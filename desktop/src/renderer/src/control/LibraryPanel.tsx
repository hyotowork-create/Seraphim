import { useEffect, useState } from 'react'
import { SONG_CATEGORIES, type SongFilter } from '@shared/ipc'
import { useLibrary } from '../store/library'
import { useDeck } from '../store/deck'
import { useUi } from '../store/ui'

function isActive(f: SongFilter, scope: SongFilter['scope'], category?: string): boolean {
  if (scope === 'category') return f.scope === 'category' && f.category === category
  return f.scope === scope
}

/** [1] 라이브러리 — 카테고리 트리 + 검색 + 곡 목록 */
export function LibraryPanel(): JSX.Element {
  const { filter, songs, reload, setFilter, setSearch, toggleFavorite } = useLibrary()
  const load = useDeck((s) => s.load)
  const currentId = useDeck((s) => s.song?.id ?? null)
  const openEditor = useUi((s) => s.openEditor)
  const [q, setQ] = useState('')

  useEffect(() => {
    void reload()
  }, [reload])

  const TreeBtn = ({
    label,
    scope,
    category
  }: {
    label: string
    scope: SongFilter['scope']
    category?: string
  }): JSX.Element => (
    <button
      onClick={() => void setFilter({ scope, category })}
      className={
        'w-full text-left px-2 py-1 rounded text-[12px] ' +
        (isActive(filter, scope, category)
          ? 'bg-accent/20 text-white'
          : 'text-slate-300 hover:bg-panel2')
      }
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col h-full border border-line rounded-lg bg-panel2/40 min-h-0">
      <div className="flex items-center justify-between px-3 h-9 border-b border-line">
        <span className="text-xs font-semibold text-slate-300">[1] 라이브러리</span>
        <button
          onClick={() => openEditor(null)}
          className="text-[11px] px-2 py-0.5 rounded bg-accent/20 border border-accent text-white hover:bg-accent/30"
        >
          + 새 곡
        </button>
      </div>

      {/* 트리 */}
      <div className="px-2 py-2 space-y-0.5 border-b border-line">
        <TreeBtn label="전체" scope="all" />
        <TreeBtn label="★ 즐겨찾기" scope="favorite" />
        <TreeBtn label="🕘 최근 사용" scope="recent" />
        <div className="pt-1 text-[10px] text-slate-500 px-2">찬양</div>
        {SONG_CATEGORIES.map((c) => (
          <TreeBtn key={c} label={c} scope="category" category={c} />
        ))}
      </div>

      {/* 검색 */}
      <div className="p-2 border-b border-line">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            void setSearch(e.target.value)
          }}
          placeholder="곡 검색…"
          className="w-full bg-black/40 border border-line rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent"
        />
      </div>

      {/* 곡 목록 */}
      <div className="flex-1 overflow-auto p-1 min-h-0">
        {songs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[11px] text-slate-500 text-center px-3">
            곡이 없습니다. “+ 새 곡”으로 추가하세요.
          </div>
        ) : (
          songs.map((s) => (
            <div
              key={s.id}
              onClick={() => void load(s.id)}
              className={
                'group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer ' +
                (currentId === s.id ? 'bg-accent/20' : 'hover:bg-panel2')
              }
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void toggleFavorite(s.id, !s.favorite)
                }}
                className={s.favorite ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}
                title="즐겨찾기"
              >
                ★
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-slate-100 truncate">{s.title}</div>
                <div className="text-[10px] text-slate-500">
                  {s.category} · {s.verseCount}절
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
