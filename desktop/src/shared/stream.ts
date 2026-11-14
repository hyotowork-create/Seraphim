// YouTube 라이브 송출 — main/renderer 공용 타입과 ffmpeg 인자 생성(순수 함수)
import type { LiveState } from './ipc'
//
// 흐름: 숨은 "방송 창"(output.html, role=stream)을 탭 캡처 → 운영자 창의 MediaRecorder(H.264/Opus, 무손실에 가까운 고비트레이트)
//       → IPC로 조각 전송 → main의 ffmpeg가 고정 프레임·고정 비트레이트 H.264 + AAC로 다시 인코딩 → RTMP(S) 송출 / MP4 녹화
// 방송과 녹화는 캡처만 함께 쓰고 MediaRecorder·ffmpeg를 따로 돌린다 — 언제든 따로 켜고 끄며, 인터넷이 끊겨도 녹화는 계속된다.

export const YOUTUBE_RTMPS_URL = 'rtmps://a.rtmps.youtube.com/live2'
export const YOUTUBE_RTMP_URL = 'rtmp://a.rtmp.youtube.com/live2'

/** 방송 화면 구성: 송출(프로젝터) 화면 그대로 / 카메라 위에 하단 자막 */
export type StreamLayout = 'mirror' | 'lowerThird'
/** 방송(RTMP) / 녹화(MP4) — 서로 따로 켜고 끈다 */
export type StreamKind = 'live' | 'record'
export type StreamQuality = '720p' | '1080p' | '1440p'

export interface StreamConfig {
  /** 방송을 시작할 때 녹화도 함께 시작 (녹화는 따로 돌아 인터넷이 끊겨도 계속된다) */
  recordWithLive: boolean
  /** @deprecated 예전 설정('live'|'record'|'both') — getStreamConfig에서 recordWithLive로 옮김 */
  target?: 'live' | 'record' | 'both'
  /** RTMP(S) 서버 주소 (스트림 키 제외). 기본 YouTube RTMPS */
  serverUrl: string
  quality: StreamQuality
  layout: StreamLayout
  /** 하단 자막 구성의 카메라: 'program' = 카메라 전환(1·2·3)을 따라감, 숫자 = 그 카메라 고정, 'none' = 송출 배경 그대로 */
  cameraSource: CameraSource | 'none'
  /** @deprecated 예전 설정(단일 카메라) — getStreamConfig에서 cameraSource로 옮김 */
  cameraDeviceId?: string | null
  cameraLabel?: string | null
  /** 방송 소리 입력 장치 (믹서·오디오 인터페이스). null이면 무음 */
  audioDeviceId: string | null
  audioLabel: string | null
  /** 소리 크기 배율 (0~2, 1 = 그대로) */
  audioGain: number
  /** 하단 자막 글자 크기 = 송출 글자 크기 × 이 값 */
  lowerThirdScale: number
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  recordWithLive: true,
  serverUrl: YOUTUBE_RTMPS_URL,
  quality: '720p',
  layout: 'lowerThird',
  cameraSource: 'program',
  audioDeviceId: null,
  audioLabel: null,
  audioGain: 1,
  lowerThirdScale: 0.6
}

export interface QualityPreset {
  width: number
  height: number
  fps: number
  videoKbps: number
  audioKbps: number
  /** MediaRecorder 중간 인코딩 비트레이트 (ffmpeg가 다시 인코딩하므로 넉넉히) */
  captureBps: number
  /** 방송 창 카메라에 요청할 해상도 — 디지털 줌을 해도 선명하도록 방송 해상도보다 한 단계 크게 (카메라가 못 주면 가능한 최대) */
  camera: { width: number; height: number }
  label: string
  /** 안정적으로 보내려면 필요한 업로드 속도(Mbps) — 영상+소리의 약 2배 */
  uploadMbps: number
}

