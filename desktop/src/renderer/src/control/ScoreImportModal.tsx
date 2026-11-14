import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
// legacy 빌드: Electron 32(Chromium 128)에 없는 Uint8Array.toHex 등 폴리필 포함
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import {
  SCORE_LOW_RES_EDGE,
  SCORE_PDF_MAX_PAGES,
  SONG_CATEGORIES,
  type CropRegion,
  type ExtractMethod,
  type ExtractResult,
  type ExtractedSong,
  type PickedMedia,
  type SongInput
} from '@shared/ipc'
import { splitVerses } from '@shared/lyrics'
import { useUi } from '../store/ui'
import { useLibrary } from '../store/library'
import { useDeck } from '../store/deck'
import { SyncInput, SyncTextarea } from '../components/SyncField'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** PDF 페이지를 이미지로 변환할 때의 가로 픽셀 (악보 글자 판독에 충분) */
const PDF_RENDER_WIDTH = 1800

/** Electron IPC가 붙이는 "Error invoking remote method '...': Error: " 접두어 제거 */
function ipcErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')
}

function versesToText(x: ExtractedSong): string {
  return x.verses
    .map((v) => `${v.label ? v.label + '\n' : ''}${(v.lines || []).join('\n')}`.trim())
    .filter(Boolean)
    .join('\n\n')
}

/** 검수 중인 곡 초안 (이미지에 곡이 여러 개면 여러 개) */
interface DraftSong {
  key: number
  title: string
  category: string
  lyrics: string
}
let seq = 1
const newDraft = (title = '', lyrics = ''): DraftSong => ({ key: seq++, title, category: SONG_CATEGORIES[0], lyrics })

/** 영역 선택 (페이지 index + 0~1 비율 사각형) */
interface Region {
  key: number
  pageIdx: number
  x: number
  y: number
  w: number
  h: number
}

function isLowRes(p: PickedMedia): boolean {
  return !!p.width && !!p.height && Math.max(p.width, p.height) < SCORE_LOW_RES_EDGE
}

/** PDF(seraphim-media URL) → 페이지별 PNG base64. 렌더러(Chromium)에서 pdf.js로 변환 */
async function rasterizePdf(
  url: string,
  onProgress: (done: number, total: number) => void
): Promise<{ pngBase64: string; pageNo: number }[]> {
  const data = new Uint8Array(await (await fetch(url)).arrayBuffer())
  const task = pdfjsLib.getDocument({ data })
  const doc = await task.promise
  const total = Math.min(doc.numPages, SCORE_PDF_MAX_PAGES)
  const out: { pngBase64: string; pageNo: number }[] = []
  try {
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(3, PDF_RENDER_WIDTH / base.width)
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vp.width)
      canvas.height = Math.round(vp.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('캔버스를 만들 수 없습니다.')
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise
      out.push({ pngBase64: canvas.toDataURL('image/png').split(',')[1], pageNo: i })
      page.cleanup()
      onProgress(i, total)
    }
  } finally {
    await task.destroy()
  }
  return out
}

// 디버그/자동검증용 훅 (패키징된 앱에서 PDF 변환 경로를 점검할 때 사용)
;(window as unknown as { __seraphimDebug?: Record<string, unknown> }).__seraphimDebug = {
  ...(window as unknown as { __seraphimDebug?: Record<string, unknown> }).__seraphimDebug,
  rasterizePdf
}

/**
 * 악보에서 가져오기 — 이미지/PDF(여러 장) → (Gemini) 가사 추출 → 좌(원본)/우(텍스트) 검수 편집 → 곡 저장.
 *  - 한 이미지에 곡이 여러 개면 곡 탭으로 나뉘어 각각 검수·저장
 *  - 글자가 작으면 원본 위에서 가사 영역을 드래그로 지정해 그 부분만 확대 추출
 *  - 1차 결과가 빈약하면 main이 정밀 모드(확대 + 정밀 모델)로 자동 재시도
 * 자동 추출은 100% 신뢰하지 않으며 반드시 사람이 검수·수정한 뒤 저장한다.
 */
