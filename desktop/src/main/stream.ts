import { app, BrowserWindow, powerSaveBlocker, safeStorage, type WebContents } from 'electron'
import { execFile, spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readFileSync, statfsSync } from 'fs'
import { dirname, join } from 'path'
import { promisify } from 'util'
import { getSetting, setSetting } from './db/dao'
import { IPC } from '../shared/ipc'
import {
  DEFAULT_STREAM_CONFIG,
  DISK_STOP_BYTES,
  QUALITY_PRESETS,
  RECORD_MIN_START_SEC,
  buildFfmpegArgs,
  explainFfmpegError,
  formatBytes,
  joinStreamUrl,
  maskSecret,
  parseFfmpegStats,
  recordSecondsLeft,
  type DiskInfo,
  type StreamConfig,
  type StreamKind,
  type StreamProbe,
  type StreamStatus,
  type VideoEncoder
} from '../shared/stream'

const execFileP = promisify(execFile)

// ── ffmpeg 위치·기능 확인 ─────────────────────────────

/** 패키징: Resources/ffmpeg/ffmpeg(.exe) · 개발: desktop/vendor/ffmpeg/<platform>-<arch>/ */
export function ffmpegPath(): string {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  if (app.isPackaged) return join(process.resourcesPath, 'ffmpeg', exe)
  return join(app.getAppPath(), 'vendor', 'ffmpeg', `${process.platform}-${process.arch}`, exe)
}

let probeCache: StreamProbe | null = null

export async function probeFfmpeg(): Promise<StreamProbe> {
  if (probeCache?.ok) return probeCache
  const path = ffmpegPath()
  if (!existsSync(path)) {
    probeCache = { ok: false, path, version: null, encoder: null, rtmps: false, error: `ffmpeg가 없습니다: ${path}` }
    return probeCache
  }
  try {
    const [ver, enc, proto] = await Promise.all([
      execFileP(path, ['-hide_banner', '-version'], { windowsHide: true }),
      execFileP(path, ['-hide_banner', '-encoders'], { windowsHide: true }),
      execFileP(path, ['-hide_banner', '-protocols'], { windowsHide: true })
    ])
    const encoders = enc.stdout
    // macOS는 하드웨어(VideoToolbox) 우선, 그 외엔 libx264 → Media Foundation 순
    const order: VideoEncoder[] =
      process.platform === 'darwin' ? ['h264_videotoolbox', 'libx264'] : ['libx264', 'h264_mf']
    const encoder = order.find((e) => new RegExp(`\\s${e}\\s`).test(encoders)) ?? null
    probeCache = {
      ok: !!encoder,
      path,
      version: ver.stdout.split('\n')[0]?.trim() ?? null,
      encoder,
      rtmps: /\brtmps\b/.test(proto.stdout),
      error: encoder ? undefined : '이 ffmpeg에는 H.264 인코더가 없습니다.'
    }
  } catch (e) {
    probeCache = { ok: false, path, version: null, encoder: null, rtmps: false, error: `ffmpeg 실행 실패: ${e instanceof Error ? e.message : String(e)}` }
  }
  return probeCache
}

/** macOS 주 버전 (VideoToolbox 고정 비트레이트는 macOS 13 이상). 다른 OS는 0 */
function macosMajor(): number {
  if (process.platform !== 'darwin') return 0
  return Number(process.getSystemVersion().split('.')[0]) || 0
}

// ── 설정·스트림 키 ─────────────────────────────────────

function readRawStreamConfig(): Partial<StreamConfig> {
  try {
    const raw = getSetting('stream.config')
    return raw ? (JSON.parse(raw) as Partial<StreamConfig>) : {}
  } catch {
    return {}
  }
}

export function getStreamConfig(): StreamConfig {
  const raw = readRawStreamConfig()
  const cfg: StreamConfig = { ...DEFAULT_STREAM_CONFIG, ...raw }
  // 예전 설정(단일 카메라 장치) → 카메라 출처: 장치가 있었으면 '카메라 전환 따라감', 없었으면 '송출 배경 그대로'
  if (raw.cameraSource === undefined && raw.cameraDeviceId !== undefined) cfg.cameraSource = raw.cameraDeviceId ? 'program' : 'none'
  // 예전 설정(방송만/녹화만/방송+녹화) → 방송할 때 녹화도 함께 할지
  if (raw.recordWithLive === undefined && raw.target !== undefined) cfg.recordWithLive = raw.target !== 'live'
  delete cfg.cameraDeviceId
  delete cfg.cameraLabel
  delete cfg.target
  return cfg
}

