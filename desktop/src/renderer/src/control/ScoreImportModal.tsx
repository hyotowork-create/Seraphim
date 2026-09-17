import { useEffect, useState } from 'react'
import { SONG_CATEGORIES, type ExtractMethod, type ExtractedSong, type SongInput } from '@shared/ipc'
import { splitVerses } from '@shared/lyrics'
import { useUi } from '../store/ui'
import { useLibrary } from '../store/library'
import { useDeck } from '../store/deck'

function versesToText(x: ExtractedSong): string {
  return x.verses
    .map((v) => `${v.label ? v.label + '\n' : ''}${(v.lines || []).join('\n')}`.trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * 악보에서 가져오기 — 이미지 업로드 → (Gemini) 가사 추출 → 좌(원본)/우(텍스트) 검수 편집 → 곡 저장.
 * 자동 추출은 100% 신뢰하지 않으며 반드시 사람이 검수·수정한 뒤 저장한다.
 */
export function ScoreImportModal(): JSX.Element | null {
  const open = useUi((s) => s.scoreOpen)
  const close = useUi((s) => s.closeScore)
  const reloadLibrary = useLibrary((s) => s.reload)
  const loadDeck = useDeck((s) => s.load)

  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [relPath, setRelPath] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>(SONG_CATEGORIES[0])
  const [lyrics, setLyrics] = useState('')
  const [method, setMethod] = useState<ExtractMethod>('gemini')
  const [status, setStatus] = useState<'idle' | 'extracting' | 'error'>('idle')
  const [error, setError] = useState('')
  const [hasKey, setHasKey] = useState(true)

  useEffect(() => {
    if (!open) return
    setImgUrl(null)
    setRelPath(null)
    setTitle('')
    setLyrics('')
    setStatus('idle')
    setError('')
    void window.seraphim.getSetting('extract.method').then((m) => {
      if (m === 'ocr' || m === 'gemini') setMethod(m)
    })
    void window.seraphim.hasGeminiKey().then(setHasKey)
  }, [open])

  if (!open) return null

  const pick = async (): Promise<void> => {
    const r = await window.seraphim.pickScore()
    if (!r) return
    setImgUrl(r.url)
    setRelPath(r.relPath)
  }

  const extract = async (): Promise<void> => {
    if (!relPath) return
    setStatus('extracting')
    setError('')
    try {
      const res = await window.seraphim.extractScore(relPath, method)
      if (res.title && !title) setTitle(res.title)
      setLyrics(versesToText(res))
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const verses = splitVerses(lyrics)
  const canSave = title.trim().length > 0 && verses.length > 0

  const save = async (): Promise<void> => {
    if (!canSave) return
    const input: SongInput = {
      title: title.trim(),
      category,
      verses: verses.map((v) => ({ label: v.label, text: v.text }))
    }
    const id = await window.seraphim.saveSong(input)
    await reloadLibrary()
    await loadDeck(id)
    close()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={close}>
      <div
        className="w-[1000px] max-w-full h-[85vh] flex flex-col rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-line bg-panel2">
          <span className="font-semibold text-slate-100">악보에서 가져오기 (가사 추출)</span>
          <button onClick={close} className="text-slate-400 hover:text-white text-lg px-2">
            ✕
          </button>
        </div>

        {/* 도구 바 */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line flex-wrap">
          <button
            onClick={() => void pick()}
            className="px-3 py-1.5 rounded bg-panel2 border border-line text-sm text-slate-200 hover:border-slate-500"
          >
            악보 이미지 선택…
          </button>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as ExtractMethod)}
            className="bg-black/40 border border-line rounded px-2 py-1.5 text-sm text-slate-100"
          >
            <option value="gemini">Gemini Vision (온라인)</option>
            <option value="ocr">로컬 OCR (준비 중)</option>
          </select>
          <button
            onClick={() => void extract()}
            disabled={!relPath || status === 'extracting'}
            className="px-3 py-1.5 rounded bg-accent/30 border border-accent text-sm text-white hover:bg-accent/40 disabled:opacity-40"
          >
            {status === 'extracting' ? '추출 중…' : '가사 추출'}
          </button>
          {method === 'gemini' && !hasKey && (
            <span className="text-[11px] text-amber-400">⚠ 설정에서 Gemini API 키를 입력하세요</span>
          )}
          {status === 'error' && (
            <span className="text-[11px] text-red-400 truncate max-w-[420px]">{error}</span>
          )}
        </div>

        {/* 좌: 원본 / 우: 추출 텍스트 */}
        <div className="flex-1 grid grid-cols-2 gap-3 p-5 min-h-0">
          <div className="flex flex-col min-h-0">
            <div className="text-[11px] text-slate-400 mb-1">원본 악보</div>
            <div className="flex-1 rounded-md bg-black/40 border border-line overflow-auto flex items-center justify-center">
              {imgUrl ? (
                <img src={imgUrl} alt="악보" className="max-w-full" />
              ) : (
                <span className="text-[11px] text-slate-500 p-4 text-center">
                  “악보 이미지 선택”으로 사진/스캔을 불러오세요. (PDF는 다음 단계 지원)
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col min-h-0 gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="곡 제목 *"
              className="bg-black/40 border border-line rounded px-3 py-1.5 text-sm text-white outline-none focus:border-accent"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-black/40 border border-line rounded px-2 py-1.5 text-sm text-slate-100 self-start"
            >
              {SONG_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-slate-400">
              추출 결과 (검수·수정) — 빈 줄로 절 구분 · <b>{verses.length}</b>개 절
            </div>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="추출된 가사가 여기에 표시됩니다. 오탈자·절 구분을 직접 수정한 뒤 저장하세요."
              className="flex-1 resize-none rounded-md bg-black/40 border border-line p-3 text-sm text-white outline-none focus:border-accent leading-relaxed"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 h-14 border-t border-line bg-panel2">
          <span className="text-[11px] text-slate-500">
            ※ 자동 추출은 오류가 있을 수 있으니 반드시 검수 후 저장하세요.
          </span>
          <div className="flex gap-2">
            <button
              onClick={close}
              className="px-4 py-2 rounded bg-panel border border-line text-sm text-slate-200 hover:border-slate-500"
            >
              취소
            </button>
            <button
              onClick={() => void save()}
              disabled={!canSave}
              className="px-4 py-2 rounded bg-accent/30 border border-accent text-sm text-white hover:bg-accent/40 disabled:opacity-40"
            >
              곡으로 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
