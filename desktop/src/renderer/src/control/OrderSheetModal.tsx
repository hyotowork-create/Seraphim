import { useEffect, useState } from 'react'
import { BUNDLED_BIBLE_CODE, type BibleTranslationInfo, type OrderApplyItem, type OrderResolvedLine } from '@shared/ipc'
import { useUi } from '../store/ui'
import { usePlaylist } from '../store/playlist'
import { useBible } from '../store/bible'
import { useDeck } from '../store/deck'
import { SyncInput, SyncTextarea } from '../components/SyncField'

const ipcMsg = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')

const todayName = (): string => {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 예배`
}

const PLACEHOLDER = `한 줄에 하나씩 적으세요. 순서지를 그대로 붙여 넣어도 됩니다.

요 3:16-18
478장
주 하나님 지으신 모든 세계
1. 참 아름다워라(D) – 1-3절 – 2번 연결
2. 물 위를 걷는 자(A) - 후렴 2번 반복
시 23편`

/**
 * 순서지 → 플레이리스트 자동 구성.
 * 줄마다 성경 참조 / 찬송가 장 번호 / 곡 제목을 해석해 미리보기로 보여 주고, 확정하면 말씀을 저장하고 플레이리스트를 만든다.
 */
export function OrderSheetModal(): JSX.Element | null {
  const open = useUi((s) => s.orderOpen)
  const close = useUi((s) => s.closeOrder)
  const openEditor = useUi((s) => s.openEditor)
  const pl = usePlaylist()
  const reloadBible = useBible((s) => s.reload)
  const loadSong = useDeck((s) => s.load)
  const loadBibleDeck = useDeck((s) => s.loadBible)

  const [text, setText] = useState('')
  const [name, setName] = useState(todayName())
  const [translations, setTranslations] = useState<BibleTranslationInfo[]>([])
  const [code, setCode] = useState(BUNDLED_BIBLE_CODE)
  const [lines, setLines] = useState<OrderResolvedLine[] | null>(null)
  /** 후보 중 사용자가 고른 곡 id (index → songId) */
  const [picked, setPicked] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setText('')
    setName(todayName())
    setLines(null)
    setPicked({})
    setError('')
    void window.seraphim.getSetting('bible.translation').then((c) => {
      if (c) setCode(c)
    })
    void window.seraphim.listBibleTranslations().then((list) => {
      setTranslations(list)
      setCode((cur) => (list.some((t) => t.code === cur) ? cur : (list[0]?.code ?? cur)))
    })
  }, [open])

  if (!open) return null

  const resolve = async (): Promise<void> => {
    if (!text.trim()) return
    setBusy(true)
    setError('')
    try {
      const r = await window.seraphim.resolveOrder(text, code)
      setLines(r)
      setPicked({})
    } catch (e) {
      setError(ipcMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const items = (): OrderApplyItem[] => {
    const out: OrderApplyItem[] = []
    for (const l of lines ?? []) {
      if (l.bible) {
        out.push({ kind: 'bible', note: l.note, bible: { book: l.bible.book, chapter: l.bible.chapter, verseRange: l.bible.verseRange, translation: l.bible.translationName, text: l.bible.text } })
      } else if (l.song) {
        out.push({ kind: 'song', note: l.note, songId: l.song.id })
      } else if (l.candidates && picked[l.index] != null) {
        out.push({ kind: 'song', note: l.note, songId: picked[l.index] })
      }
    }
    return out
  }
  const ready = items()
  const unresolved = (lines ?? []).filter((l) => l.kind !== 'blank' && !l.bible && !l.song && !(l.candidates && picked[l.index] != null))

  const apply = async (): Promise<void> => {
    if (!ready.length) return
    setBusy(true)
    setError('')
    try {
      const r = await window.seraphim.applyOrder(name, ready)
      await pl.loadPlaylists()
      await pl.open(r.playlistId)
      await reloadBible()
      // 첫 항목을 송출 대기로
      const first = ready[0]
      if (first.kind === 'song' && first.songId != null) await loadSong(first.songId)
      else {
        const its = await window.seraphim.playlistItems(r.playlistId)
        const b = its.find((i) => i.itemType === 'bible' && i.refId != null)
        if (b?.refId != null) await loadBibleDeck(b.refId)
      }
      window.dispatchEvent(new Event('seraphim:songs-changed'))
      close()
    } catch (e) {
      setError(ipcMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const rowStatus = (l: OrderResolvedLine): JSX.Element => {
    if (l.kind === 'blank') return <span className="text-slate-600">—</span>
    if (l.bible)
      return (
        <span className="text-emerald-300">
          📖 {l.bible.reference} <span className="text-slate-400">({l.bible.translationName} · {l.bible.verseCount}절)</span>
        </span>
      )
    if (l.song)
      return (
        <span className="text-emerald-300">
          ♪ {l.song.hymnNo != null && <span className="text-accent">{l.song.hymnNo}장 </span>}
          {l.song.title} <span className="text-slate-400">({l.song.category})</span>
        </span>
      )
    if (l.candidates)
      return (
        <span className="flex items-center gap-1 text-amber-300">
          후보 {l.candidates.length}개:
          <select
            value={picked[l.index] ?? ''}
            onChange={(e) => setPicked((p) => ({ ...p, [l.index]: Number(e.target.value) }))}
            className="bg-black/40 border border-line rounded px-1 py-0.5 text-[11px] text-slate-100"
          >
            <option value="">선택…</option>
            {l.candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.hymnNo != null ? `${c.hymnNo}장 ` : ''}
                {c.title} ({c.category})
              </option>
            ))}
          </select>
        </span>
      )
    return (
      <span className="flex items-center gap-2 text-red-300">
        {l.error ?? '해석 실패'}
        {l.kind !== 'bible' && (
          <button
            className="text-[10px] px-1.5 py-0.5 rounded border border-line bg-panel2 text-slate-200 hover:border-slate-500"
            onClick={() => openEditor(null, l.raw.replace(/^\s*(?:[①-⑳]|[(\[]?\d{1,2}[.)\]]|\d{1,2}\s*[-–:])\s*/, '').replace(/\s*\([A-G][#b]?m?\)\s*/g, ' ').trim())}
            title="곡 편집기를 열어 이 곡을 새로 입력 (제목 미리 채움)"
          >
            새 곡으로 입력
          </button>
        )}
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={close}>
      <div
        className="w-[1000px] max-w-full h-[85vh] flex flex-col rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-line bg-panel2">
          <span className="font-semibold text-slate-100">예배 순서로 플레이리스트 만들기</span>
          <button onClick={close} className="text-slate-400 hover:text-white text-lg px-2">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-b border-line flex-wrap">
          <span className="text-xs text-slate-400">플레이리스트 이름</span>
          <SyncInput
            value={name}
            onValue={setName}
            className="w-56 bg-black/40 border border-line rounded px-3 py-1.5 text-sm text-white outline-none focus:border-accent"
          />
          <span className="text-xs text-slate-400 ml-2">성경 번역본</span>
          <select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="bg-black/40 border border-line rounded px-2 py-1.5 text-sm text-slate-100"
          >
            {translations.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void resolve()}
            disabled={!text.trim() || busy}
            className="ml-auto px-3 py-1.5 rounded bg-accent/30 border border-accent text-sm text-white hover:bg-accent/40 disabled:opacity-40"
          >
            {busy && !lines ? '해석 중…' : '해석하기'}
          </button>
          {error && <span className="w-full text-[11px] text-red-400">{error}</span>}
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3 p-5 min-h-0">
          <div className="flex flex-col min-h-0">
            <div className="text-[11px] text-slate-400 mb-1">
              순서지 — 한 줄에 하나 (말씀 장절 · 찬송가 장 번호 · 곡 제목). 번호, 조표(D), "1-3절" 같은 메모는 자동으로 걸러집니다.
            </div>
            <SyncTextarea
              autoFocus
              value={text}
              onValue={setText}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void resolve()
              }}
              placeholder={PLACEHOLDER}
              className="flex-1 resize-none rounded-md bg-black/40 border border-line p-3 text-sm text-white outline-none focus:border-accent leading-relaxed"
            />
            <div className="text-[10px] text-slate-500 mt-1">⌘+Enter로 해석</div>
          </div>
          <div className="flex flex-col min-h-0">
            <div className="text-[11px] text-slate-400 mb-1">
              해석 결과{lines && <> — 항목 <b>{ready.length}</b>개 준비{unresolved.length > 0 && <>, 미해결 {unresolved.length}개</>}</>}
            </div>
            <div className="flex-1 overflow-auto rounded-md bg-black/20 border border-line p-2 space-y-1">
              {!lines ? (
                <div className="h-full flex items-center justify-center text-[11px] text-slate-500 text-center px-4">
                  왼쪽에 순서를 적고 "해석하기"를 누르면 줄마다 찾은 곡과 말씀이 여기에 표시됩니다.
                </div>
              ) : (
                lines
                  .filter((l) => l.kind !== 'blank')
                  .map((l) => (
                    <div key={l.index} className="rounded border border-line bg-panel2/40 px-2 py-1.5 text-[12px]">
                      <div className="text-slate-500 text-[10px] truncate">{l.raw}</div>
                      <div className="mt-0.5">{rowStatus(l)}</div>
                      {l.note && <div className="text-[10px] text-slate-400 mt-0.5">메모: {l.note}</div>}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 h-14 border-t border-line bg-panel2">
          <span className="text-[11px] text-slate-500">
            확정하면 말씀은 성경 목록에 저장되고, 곡과 말씀이 순서대로 담긴 새 플레이리스트가 열립니다. 미해결 줄은 건너뜁니다.
          </span>
          <div className="flex gap-2">
            <button onClick={close} className="px-4 py-2 rounded bg-panel border border-line text-sm text-slate-200 hover:border-slate-500">
              취소
            </button>
            <button
              onClick={() => void apply()}
              disabled={!ready.length || busy}
              className="px-4 py-2 rounded bg-accent/30 border border-accent text-sm text-white hover:bg-accent/40 disabled:opacity-40"
            >
              플레이리스트 만들기 ({ready.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
