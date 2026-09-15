import { useLive } from '../store/live'

interface BtnProps {
  label: string
  keyHint: string
  active?: boolean
  onClick: () => void
}

function QuickButton({ label, keyHint, active, onClick }: BtnProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={
        'flex items-center justify-between px-3 py-2 rounded-md border text-sm transition ' +
        (active
          ? 'bg-accent/20 border-accent text-white'
          : 'bg-panel2 border-line text-slate-200 hover:border-slate-500')
      }
    >
      <span>{label}</span>
      <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 border border-line text-slate-400">
        {keyHint}
      </kbd>
    </button>
  )
}

/** [4] 빠른 기능 — 다음/이전/검정/로고/일시정지 (단축키 연동) */
export function QuickPanel(): JSX.Element {
  const state = useLive((s) => s.state)
  const patch = useLive((s) => s.patch)

  return (
    <div className="flex flex-col border border-line rounded-lg bg-panel2/40 p-2 gap-2">
      <div className="text-xs font-semibold text-slate-300">[4] 빠른 기능</div>
      <QuickButton label="다음 슬라이드" keyHint="Space" onClick={() => {}} />
      <QuickButton label="이전 슬라이드" keyHint="⌫" onClick={() => {}} />
      <QuickButton
        label="검정 화면"
        keyHint="B"
        active={state.blackout}
        onClick={() => patch({ blackout: !state.blackout })}
      />
      <QuickButton
        label="로고 화면"
        keyHint="L"
        active={state.showLogo}
        onClick={() => patch({ showLogo: !state.showLogo })}
      />
      <QuickButton
        label="일시정지"
        keyHint="P"
        active={state.paused}
        onClick={() => patch({ paused: !state.paused })}
      />
      <p className="mt-auto text-[10px] text-slate-500 leading-relaxed">
        다음/이전은 슬라이드 목록 연동 후 동작합니다 (M2/M3).
      </p>
    </div>
  )
}
