import { useState } from 'react'
import { useDeck } from '../store/deck'
import { useUi } from '../store/ui'
import { useLive } from '../store/live'

/** [2] 슬라이드 목록 — 곡/성경의 절별 카드(4줄 초과 시 여러 쪽). 클릭 송출, 곡은 드래그 순서변경 */
export function SlideListPanel(): JSX.Element {
  const loaded = useDeck((s) => s.loaded)
  const pages = useDeck((s) => s.pages)
  const activeIndex = useDeck((s) => s.activeIndex)
  const goToVerse = useDeck((s) => s.goToVerse)
  const reorderVerses = useDeck((s) => s.reorderVerses)
  const setSongBackground = useDeck((s) => s.setSongBackground)
  const openEditor = useUi((s) => s.openEditor)
  const openBibleEditor = useUi((s) => s.openBibleEditor)
  const liveBg = useLive((s) => s.state.background)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const isSong = loaded?.kind === 'song'
  const activePage = activeIndex >= 0 ? pages[activeIndex] : undefined
  const activeVerse = activePage?.verseIndex ?? -1

  const canSaveBg =
    isSong && liveBg.kind === 'image' && liveBg.mediaId != null && loaded?.bgMediaId !== liveBg.mediaId
  const canClearBg = isSong && loaded?.bgMediaId != null

  const edit = (): void => {
    if (!loaded) return
    if (loaded.kind === 'song') openEditor(loaded.id)
    else openBibleEditor(loaded.id)
  }

  return (
    <div className="flex flex-col h-full border border-line rounded-lg bg-panel2/40 min-h-0">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-line">
        <span className="text-xs font-semibold text-slate-300 truncate flex-1">
          [2] {loaded ? loaded.title : '슬라이드 목록'}
        </span>
        {canSaveBg && (
          <button
            onClick={() => void setSongBackground(liveBg.mediaId ?? null)}
            className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/60 text-emerald-200 hover:bg-emerald-500/30"
            title="현재 배경을 이 곡에 저장"
          >
            배경 저장
          </button>
        )}
        {canClearBg && (
          <button
            onClick={() => void setSongBackground(null)}
            className="text-[10px] px-2 py-0.5 rounded bg-panel2 border border-line text-slate-300 hover:border-slate-500"
            title="곡에 저장된 배경 해제"
          >
            배경 해제
          </button>
        )}
        {loaded && (
          <button
            onClick={edit}
            className="text-[11px] px-2 py-0.5 rounded bg-panel2 border border-line text-slate-200 hover:border-slate-500"
          >
            편집
          </button>
        )}
      </div>

      {!loaded ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-slate-500 text-center px-3">
          왼쪽에서 곡 또는 말씀을 선택하세요.
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-2 space-y-1.5 min-h-0">
          {loaded.verses.map((v, i) => {
            const versePages = pages.filter((p) => p.verseIndex === i)
            const active = activeVerse === i
            const curPageInVerse = active ? (activePage?.pageInVerse ?? 0) + 1 : 0
            return (
              <div
                key={v.id}
                draggable={isSong}
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => isSong && e.preventDefault()}
                onDrop={() => {
                  if (isSong && dragIndex !== null) void reorderVerses(dragIndex, i)
                  setDragIndex(null)
                }}
                onClick={() => void goToVerse(i)}
                className={
                  'rounded-md border p-2 cursor-pointer transition ' +
                  (active
                    ? 'border-accent bg-accent/20 ring-1 ring-accent'
                    : 'border-line bg-black/30 hover:border-slate-500')
                }
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-panel2 border border-line text-slate-300">
                    {v.label ? (isSong ? v.label : `${v.label}절`) : i + 1}
                  </span>
                  {versePages.length > 1 && (
                    <span className="text-[10px] text-slate-500">{versePages.length}쪽</span>
                  )}
                  {active && (
                    <span className="text-[10px] text-accent">
                      ● 송출 중
                      {versePages.length > 1 ? ` (${curPageInVerse}/${versePages.length})` : ''}
                    </span>
                  )}
                  {isSong && <span className="ml-auto text-slate-600 text-xs cursor-grab">⠿</span>}
                </div>
                <div className="text-[11px] text-slate-300 whitespace-pre-wrap line-clamp-3 leading-snug">
                  {v.text}
                </div>
              </div>
            )
          })}

          <button
            onClick={edit}
            className="w-full mt-1 py-2 rounded-md border border-dashed border-line text-[11px] text-slate-400 hover:border-slate-500 hover:text-slate-200"
          >
            {isSong ? '+ 절 추가 / 편집' : '본문 편집'}
          </button>
        </div>
      )}
    </div>
  )
}
