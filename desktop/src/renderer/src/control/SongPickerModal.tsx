import { useEffect, useState } from 'react'
import type { SongListItem } from '@shared/ipc'
import { useUi } from '../store/ui'
import { usePlaylist } from '../store/playlist'

/** 플레이리스트에 곡 추가 — 전체 곡 목록에서 선택 */
export function SongPickerModal(): JSX.Element | null {
  const open = useUi((s) => s.pickerOpen)
  const close = useUi((s) => s.closePicker)
  const addSong = usePlaylist((s) => s.addSong)
  const activeId = usePlaylist((s) => s.activeId)
  const [songs, setSongs] = useState<SongListItem[]>([])
  const [q, setQ] = useState('')
  const [added, setAdded] = useState<Record<number, number>>({})

  useEffect(() => {
    if (!open) return
    setAdded({})
    setQ('')
    void window.seraphim.listSongs({ scope: 'all' }).then(setSongs)
  }, [open])

  if (!open) return null

  const filtered = q.trim()
    ? songs.filter((s) => s.title.includes(q.trim()))
    : songs

  const add = async (id: number): Promise<void> => {
    await addSong(id)
    setAdded((a) => ({ ...a, [id]: (a[id] ?? 0) + 1 }))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={close}>
      <div
        className="w-[520px] max-w-full h-[70vh] flex flex-col rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-line bg-panel2">
          <span className="font-semibold text-slate-100">플레이리스트에 곡 추가</span>
          <button onClick={close} className="text-slate-400 hover:text-white text-lg px-2">
            ✕
          </button>
        </div>
        <div className="p-3 border-b border-line">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="곡 검색…"
            className="w-full bg-black/40 border border-line rounded px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-accent"
          />
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {activeId == null ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              플레이리스트를 먼저 선택하세요.
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              곡이 없습니다.
            </div>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 px-3 py-2 rounded border border-line bg-black/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-100 truncate">{s.title}</div>
                  <div className="text-[10px] text-slate-500">
                    {s.category} · {s.verseCount}절
                  </div>
                </div>
                {added[s.id] ? (
                  <span className="text-[11px] text-emerald-400">추가됨{added[s.id] > 1 ? ` ×${added[s.id]}` : ''}</span>
                ) : null}
                <button
                  onClick={() => void add(s.id)}
                  className="text-xs px-2 py-1 rounded bg-accent/20 border border-accent text-white hover:bg-accent/30"
                >
                  추가
                </button>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end px-5 h-14 items-center border-t border-line bg-panel2">
          <button
            onClick={close}
            className="px-4 py-2 rounded bg-accent/30 border border-accent text-sm text-white hover:bg-accent/40"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  )
}