/** 예전 방송 설정에 저장돼 있던 카메라 장치 (카메라 1로 옮기기용) */
export function legacyStreamCamera(): { deviceId: string; label: string | null } | null {
  const raw = readRawStreamConfig()
  return raw.cameraDeviceId ? { deviceId: raw.cameraDeviceId, label: raw.cameraLabel ?? null } : null
}

export function setStreamConfig(patch: Partial<StreamConfig>): StreamConfig {
  const next: StreamConfig = { ...getStreamConfig(), ...patch }
  delete next.cameraDeviceId
  delete next.cameraLabel
  delete next.target
  setSetting('stream.config', JSON.stringify(next))
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(IPC.STREAM_CONFIG, next)
  return next
}

/** 스트림 키는 OS 키체인으로 암호화해 저장 (불가하면 평문) */
export function setStreamKey(key: string): void {
  const k = key.trim()
  if (!k) {
    setSetting('stream.key.enc', '')
    setSetting('stream.key', '')
  } else if (safeStorage.isEncryptionAvailable()) {
    setSetting('stream.key.enc', safeStorage.encryptString(k).toString('base64'))
    setSetting('stream.key', '')
  } else {
    setSetting('stream.key', k)
    setSetting('stream.key.enc', '')
  }
}

function getStreamKey(): string | null {
  const enc = getSetting('stream.key.enc')
  if (enc) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch {
      return null
    }
  }
  return getSetting('stream.key') || null
}

export function hasStreamKey(): boolean {
  return !!getStreamKey()
}

// ── 녹화 폴더·저장 공간 ──────────────────────────────

export function recordingsDir(): string {
  // 기본: 동영상 폴더/Seraphim (macOS ~/Movies/Seraphim, Windows 동영상\Seraphim). 테스트는 환경변수로 바꿈
  const dir = process.env.SERAPHIM_RECORDINGS_DIR || join(app.getPath('videos'), 'Seraphim')
  mkdirSync(dir, { recursive: true })
  return dir
}

function nextRecordPath(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  const base = `Seraphim ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}`
  let path = join(recordingsDir(), `${base}.mp4`)
  for (let i = 2; existsSync(path); i++) path = join(recordingsDir(), `${base} (${i}).mp4`)
  return path
}

/** 폴더가 있는 디스크의 남은 공간 (바이트). 테스트는 SERAPHIM_FAKE_DISK_FREE_FILE에 적힌 값을 쓴다 */
function diskFreeBytes(dir: string): number | null {
  const fake = process.env.SERAPHIM_FAKE_DISK_FREE_FILE
  if (fake) {
    try {
      const n = Number(readFileSync(fake, 'utf8').trim())
      if (Number.isFinite(n)) return n
    } catch {
      /* 파일이 없으면 실제 값 */
    }
  }
  try {
    const st = statfsSync(dir)
    return Number(st.bavail) * Number(st.bsize)
  } catch {
    return null
  }
}

export function diskInfo(): DiskInfo {
  const dir = recordingsDir()
  return { dir, freeBytes: diskFreeBytes(dir) }
}

// ── 송출 세션 (ffmpeg 프로세스) — 방송·녹화가 각자 하나씩 ─────────

interface Channel {
  proc: ChildProcess | null
  session: number
  stopping: boolean
  status: StreamStatus | null
  statusTarget: WebContents | null
  psbId: number | null
  errLines: string[]
  lastPush: number
  secret: string | null
  diskTimer: ReturnType<typeof setInterval> | null
  /** 다시 시도하지 않을 중단 사유 (저장 공간 부족) */
  fatal: string | null
}

const newChannel = (): Channel => ({
  proc: null,
  session: 0,
  stopping: false,
  status: null,
  statusTarget: null,
  psbId: null,
  errLines: [],
  lastPush: 0,
  secret: null,
  diskTimer: null,
  fatal: null
})

const channels: Record<StreamKind, Channel> = { live: newChannel(), record: newChannel() }
/** 세션 번호는 방송·녹화 통틀어 하나씩 늘린다 (조각을 세션 번호만으로 나눠 보내도록) */
let sessionSeq = 0

