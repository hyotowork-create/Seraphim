import { useLive } from '../store/live'

/** [8] 전환 효과 — Fade on/off + 지속시간 */
export function TransitionPanel(): JSX.Element {
  const t = useLive((s) => s.state.transition)
  const patch = useLive((s) => s.patch)
  const fade = t.type === 'fade'

  return (
    <div className="flex flex-col border border-line rounded-lg bg-panel2/40 p-2 gap-2">
      <div className="text-xs font-semibold text-slate-300">[8] 전환 효과</div>

      <div className="flex gap-1">
        <button
          onClick={() => void patch({ transition: { type: 'none' } })}
          className={
            'flex-1 px-2 py-1 rounded border text-[11px] ' +
            (!fade ? 'bg-accent/20 border-accent text-white' : 'bg-panel2 border-line text-slate-300')
          }
        >
          없음
        </button>
        <button
          onClick={() => void patch({ transition: { type: 'fade' } })}
          className={
            'flex-1 px-2 py-1 rounded border text-[11px] ' +
            (fade ? 'bg-accent/20 border-accent text-white' : 'bg-panel2 border-line text-slate-300')
          }
        >
          Fade
        </button>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <span className="w-12 shrink-0">지속시간</span>
        <input
          type="range"
          min={100}
          max={2000}
          step={100}
          value={t.durationMs}
          disabled={!fade}
          onChange={(e) => void patch({ transition: { durationMs: Number(e.target.value) } })}
          className="flex-1 accent-accent disabled:opacity-40"
        />
        <span className="w-10 text-right text-slate-300">{(t.durationMs / 1000).toFixed(1)}초</span>
      </label>

      <p className="mt-auto text-[10px] text-slate-500 leading-relaxed">
        슬라이드가 바뀔 때 가사가 부드럽게 나타납니다.
      </p>
    </div>
  )
}
