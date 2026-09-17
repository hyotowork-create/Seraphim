import { useEffect, useState } from 'react'
import type { BibleInput } from '@shared/ipc'
import { splitBibleVerses, formatReference } from '@shared/bible'
import { useUi } from '../store/ui'
import { useBible } from '../store/bible'
import { useDeck } from '../store/deck'

/** 성경 편집기 — 책·장·절 + 본문 → 절 단위 슬라이드 자동 생성 */
export function BibleEditorModal(): JSX.Element | null {
  const open = useUi((s) => s.bibleEditorOpen)
  const editId = useUi((s) => s.bibleEditId)
  const close = useUi((s) => s.closeBibleEditor)
  const reloadBible = useBible((s) => s.reload)
  const loadBible = useDeck((s) => s.loadBible)

  const [book, setBook] = useState('')
  const [chapter, setChapter] = useState('')
  const [range, setRange] = useState('')
  const [translation, setTranslation] = useState('개역개정')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editId == null) {
      setBook('')
      setChapter('')
      setRange('')
      setTranslation('개역개정')
      setText('')
      return
    }
    void window.seraphim.getBible(editId).then((b) => {
      if (!b) return
      setBook(b.book)
      setChapter(String(b.chapter))
      setRange(b.verseRange)
      setTranslation(b.translation ?? '')
      setText(b.text)
    })
  }, [open, editId])

  if (!open) return null

  const verses = splitBibleVerses(text)
  const canSave = book.trim().length > 0 && text.trim().length > 0

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    try {
      const input: BibleInput = {
        id: editId ?? undefined,
        book: book.trim(),
        chapter: Number(chapter) || 0,
        verseRange: range.trim(),
        translation: translation.trim() || null,
        text
      }
      const id = await window.seraphim.saveBible(input)
      await reloadBible()
      await loadBible(id)
      close()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={close}>
      <div
        className="w-[900px] max-w-full h-[80vh] flex flex-col rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-line bg-panel2">
          <span className="font-semibold text-slate-100">
            {editId == null ? '새 성경 말씀' : '성경 말씀 편집'}
          </span>
          <button onClick={close} className="text-slate-400 hover:text-white text-lg px-2">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-b border-line flex-wrap">
          <input
            value={book}
            onChange={(e) => setBook(e.target.value)}
            placeholder="책 (예: 요한복음) *"
            className="w-40 bg-black/40 border border-line rounded px-3 py-1.5 text-sm text-white outline-none focus:border-accent"
          />
          <input
            value={chapter}
            onChange={(e) => setChapter(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="장"
            className="w-16 bg-black/40 border border-line rounded px-3 py-1.5 text-sm text-white outline-none focus:border-accent"
          />
          <input
            value={range}
            onChange={(e) => setRange(e.target.value)}
            placeholder="절 (예: 16-17)"
            className="w-28 bg-black/40 border border-line rounded px-3 py-1.5 text-sm text-white outline-none focus:border-accent"
          />
          <input
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            placeholder="번역본 (선택)"
            className="w-32 bg-black/40 border border-line rounded px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-accent"
          />
          <span className="text-xs text-slate-400 ml-auto">
            {book && chapter ? formatReference(book, chapter, range) : '참조 미입력'}
          </span>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3 p-5 min-h-0">
          <div className="flex flex-col min-h-0">
            <div className="text-[11px] text-slate-400 mb-1">
              본문 — <b>한 줄 = 한 절</b> 슬라이드 (절 번호로 시작하면 자동 인식)
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'16 하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니\n17 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라'}
              className="flex-1 resize-none rounded-md bg-black/40 border border-line p-3 text-sm text-white outline-none focus:border-accent leading-relaxed"
            />
          </div>
          <div className="flex flex-col min-h-0">
            <div className="text-[11px] text-slate-400 mb-1">
              슬라이드 미리보기 — <b>{verses.length}</b>개 절
            </div>
            <div className="flex-1 overflow-auto rounded-md bg-black/20 border border-line p-2 space-y-2">
              {verses.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-slate-500">
                  본문을 입력하면 절이 자동으로 나뉩니다.
                </div>
              ) : (
                verses.map((v, i) => (
                  <div key={i} className="rounded border border-line bg-panel2/40 p-2">
                    {v.label && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-panel2 border border-line text-slate-300">
                        {v.label}절
                      </span>
                    )}
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
            onClick={close}
            className="px-4 py-2 rounded bg-panel border border-line text-sm text-slate-200 hover:border-slate-500"
          >
            취소
          </button>
          <button
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded bg-accent/30 border border-accent text-sm text-white hover:bg-accent/40 disabled:opacity-40"
          >
            {saving ? '저장 중…' : '말씀으로 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