function pushStatus(ch: Channel, force = false): void {
  if (!ch.status || !ch.statusTarget || ch.statusTarget.isDestroyed()) return
  const now = Date.now()
  if (!force && now - ch.lastPush < 900) return
  ch.lastPush = now
  ch.statusTarget.send(IPC.STREAM_STATUS, ch.status)
}

/** 방송이나 녹화 중 하나라도 돌고 있는지 */
export function isStreaming(): boolean {
  return !!(channels.live.proc || channels.record.proc)
}

/** 지금 돌고 있는 것 */
export function activeKinds(): StreamKind[] {
  return (['live', 'record'] as const).filter((k) => !!channels[k].proc)
}

export function getStreamStatus(kind: StreamKind): StreamStatus | null {
  return channels[kind].status
}

/** 녹화 중 저장 공간 확인 — 부족하면 지금까지 녹화한 부분을 마무리하고 멈춘다 */
function checkDisk(ch: Channel): void {
  const path = ch.status?.recordPath
  if (!path || !ch.proc || !ch.status) return
  const free = diskFreeBytes(dirname(path))
  ch.status.freeBytes = free
  if (free != null && free < DISK_STOP_BYTES && !ch.stopping && !ch.fatal) {
    ch.fatal = `저장 공간이 부족해 녹화를 멈췄습니다 (남은 공간 ${formatBytes(free)}). 지금까지 녹화한 부분은 저장되었습니다.`
    ch.proc.stdin?.end()
  }
  pushStatus(ch, true)
}

