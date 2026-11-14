import { useEffect, useState } from 'react'
import { CAMERA_SLOT_COUNT, CAMERA_ZOOM_MAX, resolveCameraLayers, type CameraSource } from '@shared/stream'
import { useLive } from '../store/live'
import { useUi } from '../store/ui'
import { CameraView } from '../components/SlideView'
import { CameraZoomControls } from './CameraZoomControls'

/** 화면에 나가는 곳(프로젝터 배경 카메라·방송 카메라) 중 '카메라 전환 따라가기'를 쓰는 곳이 있는지 — 전환 버튼의 의미 안내용 */
function useProgramUsers(): { projector: boolean; stream: boolean } {
  const bg = useLive((s) => s.state.background)
  const [stream, setStream] = useState(false)
  useEffect(() => {
    const apply = (c: { layout: string; cameraSource: unknown }): void => setStream(c.layout === 'lowerThird' && c.cameraSource === 'program')
    void window.seraphim.getStreamConfig().then(apply)
    return window.seraphim.onStreamConfig(apply)
  }, [])
  return { projector: bg.kind === 'camera' && (bg.cameraSource ?? 'program') === 'program', stream }
}

/** 카메라 칸 위의 줌 −/배율/+ (배율을 누르면 원래 크기). 칸을 누르는 전환과 겹치지 않게 클릭을 막는다 */
function TileZoom({ index, zoom }: { index: number; zoom: number }): JSX.Element {
  const patch = useLive((s) => s.patch)
  const setZoom = (z: number): void => {
    const next = Math.min(CAMERA_ZOOM_MAX, Math.max(1, Math.round(z * 4) / 4))
    void patch({ cameraSlot: { index, view: next <= 1 ? { zoom: 1, x: 0.5, y: 0.5 } : { zoom: next } } })
  }
  const btn = 'w-6 h-5 leading-none hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <div
      className="absolute bottom-1 left-1 flex items-center rounded bg-black/70 text-[11px] text-white overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      data-tile-zoom={index}
    >
      <button onClick={() => setZoom(zoom - 0.25)} disabled={zoom <= 1.001} className={btn} title="줌 아웃 (키보드 −)" aria-label={`카메라 ${index + 1} 줌 아웃`}>
        −
      </button>
      <button
        onClick={() => setZoom(1)}
        disabled={zoom <= 1.001}
        className="px-1 h-5 tabular-nums hover:bg-white/20 disabled:hover:bg-transparent"
        title="원래 크기로 (키보드 0)"
        data-tile-zoom-value={zoom}
      >
        {zoom.toFixed(1)}×
      </button>
      <button onClick={() => setZoom(zoom + 0.25)} disabled={zoom >= CAMERA_ZOOM_MAX} className={btn} title="줌 인 (키보드 +)" aria-label={`카메라 ${index + 1} 줌 인`}>
        +
      </button>
    </div>
  )
}

/**
 * 카메라 1·2·3 — 프리뷰 아래 칸. 연결된 카메라를 실시간으로 보여 주고, 누르면(또는 숫자키 1·2·3) 그 카메라로 전환한다.
 * '카메라 전환 따라가기'로 설정된 프로젝터 배경·방송 화면이 함께 바뀐다.
 */
