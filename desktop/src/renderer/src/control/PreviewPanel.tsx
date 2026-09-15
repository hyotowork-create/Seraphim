import { useEffect, useRef, useState } from 'react'
import { useLive } from '../store/live'
import { SlideView } from '../components/SlideView'

/** [3] 프리뷰 — 현재 송출 슬라이드 16:9 실시간 미리보기 */
export function PreviewPanel(): JSX.Element {
  const state = useLive((s) => s.state)
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientHeight / 1080))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="flex flex-col border border-line rounded-lg bg-panel2/40 p-2 min-h-0">
      <div className="text-xs font-semibold text-slate-300 mb-2">[3] 프리뷰 (출력 화면)</div>
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div
          ref={boxRef}
          className="relative bg-black rounded-md overflow-hidden shadow-lg ring-1 ring-line"
          style={{ aspectRatio: '16 / 9', height: '100%', maxWidth: '100%' }}
        >
          <SlideView state={state} scale={scale} />
        </div>
      </div>
    </div>
  )
}