export function ScoreImportModal(): JSX.Element | null {
  const open = useUi((s) => s.scoreOpen)
  const close = useUi((s) => s.closeScore)
  const reloadLibrary = useLibrary((s) => s.reload)
  const loadDeck = useDeck((s) => s.load)

  const [pages, setPages] = useState<PickedMedia[]>([])
  const [selected, setSelected] = useState(0)
  const [drafts, setDrafts] = useState<DraftSong[]>([newDraft()])
  const [active, setActive] = useState(0)
  const [method, setMethod] = useState<ExtractMethod>('gemini')
  const [precise, setPrecise] = useState(false)
  const [status, setStatus] = useState<'idle' | 'picking' | 'extracting' | 'error'>('idle')
  const [progress, setProgress] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [hasKey, setHasKey] = useState(true)

  // 영역 선택
  const [regions, setRegions] = useState<Region[]>([])
  const [cropMode, setCropMode] = useState(false)
  const [dragging, setDragging] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const imgWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setPages([])
    setSelected(0)
    setDrafts([newDraft()])
    setActive(0)
    setRegions([])
    setCropMode(false)
    setDragging(null)
    setPrecise(false)
    setStatus('idle')
    setProgress('')
    setNotice('')
    setError('')
    void window.seraphim.getSetting('extract.method').then((m) => {
      if (m === 'gemini' || m === 'ocr') setMethod(m)
    })
    void window.seraphim.hasGeminiKey().then(setHasKey)
  }, [open])

  if (!open) return null

  const draft = drafts[active] ?? drafts[0]
  const updateDraft = (patch: Partial<DraftSong>): void =>
    setDrafts((prev) => prev.map((d, i) => (i === active ? { ...d, ...patch } : d)))

  const pick = async (): Promise<void> => {
    setStatus('picking')
    setError('')
    try {
      const picked = await window.seraphim.pickScores()
      const added: PickedMedia[] = []
      for (const p of picked) {
        if (/\.pdf$/i.test(p.relPath)) {
          setProgress(`PDF 변환 중… (${p.name})`)
          const rendered = await rasterizePdf(p.url, (d, t) => setProgress(`PDF 변환 중… ${d}/${t} (${p.name})`))
          for (const r of rendered) {
            added.push(await window.seraphim.saveScorePage(r.pngBase64, `${p.name} p${r.pageNo}`))
          }
          if (rendered.length === SCORE_PDF_MAX_PAGES) setError(`PDF는 앞 ${SCORE_PDF_MAX_PAGES}쪽까지만 변환됩니다.`)
        } else {
          added.push(p)
        }
      }
      if (added.length) {
        setPages((prev) => {
          const next = [...prev, ...added]
          setSelected(next.length - added.length)
          return next
        })
      }
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setError(ipcErrorMessage(e))
    } finally {
      setProgress('')
    }
  }

  const removePage = (idx: number): void => {
    setPages((prev) => prev.filter((_, i) => i !== idx))
    setRegions((prev) =>
      prev.filter((r) => r.pageIdx !== idx).map((r) => (r.pageIdx > idx ? { ...r, pageIdx: r.pageIdx - 1 } : r))
    )
    setSelected((s) => Math.max(0, Math.min(s, pages.length - 2)))
  }

  const movePage = (idx: number, dir: -1 | 1): void => {
    const j = idx + dir
    if (j < 0 || j >= pages.length) return
    setPages((prev) => {
      const next = [...prev]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
    setRegions((prev) =>
      prev.map((r) => (r.pageIdx === idx ? { ...r, pageIdx: j } : r.pageIdx === j ? { ...r, pageIdx: idx } : r))
    )
    setSelected(j)
  }

  // ── 영역 드래그 ──
  const relPoint = (e: ReactMouseEvent): { x: number; y: number } | null => {
    const el = imgWrapRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    }
  }
  const onMouseDown = (e: ReactMouseEvent): void => {
    if (!cropMode || e.button !== 0) return
    const p = relPoint(e)
    if (!p) return
    e.preventDefault()
    setDragging({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMouseMove = (e: ReactMouseEvent): void => {
    if (!dragging) return
    const p = relPoint(e)
    if (p) setDragging({ ...dragging, x1: p.x, y1: p.y })
  }
  const onMouseUp = (): void => {
    if (!dragging) return
    const x = Math.min(dragging.x0, dragging.x1)
    const y = Math.min(dragging.y0, dragging.y1)
    const w = Math.abs(dragging.x1 - dragging.x0)
    const h = Math.abs(dragging.y1 - dragging.y0)
    setDragging(null)
    if (w < 0.02 || h < 0.02) return // 클릭 수준은 무시
    setRegions((prev) => [...prev, { key: seq++, pageIdx: selected, x, y, w, h }])
  }

  const toCropRegions = (): CropRegion[] =>
    [...regions]
      .sort((a, b) => a.pageIdx - b.pageIdx || a.y - b.y)
      .map((r) => ({ relPath: pages[r.pageIdx].relPath, x: r.x, y: r.y, w: r.w, h: r.h }))

  const extract = async (useRegions: boolean): Promise<void> => {
    if (!pages.length) return
    const hasText = drafts.some((d) => d.lyrics.trim())
    if (hasText && !window.confirm('검수 중인 가사가 있습니다. 새 추출 결과로 덮어쓸까요?')) return
    setStatus('extracting')
    setError('')
    setNotice('')
    try {
      const res: ExtractResult = await window.seraphim.extractScore(
        pages.map((p) => p.relPath),
        method,
        { precise, regions: useRegions ? toCropRegions() : undefined }
      )
      const next = res.songs.map((s) => newDraft(s.title, versesToText(s)))
      setDrafts(next.length ? next : [newDraft()])
      setActive(0)
      const bits: string[] = []
      if (res.songs.length > 1) bits.push(`곡 ${res.songs.length}개를 찾았습니다. 탭에서 각각 검수한 뒤 저장하세요.`)
      if (res.meta.retried) bits.push(`1차 결과가 빈약해 정밀 모드(${res.meta.model})로 다시 추출했습니다.`)
      else if (res.meta.precise) bits.push(`정밀 모드(${res.meta.model})로 추출했습니다.`)
      if (useRegions) bits.push(`선택 영역 ${regions.length}개만 추출했습니다.`)
      setNotice(bits.join(' '))
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setError(ipcErrorMessage(e))
    }
  }

  const draftVerses = (d: DraftSong): ReturnType<typeof splitVerses> => splitVerses(d.lyrics)
  const isSavable = (d: DraftSong): boolean => d.title.trim().length > 0 && draftVerses(d).length > 0
  const verses = draftVerses(draft)
  const busy = status === 'extracting' || status === 'picking'
  const canSave = isSavable(draft) && !busy
  const savableCount = drafts.filter(isSavable).length

  const saveDrafts = async (targets: DraftSong[]): Promise<void> => {
    let lastId: number | null = null
    for (const d of targets) {
      const input: SongInput = {
        title: d.title.trim(),
        category: d.category,
        verses: draftVerses(d).map((v) => ({ label: v.label, text: v.text })),
        scoreMediaIds: pages.map((p) => p.id)
      }
      lastId = await window.seraphim.saveSong(input)
    }
    await reloadLibrary()
    if (lastId != null) await loadDeck(lastId)
    close()
  }

  const current = pages[selected]
  const currentRegions = regions.filter((r) => r.pageIdx === selected)
  const lowResPages = pages.filter(isLowRes)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={close}>
      <div
        className="w-[1100px] max-w-full h-[88vh] flex flex-col rounded-xl border border-line bg-panel shadow-2xl"
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
            disabled={busy}
            className="px-3 py-1.5 rounded bg-panel2 border border-line text-sm text-slate-200 hover:border-slate-500 disabled:opacity-40"
          >
            {pages.length ? '페이지 추가…' : '악보 이미지/PDF 선택…'}
          </button>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as ExtractMethod)}
            className="bg-black/40 border border-line rounded px-2 py-1.5 text-sm text-slate-100"
          >
            <option value="gemini">Gemini Vision (온라인)</option>
            <option value="ocr">로컬 OCR (오프라인 · 정확도 낮음)</option>
          </select>
          <label
            className="flex items-center gap-1 text-xs text-slate-300"
            title="확대 + 정밀 모델로 바로 추출 (글자가 작을 때)"
          >
            <input type="checkbox" checked={precise} onChange={(e) => setPrecise(e.target.checked)} className="accent-accent" />
            정밀 모드
          </label>
          <button
            onClick={() => void extract(false)}
            disabled={!pages.length || busy}
            className="px-3 py-1.5 rounded bg-accent/30 border border-accent text-sm text-white hover:bg-accent/40 disabled:opacity-40"
          >
            {status === 'extracting' ? '추출 중…' : pages.length > 1 ? `가사 추출 (${pages.length}쪽)` : '가사 추출'}
          </button>
          {regions.length > 0 && (
            <button
              onClick={() => void extract(true)}
              disabled={busy}
              className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500 text-sm text-white hover:bg-emerald-500/30 disabled:opacity-40"
              title="지정한 영역만 잘라서(확대 효과) 추출"
            >
              선택 영역만 추출 ({regions.length})
            </button>
          )}
          {progress && <span className="text-[11px] text-slate-300">{progress}</span>}
          {method === 'gemini' && !hasKey && (
            <span className="text-[11px] text-amber-400">⚠ 설정에서 Gemini API 키를 입력하세요</span>
          )}
          {method === 'ocr' && (
            <span className="text-[11px] text-slate-400">오프라인 OCR: 절 구분·곡 분리가 거칠어 검수가 더 필요합니다</span>
          )}
        </div>
        {(error || notice || lowResPages.length > 0) && (
          <div className="px-5 py-1.5 border-b border-line space-y-0.5">
            {error && (
              <div className="text-[11px] text-red-400" title={error}>
                {error}
              </div>
            )}
            {notice && <div className="text-[11px] text-emerald-300">{notice}</div>}
            {lowResPages.length > 0 && !error && (
              <div className="text-[11px] text-amber-400">
                ⚠ 해상도가 낮은 이미지가 {lowResPages.length}장 있습니다 (긴 변 {SCORE_LOW_RES_EDGE}px 미만). 전송 시
                자동 확대하지만 글자가 작으면 인식이 어려울 수 있습니다. "영역 선택"으로 가사 부분만 지정하거나 정밀
                모드를 켜 보세요. 아이폰 메모 앱의 문서 스캔이나 300dpi 스캔을 권장합니다.
              </div>
            )}
          </div>
        )}

        {/* 좌: 원본(페이지 목록 + 영역 선택) / 우: 곡 탭 + 추출 텍스트 */}
        <div className="flex-1 grid grid-cols-2 gap-3 p-5 min-h-0">
          <div className="flex flex-col min-h-0 gap-2">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>
                원본 악보{pages.length > 0 && ` — ${selected + 1}/${pages.length}쪽`}
                {current?.width && current.height && (
                  <span className={isLowRes(current) ? 'text-amber-400' : ''}>
                    {' '}
                    ({current.width}×{current.height}px)
                  </span>
                )}
              </span>
              {pages.length > 0 && (
                <>
                  <button
                    onClick={() => setCropMode((v) => !v)}
                    className={
                      'ml-auto px-2 py-0.5 rounded border text-[11px] ' +
                      (cropMode
                        ? 'bg-emerald-500/20 border-emerald-500 text-white'
                        : 'bg-panel2 border-line text-slate-300 hover:border-slate-500')
                    }
                    title="원본 위에서 드래그하여 가사 영역(또는 곡 하나)을 지정"
                  >
                    {cropMode ? '영역 선택 중 (드래그)' : '영역 선택'}
                  </button>
                  {regions.length > 0 && (
                    <button
                      onClick={() => setRegions([])}
                      className="px-2 py-0.5 rounded border border-line bg-panel2 text-[11px] text-slate-300 hover:border-slate-500"
                    >
                      영역 지우기
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex-1 rounded-md bg-black/40 border border-line overflow-auto flex items-start justify-center min-h-0">
              {current ? (
                <div
                  ref={imgWrapRef}
                  className={'relative inline-block select-none ' + (cropMode ? 'cursor-crosshair' : '')}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                  onMouseLeave={onMouseUp}
                >
                  <img src={current.url} alt={current.name} className="max-w-full block" draggable={false} />
                  {currentRegions.map((r) => (
                    <div
                      key={r.key}
                      className="absolute border-2 border-emerald-400 bg-emerald-400/10"
                      style={{
                        left: `${r.x * 100}%`,
                        top: `${r.y * 100}%`,
                        width: `${r.w * 100}%`,
                        height: `${r.h * 100}%`
                      }}
                    >
                      <span className="absolute -top-5 left-0 text-[10px] px-1 rounded bg-emerald-600 text-white">
                        영역 {regions.indexOf(r) + 1}
                      </span>
                      <button
                        className="absolute -top-5 right-0 text-[10px] px-1 rounded bg-black/70 text-red-300 hover:text-red-200"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          setRegions((prev) => prev.filter((x) => x.key !== r.key))
                        }}
                        title="이 영역 제거"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {dragging && (
                    <div
                      className="absolute border-2 border-dashed border-emerald-300 bg-emerald-300/10 pointer-events-none"
                      style={{
                        left: `${Math.min(dragging.x0, dragging.x1) * 100}%`,
                        top: `${Math.min(dragging.y0, dragging.y1) * 100}%`,
                        width: `${Math.abs(dragging.x1 - dragging.x0) * 100}%`,
                        height: `${Math.abs(dragging.y1 - dragging.y0) * 100}%`
                      }}
                    />
                  )}
                </div>
              ) : (
                <span className="text-[11px] text-slate-500 p-4 text-center self-center">
                  “악보 이미지/PDF 선택”으로 사진(JPG/PNG/HEIC)이나 스캔 PDF를 불러오세요.
                  <br />
                  여러 장을 한 번에 선택하면 연속 페이지로 처리되고, 한 장에 곡이 여러 개면 곡별로 나뉩니다.
                </span>
              )}
            </div>
            {pages.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto shrink-0 pb-1">
                {pages.map((p, i) => (
                  <div
                    key={p.id}
                    className={
                      'relative shrink-0 w-16 h-20 rounded border cursor-pointer overflow-hidden bg-black/40 ' +
                      (i === selected ? 'border-accent' : 'border-line hover:border-slate-500')
                    }
                    onClick={() => setSelected(i)}
                    title={p.name}
                  >
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    <span className="absolute left-0.5 bottom-0.5 text-[9px] px-1 rounded bg-black/70 text-slate-200">
                      {i + 1}
                      {isLowRes(p) && <span className="text-amber-400"> ⚠</span>}
                    </span>
                    <div className="absolute right-0 top-0 flex">
                      <button
                        className="text-[10px] px-1 bg-black/70 text-slate-300 hover:text-white"
                        title="앞으로"
                        onClick={(e) => {
                          e.stopPropagation()
                          movePage(i, -1)
                        }}
                      >
                        ◀
                      </button>
                      <button
                        className="text-[10px] px-1 bg-black/70 text-slate-300 hover:text-white"
                        title="뒤로"
                        onClick={(e) => {
                          e.stopPropagation()
                          movePage(i, 1)
                        }}
                      >
                        ▶
                      </button>
                      <button
                        className="text-[10px] px-1 bg-black/70 text-red-300 hover:text-red-200"
                        title="제거"
                        onClick={(e) => {
                          e.stopPropagation()
                          removePage(i)
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col min-h-0 gap-2">
            {/* 곡 탭 */}
            <div className="flex items-center gap-1 flex-wrap">
              {drafts.map((d, i) => (
                <div
                  key={d.key}
                  className={
                    'flex items-center gap-1 px-2 py-1 rounded-t border text-xs cursor-pointer ' +
                    (i === active
                      ? 'bg-panel2 border-accent text-white'
                      : 'bg-black/30 border-line text-slate-400 hover:text-slate-200')
                  }
                  onClick={() => setActive(i)}
                >
                  <span className="max-w-[140px] truncate">
                    {i + 1}. {d.title.trim() || '(제목 없음)'}
                  </span>
                  {isSavable(d) && <span className="text-emerald-400">●</span>}
                  {drafts.length > 1 && (
                    <button
                      className="text-slate-500 hover:text-red-300"
                      title="이 곡 제외"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDrafts((prev) => prev.filter((_, j) => j !== i))
                        setActive((a) => Math.max(0, Math.min(a, drafts.length - 2)))
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                className="px-2 py-1 text-xs text-slate-400 hover:text-white"
                title="곡 탭 추가 (자동 분리가 빠뜨린 곡을 직접 입력)"
                onClick={() => {
                  setDrafts((prev) => [...prev, newDraft()])
                  setActive(drafts.length)
                }}
              >
                ＋ 곡
              </button>
            </div>
            <SyncInput
              key={`t-${draft.key}`}
              value={draft.title}
              onValue={(v) => updateDraft({ title: v })}
              placeholder="곡 제목 *"
              className="bg-black/40 border border-line rounded px-3 py-1.5 text-sm text-white outline-none focus:border-accent"
            />
            <select
              value={draft.category}
              onChange={(e) => updateDraft({ category: e.target.value })}
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
            <SyncTextarea
              key={`l-${draft.key}`}
              value={draft.lyrics}
              onValue={(v) => updateDraft({ lyrics: v })}
              placeholder="추출된 가사가 여기에 표시됩니다. 오탈자·절 구분을 직접 수정한 뒤 저장하세요."
              className="flex-1 resize-none rounded-md bg-black/40 border border-line p-3 text-sm text-white outline-none focus:border-accent leading-relaxed"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 h-14 border-t border-line bg-panel2">
          <span className="text-[11px] text-slate-500">
            ※ 자동 추출은 오류가 있을 수 있으니 반드시 검수 후 저장하세요. 저장하면 원본 악보가 곡에 함께 보관됩니다.
          </span>
          <div className="flex gap-2">
            <button
              onClick={close}
              className="px-4 py-2 rounded bg-panel border border-line text-sm text-slate-200 hover:border-slate-500"
            >
              취소
            </button>
            {drafts.length > 1 && (
              <button
                onClick={() => void saveDrafts(drafts.filter(isSavable))}
                disabled={savableCount === 0 || busy}
                className="px-4 py-2 rounded bg-panel border border-accent/60 text-sm text-white hover:bg-accent/20 disabled:opacity-40"
              >
                모두 저장 ({savableCount}곡)
              </button>
            )}
            <button
              onClick={() => void saveDrafts([draft])}
              disabled={!canSave}
              className="px-4 py-2 rounded bg-accent/30 border border-accent text-sm text-white hover:bg-accent/40 disabled:opacity-40"
            >
              {drafts.length > 1 ? '이 곡만 저장' : '곡으로 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
