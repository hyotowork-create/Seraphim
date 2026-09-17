import { useState } from 'react'
import { useDeck } from '../store/deck'
import { useUi } from '../store/ui'

/** [2] 슬라이드 목록 — 선택 곡의 절별 리스트. 클릭 송출, 드래그 순서변경 */
export function SlideListPanel(): JSX.Element {
  const song = useDeck((s) => s.song)
  const activeIndex = useDeck((s) => s.activeIndex)
  const goTo = useDeck((s) => s.goTo)
  const reorderVerses = useDeck((s) => s.reorderVerses)
  const openEditor = useUi((s) => s.openEditor)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  return (
    <div className="flex flex-col h-full border border-line rounded-lg bg-panel2/40 min-h-0">
      <div className="flex items-center justify-between px-3 h-9 border-b border-line">
        <span className="text-xs font-semibold text-slate-300 truncate">
          [2] {song ? song.title : '슬라이드 목록'}
        </span>
        {song && (
          <button
            onClick={() => openEditor(song.id)}
            className="text-[11px] px-2 py-0.5 rounded bg-panel2 border border-line text-slate-200 hover:border-slate-500"
          >
            편집
          </button>
        )}
      </div>

      {!song ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-slate-500 text-center px-3">
          왼쪽에서 곡을 선택하세요.
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-2 space-y-1.5 min-h-0">
          {song.verses.map((v, i) => (
            <div
              key={v.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) void reorderVerses(dragIndex, i)
                setDragIndex(null)
              }}
              onClick={() => void goTo(i)}
              className={
                'rounded-md border p-2 cursor-pointer transition ' +
                (activeIndex === i
                  ? 'border-accent bg-accent/20 ring-1 ring-accent'
                  : 'border-line bg-black/30 hover:border-slate-500')
              }
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-panel2 border border-line text-slate-300">
                  {v.label || i + 1}
                </span>
                {activeIndex === i && <span className="text-[10px] text-accent">● 송출 중</span>}
                <span className="ml-auto text-slate-600 text-xs cursor-grab">⠿</span>
              </div>
              <div className="text-[11px] text-slate-300 whitespace-pre-wrap line-clamp-3 leading-snug">
                {v.text}
              </div>
            </div>
          ))}

          <button
            onClick={() => openEditor(song.id)}
            className="w-full mt-1 py-2 rounded-md border border-dashed border-line text-[11px] text-slate-400 hover:border-slate-500 hover:text-slate-200"
          >
            + 절 추가 / 편집
          </button>
        </div>
      )}
    </div>
  )
}
