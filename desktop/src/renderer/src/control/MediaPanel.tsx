import { useEffect, useState } from 'react'
import { useLive } from '../store/live'
import type { BackgroundKind } from '@shared/ipc'

const TABS: { key: BackgroundKind; label: string }[] = [
  { key: 'color', label: '단색' },
  { key: 'image', label: '이미지' },
  { key: 'camera', label: '카메라' }
]

/** [6] 미디어 — 배경 소스: 단색 / 이미지 / 라이브 카메라 */
export function MediaPanel(): JSX.Element {
  const bg = useLive((s) => s.state.background)
  const patch = useLive((s) => s.patch)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [camLoading, setCamLoading] = useState(false)

  const loadCameras = async (): Promise<void> => {
    setCamLoading(true)
    try {
      // 라벨을 얻으려면 1회 권한 획득 필요
      const s = await navigator.mediaDevices.getUserMedia({ video: true })
      s.getTracks().forEach((t) => t.stop())
    } catch {
      /* 권한 거부/장치 없음 — enumerate는 계속 시도 */
    }
    try {
      const devs = await navigator.mediaDevices.enumerateDevices()
      setCameras(devs.filter((d) => d.kind === 'videoinput'))
    } finally {
      setCamLoading(false)
    }
  }

  // 카메라 탭 진입 시 장치 목록 로드
  useEffect(() => {
    if (bg.kind === 'camera' && cameras.length === 0) void loadCameras()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bg.kind])

  const pickImage = async (): Promise<void> => {
    const r = await window.seraphim.pickBackgroundImage()
    if (r)
      await patch({ background: { kind: 'image', imageUrl: r.url, imageName: r.name, mediaId: r.id } })
  }

  const chooseCamera = (id: string): void => {
    const label = cameras.find((c) => c.deviceId === id)?.label || '카메라'
    void patch({ background: { kind: 'camera', cameraDeviceId: id, cameraLabel: label } })
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

        {bg.kind === 'camera' && (
          <div className="space-y-2">
            <select
              value={bg.cameraDeviceId ?? ''}
              onChange={(e) => chooseCamera(e.target.value)}
              className="w-full bg-black/40 border border-line rounded px-2 py-1 text-slate-200 outline-none"
            >
              <option value="" disabled>
                {camLoading ? '카메라 검색 중…' : '카메라 선택'}
              </option>
              {cameras.map((c, i) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label || `카메라 ${i + 1}`}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadCameras()}
              className="w-full px-2 py-1 rounded bg-panel2 border border-line text-slate-200 hover:border-slate-500"
            >
              장치 새로고침
            </button>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              카메라 영상이 배경으로 실시간 송출되고, 그 위에 가사가 얹힙니다.
            </p>
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