export function CameraSwitcher(): JSX.Element {
  const cameras = useLive((s) => s.state.cameras)
  const active = useLive((s) => s.state.activeCamera)
  const capture = useLive((s) => s.state.cameraCapture)
  const patch = useLive((s) => s.patch)
  const openSetup = useUi((s) => s.openCameraSetup)
  const users = useProgramUsers()
  const visible = resolveCameraLayers(cameras, active, 'program').visible
  const anyConfigured = cameras.some((c) => c.deviceId)

  if (!anyConfigured) {
    return (
      <div className="flex items-center gap-2 border border-line rounded-lg bg-panel2/40 px-2 py-1.5 text-[11px] text-slate-400" data-camera-switcher="empty">
        <span className="font-semibold text-slate-300">카메라</span>
        <span>여러 카메라(아이폰·오즈모 등)를 연결해 두고 1·2·3으로 전환합니다</span>
        <div className="ml-auto flex gap-1">
          {Array.from({ length: CAMERA_SLOT_COUNT }, (_, i) => (
            <button
              key={i}
              onClick={() => openSetup(i)}
              className="px-2 py-1 rounded bg-panel2 border border-line text-slate-200 hover:border-slate-500"
            >
              ＋ 카메라 {i + 1}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const onAir = users.projector || users.stream
  return (
    <div className="border border-line rounded-lg bg-panel2/40 p-2" data-camera-switcher="tiles">
      <div className="flex items-center gap-2 mb-1.5 text-[11px]">
        <span className="font-semibold text-slate-300">카메라 전환</span>
        <span className="text-slate-500">
          {onAir
            ? `누르거나 숫자키 1·2·3 — ${[users.projector && '프로젝터 배경', users.stream && '유튜브 방송'].filter(Boolean).join('·')}이(가) 함께 바뀝니다 · 칸 아래 − + 로 줌`
            : '프로젝터 배경을 "카메라"로 하거나 방송 화면을 "카메라 + 하단 자막"으로 하면 여기서 전환됩니다'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cameras.map((slot, i) => {
          const isOn = slot.deviceId && visible === i
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => (slot.deviceId ? void patch({ activeCamera: i }) : openSetup(i))}
              className={
                'relative aspect-video max-h-[92px] w-full rounded overflow-hidden cursor-pointer border-2 bg-black ' +
                (isOn ? 'border-red-500' : 'border-line hover:border-slate-500')
              }
              data-camera-tile={i}
              data-camera-on={isOn ? '1' : '0'}
              title={slot.deviceId ? `카메라 ${i + 1}로 전환 (${i + 1})` : `카메라 ${i + 1} 연결`}
            >
              {slot.deviceId ? (
                <CameraView deviceId={slot.deviceId} view={slot.view} ideal={capture} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-500">＋ 카메라 {i + 1} 연결</div>
              )}
              <div className="absolute top-1 left-1 flex items-center gap-1 text-[10px]">
                <span className={'px-1.5 rounded font-bold ' + (isOn ? 'bg-red-600 text-white' : 'bg-black/70 text-slate-200')}>{i + 1}</span>
                {slot.deviceId && <span className="px-1 rounded bg-black/60 text-slate-200 max-w-[120px] truncate">{slot.label || '카메라'}</span>}
              </div>
              {isOn && onAir && <span className="absolute top-1 right-1 px-1 rounded bg-red-600 text-[9px] font-bold text-white">ON AIR</span>}
              {slot.deviceId && <TileZoom index={i} zoom={slot.view.zoom} />}
              {slot.deviceId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openSetup(i)
                  }}
                  className="absolute bottom-1 right-1 px-1 rounded bg-black/60 text-[10px] text-slate-200 hover:bg-black/80"
                  title={`카메라 ${i + 1} 설정·줌`}
                >
                  ⚙
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 카메라 N 연결·줌 설정 창 */
export function CameraSetupDialog(): JSX.Element | null {
  const index = useUi((s) => s.cameraSetup)
  const close = useUi((s) => s.closeCameraSetup)
  const cameras = useLive((s) => s.state.cameras)
  const capture = useLive((s) => s.state.cameraCapture)
  const patch = useLive((s) => s.patch)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      // 장치 이름을 얻으려면 권한을 한 번 받아야 한다
      const s = await navigator.mediaDevices.getUserMedia({ video: true })
      s.getTracks().forEach((t) => t.stop())
    } catch {
      /* 장치 없음·거부 — 목록은 계속 */
    }
    try {
      const devs = await navigator.mediaDevices.enumerateDevices()
      setDevices(devs.filter((d) => d.kind === 'videoinput'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (index != null) void load()
  }, [index])

  if (index == null) return null
  const slot = cameras[index]
  const usedElsewhere = (id: string): number => cameras.findIndex((c, i) => i !== index && c.deviceId === id)

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={close}>
      <div className="w-[560px] rounded-lg border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()} data-camera-setup={index}>
        <div className="flex items-center justify-between px-5 h-12 border-b border-line bg-panel2">
          <div className="text-sm font-semibold text-slate-100">카메라 {index + 1} 설정</div>
          <button onClick={close} className="text-slate-400 hover:text-white text-lg">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="flex gap-2">
            <select
              value={slot.deviceId ?? ''}
              onChange={(e) => {
                const d = devices.find((x) => x.deviceId === e.target.value)
                void patch({ cameraSlot: { index, deviceId: d?.deviceId ?? null, label: d?.label ?? null } })
              }}
              className="flex-1 min-w-0 bg-black/40 border border-line rounded px-2 py-1.5 text-xs text-slate-200 outline-none"
              data-camera-device-select
            >
              <option value="">{loading ? '카메라 찾는 중…' : '연결 안 함'}</option>
              {devices.map((d, i) => {
                const other = usedElsewhere(d.deviceId)
                return (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `카메라 ${i + 1}`}
                    {other >= 0 ? ` (카메라 ${other + 1}에서도 사용 중)` : ''}
                  </option>
                )
              })}
            </select>
            <button onClick={() => void load()} className="px-2 rounded bg-panel2 border border-line text-xs text-slate-200 hover:border-slate-500">
              새로고침
            </button>
          </div>
          <div className="aspect-video rounded border border-line bg-black overflow-hidden">
            {slot.deviceId ? (
              <CameraView deviceId={slot.deviceId} view={slot.view} ideal={capture} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">카메라를 고르면 여기에 보입니다</div>
            )}
          </div>
          {slot.deviceId && <CameraZoomControls index={index} />}
          <div className="text-[11px] text-slate-500 leading-relaxed space-y-1">
            <p>아이폰: 맥의 연속성 카메라(같은 Apple ID, 가로 거치)로 연결하면 목록에 나옵니다. 최대 1080p.</p>
            <p>DJI 오즈모 포켓 3: USB-C로 연결하고 기기에서 “웹캠” 모드를 고르세요. 펌웨어 v01.04.08.02 이상이면 4K까지 받습니다.</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 h-14 border-t border-line bg-panel2">
          <button
            onClick={() => void patch({ cameraSlot: { index, deviceId: null, label: null } })}
            disabled={!slot.deviceId}
            className="text-xs text-slate-400 hover:text-white disabled:opacity-40"
          >
            이 칸 비우기
          </button>
          <button onClick={close} className="px-4 py-2 rounded bg-accent text-sm text-white hover:bg-accent/80">
            완료
          </button>
        </div>
      </div>
    </div>
  )
}

/** 카메라 출처 고르기 — 프로젝터 배경·방송 화면 공용 ('카메라 전환 따라가기' / 카메라 N 고정 / (방송만) 카메라 없이) */
export function CameraSourceSelect({
  value,
  onChange,
  allowNone = false
}: {
  value: CameraSource | 'none'
  onChange: (v: CameraSource | 'none') => void
  allowNone?: boolean
}): JSX.Element {
  const cameras = useLive((s) => s.state.cameras)
  const active = useLive((s) => s.state.activeCamera)
  const openSetup = useUi((s) => s.openCameraSetup)
  const vis = resolveCameraLayers(cameras, active, 'program').visible
  const firstEmpty = cameras.findIndex((c) => !c.deviceId)
  return (
    <div className="space-y-1">
      <select
        value={String(value)}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === 'program' || v === 'none' ? v : Number(v))
        }}
        className="w-full bg-black/40 border border-line rounded px-2 py-1.5 text-xs text-slate-200 outline-none"
        data-camera-source-select
      >
        <option value="program">
          카메라 전환 따라가기{vis != null ? ` · 지금 카메라 ${vis + 1}${cameras[vis].label ? ` (${cameras[vis].label})` : ''}` : ' · 연결된 카메라 없음'}
        </option>
        {cameras.map((c, i) => (
          <option key={i} value={i} disabled={!c.deviceId}>
            카메라 {i + 1} 고정{c.deviceId ? ` · ${c.label || '카메라'}` : ' (연결 안 됨)'}
          </option>
        ))}
        {allowNone && <option value="none">카메라 없이 — 송출 배경 그대로</option>}
      </select>
      <button onClick={() => openSetup(firstEmpty >= 0 ? firstEmpty : 0)} className="text-[11px] text-accent hover:underline">
        카메라 연결·설정…
      </button>
    </div>
  )
}
