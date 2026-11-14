import { create } from 'zustand'
import { QUALITY_PRESETS, type DiskInfo, type StreamConfig, type StreamKind, type StreamStatus } from '@shared/stream'

/**
 * YouTube 라이브 방송·녹화 — 운영자 창에서 도는 부분.
 * 방송 창(숨은 창)을 탭 캡처 + 소리 입력(믹서)을 한 번만 열어 두고, 방송·녹화가 각자 MediaRecorder(H.264/Opus)로
 * 0.25초 조각을 main의 자기 ffmpeg로 보낸다. 그래서 둘을 언제든 따로 켜고 끄고, 인터넷이 끊겨도 녹화는 계속된다.
 * 모달을 닫아도 이어지도록 상태와 자원은 이 스토어(모듈)에 둔다.
 */

export type ChannelPhase = 'idle' | 'starting' | 'live' | 'reconnecting' | 'stopping' | 'error'

export interface ChannelState {
  phase: ChannelPhase
  status: StreamStatus | null
  /** 처음 시작된 시각 (재연결해도 유지) */
  startedAt: number | null
  attempt: number
  error: string | null
  /** 재연결 중 등 안내 */
  notice: string | null
}

const IDLE: ChannelState = { phase: 'idle', status: null, startedAt: null, attempt: 0, error: null, notice: null }

/** 돌고 있는(캡처가 필요한) 상태 */
export const isActive = (p: ChannelPhase): boolean => p === 'starting' || p === 'live' || p === 'reconnecting' || p === 'stopping'

interface BroadcastStore {
  config: StreamConfig | null
  /** YouTube 방송 */
  live: ChannelState
  /** MP4 녹화 */
  rec: ChannelState
  /** 미리보기를 켰는지 (방송·녹화가 없어도 캡처 유지) */
  previewOn: boolean
  previewError: string | null
  /** 방송 창 캡처 영상 (미리보기용) */
  preview: MediaStream | null
  /** 소리 크기 0~1 (최근 0.1초 최대값) */
  audioLevel: number
  lastRecordPath: string | null
  /** 녹화 폴더와 남은 공간 */
  disk: DiskInfo | null
  init: () => Promise<void>
  updateConfig: (patch: Partial<StreamConfig>) => Promise<void>
  refreshDisk: () => Promise<void>
  startPreview: () => Promise<void>
  stopPreview: () => Promise<void>
  /** 방송 시작 — 설정이 켜져 있으면 녹화도 함께 */
  startLive: () => Promise<void>
  /** 방송 끝 — alsoRecord면 녹화도 함께 끝낸다 */
  stopLive: (alsoRecord?: boolean) => Promise<void>
  startRecord: () => Promise<void>
  stopRecord: () => Promise<void>
}

const MIME_CANDIDATES = ['video/x-matroska;codecs=avc1,opus', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus']

const ipcMsg = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')

const KEY = { live: 'live', record: 'rec' } as const

// ── 캡처 (방송·녹화 공용) ─────────────────────────────
let video: MediaStream | null = null
let audioCtx: AudioContext | null = null
let mic: MediaStream | null = null
let gain: GainNode | null = null
let dest: MediaStreamAudioDestinationNode | null = null
let meterTimer: ReturnType<typeof setInterval> | null = null
/** 캡처 준비 (동시에 여러 곳에서 불러도 한 번만) */
let capture: Promise<void> | null = null
let captureGen = 0
let initialized = false

// ── 방송·녹화 각자의 녹화기·세션 ────────────────────────
interface Runtime {
  /** 시작·끝내기마다 바뀐다 — 시작하는 사이 끝내기를 누르면 늦게 끝난 시작이 이를 보고 물러난다 */
  gen: number
  recorder: MediaRecorder | null
  sessionId: number
  began: number
  queue: Promise<void>
  userStop: boolean
  quickFails: number
  retryTimer: ReturnType<typeof setTimeout> | null
}
const newRuntime = (): Runtime => ({ gen: 0, recorder: null, sessionId: 0, began: 0, queue: Promise.resolve(), userStop: false, quickFails: 0, retryTimer: null })
const rt: Record<StreamKind, Runtime> = { live: newRuntime(), record: newRuntime() }

async function acquireVideo(): Promise<void> {
  if (video) return
  const prep = await window.seraphim.streamPrepare()
  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: prep.sourceId,
        minWidth: prep.width,
        maxWidth: prep.width,
        minHeight: prep.height,
        maxHeight: prep.height,
        maxFrameRate: prep.fps
      }
    }
  } as unknown as MediaStreamConstraints
  video = await navigator.mediaDevices.getUserMedia(constraints)
}

