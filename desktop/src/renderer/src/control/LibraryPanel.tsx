import { useEffect, useState } from 'react'
import { SONG_CATEGORIES, type SongFilter } from '@shared/ipc'
import { useLibrary } from '../store/library'
import { useDeck } from '../store/deck'
import { useUi } from '../store/ui'
import { usePlaylist } from '../store/playlist'

function isActive(f: SongFilter, scope: SongFilter['scope'], category?: string): boolean {
  if (scope === 'category') return f.scope === 'category' && f.category === category
  return f.scope === scope
}

/** [1] 라이브러리 — 카테고리 트리 + 검색 + 곡 목록 + (하단) 플레이리스트 */
export function LibraryPanel(): JSX.Element {
  const { filter, songs, reload, setFilter, setSearch, toggleFavorite } = useLibrary()
  const load = useDeck((s) => s.load)
  const currentId = useDeck((s) => s.song?.id ?? null)
  const openEditor = useUi((s) => s.openEditor)
  const openPicker = useUi((s) => s.openPicker)
  const pl = usePlaylist()
  const [q, setQ] = useState('')
  const [newName, setNewName] = useState<string | null>(null)

  useEffect(() => {
    void reload()
    void pl.loadPlaylists()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      onClick={() => {
        pl.closeView()
        void setFilter({ scope, category })
      }}
      className={
        'w-full text-left px-2 py-1 rounded text-[12px] ' +
        (pl.viewMode === 'browse' && isActive(filter, scope, category)
          ? 'bg-accent/20 text-white'
          : 'text-slate-300 hover:bg-panel2')
      }
    >
      {label}
    </button>
  )

  const activePlaylist = pl.playlists.find((p) => p.id === pl.activeId)

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

      {/* 상단 영역: 플레이리스트 보기 or 브라우즈 */}
      {pl.viewMode === 'playlist' && activePlaylist ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-1 px-2 py-2 border-b border-line">
            <span className="text-[12px] text-accent font-semibold truncate flex-1">
              ▶ {activePlaylist.name}
            </span>
            <button
              onClick={openPicker}
              className="text-[11px] px-2 py-0.5 rounded bg-accent/20 border border-accent text-white hover:bg-accent/30"
            >
              + 곡
            </button>
            <button
              onClick={() => pl.closeView()}
              className="text-[11px] px-2 py-0.5 rounded bg-panel2 border border-line text-slate-300 hover:border-slate-500"
            >
              닫기
            </button>
          </div>
          <div className="flex-1 overflow-auto p-1 min-h-0">
            {pl.items.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[11px] text-slate-500 text-center px-3">
                “+ 곡”으로 예배 순서를 구성하세요.
              </div>
            ) : (
              pl.items.map((it, idx) => (
                <div
                  key={it.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(idx))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const from = Number(e.dataTransfer.getData('text/plain'))
                    void pl.reorder(from, idx)
                  }}
                  onClick={() => it.itemType === 'song' && it.refId != null && void load(it.refId)}
                  className={
                    'group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ' +
                    (currentId === it.refId && it.itemType === 'song'
                      ? 'bg-accent/20'
                      : 'hover:bg-panel2')
                  }
                >
                  <span className="text-slate-600 text-xs cursor-grab">⠿</span>
                  <span className="text-[11px] text-slate-500 w-4 text-right">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-slate-100 truncate">{it.title}</div>
                    {it.subtitle && <div className="text-[10px] text-slate-500">{it.subtitle}</div>}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void pl.removeItem(it.id)
                    }}
                    className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
                    title="빼기"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="px-2 py-2 space-y-0.5 border-b border-line">
            <TreeBtn label="전체" scope="all" />
            <TreeBtn label="★ 즐겨찾기" scope="favorite" />
            <TreeBtn label="🕘 최근 사용" scope="recent" />
            <div className="pt-1 text-[10px] text-slate-500 px-2">찬양</div>
            {SONG_CATEGORIES.map((c) => (
              <TreeBtn key={c} label={c} scope="category" category={c} />
            ))}
          </div>

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
        </>
      )}

      {/* 하단: 플레이리스트 목록 (항상 표시) */}
      <div className="border-t border-line p-2 max-h-[34%] overflow-auto">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500">플레이리스트 (예배별)</span>
          <button
            onClick={() => setNewName('')}
            className="text-[11px] px-1.5 rounded bg-panel2 border border-line text-slate-300 hover:border-slate-500"
          >
            ＋
          </button>
        </div>
        {newName !== null && (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                void pl.create(newName.trim())
                setNewName(null)
              } else if (e.key === 'Escape') setNewName(null)
            }}
            onBlur={() => setNewName(null)}
            placeholder="새 플레이리스트 이름 후 Enter"
            className="w-full mb-1 bg-black/40 border border-line rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent"
          />
        )}
        <div className="space-y-0.5">
          {pl.playlists.map((p) => (
            <div
              key={p.id}
              onClick={() => void pl.open(p.id)}
              className={
                'group flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-[12px] ' +
                (pl.viewMode === 'playlist' && pl.activeId === p.id
                  ? 'bg-accent/20 text-white'
                  : 'text-slate-300 hover:bg-panel2')
              }
            >
              <span className="truncate flex-1">{p.name}</span>
              <span className="text-[10px] text-slate-500">{p.itemCount}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`'${p.name}' 플레이리스트를 삭제할까요?`)) void pl.remove(p.id)
                }}
                className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
