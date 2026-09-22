import { useEffect, useState } from 'react'
import { SONG_CATEGORIES, type SongInput } from '@shared/ipc'
import { splitVerses } from '@shared/lyrics'
import { useUi } from '../store/ui'
import { useLibrary } from '../store/library'
import { useDeck } from '../store/deck'
import { SyncInput, SyncTextarea } from '../components/SyncField'

/** 곡 편집기 — 제목/카테고리 + 가사(빈 줄 기준 절 자동 분할, 실시간 미리보기) */
export function SongEditorModal(): JSX.Element | null {
  const editorOpen = useUi((s) => s.editorOpen)
  const editSongId = useUi((s) => s.editSongId)
  const closeEditor = useUi((s) => s.closeEditor)
  const reloadLibrary = useLibrary((s) => s.reload)
  const loadDeck = useDeck((s) => s.load)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>(SONG_CATEGORIES[0])
  const [favorite, setFavorite] = useState(false)
  const [author, setAuthor] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editorOpen) return
    if (editSongId == null) {
      setTitle('')
      setCategory(SONG_CATEGORIES[0])
      setFavorite(false)
      setAuthor('')
      setLyrics('')
      return
    }
    void window.seraphim.getSong(editSongId).then((song) => {
      if (!song) return
      setTitle(song.title)
      setCategory(song.category)
      setFavorite(song.favorite)
      setAuthor(song.author ?? '')
      setLyrics(
        song.verses.map((v) => (v.label ? `${v.label}\n${v.text}` : v.text)).join('\n\n')
      )
    })
  }, [editorOpen, editSongId])

  if (!editorOpen) return null

  const verses = splitVerses(lyrics)
  const canSave = title.trim().length > 0 && verses.length > 0

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    try {
      const input: SongInput = {
        id: editSongId ?? undefined,
        title: title.trim(),
        category,
        favorite,
        author: author.trim() || null,
        verses: verses.map((v) => ({ label: v.label, text: v.text }))
      }
      const id = await window.seraphim.saveSong(input)
      await reloadLibrary()
      await loadDeck(id)
      closeEditor()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={closeEditor}>
      <div
        className="w-[900px] max-w-full h-[80vh] flex flex-col rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-line bg-panel2">
          <span className="font-semibold text-slate-100">
            {editSongId == null ? '새 곡' : '곡 편집'}
          </span>
          <button onClick={closeEditor} className="text-slate-400 hover:text-white text-lg px-2">
            ✕
          </button>
        </div>

        {/* 메타 */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line flex-wrap">
          <SyncInput
            value={title}
            onValue={setTitle}
            placeholder="곡 제목 *"
            className="flex-1 min-w-[200px] bg-black/40 border border-line rounded px-3 py-1.5 text-sm text-white outline-none focus:border-accent"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-black/40 border border-line rounded px-2 py-1.5 text-sm text-slate-100 outline-none"
          >
            {SONG_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <SyncInput
            value={author}
            onValue={setAuthor}
            placeholder="작사/작곡 (선택)"
            className="w-40 bg-black/40 border border-line rounded px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-accent"
          />
          <label className="flex items-center gap-1 text-xs text-slate-300">
            <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} className="accent-accent" />
            즐겨찾기
          </label>
        </div>

        {/* 본문: 가사 입력 | 절 미리보기 */}
        <div className="flex-1 grid grid-cols-2 gap-3 p-5 min-h-0">
          <div className="flex flex-col min-h-0">
            <div className="text-[11px] text-slate-400 mb-1">
              가사 — <b>빈 줄</b>로 절을 구분합니다 (예: 1절 ↵ 내용 ↵↵ 후렴 ↵ 내용)
            </div>
            <SyncTextarea
              value={lyrics}
              onValue={setLyrics}
              placeholder={'1절\n주 하나님 지으신 모든 세계\n내 마음속에 그리어 볼 때\n\n후렴\n주님의 높고 위대하심을'}
              className="flex-1 resize-none rounded-md bg-black/40 border border-line p-3 text-sm text-white outline-none focus:border-accent leading-relaxed font-mono"
            />
          </div>

          <div className="flex flex-col min-h-0">
            <div className="text-[11px] text-slate-400 mb-1">
              자동 분할 미리보기 — <b>{verses.length}</b>개 절
            </div>
            <div className="flex-1 overflow-auto rounded-md bg-black/20 border border-line p-2 space-y-2">
              {verses.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-slate-500">
                  가사를 입력하면 절이 자동으로 나뉩니다.
                </div>
              ) : (
                verses.map((v, i) => (
                  <div key={i} className="rounded border border-line bg-panel2/40 p-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-panel2 border border-line text-slate-300">
                      {v.label}
                    </span>
                    <div className="mt-1 text-[12px] text-slate-200 whitespace-pre-wrap leading-snug">
                      {v.text}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 h-14 border-t border-line bg-panel2">
          <button
            onClick={closeEditor}
            className="px-4 py-2 rounded bg-panel border border-line text-sm text-slate-200 hover:border-slate-500"
          >
            취소
          </button>
          <button
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded bg-accent/30 border border-accent text-sm text-white hover:bg-accent/40 disabled:opacity-40"
          >
            {saving ? '저장 중…' : '곡으로 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
