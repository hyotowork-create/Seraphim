import { useEffect, useState } from 'react'
import { SONG_CATEGORIES, type SongInput } from '@shared/ipc'
import { splitVerses, splitLongVerses } from '@shared/lyrics'
import { usePlaylist } from '../store/playlist'
import { useUi } from '../store/ui'
import { useLibrary } from '../store/library'
import { useDeck } from '../store/deck'
import { SyncInput, SyncTextarea } from '../components/SyncField'

/** 곡 편집기 — 제목/카테고리 + 가사(빈 줄 기준 절 자동 분할, 실시간 미리보기) */
export function SongEditorModal(): JSX.Element | null {
  const editorOpen = useUi((s) => s.editorOpen)
  const editSongId = useUi((s) => s.editSongId)
  const prefillTitle = useUi((s) => s.editorPrefillTitle)
  const closeEditor = useUi((s) => s.closeEditor)
  const openPptx = useUi((s) => s.openPptx)
  const reloadLibrary = useLibrary((s) => s.reload)
  const loadDeck = useDeck((s) => s.load)
  const deckLoaded = useDeck((s) => s.loaded)
  const clearDeck = useDeck((s) => s.clear)
  const refreshPlaylist = usePlaylist((s) => s.refreshItems)
  const [splitN, setSplitN] = useState('4')
  const [deleting, setDeleting] = useState(false)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>(SONG_CATEGORIES[0])
  const [favorite, setFavorite] = useState(false)
  const [author, setAuthor] = useState('')
  const [hymnNo, setHymnNo] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [saving, setSaving] = useState(false)
  const [scores, setScores] = useState<{ mediaId: number; url: string }[]>([])
  const [viewScore, setViewScore] = useState<string | null>(null)

  useEffect(() => {
    if (!editorOpen) return
    if (editSongId == null) {
      setTitle(prefillTitle ?? '')
      setCategory(SONG_CATEGORIES[0])
      setFavorite(false)
      setAuthor('')
      setHymnNo('')
      setLyrics('')
      setScores([])
      setViewScore(null)
      return
    }
    setScores([])
    setViewScore(null)
    void window.seraphim.getSong(editSongId).then((song) => {
      if (!song) return
      setTitle(song.title)
      setCategory(song.category)
      setFavorite(song.favorite)
      setAuthor(song.author ?? '')
      setHymnNo(song.hymnNo != null ? String(song.hymnNo) : '')
      setScores(song.scores ?? [])
      setLyrics(
        song.verses.map((v) => (v.label ? `${v.label}\n${v.text}` : v.text)).join('\n\n')
      )
    })
  }, [editorOpen, editSongId, prefillTitle])

  if (!editorOpen) return null

  const remove = async (): Promise<void> => {
    if (editSongId == null) return
    if (!window.confirm(`"${title.trim() || '이 곡'}"을(를) 삭제할까요?\n플레이리스트에 담긴 항목도 함께 빠집니다. 되돌릴 수 없습니다.`)) return
    setDeleting(true)
    try {
      await window.seraphim.deleteSong(editSongId)
      if (deckLoaded?.kind === 'song' && deckLoaded.id === editSongId) clearDeck()
      await reloadLibrary()
      await refreshPlaylist()
      window.dispatchEvent(new Event('seraphim:songs-changed'))
      closeEditor()
    } finally {
      setDeleting(false)
    }
  }

  const applySplit = (): void => {
    const n = Number(splitN)
    if (!lyrics.trim() || !(n >= 1 && n <= 12)) return
    setLyrics(splitLongVerses(lyrics, n))
  }

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
        hymnNo: /^\d+$/.test(hymnNo.trim()) ? Number(hymnNo.trim()) : null,
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
            value={hymnNo}
            onValue={(v) => setHymnNo(v.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder="장"
            title="찬송가 장 번호 (선택)"
            className="w-16 bg-black/40 border border-line rounded px-3 py-1.5 text-sm text-white outline-none focus:border-accent"
          />
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
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1">
              <span>
                가사 — <b>빈 줄</b>로 절을 구분합니다 (예: 1절 ↵ 내용 ↵↵ 후렴 ↵ 내용)
              </span>
              <span className="ml-auto flex items-center gap-1" title="긴 절을 정한 줄 수마다 절로 나눕니다 (가져온 CCM처럼 절이 하나인 곡에 유용)">
                <SyncInput
                  value={splitN}
                  onValue={(v) => setSplitN(v.replace(/[^0-9]/g, '').slice(0, 2))}
                  inputMode="numeric"
                  className="w-9 bg-black/40 border border-line rounded px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-accent text-center"
                />
                줄마다
                <button
                  onClick={applySplit}
                  disabled={!lyrics.trim()}
                  className="px-1.5 py-0.5 rounded border border-line bg-panel2 text-slate-200 hover:border-slate-500 disabled:opacity-40"
                >
                  절 나누기
                </button>
              </span>
            </div>
            <SyncTextarea
              value={lyrics}
              onValue={setLyrics}
              placeholder={'1절\n첫째 줄 가사\n둘째 줄 가사\n\n후렴\n후렴 가사'}
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
            {scores.length > 0 && (
              <div className="shrink-0 mt-2">
                <div className="text-[11px] text-slate-400 mb-1">
                  원본 악보 {scores.length}장 — 클릭하면 크게 보며 가사를 대조할 수 있습니다
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {scores.map((sc, i) => (
                    <button
                      key={sc.mediaId}
                      onClick={() => setViewScore(sc.url)}
                      className="relative shrink-0 w-14 h-18 rounded border border-line hover:border-accent overflow-hidden bg-black/40"
                      title={`${i + 1}쪽`}
                    >
                      <img src={sc.url} alt="" className="w-full h-full object-cover" />
                      <span className="absolute left-0.5 bottom-0.5 text-[9px] px-1 rounded bg-black/70 text-slate-200">
                        {i + 1}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {viewScore && (
          <div
            className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-8 cursor-zoom-out"
            onClick={() => setViewScore(null)}
          >
            <img src={viewScore} alt="원본 악보" className="max-w-full max-h-full rounded shadow-2xl" />
            <button
              className="absolute top-4 right-5 text-slate-300 hover:text-white text-2xl"
              onClick={() => setViewScore(null)}
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 h-14 border-t border-line bg-panel2">
          {editSongId != null && (
            <button
              onClick={() => void remove()}
              disabled={deleting || saving}
              className="mr-auto px-4 py-2 rounded bg-panel border border-red-500/60 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              title="이 곡을 라이브러리에서 삭제"
            >
              {deleting ? '삭제 중…' : '곡 삭제'}
            </button>
          )}
          {editSongId != null && (
            <button
              onClick={() => openPptx({ name: title || '곡', songId: editSongId })}
              disabled={saving}
              className="px-3 py-2 rounded bg-panel border border-line text-sm text-slate-300 hover:border-slate-500 disabled:opacity-40"
              title="이 곡을 송출 화면과 같은 모양의 PPTX 파일로 저장 (저장된 내용 기준)"
            >
              PPTX
            </button>
          )}
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
