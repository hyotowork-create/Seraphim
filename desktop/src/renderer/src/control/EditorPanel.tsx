import { useLive } from '../store/live'
import type { OverlayStyle } from '@shared/ipc'

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-400">
      <span className="w-14 shrink-0">{label}</span>
      {children}
    </label>
  )
}

/** [5] 에디터 — 현재 송출 텍스트 + 오버레이 스타일 편집 (즉시 반영) */
export function EditorPanel(): JSX.Element {
  const state = useLive((s) => s.state)
  const patch = useLive((s) => s.patch)
  const o = state.overlay

  const setOverlay = (p: Partial<OverlayStyle>): void => void patch({ overlay: p })

  return (
    <div className="flex flex-col border border-line rounded-lg bg-panel2/40 p-2 min-h-0">
      <div className="text-xs font-semibold text-slate-300 mb-2">[5] 에디터 — 자막/가사</div>
      <div className="flex-1 grid grid-cols-[1fr_240px] gap-3 min-h-0">
        {/* 텍스트 입력 */}
        <textarea
          value={state.text}
          onChange={(e) => patch({ text: e.target.value })}
          placeholder="여기에 자막/가사를 입력하면 프리뷰와 송출 화면에 바로 반영됩니다."
          className="resize-none rounded-md bg-black/40 border border-line p-3 text-sm text-white outline-none focus:border-accent leading-relaxed"
        />

        {/* 스타일 컨트롤 */}
        <div className="flex flex-col gap-2 overflow-auto pr-1">
          <Field label="글자 크기">
            <input
              type="range"
              min={28}
              max={140}
              value={o.fontSize}
              onChange={(e) => setOverlay({ fontSize: Number(e.target.value) })}
              className="flex-1 accent-accent"
            />
            <span className="w-8 text-right text-slate-300">{o.fontSize}</span>
          </Field>

          <Field label="글자색">
            <input
              type="color"
              value={o.color}
              onChange={(e) => setOverlay({ color: e.target.value })}
              className="h-6 w-10 bg-transparent"
            />
          </Field>

          <Field label="외곽선">
            <input
              type="color"
              value={o.outlineColor}
              onChange={(e) => setOverlay({ outlineColor: e.target.value })}
              className="h-6 w-10 bg-transparent"
            />
            <input
              type="range"
              min={0}
              max={12}
              value={o.outlineWidth}
              onChange={(e) => setOverlay({ outlineWidth: Number(e.target.value) })}
              className="flex-1 accent-accent"
            />
            <span className="w-6 text-right text-slate-300">{o.outlineWidth}</span>
          </Field>

          <Field label="정렬">
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setOverlay({ align: a })}
                  className={
                    'px-2 py-1 rounded border text-[11px] ' +
                    (o.align === a
                      ? 'bg-accent/20 border-accent text-white'
                      : 'bg-panel2 border-line text-slate-300')
                  }
                >
                  {a === 'left' ? '좌' : a === 'center' ? '중앙' : '우'}
                </button>
              ))}
            </div>
          </Field>

          <Field label="그림자">
            <input
              type="checkbox"
              checked={o.shadow}
              onChange={(e) => setOverlay({ shadow: e.target.checked })}
              className="accent-accent"
            />
          </Field>

          <Field label="배경색">
            <input
              type="color"
              value={/^#/.test(state.background) ? state.background : '#000000'}
              onChange={(e) => patch({ background: e.target.value })}
              className="h-6 w-10 bg-transparent"
            />
          </Field>
        </div>
      </div>
    </div>
  )
}