/** YouTube 권장 범위 안에서 교회 업로드 회선(보통 10~20 Mbps)에 무리 없는 값 */
export const QUALITY_PRESETS: Record<StreamQuality, QualityPreset> = {
  '720p': { width: 1280, height: 720, fps: 30, videoKbps: 3500, audioKbps: 128, captureBps: 8_000_000, camera: { width: 1920, height: 1080 }, uploadMbps: 8, label: '720p · 30fps · 약 3.6 Mbps (권장)' },
  '1080p': { width: 1920, height: 1080, fps: 30, videoKbps: 6000, audioKbps: 160, captureBps: 14_000_000, camera: { width: 2560, height: 1440 }, uploadMbps: 13, label: '1080p · 30fps · 약 6.2 Mbps' },
  // YouTube H.264 1440p30: 최소 7 Mbps, 권장 21 Mbps. 교회 회선을 고려해 12 Mbps
  '1440p': { width: 2560, height: 1440, fps: 30, videoKbps: 12000, audioKbps: 160, captureBps: 25_000_000, camera: { width: 3840, height: 2160 }, uploadMbps: 25, label: '1440p(2K) · 30fps · 약 12 Mbps' }
}

/** main의 ffmpeg 프로세스 상태 (세션 단위 — 방송·녹화가 각자 세션을 가진다) */
export interface StreamStatus {
  session: number
  kind: StreamKind
  /** starting: 프로세스 시작, 첫 프레임 전 / live: 인코딩 중 / ended: 정상 종료 / failed: 비정상 종료 */
  phase: 'starting' | 'live' | 'ended' | 'failed'
  startedAt: number | null
  fps: number | null
  kbps: number | null
  speed: number | null
  /** 사람이 읽을 오류 설명 (스트림 키는 가림) */
  message: string | null
  recordPath: string | null
  /** 녹화: 저장 폴더 디스크의 남은 공간 (5초마다 갱신) */
  freeBytes: number | null
  /** 다시 시도해도 소용없는 중단 (저장 공간 부족 등) */
  fatal?: boolean
}

// ── 녹화 저장 공간 ─────────────────────────────────────

/** 남은 공간이 이보다 적어지면 녹화를 자동으로 끝낸다 (디스크가 가득 차 앱·시스템이 멈추지 않게) */
export const DISK_STOP_BYTES = 512 * 1024 * 1024
/** 남은 녹화 시간이 이보다 짧으면 녹화를 시작하지 않는다 */
export const RECORD_MIN_START_SEC = 180

export interface DiskInfo {
  /** 녹화 저장 폴더 */
  dir: string
  /** 남은 공간 (모르면 null) */
  freeBytes: number | null
}

/** 녹화 1초에 쓰는 바이트 — 영상+소리 비트레이트에 MP4 여유 3% */
export function recordBytesPerSec(quality: StreamQuality): number {
  const p = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS['720p']
  return (((p.videoKbps + p.audioKbps) * 1000) / 8) * 1.03
}

/** 남은 공간으로 더 녹화할 수 있는 시간(초). 자동 정지 여유분은 뺀다 */
export function recordSecondsLeft(freeBytes: number, quality: StreamQuality): number {
  return Math.max(0, Math.floor((freeBytes - DISK_STOP_BYTES) / recordBytesPerSec(quality)))
}

/** ok / low(30분 미만) / critical(10분 미만) */
export function diskLevel(secondsLeft: number): 'ok' | 'low' | 'critical' {
  return secondsLeft < 600 ? 'critical' : secondsLeft < 1800 ? 'low' : 'ok'
}

/** "약 3시간 20분" · "약 45분" · "1분 미만" (100시간 넘으면 "100시간 이상") */
export function formatRecordLeft(sec: number): string {
  const m = Math.floor(sec / 60)
  if (m < 1) return '1분 미만'
  if (m >= 6000) return '100시간 이상'
  const h = Math.floor(m / 60)
  return h > 0 ? `약 ${h}시간${m % 60 ? ` ${m % 60}분` : ''}` : `약 ${m}분`
}

