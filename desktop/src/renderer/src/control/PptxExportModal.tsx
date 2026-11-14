import { useEffect, useState } from 'react'
import type { PptxExportResult } from '@shared/ipc'
import { useUi } from '../store/ui'

const ipcMsg = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')

/**
 * 자막 → PPTX 내보내기 옵션.
 * 송출 화면과 같은 페이지 나누기·글꼴·색·배경으로 슬라이드를 만들어 .pptx 로 저장한다.
 */
export function PptxExportModal(): JSX.Element | null {
  const open = useUi((s) => s.pptxOpen)
  const target = useUi((s) => s.pptxTarget)
  const close = useUi((s) => s.closePptx)
  const [titleSlides, setTitleSlides] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const [includeBackground, setIncludeBackground] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PptxExportResult | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setResult(null)
      setBusy(false)
    }
  }, [open])

  if (!open || !target) return null

  const run = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const r = await window.seraphim.exportPptx({
        playlistId: target.playlistId,
        songId: target.songId,
        bibleId: target.bibleId,
        titleSlides,
        showLabels,
        includeBackground
      })
      if (r) setResult(r)
    } catch (e) {
      setError(ipcMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={close}>
      <div className="w-[440px] rounded-lg border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-12 border-b border-line bg-panel2">
          <div className="text-sm font-semibold text-slate-100">PPTX로 내보내기</div>
          <button onClick={close} className="text-slate-400 hover:text-white text-lg">
            ✕
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm">
          <div className="text-slate-300">
            <span className="text-slate-500">대상 </span>
            <span className="text-white">{target.name}</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            송출 화면과 같은 줄 수로 페이지를 나누고, 현재 송출 스타일(글꼴·크기·색·외곽선·그림자·배경·로고)을 그대로 옮깁니다. 페이지 하나가 슬라이드 한 장이 됩니다.
          </p>
          <label className="flex items-center gap-2 text-slate-200">
            <input type="checkbox" checked={titleSlides} onChange={(e) => setTitleSlides(e.target.checked)} />
            곡·말씀마다 제목 슬라이드 넣기
          </label>
          <label className="flex items-center gap-2 text-slate-200">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
            절 라벨(1절·후렴) 왼쪽 위에 작게 표시
          </label>
          <label className="flex items-center gap-2 text-slate-200">
            <input type="checkbox" checked={includeBackground} onChange={(e) => setIncludeBackground(e.target.checked)} />
            배경 이미지·어둡게 포함 (끄면 배경색만)
          </label>
          {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/40 rounded px-2 py-1.5 whitespace-pre-wrap">{error}</div>}
          {result && (
            <div className="text-xs bg-emerald-500/10 border border-emerald-500/40 rounded px-2 py-1.5 space-y-1">
              <div className="text-emerald-200">슬라이드 {result.slides}장 저장됨</div>
              <div className="text-slate-300 break-all">{result.path}</div>
              {result.warnings.length > 0 && (
                <ul className="text-amber-200 list-disc pl-4">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 h-14 border-t border-line bg-panel2">
          <button onClick={close} className="px-4 py-2 rounded bg-panel border border-line text-sm text-slate-200 hover:border-slate-500">
            {result ? '닫기' : '취소'}
          </button>
          <button
            onClick={() => void run()}
            disabled={busy}
            className="px-4 py-2 rounded bg-accent text-sm text-white hover:bg-accent/80 disabled:opacity-40"
          >
            {busy ? '만드는 중…' : result ? '다시 저장' : '저장…'}
          </button>
        </div>
      </div>
    </div>
  )
}
