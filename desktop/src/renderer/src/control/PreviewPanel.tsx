import { useLive } from '../store/live'
import { Stage } from '../components/Stage'

/** [3] 프리뷰 — 현재 송출 슬라이드 실시간 미리보기 (출력 비율 반영) */
export function PreviewPanel(): JSX.Element {
  const state = useLive((s) => s.state)

  return (
    <div className="flex flex-col border border-line rounded-lg bg-panel2/40 p-2 min-h-0">
      <div className="text-xs font-semibold text-slate-300 mb-2">
        [3] 프리뷰 (출력 화면) · {state.aspect === 'fill' ? '화면 채우기' : state.aspect}
      </div>
      <div className="flex-1 min-h-0 rounded-md overflow-hidden ring-1 ring-line">
        <Stage state={state} />
      </div>
    </div>
  )
}
