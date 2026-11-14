import { useLive } from '../store/live'
import { useDeck } from '../store/deck'

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
  const next = useDeck((s) => s.next)
  const prev = useDeck((s) => s.prev)

  const pickLogo = async (): Promise<void> => {
    const r = await window.seraphim.pickLogo()
    if (!r) return
    await window.seraphim.setSetting('logo.mediaId', String(r.id))
    await patch({ logoUrl: r.url })
  }
  const clearLogo = async (): Promise<void> => {
    await window.seraphim.setSetting('logo.mediaId', '')
    await patch({ logoUrl: null })
  }

  return (
    <div className="flex flex-col border border-line rounded-lg bg-panel2/40 p-2 gap-2">
      <div className="text-xs font-semibold text-slate-300">[4] 빠른 기능</div>
      <QuickButton label="다음 슬라이드" keyHint="Space" onClick={() => void next()} />
      <QuickButton label="이전 슬라이드" keyHint="⌫" onClick={() => void prev()} />
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
      <div className="flex items-center gap-1 -mt-1 px-1 text-[10px] text-slate-500">
        <span className="truncate flex-1" title={state.logoUrl ?? '기본 글자 로고(SERAPHIM)'}>
          {state.logoUrl ? '로고 이미지 지정됨' : '글자 로고(SERAPHIM)'}
        </span>
        <button
          onClick={() => void pickLogo()}
          className="px-1.5 py-0.5 rounded border border-line bg-panel2 text-slate-300 hover:border-slate-500"
          title="교회 로고 이미지를 지정 (PNG 투명 배경 권장)"
        >
          이미지…
        </button>
        {state.logoUrl && (
          <button
            onClick={() => void clearLogo()}
            className="px-1.5 py-0.5 rounded border border-line bg-panel2 text-slate-400 hover:text-red-300"
            title="글자 로고로 되돌리기"
          >
            지우기
          </button>
        )}
      </div>
      <QuickButton
        label="일시정지"
        keyHint="P"
        active={state.paused}
        onClick={() => patch({ paused: !state.paused })}
      />
      <p className="mt-auto text-[10px] text-slate-500 leading-relaxed">
        곡 선택 후 Space/⌫ 또는 슬라이드 클릭으로 절을 송출합니다.
      </p>
    </div>
  )
}
