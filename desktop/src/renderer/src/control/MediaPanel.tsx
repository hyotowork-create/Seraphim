import { useLive } from '../store/live'
import type { BackgroundKind } from '@shared/ipc'
import { CameraZoomControls } from './CameraZoomControls'
import { CameraSourceSelect } from './CameraSwitcher'
import { resolveCameraLayers } from '@shared/stream'

const TABS: { key: BackgroundKind; label: string }[] = [
  { key: 'color', label: '단색' },
  { key: 'image', label: '이미지' },
  { key: 'video', label: '영상' },
  { key: 'camera', label: '카메라' }
]

/** [6] 미디어 — 배경 소스: 단색 / 이미지 / 라이브 카메라 */
export function MediaPanel(): JSX.Element {
  const bg = useLive((s) => s.state.background)
  const cameras = useLive((s) => s.state.cameras)
  const activeCamera = useLive((s) => s.state.activeCamera)
  // 이 배경이 보여 주는 카메라 (줌 조절 대상)
  const camIndex = resolveCameraLayers(cameras, activeCamera, bg.cameraSource ?? 'program').visible
  const patch = useLive((s) => s.patch)
  const pickImage = async (): Promise<void> => {
    const r = await window.seraphim.pickBackgroundImage()
    if (r)
      await patch({ background: { kind: 'image', imageUrl: r.url, imageName: r.name, mediaId: r.id } })
  }

  const pickVideo = async (): Promise<void> => {
    const r = await window.seraphim.pickBackgroundVideo()
    if (r)
      await patch({ background: { kind: 'video', videoUrl: r.url, videoName: r.name, mediaId: r.id } })
  }

  return (
    <div className="flex flex-col border border-line rounded-lg bg-panel2/40 p-2 min-h-0">
      <div className="text-xs font-semibold text-slate-300 mb-2">[6] 미디어 — 배경</div>

      {/* 탭 */}
      <div className="flex gap-1 mb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => void patch({ background: { kind: t.key } })}
            className={
              'flex-1 px-2 py-1 rounded border text-[11px] ' +
              (bg.kind === t.key
                ? 'bg-accent/20 border-accent text-white'
                : 'bg-panel2 border-line text-slate-300 hover:border-slate-500')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto text-[11px] text-slate-300 space-y-2">
        {bg.kind === 'color' && (
          <label className="flex items-center gap-2">
            <span className="w-14 text-slate-400">배경색</span>
            <input
              type="color"
              value={bg.color || '#000000'}
              onChange={(e) => void patch({ background: { color: e.target.value } })}
              className="h-7 w-12 bg-transparent"
            />
          </label>
        )}

        {bg.kind === 'image' && (
          <div className="space-y-2">
            <button
              onClick={() => void pickImage()}
              className="w-full px-2 py-2 rounded bg-accent/20 border border-accent text-white hover:bg-accent/30"
            >
              이미지 파일 선택…
            </button>
            <div className="truncate text-slate-400">
              {bg.imageName ? `선택됨: ${bg.imageName}` : '선택된 이미지 없음'}
            </div>
          </div>
        )}

        {bg.kind === 'video' && (
          <div className="space-y-2">
            <button
              onClick={() => void pickVideo()}
              className="w-full px-2 py-2 rounded bg-accent/20 border border-accent text-white hover:bg-accent/30"
            >
              영상 파일 선택…
            </button>
            <div className="truncate text-slate-400">
              {bg.videoName ? `선택됨: ${bg.videoName}` : '선택된 영상 없음'}
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              배경 영상은 자동 반복·무음으로 재생됩니다.
            </p>
          </div>
        )}

        {bg.kind === 'camera' && (
          <div className="space-y-2">
            <CameraSourceSelect
              value={bg.cameraSource ?? 'program'}
              onChange={(v) => void patch({ background: { kind: 'camera', cameraSource: v === 'none' ? 'program' : v } })}
            />
            {camIndex != null && <CameraZoomControls index={camIndex} compact />}
            <p className="text-[10px] text-slate-500 leading-relaxed">카메라 연결·전환은 프리뷰 아래 카메라 칸에서 합니다 (숫자키 1·2·3).</p>
          </div>
        )}

        {/* 공통: 어둡게(가독성) */}
        <label className="flex items-center gap-2 pt-1 border-t border-line/60">
          <span className="w-14 text-slate-400">어둡게</span>
          <input
            type="range"
            min={0}
            max={0.8}
            step={0.05}
            value={bg.dim}
            onChange={(e) => void patch({ background: { dim: Number(e.target.value) } })}
            className="flex-1 accent-accent"
          />
          <span className="w-8 text-right">{Math.round(bg.dim * 100)}%</span>
        </label>
      </div>
    </div>
  )
}