async function acquireAudio(cfg: StreamConfig, set: (p: Partial<BroadcastStore>) => void): Promise<void> {
  if (audioCtx) return
  const ctx = new AudioContext({ sampleRate: 48000 })
  audioCtx = ctx
  dest = ctx.createMediaStreamDestination()
  dest.channelCount = 2
  gain = ctx.createGain()
  gain.gain.value = cfg.audioGain
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048 // 약 42ms 창
  gain.connect(dest)
  gain.connect(analyser)
  if (cfg.audioDeviceId) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: cfg.audioDeviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 2 },
          sampleRate: { ideal: 48000 }
        }
      })
    } catch {
      throw new Error(`소리 장치(${cfg.audioLabel ?? '선택한 장치'})를 열 수 없습니다. 연결을 확인하거나 다시 선택하세요.`)
    }
    ctx.createMediaStreamSource(mic).connect(gain)
  } else {
    // 소리 없음 — YouTube가 소리 트랙을 요구하므로 무음 트랙을 만든다
    const osc = ctx.createOscillator()
    const mute = ctx.createGain()
    mute.gain.value = 0
    osc.connect(mute).connect(gain)
    osc.start()
  }
  await ctx.resume()
  // 25ms마다 42ms 창을 읽어 빈틈없이 최대값을 모으고, 화면에는 0.1초마다 한 번 반영 (짧은 소리도 놓치지 않게)
  const data = new Float32Array(analyser.fftSize)
  let peak = 0
  let tick = 0
  meterTimer = setInterval(() => {
    analyser.getFloatTimeDomainData(data)
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
    if (++tick % 4 === 0) {
      set({ audioLevel: Math.min(1, peak) })
      peak = 0
    }
  }, 25)
}

/** 캡처를 풀고, 그동안 새 캡처가 시작되지 않았으면 방송 창을 닫는다 */
async function teardownCapture(gen: number): Promise<void> {
  if (meterTimer) clearInterval(meterTimer)
  meterTimer = null
  // 모듈 변수를 먼저 비워 두어야 정리하는 사이 새 캡처가 시작돼도 섞이지 않는다
  const v = video
  const m = mic
  const ctx = audioCtx
  video = null
  mic = null
  gain = null
  dest = null
  audioCtx = null
  v?.getTracks().forEach((t) => t.stop())
  m?.getTracks().forEach((t) => t.stop())
  if (ctx) await ctx.close().catch(() => {})
  // 캡처가 완전히 풀린 뒤 방송 창을 닫는다 (캡처 중인 창을 바로 닫으면 Chromium이 멈출 수 있음)
  await new Promise((r) => setTimeout(r, 400))
  if (gen === captureGen && !capture) await window.seraphim.streamCloseWindow().catch(() => false)
}

function stopRecorderSilently(kind: StreamKind): void {
  const r = rt[kind]
  if (r.recorder) {
    r.recorder.ondataavailable = null
    r.recorder.onerror = null
    try {
      if (r.recorder.state !== 'inactive') r.recorder.stop()
    } catch {
      /* 이미 멈춤 */
    }
  }
  r.recorder = null
}

