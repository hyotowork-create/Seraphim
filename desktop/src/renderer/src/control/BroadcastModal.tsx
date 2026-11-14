import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_STREAM_CONFIG,
  QUALITY_PRESETS,
  YOUTUBE_RTMPS_URL,
  diskLevel,
  formatBytes,
  formatRecordLeft,
  recordBytesPerSec,
  recordSecondsLeft,
  resolveCameraLayers,
  type StreamConfig,
  type StreamProbe
} from '@shared/stream'
import { useUi } from '../store/ui'
import { isActive, useBroadcast, type ChannelState } from '../store/broadcast'
import { CameraZoomControls } from './CameraZoomControls'
import { CameraSourceSelect } from './CameraSwitcher'
import { useLive } from '../store/live'

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

/** 1초마다 다시 그리기 (경과 시간 표시용) */
export function useTick(active: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

/** 남은 저장 공간으로 이 화질에서 더 녹화할 수 있는 시간 */
function useRecordLeft(): { sec: number | null; level: 'ok' | 'low' | 'critical' } {
  const free = useBroadcast((s) => s.disk?.freeBytes ?? null)
  const quality = useBroadcast((s) => s.config?.quality ?? '720p')
  if (free == null) return { sec: null, level: 'ok' }
  const sec = recordSecondsLeft(free, quality)
  return { sec, level: diskLevel(sec) }
}

const LEVEL_TEXT = { ok: 'text-slate-400', low: 'text-amber-300', critical: 'text-red-300' } as const

function channelLine(ch: ChannelState, kind: 'live' | 'record', now: number): { dot: string; text: string } {
  const name = kind === 'live' ? '방송' : '녹화'
  switch (ch.phase) {
    case 'live':
      return { dot: 'bg-red-500 animate-pulse', text: `${name} 중 ${ch.startedAt ? formatElapsed(now - ch.startedAt) : ''}` }
    case 'starting':
      return { dot: 'bg-amber-400 animate-pulse', text: kind === 'live' ? '연결 중…' : '녹화 준비 중…' }
    case 'reconnecting':
      return { dot: 'bg-amber-400 animate-pulse', text: kind === 'live' ? `다시 연결 중 (${ch.attempt}번째)` : '새 파일로 이어 가는 중' }
    case 'stopping':
      return { dot: 'bg-slate-400', text: '마무리 중…' }
    case 'error':
      return { dot: 'bg-red-400', text: `${name} 멈춤` }
    default:
      return { dot: 'bg-slate-500', text: `${name} 안 함` }
  }
}

function Seg<T extends string>({ value, options, onChange, disabled }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }): JSX.Element {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.key}
          disabled={disabled}
          onClick={() => onChange(o.key)}
          className={
            'flex-1 px-2 py-1.5 rounded border text-xs disabled:opacity-50 ' +
            (value === o.key ? 'bg-accent/20 border-accent text-white' : 'bg-panel2 border-line text-slate-300 hover:border-slate-500')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** YouTube 라이브 방송·녹화 — 스트림 키 방식 (YouTube Studio → 라이브 스트리밍 → 스트림 키) */
export function BroadcastModal(): JSX.Element | null {
  const open = useUi((s) => s.broadcastOpen)
  const close = useUi((s) => s.closeBroadcast)
  const b = useBroadcast()
  const cfg: StreamConfig = b.config ?? DEFAULT_STREAM_CONFIG
  const [probe, setProbe] = useState<StreamProbe | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyMsg, setKeyMsg] = useState<string | null>(null)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [confirmStop, setConfirmStop] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const liveBusy = isActive(b.live.phase)
  const recBusy = isActive(b.rec.phase)
  // 화질·소리 장치는 캡처를 함께 쓰므로 방송·녹화가 모두 끝난 뒤 바꾼다
  const busy = liveBusy || recBusy
  const now = useTick(open && (!!b.live.startedAt || !!b.rec.startedAt))
  const left = useRecordLeft()
  const cameras = useLive((s) => s.state.cameras)
  const activeCamera = useLive((s) => s.state.activeCamera)
  const streamSource = cfg.cameraSource ?? 'program'
  // 방송 화면에 보이는 카메라 (줌 조절 대상)
  const streamCam = streamSource === 'none' ? null : resolveCameraLayers(cameras, activeCamera, streamSource).visible

  const loadDevices = async (): Promise<void> => {
    try {
      // 장치 이름을 얻으려면 권한을 한 번 받아야 한다
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
    } catch {
      /* 장치가 없거나 거부 — 목록은 계속 */
    }
    const devs = await navigator.mediaDevices.enumerateDevices()
    setMics(devs.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications'))
  }

  useEffect(() => {
    if (!open) return
    void b.init()
    void b.refreshDisk()
    void window.seraphim.streamProbe().then(setProbe)
    void window.seraphim.hasStreamKey().then(setHasKey)
    void loadDevices()
    setKeyMsg(null)
    setConfirmStop(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!liveBusy) setConfirmStop(false)
  }, [liveBusy])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (v.srcObject !== b.preview) {
      v.srcObject = b.preview
      if (b.preview) void v.play().catch(() => {})
    }
  }, [b.preview, open])

  if (!open) return null

  const up = (p: Partial<StreamConfig>): void => void b.updateConfig(p)

  const saveKey = async (): Promise<void> => {
    const ok = await window.seraphim.setStreamKey(keyDraft)
    setHasKey(ok)
    setKeyDraft('')
    setKeyMsg(ok ? '스트림 키를 저장했습니다 (이 PC에 암호화 보관).' : '스트림 키를 지웠습니다.')
  }

  const liveLine = channelLine(b.live, 'live', now)
  const recLine = channelLine(b.rec, 'record', now)
  const level = Math.round(b.audioLevel * 100)
  const clip = b.audioLevel > 0.95
  const gbPerHour = (recordBytesPerSec(cfg.quality) * 3600) / 1024 ** 3
  const errors = [
    b.live.error && `방송: ${b.live.error}`,
    b.rec.error && `녹화: ${b.rec.error}`,
    b.previewError && `미리보기: ${b.previewError}`
  ].filter(Boolean) as string[]
  const notices = [b.live.notice && `방송: ${b.live.notice}`, b.rec.notice && `녹화: ${b.rec.notice}`].filter(Boolean) as string[]

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={close}>
      <div className="w-[980px] max-h-[92vh] flex flex-col rounded-lg border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-12 border-b border-line bg-panel2 shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-slate-100">YouTube 방송 · 녹화</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-200" data-broadcast-state={b.live.phase}>
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${liveLine.dot}`} />
              {liveLine.text}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-200" data-record-state={b.rec.phase}>
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${recLine.dot}`} />
              {recLine.text}
            </span>
            {b.live.phase === 'live' && b.live.status && (
              <span className="text-[11px] text-slate-400 tabular-nums">
                {b.live.status.fps != null ? `${Math.round(b.live.status.fps)}fps` : ''}
                {b.live.status.kbps != null ? ` · ${(b.live.status.kbps / 1000).toFixed(1)} Mbps` : ''}
                {b.live.status.speed != null && b.live.status.speed < 0.95 ? ' · 인코딩이 느림' : ''}
              </span>
            )}
          </div>
          <button onClick={close} className="text-slate-400 hover:text-white text-lg" title="닫아도 방송·녹화는 계속됩니다">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto grid grid-cols-[1fr_380px] gap-4 p-5 text-sm">
          {/* 왼쪽: 미리보기 + 소리 */}
          <div className="space-y-3 min-w-0">
            <div className="relative aspect-video rounded border border-line bg-black overflow-hidden">
              <video ref={videoRef} className="w-full h-full object-contain" muted playsInline data-broadcast-preview />
              {!b.preview && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                  <span>방송·녹화로 나갈 화면이 여기에 보입니다</span>
                  <button
                    onClick={() => void b.startPreview()}
                    className="px-3 py-1.5 rounded bg-panel2 border border-line text-slate-200 hover:border-slate-500"
                  >
                    미리보기 켜기
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-10 text-slate-400">소리</span>
              <div className="flex-1 h-2.5 rounded bg-black/50 border border-line overflow-hidden" data-audio-meter={level}>
                <div
                  className={`h-full ${clip ? 'bg-red-500' : level > 70 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                  style={{ width: `${level}%`, transition: 'width 80ms linear' }}
                />
              </div>
              <span className="w-10 text-right tabular-nums text-slate-400">{b.preview ? `${level}%` : '—'}</span>
            </div>
            {errors.map((t) => (
              <div key={t} className="text-xs text-red-300 bg-red-500/10 border border-red-500/40 rounded px-2 py-1.5 whitespace-pre-wrap" data-broadcast-error>
                {t}
              </div>
            ))}
            {notices.map((t) => (
              <div key={t} className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/40 rounded px-2 py-1.5">
                {t}
              </div>
            ))}
            {probe && !probe.ok && (
              <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/40 rounded px-2 py-1.5">방송 엔진(ffmpeg)을 쓸 수 없습니다: {probe.error}</div>
            )}
            <div className="text-[11px] text-slate-500 leading-relaxed space-y-1">
              <p>
                <b className="text-slate-300">처음 한 번:</b> YouTube Studio → 만들기 → 라이브 스트리밍 시작 → 스트리밍 소프트웨어(스트림 키) 방식을 고르고, 스트림 키를 복사해 오른쪽에 저장하세요.
              </p>
              <p>방송을 시작하고 10~20초 뒤 YouTube Studio 미리보기에 화면이 보이면, Studio에서 “라이브 스트리밍 시작”을 누르면 시청자에게 나갑니다 (자동 시작을 켜 두었다면 바로 나갑니다).</p>
              <p>이 창을 닫아도 방송·녹화는 계속되며, 상단의 빨간 LIVE·REC 표시로 상태를 볼 수 있습니다.</p>
            </div>
          </div>

          {/* 오른쪽: 설정 */}
          <div className="space-y-4">
            <section className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">스트림 키</span>
                <span className={hasKey ? 'text-emerald-300' : 'text-amber-300'} data-stream-key-state={hasKey ? 'saved' : 'missing'}>
                  {hasKey ? '✓ 저장됨' : '아직 없음'}
                </span>
              </div>
              <div className="flex gap-1">
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder={hasKey ? '바꾸려면 새 키를 붙여 넣기' : 'xxxx-xxxx-xxxx-xxxx-xxxx'}
                  disabled={liveBusy}
                  className="flex-1 min-w-0 bg-black/40 border border-line rounded px-2 py-1.5 text-slate-200 outline-none text-xs"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  onClick={() => void saveKey()}
                  disabled={liveBusy || (!keyDraft.trim() && !hasKey)}
                  className="px-2 rounded bg-panel2 border border-line text-xs text-slate-200 hover:border-slate-500 disabled:opacity-40"
                >
                  {keyDraft.trim() || !hasKey ? '저장' : '지우기'}
                </button>
              </div>
              {keyMsg && <div className="text-[11px] text-slate-400">{keyMsg}</div>}
              <button onClick={() => void window.seraphim.openYoutubeStudio()} className="text-[11px] text-accent hover:underline">
                YouTube Studio 열기 ↗
              </button>
              <details className="text-[11px] text-slate-400">
                <summary className="cursor-pointer select-none">고급: 서버 주소</summary>
                <div className="flex gap-1 mt-1">
                  <input
                    defaultValue={cfg.serverUrl}
                    key={cfg.serverUrl}
                    disabled={liveBusy}
                    onBlur={(e) => e.target.value.trim() !== cfg.serverUrl && up({ serverUrl: e.target.value.trim() || YOUTUBE_RTMPS_URL })}
                    className="flex-1 min-w-0 bg-black/40 border border-line rounded px-2 py-1 text-slate-200 outline-none"
                    spellCheck={false}
                  />
                  <button
                    onClick={() => up({ serverUrl: YOUTUBE_RTMPS_URL })}
                    disabled={liveBusy}
                    className="px-2 rounded bg-panel2 border border-line hover:border-slate-500 disabled:opacity-40"
                  >
                    기본값
                  </button>
                </div>
                <p className="mt-1 leading-relaxed">YouTube 기본값을 쓰세요. 다른 서비스(페이스북 등)는 그 서비스가 알려 주는 RTMP 주소를 넣습니다.</p>
              </details>
            </section>

            <section className="space-y-1.5">
              <div className="text-xs text-slate-400">화질 (방송·녹화 공통)</div>
              <select
                value={cfg.quality}
                disabled={busy}
                onChange={(e) => up({ quality: e.target.value as StreamConfig['quality'] })}
                className="w-full bg-black/40 border border-line rounded px-2 py-1.5 text-xs text-slate-200 outline-none"
              >
                {Object.entries(QUALITY_PRESETS).map(([k, q]) => (
                  <option key={k} value={k}>
                    {q.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                교회 인터넷 업로드 속도가 {(QUALITY_PRESETS[cfg.quality] ?? QUALITY_PRESETS['720p']).uploadMbps} Mbps 이상이어야 끊기지 않습니다.
              </p>
              {cfg.quality === '1440p' && (
                <p className="text-[11px] text-amber-200/90 leading-relaxed" data-quality-note>
                  아이폰 연속성 카메라는 1080p까지만 보내므로 카메라 화면은 1080p를 키운 화질입니다(자막·글자는 2K로 선명). 카메라까지 2K로 보내려면 4K를 지원하는 웹캠 앱이나 캡처 장치가 필요합니다.
                  {/Windows/i.test(navigator.userAgent) && ' 윈도우는 CPU로 인코딩하므로 PC 성능이 낮으면 끊길 수 있습니다.'}
                </p>
              )}
            </section>

            <section className="space-y-1.5">
              <div className="text-xs text-slate-400">방송 화면 구성</div>
              <Seg
                value={cfg.layout}
                options={[
                  { key: 'lowerThird', label: '카메라 + 하단 자막' },
                  { key: 'mirror', label: '송출 화면 그대로' }
                ]}
                onChange={(v) => up({ layout: v })}
              />
              {cfg.layout === 'lowerThird' ? (
                <div className="space-y-2 pt-1">
                  <CameraSourceSelect value={cfg.cameraSource ?? 'program'} onChange={(v) => up({ cameraSource: v })} allowNone />
                  <label className="flex items-center gap-2 text-[11px] text-slate-300">
                    <span className="w-14 text-slate-400">자막 크기</span>
                    <input
                      type="range"
                      min={0.35}
                      max={1}
                      step={0.05}
                      value={cfg.lowerThirdScale}
                      onChange={(e) => up({ lowerThirdScale: Number(e.target.value) })}
                      className="flex-1 accent-accent"
                    />
                    <span className="w-9 text-right">{Math.round(cfg.lowerThirdScale * 100)}%</span>
                  </label>
                  {streamCam != null && <CameraZoomControls index={streamCam} />}
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    검정 화면(B)·로고(L)일 때는 자막만 숨기고 카메라는 계속 나갑니다. “카메라 전환 따라가기”면 프리뷰 아래 카메라 칸이나 숫자키 1·2·3으로 방송 중에 카메라를 바꿉니다.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 leading-relaxed">프로젝터에 나가는 화면이 그대로 방송됩니다. 검정 화면(B)이면 방송도 검정입니다.</p>
              )}
            </section>

            <section className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">소리 입력 (믹서·오디오 인터페이스)</span>
                <button onClick={() => void loadDevices()} className="text-[11px] text-slate-400 hover:text-white">
                  새로고침
                </button>
              </div>
              <select
                value={cfg.audioDeviceId ?? ''}
                disabled={busy}
                onChange={(e) => {
                  const d = mics.find((m) => m.deviceId === e.target.value)
                  up({ audioDeviceId: d?.deviceId ?? null, audioLabel: d?.label ?? null })
                }}
                className="w-full bg-black/40 border border-line rounded px-2 py-1.5 text-xs text-slate-200 outline-none"
              >
                <option value="">소리 없음</option>
                {mics.map((m, i) => (
                  <option key={m.deviceId} value={m.deviceId}>
                    {m.label || `입력 ${i + 1}`}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-[11px] text-slate-300">
                <span className="w-14 text-slate-400">크기</span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={cfg.audioGain}
                  onChange={(e) => up({ audioGain: Number(e.target.value) })}
                  className="flex-1 accent-accent"
                />
                <span className="w-9 text-right">{Math.round(cfg.audioGain * 100)}%</span>
              </label>
              {busy && <p className="text-[11px] text-slate-500">소리 장치·화질은 방송·녹화를 모두 끝낸 뒤 바꿀 수 있습니다. 소리 크기와 화면 구성은 방송 중에도 바뀝니다.</p>}
            </section>

            <section className="space-y-1.5" data-record-section>
              <div className="text-xs text-slate-400">녹화 (MP4)</div>
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input type="checkbox" checked={cfg.recordWithLive} onChange={(e) => up({ recordWithLive: e.target.checked })} className="accent-accent" data-record-with-live />
                방송을 시작할 때 녹화도 함께 시작
              </label>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                녹화는 방송과 따로 돌아 인터넷이 끊겨도 계속됩니다. 상단의 <b className="text-slate-300">● 녹화</b> 버튼으로 방송 없이도 언제든 켜고 끌 수 있습니다.
              </p>
              <div className="text-[11px] leading-relaxed" data-disk-info>
                {b.disk?.freeBytes != null ? (
                  <span className={LEVEL_TEXT[left.level]}>
                    남은 공간 {formatBytes(b.disk.freeBytes)} · 이 화질로 {formatRecordLeft(left.sec ?? 0)} 녹화 가능 (1시간에 약 {gbPerHour.toFixed(1)} GB)
                    {left.level === 'critical' ? ' — 공간이 거의 없습니다. 파일을 정리하세요.' : left.level === 'low' ? ' — 공간이 부족해지고 있습니다.' : ''}
                  </span>
                ) : (
                  <span className="text-slate-500">남은 공간을 확인할 수 없습니다.</span>
                )}
                <div className="text-slate-500 truncate" title={b.disk?.dir}>
                  저장 위치: {b.disk?.dir ?? '동영상 폴더'}
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 h-14 border-t border-line bg-panel2 shrink-0">
          <button onClick={() => void window.seraphim.openRecordings(b.lastRecordPath ?? undefined)} className="text-xs text-slate-400 hover:text-white">
            {b.lastRecordPath ? '방금 녹화한 파일 보기' : '녹화 폴더 열기'}
          </button>
          {b.previewOn && !busy && (
            <button onClick={() => void b.stopPreview()} className="text-xs text-slate-400 hover:text-white">
              미리보기 끄기
            </button>
          )}
          {confirmStop ? (
            <div className="ml-auto flex items-center gap-2" data-stop-confirm>
              <span className="text-xs text-slate-200">방송을 끝낼까요? 시청자 화면이 멈춥니다.</span>
              <button onClick={() => setConfirmStop(false)} className="px-3 py-2 rounded border border-line text-xs text-slate-200 hover:border-slate-500">
                취소
              </button>
              {recBusy ? (
                <>
                  <button
                    onClick={() => {
                      setConfirmStop(false)
                      void b.stopLive(false)
                    }}
                    className="px-3 py-2 rounded bg-red-600/80 text-xs text-white hover:bg-red-500"
                    data-stop-live-only
                  >
                    방송만 끝내기 (녹화 계속)
                  </button>
                  <button
                    onClick={() => {
                      setConfirmStop(false)
                      void b.stopLive(true)
                    }}
                    className="px-3 py-2 rounded bg-red-600 text-xs text-white hover:bg-red-500"
                    data-stop-all
                  >
                    방송·녹화 모두 끝내기
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setConfirmStop(false)
                    void b.stopLive(false)
                  }}
                  className="px-3 py-2 rounded bg-red-600 text-xs text-white hover:bg-red-500"
                  data-stop-live-only
                >
                  방송 끝내기
                </button>
              )}
            </div>
          ) : (
            <div className="ml-auto flex gap-2">
              {recBusy ? (
                <button
                  onClick={() => {
                    if (window.confirm('녹화를 끝낼까요? 지금까지 녹화한 파일은 저장됩니다.')) void b.stopRecord()
                  }}
                  disabled={b.rec.phase === 'stopping'}
                  className="px-4 py-2 rounded border border-red-500 text-sm text-red-200 hover:bg-red-500/15 disabled:opacity-50 tabular-nums"
                  data-record-stop
                >
                  {b.rec.phase === 'stopping' ? '녹화 마무리 중…' : `■ 녹화 끝내기${b.rec.startedAt ? ` ${formatElapsed(now - b.rec.startedAt)}` : ''}`}
                </button>
              ) : (
                <button
                  onClick={() => void b.startRecord()}
                  disabled={!probe?.ok}
                  className="px-4 py-2 rounded border border-line text-sm text-slate-100 hover:border-red-400 disabled:opacity-40"
                  data-record-start
                >
                  <span className="text-red-500">●</span> 녹화 시작
                </button>
              )}
              {liveBusy ? (
                <button
                  onClick={() => setConfirmStop(true)}
                  disabled={b.live.phase === 'stopping'}
                  className="px-5 py-2 rounded bg-red-600 text-sm text-white hover:bg-red-500 disabled:opacity-50"
                  data-broadcast-stop
                >
                  {b.live.phase === 'stopping' ? '마무리 중…' : '방송 끝내기'}
                </button>
              ) : (
                <button
                  onClick={() => void b.startLive()}
                  disabled={!probe?.ok || !hasKey}
                  className="px-5 py-2 rounded bg-red-600 text-sm text-white hover:bg-red-500 disabled:opacity-40"
                  title={!hasKey ? '스트림 키를 먼저 저장하세요' : undefined}
                  data-broadcast-start
                >
                  ● 방송 시작{cfg.recordWithLive && !recBusy ? ' + 녹화' : ''}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 상단 바: 방송 버튼 / 방송 중이면 빨간 LIVE 표시와 경과 시간 — 누르면 방송 창 */
export function BroadcastHeaderButton(): JSX.Element {
  const openBroadcast = useUi((s) => s.openBroadcast)
  const phase = useBroadcast((s) => s.live.phase)
  const startedAt = useBroadcast((s) => s.live.startedAt)
  const onAir = isActive(phase)
  const now = useTick(onAir)
  useEffect(() => {
    void useBroadcast.getState().init()
  }, [])
  if (onAir) {
    return (
      <button
        onClick={openBroadcast}
        className={`px-3 py-1 rounded text-xs font-semibold text-white tabular-nums ${phase === 'live' ? 'bg-red-600' : 'bg-amber-600'}`}
        data-live-pill
      >
        ● {phase === 'live' ? 'LIVE' : phase === 'reconnecting' ? '재연결' : phase === 'stopping' ? '종료 중' : '연결 중'}
        {startedAt ? ` ${formatElapsed(now - startedAt)}` : ''}
      </button>
    )
  }
  return (
    <button
      onClick={openBroadcast}
      className={
        'px-3 py-1 rounded border bg-panel text-xs hover:border-slate-500 ' + (phase === 'error' ? 'border-amber-500 text-amber-200' : 'border-line text-slate-200')
      }
      title={phase === 'error' ? '방송이 멈췄습니다 — 눌러서 이유 보기' : undefined}
    >
      {phase === 'error' ? '⚠ 방송 멈춤' : '📡 유튜브 방송'}
    </button>
  )
}

/** 상단 바: 녹화 — 누르면 바로 녹화(방송과 따로), 녹화 중이면 빨간 REC와 경과·남은 시간, 누르면 끝내기 */
export function RecordHeaderButton(): JSX.Element {
  const openBroadcast = useUi((s) => s.openBroadcast)
  const rec = useBroadcast((s) => s.rec)
  const lastRecordPath = useBroadcast((s) => s.lastRecordPath)
  const recording = isActive(rec.phase)
  const now = useTick(recording)
  const left = useRecordLeft()
  useEffect(() => {
    void useBroadcast.getState().init()
  }, [])

  if (rec.phase === 'live' || rec.phase === 'reconnecting') {
    const warn = left.level !== 'ok' && left.sec != null
    return (
      <button
        onClick={() => {
          if (window.confirm('녹화를 끝낼까요? 지금까지 녹화한 파일은 저장됩니다.')) void useBroadcast.getState().stopRecord()
        }}
        className={
          'px-3 py-1 rounded text-xs font-semibold text-white tabular-nums ' +
          (rec.phase === 'live' ? 'bg-red-600' : 'bg-amber-600') +
          (left.level === 'critical' ? ' ring-2 ring-amber-300 animate-pulse' : '')
        }
        title={`누르면 녹화를 끝냅니다${left.sec != null ? ` · 남은 공간으로 ${formatRecordLeft(left.sec)} 더 녹화 가능` : ''}`}
        data-rec-pill
      >
        ● REC{rec.startedAt ? ` ${formatElapsed(now - rec.startedAt)}` : ''}
        {rec.phase === 'reconnecting' ? ' · 이어 가는 중' : warn ? ` · 남은 ${formatRecordLeft(left.sec!)}` : ''}
      </button>
    )
  }
  if (rec.phase === 'starting' || rec.phase === 'stopping') {
    return (
      <span className="px-3 py-1 rounded bg-amber-600 text-xs font-semibold text-white" data-rec-pill>
        {rec.phase === 'starting' ? '● 녹화 준비 중…' : '녹화 마무리 중…'}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1">
      <button
        onClick={() => (rec.phase === 'error' ? openBroadcast() : void useBroadcast.getState().startRecord())}
        className={
          'px-3 py-1 rounded border bg-panel text-xs hover:border-slate-500 ' + (rec.phase === 'error' ? 'border-amber-500 text-amber-200' : 'border-line text-slate-200')
        }
        title={rec.phase === 'error' ? '녹화가 멈췄습니다 — 눌러서 이유 보기' : '누르면 바로 녹화를 시작합니다 (방송과 따로, 동영상 폴더에 MP4)'}
        data-rec-button
      >
        {rec.phase === 'error' ? (
          '⚠ 녹화 멈춤'
        ) : (
          <>
            <span className="text-red-500">●</span> 녹화
          </>
        )}
      </button>
      {lastRecordPath && (
        <button
          onClick={() => void window.seraphim.openRecordings(lastRecordPath)}
          className="px-1.5 py-1 rounded border border-line bg-panel text-xs text-slate-300 hover:border-slate-500"
          title="방금 녹화한 파일 보기"
        >
          📁
        </button>
      )}
    </span>
  )
}
