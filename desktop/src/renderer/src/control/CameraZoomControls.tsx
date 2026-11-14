import { CAMERA_ZOOM_MAX, DEFAULT_CAMERA_VIEW, resolveCameraLayers, type CameraViewState } from '@shared/stream'
import { useLive } from '../store/live'

const PRESETS = [1, 1.5, 2, 3]

/**
 * 카메라 줌 인/아웃 + 위치 — 카메라마다 따로 기억되는 디지털 줌.
 * index를 주면 그 카메라, 없으면 지금 화면에 보이는(전환된) 카메라를 조절한다.
 * 송출 창과 방송 창에 함께 적용된다. 단축키: + / − / 0 (보이는 카메라). compact = 좁은 패널용(설명 짧게)
 */
export function CameraZoomControls({ index, compact = false }: { index?: number; compact?: boolean }): JSX.Element {
  const cameras = useLive((s) => s.state.cameras)
  const active = useLive((s) => s.state.activeCamera)
  const patch = useLive((s) => s.patch)
  const target = index ?? resolveCameraLayers(cameras, active, 'program').visible ?? active
  const cam: CameraViewState = cameras[target]?.view ?? DEFAULT_CAMERA_VIEW
  const setCam = (p: Partial<CameraViewState>): void => void patch({ cameraSlot: { index: target, view: p } })
  const step = (d: number): void => setCam({ zoom: Math.round((cam.zoom + d) * 4) / 4 })
  const zoomed = cam.zoom > 1.001

  return (
    <div className="space-y-1.5 text-[11px] text-slate-300" data-camera-controls={target}>
      <div className="flex items-center gap-1.5">
        <span className="w-8 text-slate-400">확대</span>
        <button
          onClick={() => step(-0.25)}
          disabled={!zoomed}
          className="w-6 h-6 rounded bg-panel2 border border-line hover:border-slate-500 disabled:opacity-40"
          title="줌 아웃 (−)"
          aria-label="줌 아웃"
        >
          −
        </button>
        <input
          type="range"
          min={1}
          max={CAMERA_ZOOM_MAX}
          step={0.05}
          value={cam.zoom}
          onChange={(e) => setCam({ zoom: Number(e.target.value) })}
          className="flex-1 accent-accent"
          aria-label={`카메라 ${target + 1} 확대 배율`}
        />
        <button
          onClick={() => step(0.25)}
          disabled={cam.zoom >= CAMERA_ZOOM_MAX}
          className="w-6 h-6 rounded bg-panel2 border border-line hover:border-slate-500 disabled:opacity-40"
          title="줌 인 (+)"
          aria-label="줌 인"
        >
          ＋
        </button>
        <span className="w-9 text-right tabular-nums text-white">{cam.zoom.toFixed(1)}×</span>
      </div>
      <div className="flex items-center gap-1 pl-9">
        {PRESETS.map((z) => (
          <button
            key={z}
            onClick={() => setCam({ zoom: z, ...(z === 1 ? { x: 0.5, y: 0.5 } : {}) })}
            className={
              'px-1.5 py-0.5 rounded border ' +
              (Math.abs(cam.zoom - z) < 0.01 ? 'bg-accent/20 border-accent text-white' : 'bg-panel2 border-line hover:border-slate-500')
            }
          >
            {z}×
          </button>
        ))}
        <button
          onClick={() => setCam({ zoom: 1, x: 0.5, y: 0.5 })}
          className="ml-auto px-1.5 py-0.5 rounded bg-panel2 border border-line hover:border-slate-500"
          title="원래 크기·가운데로 (0)"
        >
          원래대로
        </button>
      </div>
      <label className="flex items-center gap-1.5">
        <span className="w-8 text-slate-400">좌우</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={cam.x}
          disabled={!zoomed}
          onChange={(e) => setCam({ x: Number(e.target.value) })}
          className="flex-1 accent-accent disabled:opacity-40"
          aria-label={`카메라 ${target + 1} 좌우 위치`}
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="w-8 text-slate-400">상하</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={cam.y}
          disabled={!zoomed}
          onChange={(e) => setCam({ y: Number(e.target.value) })}
          className="flex-1 accent-accent disabled:opacity-40"
          aria-label={`카메라 ${target + 1} 상하 위치`}
        />
      </label>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        {compact
          ? `카메라 ${target + 1}의 줌입니다. 단축키 + / − / 0은 화면에 나가는 카메라에 적용됩니다.`
          : '카메라마다 줌이 따로 기억됩니다. 디지털 줌이라 모든 카메라(아이폰 연속성 카메라 포함)에서 같게 동작하며, 2× 이상은 화질이 조금 거칠어질 수 있습니다. 단축키 + / − / 0.'}
      </p>
    </div>
  )
}