export const useBroadcast = create<BroadcastStore>((set, get) => {
  const setCh = (kind: StreamKind, p: Partial<ChannelState>): void => {
    const k = KEY[kind]
    set({ [k]: { ...get()[k], ...p } } as Partial<BroadcastStore>)
  }

  const captureNeeded = (): boolean => {
    const s = get()
    return s.previewOn || isActive(s.live.phase) || isActive(s.rec.phase)
  }

  const ensureCapture = async (cfg: StreamConfig): Promise<void> => {
    if (!capture) {
      const gen = ++captureGen
      const p = (async () => {
        await acquireVideo()
        await acquireAudio(cfg, set)
      })()
      capture = p
      p.catch(() => {
        if (captureGen === gen) capture = null
      })
    }
    await capture
    set({ preview: video })
  }

  const releaseIfUnused = async (): Promise<void> => {
    if (captureNeeded()) return
    capture = null
    const gen = ++captureGen
    set({ preview: null, audioLevel: 0 })
    await teardownCapture(gen)
  }

  /** ffmpeg 세션 하나 시작 + 녹화기 연결 (재연결 시에도 캡처는 그대로 쓴다) */
  const startSession = async (kind: StreamKind): Promise<void> => {
    if (!video || !dest) throw new Error('캡처가 준비되지 않았습니다.')
    const r = rt[kind]
    const gen = r.gen
    const cfg = get().config!
    const q = QUALITY_PRESETS[cfg.quality] ?? QUALITY_PRESETS['720p']
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
    if (!mimeType) throw new Error('이 PC에서 화면 녹화 코덱을 사용할 수 없습니다.')
    const st = await window.seraphim.streamStart(kind)
    r.sessionId = st.session
    r.began = Date.now()
    if (r.gen !== gen) {
      // 시작하는 사이 끝내기를 눌렀다
      await window.seraphim.streamStop(kind).catch(() => false)
      return
    }
    setCh(kind, { status: st })
    if (!video || !dest) throw new Error('캡처가 준비되지 않았습니다.')
    const combined = new MediaStream([...video.getVideoTracks(), ...dest.stream.getAudioTracks()])
    const rec = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: q.captureBps, audioBitsPerSecond: 192_000 })
    const mySession = r.sessionId
    r.queue = Promise.resolve()
    rec.ondataavailable = (e): void => {
      if (!e.data.size) return
      const blob = e.data
      r.queue = r.queue.then(async () => window.seraphim.streamChunk(mySession, await blob.arrayBuffer()))
    }
    rec.onerror = (): void => {
      if (mySession === r.sessionId) void handleFailure(kind, '화면 녹화기가 멈췄습니다.')
    }
    r.recorder = rec
    rec.start(250)
  }

  const handleFailure = async (kind: StreamKind, message: string | null, fatal = false): Promise<void> => {
    const r = rt[kind]
    if (r.userStop) return
    stopRecorderSilently(kind)
    const ranMs = Date.now() - r.began
    r.quickFails = ranMs < 10_000 ? r.quickFails + 1 : 0
    const attempt = get()[KEY[kind]].attempt + 1
    // 저장 공간 부족·연속으로 바로 실패(키·주소 오류 등)·너무 많이 실패하면 멈춘다
    if (fatal || r.quickFails >= 3 || attempt > (kind === 'live' ? 30 : 5)) {
      await window.seraphim.streamStop(kind).catch(() => false)
      const recordPath = kind === 'record' ? (get().rec.status?.recordPath ?? null) : null
      setCh(kind, { phase: 'error', error: message ?? (kind === 'live' ? '방송이 중단되었습니다.' : '녹화가 중단되었습니다.'), notice: null, startedAt: null, attempt: 0 })
      if (recordPath) set({ lastRecordPath: recordPath })
      await releaseIfUnused()
      if (kind === 'record') void get().refreshDisk()
      return
    }
    // 방송은 서버가 돌아올 때까지 점점 길게 기다리고, 녹화는 곧바로 새 파일로 다시 시작한다
    const delay = kind === 'live' ? Math.min(15_000, 2000 * attempt) : 1000
    setCh(kind, {
      phase: 'reconnecting',
      attempt,
      notice:
        kind === 'live'
          ? `${message ?? '연결이 끊겼습니다.'} ${Math.round(delay / 1000)}초 뒤 다시 연결합니다 (${attempt}번째).`
          : `${message ?? '녹화가 멈췄습니다.'} 새 파일로 녹화를 이어 갑니다.`
    })
    const gen = r.gen
    r.retryTimer = setTimeout(() => {
      r.retryTimer = null
      if (r.gen === gen) startSession(kind).catch((e) => void handleFailure(kind, ipcMsg(e)))
    }, delay)
  }

  const startChannel = async (kind: StreamKind): Promise<void> => {
    if (isActive(get()[KEY[kind]].phase)) return
    const r = rt[kind]
    const gen = ++r.gen
    r.userStop = false
    r.quickFails = 0
    setCh(kind, { ...IDLE, phase: 'starting' })
    try {
      const cfg = await window.seraphim.getStreamConfig()
      set({ config: cfg })
      await ensureCapture(cfg)
      if (r.gen !== gen) return
      await startSession(kind)
    } catch (e) {
      if (r.gen !== gen) return
      stopRecorderSilently(kind)
      await window.seraphim.streamStop(kind).catch(() => false)
      setCh(kind, { ...IDLE, phase: 'error', error: ipcMsg(e) })
      await releaseIfUnused()
    }
  }

  const stopChannel = async (kind: StreamKind): Promise<void> => {
    const phase = get()[KEY[kind]].phase
    if (phase !== 'starting' && phase !== 'live' && phase !== 'reconnecting') return
    const r = rt[kind]
    r.gen++
    r.userStop = true
    if (r.retryTimer) clearTimeout(r.retryTimer)
    r.retryTimer = null
    setCh(kind, { phase: 'stopping' })
    const rec = r.recorder
    if (rec && rec.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 3000)
        rec.onstop = (): void => {
          clearTimeout(t)
          resolve()
        }
        rec.stop()
      })
    }
    r.recorder = null
    await r.queue
    await window.seraphim.streamStop(kind).catch(() => false)
    const recordPath = kind === 'record' ? (get().rec.status?.recordPath ?? null) : null
    setCh(kind, { ...IDLE })
    if (recordPath) set({ lastRecordPath: recordPath })
    r.userStop = false
    await releaseIfUnused()
    if (kind === 'record') void get().refreshDisk()
  }

  return {
    config: null,
    live: { ...IDLE },
    rec: { ...IDLE },
    previewOn: false,
    previewError: null,
    preview: null,
    audioLevel: 0,
    lastRecordPath: null,
    disk: null,

    init: async () => {
      if (initialized) return
      initialized = true
      set({ config: await window.seraphim.getStreamConfig() })
      void get().refreshDisk()
      window.seraphim.onStreamConfig((config) => set({ config }))
      window.seraphim.onStreamStatus((st) => {
        const kind: StreamKind = st.kind === 'record' ? 'record' : 'live'
        if (st.session !== rt[kind].sessionId) return
        const ch = get()[KEY[kind]]
        setCh(kind, { status: st })
        if (st.phase === 'live' && (ch.phase === 'starting' || ch.phase === 'reconnecting')) {
          setCh(kind, { phase: 'live', startedAt: ch.startedAt ?? st.startedAt ?? Date.now(), attempt: 0, notice: null })
        }
        if (kind === 'record') {
          if (st.recordPath && st.phase !== 'starting') set({ lastRecordPath: st.recordPath })
          const disk = get().disk
          if (st.freeBytes != null && disk) set({ disk: { ...disk, freeBytes: st.freeBytes } })
        }
        if (st.phase === 'failed' && (ch.phase === 'starting' || ch.phase === 'live' || ch.phase === 'reconnecting')) void handleFailure(kind, st.message, !!st.fatal)
      })
    },

    updateConfig: async (patch) => {
      const config = await window.seraphim.setStreamConfig(patch)
      set({ config })
      if (patch.audioGain != null && gain) gain.gain.value = patch.audioGain
    },

    refreshDisk: async () => {
      try {
        set({ disk: await window.seraphim.streamDisk() })
      } catch {
        /* 모르면 표시 안 함 */
      }
    },

    startPreview: async () => {
      if (get().previewOn) return
      set({ previewOn: true, previewError: null })
      try {
        const cfg = await window.seraphim.getStreamConfig()
        set({ config: cfg })
        await ensureCapture(cfg)
      } catch (e) {
        set({ previewOn: false, previewError: ipcMsg(e) })
        await releaseIfUnused()
      }
    },

    stopPreview: async () => {
      set({ previewOn: false, previewError: null })
      await releaseIfUnused()
    },

    startLive: async () => {
      const cfg = get().config ?? (await window.seraphim.getStreamConfig())
      const withRecord = cfg.recordWithLive && !isActive(get().rec.phase)
      await Promise.all([startChannel('live'), withRecord ? startChannel('record') : Promise.resolve()])
    },

    stopLive: async (alsoRecord = false) => {
      await Promise.all([stopChannel('live'), alsoRecord ? stopChannel('record') : Promise.resolve()])
    },

    startRecord: () => startChannel('record'),
    stopRecord: () => stopChannel('record')
  }
})

// E2E 테스트용 (DevTools에서 방송 스토어 조작)
;(window as unknown as { __seraphimDebug?: Record<string, unknown> }).__seraphimDebug = {
  ...(window as unknown as { __seraphimDebug?: Record<string, unknown> }).__seraphimDebug,
  broadcast: useBroadcast
}