/** "120 GB" · "850 MB" */
export function formatBytes(n: number): string {
  const gb = n / 1024 ** 3
  return gb >= 10 ? `${Math.round(gb)} GB` : gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.max(0, Math.round(n / 1024 ** 2))} MB`
}

export interface StreamProbe {
  ok: boolean
  path: string
  version: string | null
  encoder: VideoEncoder | null
  rtmps: boolean
  error?: string
}

export interface StreamPrepareResult {
  /** 방송 창의 탭 캡처용 미디어 소스 id (약 10초 유효) */
  sourceId: string
  width: number
  height: number
  fps: number
}

export type VideoEncoder = 'libx264' | 'h264_videotoolbox' | 'h264_mf'

export interface FfmpegArgsOptions {
  width: number
  height: number
  fps: number
  videoKbps: number
  audioKbps: number
  encoder: VideoEncoder
  /** 스트림 키까지 붙은 전체 RTMP(S) 주소. null이면 방송 안 함 */
  rtmpUrl: string | null
  /** MP4 녹화 경로. null이면 녹화 안 함 */
  recordPath: string | null
  /** RTMPS 인증서 검증 (macOS SecureTransport 빌드에서 확인됨) */
  tlsVerify: boolean
  /** VideoToolbox 고정 비트레이트(-constant_bit_rate, macOS 13 이상). false면 평균 비트레이트 */
  vtConstantBitRate?: boolean
}

/** 서버 주소 + 스트림 키 → 전체 주소 */
export function joinStreamUrl(serverUrl: string, key: string): string {
  return `${serverUrl.trim().replace(/\/+$/, '')}/${key.trim()}`
}

/** 오류 메시지 등에서 스트림 키를 가린다 */
export function maskSecret(text: string, secret: string | null | undefined): string {
  if (!secret || secret.length < 4) return text
  return text.split(secret).join('****')
}

/** tee 출력 이름 이스케이프 — tee는 '|'로 출력을 나누고 '\'·"'"·'['·']'를 특수 문자로 본다 */
export function teeEscape(s: string): string {
  return s.replace(/[\\'|[\]]/g, (m) => `\\${m}`)
}

function encoderArgs(o: FfmpegArgsOptions): string[] {
  const g = String(o.fps * 2) // 키프레임 2초 간격 (YouTube 권장, 최대 4초)
  const rate = [`-b:v`, `${o.videoKbps}k`, '-maxrate', `${o.videoKbps}k`, '-bufsize', `${o.videoKbps * 2}k`]
  if (o.encoder === 'h264_videotoolbox') {
    // VideoToolbox는 -maxrate/-bufsize(데이터 속도 제한)를 주면 목표의 약 70%로 낮게 나온다(1440p 12M → 8.4M 측정).
    // 제한 없이 고정 비트레이트(macOS 13+)로 주면 목표와 거의 같다(720p 3.52 / 1080p 6.04 / 1440p 12.08 Mbps 측정).
    const vtRate = o.vtConstantBitRate ? ['-b:v', `${o.videoKbps}k`, '-constant_bit_rate', '1'] : ['-b:v', `${o.videoKbps}k`]
    return ['-c:v', 'h264_videotoolbox', '-realtime', '1', '-allow_sw', '1', '-profile:v', 'high', ...vtRate, '-g', g]
  }
  if (o.encoder === 'h264_mf') {
    return ['-c:v', 'h264_mf', '-rate_control', 'cbr', '-scenario', 'live_streaming', ...rate, '-g', g]
  }
  return [
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'high',
    ...rate, '-g', g, '-keyint_min', g, '-sc_threshold', '0', '-x264-params', 'nal-hrd=cbr'
  ]
}

/**
 * ffmpeg 인자 — 입력은 stdin의 Matroska/WebM (MediaRecorder 출력, 영상+소리 항상 포함).
 * 영상은 고정 프레임(fps 필터)·지정 해상도(비율 유지 + 검은 여백)로 맞춰 인코딩하고, 소리는 AAC 48kHz 스테레오.
 */
export function buildFfmpegArgs(o: FfmpegArgsOptions): string[] {
  if (!o.rtmpUrl && !o.recordPath) throw new Error('방송 주소나 녹화 경로 중 하나는 있어야 합니다.')
  const pixFmt = o.encoder === 'h264_videotoolbox' ? 'nv12' : 'yuv420p'
  const args = [
    '-hide_banner', '-loglevel', 'warning', '-stats', '-stats_period', '1',
    '-fflags', '+genpts', '-thread_queue_size', '1024',
    '-f', 'matroska', '-i', 'pipe:0',
    '-map', '0:v:0', '-map', '0:a:0',
    '-vf', `fps=${o.fps},scale=${o.width}:${o.height}:force_original_aspect_ratio=decrease,pad=${o.width}:${o.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=${pixFmt}`,
    '-af', 'aresample=async=1000:first_pts=0',
    ...encoderArgs(o),
    '-c:a', 'aac', '-b:a', `${o.audioKbps}k`, '-ar', '48000', '-ac', '2',
    '-max_muxing_queue_size', '1024'
  ]
  const tls = o.rtmpUrl && /^rtmps:/i.test(o.rtmpUrl) && o.tlsVerify ? ['-tls_verify', '1'] : []
  const mp4Flags = '+frag_keyframe+empty_moov+default_base_moof'
  if (o.rtmpUrl && o.recordPath) {
    const live = `[f=flv:flvflags=no_duration_filesize${tls.length ? ':tls_verify=1' : ''}:onfail=abort]${teeEscape(o.rtmpUrl)}`
    const rec = `[f=mp4:movflags=${mp4Flags}:onfail=ignore]${teeEscape(o.recordPath)}`
    args.push('-f', 'tee', `${live}|${rec}`)
  } else if (o.rtmpUrl) {
    args.push(...tls, '-f', 'flv', '-flvflags', 'no_duration_filesize', o.rtmpUrl)
  } else {
    args.push('-f', 'mp4', '-movflags', mp4Flags, o.recordPath!)
  }
  return args
}

export interface FfmpegStats {
  frame: number
  fps: number
  kbps: number | null
  speed: number | null
}

/** ffmpeg -stats 한 줄 → 수치 ("frame=  301 fps= 30 q=21.0 size=  1024kB time=00:00:10.00 bitrate= 838.9kbits/s speed=1.00x") */
export function parseFfmpegStats(line: string): FfmpegStats | null {
  const f = line.match(/frame=\s*(\d+)/)
  if (!f) return null
  const fps = line.match(/fps=\s*([\d.]+)/)
  const br = line.match(/bitrate=\s*([\d.]+)kbits\/s/)
  const sp = line.match(/speed=\s*([\d.]+)x/)
  return {
    frame: Number(f[1]),
    fps: fps ? Number(fps[1]) : 0,
    kbps: br ? Number(br[1]) : null,
    speed: sp ? Number(sp[1]) : null
  }
}

/** ffmpeg 오류 출력 → 운영자가 할 일을 알려 주는 한국어 설명 */
export function explainFfmpegError(lines: string[]): string {
  const text = lines.join('\n')
  if (/Unable to negotiate TLS|certificate|SSL/i.test(text))
    return 'RTMPS 보안 연결에 실패했습니다. PC 시계가 맞는지, 서버 주소가 맞는지 확인하세요.'
  if (/Failed to resolve|Name or service not known|nodename nor servname|getaddrinfo/i.test(text))
    return '방송 서버 주소를 찾지 못했습니다. 인터넷 연결과 서버 주소를 확인하세요.'
  if (/Connection refused|Operation timed out|Connection timed out|Network is unreachable|No route to host|Cannot open connection/i.test(text))
    return '방송 서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.'
  if (/handshake|NetStream\.Publish|Server error|publish/i.test(text))
    return '서버가 방송을 받아 주지 않았습니다. 스트림 키가 맞는지, YouTube Studio에서 라이브가 켜져 있는지 확인하세요.'
  if (/Broken pipe|End of file|Connection reset|Input\/output error|Error writing trailer|Error muxing/i.test(text))
    return '방송 서버와 연결이 끊겼습니다.'
  if (/Permission denied|No such file or directory/i.test(text)) return '녹화 파일을 저장할 수 없습니다. 저장 폴더 권한을 확인하세요.'
  if (/Invalid data found|Error while decoding|could not find codec/i.test(text)) return '화면 캡처 데이터를 읽지 못했습니다. 방송을 다시 시작해 보세요.'
  const last = lines.filter((l) => l.trim()).slice(-1)[0]
  return last ? `ffmpeg 오류: ${last.trim().slice(0, 200)}` : 'ffmpeg가 예기치 않게 종료되었습니다.'
}

/** 카메라 디지털 줌/위치 (송출·방송 창의 카메라 영상에 공통 적용) */
export interface CameraViewState {
  /** 1 = 원래 크기, 최대 4 */
  zoom: number
  /** 확대 중심 (0~1, 0.5 = 가운데) */
  x: number
  y: number
}

export const DEFAULT_CAMERA_VIEW: CameraViewState = { zoom: 1, x: 0.5, y: 0.5 }
export const CAMERA_ZOOM_MAX = 4

export function clampCameraView(v: Partial<CameraViewState>, base: CameraViewState = DEFAULT_CAMERA_VIEW): CameraViewState {
  const n = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : d)
  return {
    zoom: Math.min(CAMERA_ZOOM_MAX, Math.max(1, Math.round(n(v.zoom, base.zoom) * 100) / 100)),
    x: Math.min(1, Math.max(0, n(v.x, base.x))),
    y: Math.min(1, Math.max(0, n(v.y, base.y)))
  }
}

/** 디지털 줌 CSS — 중심점 기준 확대라 화면 밖으로 빈 곳이 생기지 않는다 */
export function cameraTransformCss(v: CameraViewState): { transform: string; transformOrigin: string } {
  return { transform: `scale(${v.zoom})`, transformOrigin: `${(v.x * 100).toFixed(1)}% ${(v.y * 100).toFixed(1)}%` }
}

/**
 * 방송 창에 그릴 상태 — 송출(프로젝터) 상태에서 파생.
 *  - mirror: 송출 화면 그대로 (검정·로고도 그대로 나감)
 *  - lowerThird: 카메라(지정 시) 위에 작은 하단 자막. 검정·로고 화면일 때는 자막만 숨기고 카메라는 계속 나간다(설교·기도 중에도 방송 화면 유지)
 * 방송 창 자체가 16:9라 비율은 항상 화면 채우기.
 */
export function streamViewState(live: LiveState, cfg: StreamConfig): LiveState {
  if (cfg.layout === 'mirror') return { ...live, aspect: 'fill' }
  const hideText = live.blackout || live.showLogo
  const source = cfg.cameraSource ?? 'program'
  const background =
    source !== 'none' && resolveCameraLayers(live.cameras, live.activeCamera, source).layers.length
      ? { kind: 'camera' as const, color: '#000000', cameraSource: source, dim: 0 }
      : live.background
  return {
    ...live,
    aspect: 'fill',
    blackout: false,
    showLogo: false,
    text: hideText ? '' : live.text,
    background,
    overlay: {
      ...live.overlay,
      fontSize: Math.max(24, Math.round(live.overlay.fontSize * cfg.lowerThirdScale)),
      align: 'center',
      vAlign: 'bottom',
      offsetY: 0
    }
  }
}

// ── 카메라 1·2·3 (여러 카메라 동시 사용·전환) ───────────────────

export const CAMERA_SLOT_COUNT = 3

/** 카메라 칸 하나 — 장치와 그 카메라의 줌/위치 */
export interface CameraSlot {
  deviceId: string | null
  label: string | null
  view: CameraViewState
}

/** 'program' = 카메라 전환(1·2·3)을 따라감, 숫자(0부터) = 그 카메라 고정 */
export type CameraSource = 'program' | number

export function emptyCameraSlots(): CameraSlot[] {
  return Array.from({ length: CAMERA_SLOT_COUNT }, () => ({ deviceId: null, label: null, view: { ...DEFAULT_CAMERA_VIEW } }))
}

/** 저장된 값·패치를 안전한 슬롯 배열로 (길이 3, 줌 범위 제한) */
export function normalizeCameraSlots(raw: unknown): CameraSlot[] {
  const base = emptyCameraSlots()
  if (!Array.isArray(raw)) return base
  return base.map((b, i) => {
    const r = raw[i] as Partial<CameraSlot> | undefined
    if (!r || typeof r !== 'object') return b
    return {
      deviceId: typeof r.deviceId === 'string' && r.deviceId ? r.deviceId : null,
      label: typeof r.label === 'string' ? r.label : null,
      view: clampCameraView(r.view ?? {}, DEFAULT_CAMERA_VIEW)
    }
  })
}

export interface CameraLayers {
  /** 켜 둘 카메라(전환 시 끊김이 없도록 모두 미리 재생) */
  layers: { index: number; slot: CameraSlot }[]
  /** 지금 보이는 카메라 번호 (없으면 null) */
  visible: number | null
}

/**
 * 출처 → 켜 둘 카메라와 보이는 카메라.
 *  - 숫자: 그 카메라만 (설정 안 됐으면 없음)
 *  - 'program': 설정된 카메라 모두 켜 두고, 전환된 카메라(없으면 첫 설정 카메라)를 보인다
 */
export function resolveCameraLayers(slots: CameraSlot[], active: number, source: CameraSource): CameraLayers {
  const configured = slots.map((slot, index) => ({ index, slot })).filter((x) => !!x.slot.deviceId)
  if (typeof source === 'number') {
    const one = configured.find((x) => x.index === source)
    return one ? { layers: [one], visible: one.index } : { layers: [], visible: null }
  }
  if (!configured.length) return { layers: [], visible: null }
  const visible = configured.some((x) => x.index === active) ? active : configured[0].index
  return { layers: configured, visible }
}

export interface CameraPatch {
  /** 지금 보이는(전환된) 카메라의 줌/위치 */
  camera?: Partial<CameraViewState>
  /** 특정 카메라 칸의 장치·줌 */
  cameraSlot?: { index: number; deviceId?: string | null; label?: string | null; view?: Partial<CameraViewState> }
  /** 카메라 전환 */
  activeCamera?: number
}

/** main의 송출 상태에 카메라 패치 적용 (순수 함수) */
export function applyCameraPatch(
  slots: CameraSlot[],
  active: number,
  p: CameraPatch
): { cameras: CameraSlot[]; activeCamera: number } {
  const cameras = normalizeCameraSlots(slots)
  let activeCamera = Number.isInteger(active) && active >= 0 && active < CAMERA_SLOT_COUNT ? active : 0
  if (typeof p.activeCamera === 'number' && Number.isInteger(p.activeCamera) && p.activeCamera >= 0 && p.activeCamera < CAMERA_SLOT_COUNT) {
    activeCamera = p.activeCamera
  }
  const cs = p.cameraSlot
  if (cs && Number.isInteger(cs.index) && cs.index >= 0 && cs.index < CAMERA_SLOT_COUNT) {
    const cur = cameras[cs.index]
    cameras[cs.index] = {
      deviceId: cs.deviceId !== undefined ? cs.deviceId || null : cur.deviceId,
      label: cs.label !== undefined ? cs.label : cur.label,
      view: cs.view ? clampCameraView({ ...cur.view, ...cs.view }, cur.view) : cur.view
    }
    if (cs.deviceId === null) cameras[cs.index].view = { ...DEFAULT_CAMERA_VIEW }
  }
  if (p.camera) {
    // 전환된 카메라가 비어 있으면 첫 설정 카메라의 줌을 바꾼다 (화면에 보이는 카메라)
    const vis = resolveCameraLayers(cameras, activeCamera, 'program').visible ?? activeCamera
    cameras[vis] = { ...cameras[vis], view: clampCameraView({ ...cameras[vis].view, ...p.camera }, cameras[vis].view) }
  }
  return { cameras, activeCamera }
}