/** ffmpeg를 띄우고 세션 번호를 돌려준다. 이후 renderer가 STREAM_CHUNK로 Matroska 조각을 보낸다 */
export async function startStream(sender: WebContents, kind: StreamKind): Promise<StreamStatus> {
  const ch = channels[kind]
  if (ch.proc) throw new Error(kind === 'live' ? '이미 방송 중입니다.' : '이미 녹화 중입니다.')
  const cfg = getStreamConfig()
  const probe = await probeFfmpeg()
  if (!probe.ok || !probe.encoder) throw new Error(probe.error ?? 'ffmpeg를 사용할 수 없습니다.')
  const live = kind === 'live'
  const key = live ? getStreamKey() : null
  if (live && !key) throw new Error('스트림 키를 먼저 저장하세요. (YouTube Studio → 라이브 스트리밍 → 스트림 키)')
  if (live && !/^rtmps?:\/\//i.test(cfg.serverUrl.trim())) throw new Error('서버 주소는 rtmp:// 또는 rtmps:// 로 시작해야 합니다.')
  if (live && /^rtmps:/i.test(cfg.serverUrl) && !probe.rtmps) throw new Error('이 ffmpeg는 RTMPS를 지원하지 않습니다. 서버 주소를 rtmp:// 로 바꾸세요.')
  let recordPath: string | null = null
  let freeBytes: number | null = null
  if (!live) {
    freeBytes = diskFreeBytes(recordingsDir())
    if (freeBytes != null && recordSecondsLeft(freeBytes, cfg.quality) < RECORD_MIN_START_SEC) {
      throw new Error(`저장 공간이 부족해 녹화를 시작할 수 없습니다 (남은 공간 ${formatBytes(freeBytes)}). 파일을 정리하거나 화질을 낮추세요.`)
    }
    recordPath = nextRecordPath()
  }
  const q = QUALITY_PRESETS[cfg.quality] ?? QUALITY_PRESETS['720p']
  const args = buildFfmpegArgs({
    width: q.width,
    height: q.height,
    fps: q.fps,
    videoKbps: q.videoKbps,
    audioKbps: q.audioKbps,
    encoder: probe.encoder,
    rtmpUrl: live && key ? joinStreamUrl(cfg.serverUrl, key) : null,
    recordPath,
    // macOS(SecureTransport)에서만 검증 동작을 확인함. Windows(GnuTLS)는 인증서 저장소 설정 없이 켜면 연결이 막힐 수 있음
    tlsVerify: process.platform === 'darwin',
    vtConstantBitRate: macosMajor() >= 13
  })

  ch.secret = key
  ch.errLines = []
  ch.stopping = false
  ch.fatal = null
  ch.session = ++sessionSeq
  const mySession = ch.session
  const status: StreamStatus = {
    session: mySession,
    kind,
    phase: 'starting',
    startedAt: null,
    fps: null,
    kbps: null,
    speed: null,
    message: null,
    recordPath,
    freeBytes
  }
  ch.status = status
  ch.statusTarget = sender

  const child = spawn(probe.path, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
  ch.proc = child
  ch.psbId = powerSaveBlocker.start('prevent-app-suspension')
  if (!live) ch.diskTimer = setInterval(() => checkDisk(ch), 5000)

  let buf = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (d: string) => {
    buf += d
    const parts = buf.split(/[\r\n]+/)
    buf = parts.pop() ?? ''
    for (const raw of parts) {
      const line = maskSecret(raw, ch.secret)
      const st = parseFfmpegStats(line)
      if (st && ch.status?.session === mySession) {
        if (st.frame > 0 && ch.status.phase === 'starting') {
          ch.status.phase = 'live'
          ch.status.startedAt = Date.now()
          pushStatus(ch, true)
        }
        ch.status.fps = st.fps
        ch.status.kbps = st.kbps
        ch.status.speed = st.speed
        pushStatus(ch)
      } else if (line.trim()) {
        ch.errLines.push(line.trim())
        if (ch.errLines.length > 30) ch.errLines.shift()
        console.warn(`[ffmpeg ${kind}]`, line.trim())
      }
    }
  })
  child.stdin?.on('error', () => {
    /* ffmpeg가 먼저 끝나면 EPIPE — exit 처리에서 상태를 알림 */
  })
  child.on('error', (e) => {
    ch.errLines.push(e.message)
  })
  child.on('exit', (code, signal) => {
    if (ch.proc === child) ch.proc = null
    if (ch.psbId != null) {
      powerSaveBlocker.stop(ch.psbId)
      ch.psbId = null
    }
    if (ch.diskTimer) {
      clearInterval(ch.diskTimer)
      ch.diskTimer = null
    }
    if (ch.status?.session !== mySession) return
    if (ch.fatal) {
      ch.status.phase = 'failed'
      ch.status.message = ch.fatal
      ch.status.fatal = true
    } else {
      const ok = ch.stopping && (code === 0 || code === 255 || signal != null)
      ch.status.phase = ch.stopping ? 'ended' : 'failed'
      ch.status.message = ok || ch.stopping ? null : explainFfmpegError(ch.errLines.length ? ch.errLines : [`exit code ${code}`])
    }
    pushStatus(ch, true)
  })
  pushStatus(ch, true)
  return status
}

/** renderer → ffmpeg stdin. 인코딩·업로드가 느려 64MB 넘게 밀리면 끊고 알린다 */
export function writeStreamChunk(sess: number, data: ArrayBuffer | Uint8Array): void {
  const ch = channels.live.session === sess ? channels.live : channels.record.session === sess ? channels.record : null
  const stdin = ch?.proc?.stdin
  if (!ch || !stdin || stdin.destroyed || stdin.writableEnded) return
  stdin.write(Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data)))
  if (stdin.writableLength > 64 * 1024 * 1024) {
    ch.errLines.push(
      ch === channels.live
        ? '인코딩·업로드가 화면 캡처 속도를 따라가지 못합니다. 화질을 720p로 낮추거나 인터넷 업로드 속도를 확인하세요.'
        : '녹화 인코딩이 화면 캡처 속도를 따라가지 못합니다. 화질을 720p로 낮추세요.'
    )
    ch.proc?.kill()
  }
}

/** 정상 종료: stdin을 닫아 ffmpeg가 파일/스트림을 마무리하게 하고, 8초 안에 안 끝나면 강제 종료 */
export async function stopStream(kind: StreamKind): Promise<void> {
  const ch = channels[kind]
  const child = ch.proc
  if (!child) return
  ch.stopping = true
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 8000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.stdin?.end()
  })
}

/** 앱 종료 시 — 방송은 바로 끊고, 녹화는 입력을 닫아 ffmpeg가 파일을 마무리하게 한다(앱이 먼저 끝나도 ffmpeg는 입력 끝을 보고 스스로 끝남) */
export function killStream(): void {
  const live = channels.live
  if (live.proc) {
    live.stopping = true
    live.proc.kill('SIGKILL')
    live.proc = null
  }
  const rec = channels.record
  if (rec.proc) {
    const child = rec.proc
    rec.stopping = true
    rec.proc = null
    child.stdin?.end()
    setTimeout(() => child.kill('SIGKILL'), 3000).unref()
  }
}
