import { useEffect, useState } from 'react'
import type { DisplayInfo, OutputAspect } from '@shared/ipc'
import { useLive } from '../store/live'

/** [3] 상단 — 출력 대상(디스플레이) 선택 + 송출 창 열기/닫기/전체화면 */
export function OutputBar(): JSX.Element {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [selected, setSelected] = useState<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const aspect = useLive((s) => s.state.aspect)
  const patch = useLive((s) => s.patch)

  const setAspect = (a: OutputAspect): void => {
    void patch({ aspect: a })
    void window.seraphim.setSetting('render.aspect', a)
  }

  useEffect(() => {
    void window.seraphim.listDisplays().then((d) => {
      setDisplays(d)
      const secondary = d.find((x) => !x.primary) ?? d[0]
      setSelected(secondary?.id)
    })
  }, [])

  const openOutput = async (): Promise<void> => {
    await window.seraphim.openOutput(selected)
    setOpen(true)
  }
  const closeOutput = async (): Promise<void> => {
    await window.seraphim.closeOutput()
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-2 px-3 h-10 rounded-lg border border-line bg-panel2/60 shrink-0">
      <span className="text-xs text-slate-400">출력 대상</span>
      <select
        value={selected ?? ''}
        onChange={(e) => setSelected(Number(e.target.value))}
        className="bg-black/40 border border-line rounded px-2 py-1 text-xs text-slate-200 outline-none"
      >
        {displays.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
            {d.primary ? ' · 주모니터' : ''}
          </option>
        ))}
      </select>

      {open ? (
        <button
          onClick={() => void closeOutput()}
          className="px-3 py-1 rounded bg-red-500/20 border border-red-500/60 text-xs text-red-200 hover:bg-red-500/30"
        >
          송출 닫기
        </button>
      ) : (
        <button
          onClick={() => void openOutput()}
          className="px-3 py-1 rounded bg-accent/20 border border-accent text-xs text-white hover:bg-accent/30"
        >
          송출 열기
        </button>
      )}

      <button
        onClick={() => void window.seraphim.toggleOutputFullscreen()}
        className="px-3 py-1 rounded bg-panel2 border border-line text-xs text-slate-200 hover:border-slate-500"
      >
        전체화면 전환
      </button>

      <span className="ml-auto text-xs text-slate-400">비율</span>
      <select
        value={aspect}
        onChange={(e) => setAspect(e.target.value as OutputAspect)}
        className="bg-black/40 border border-line rounded px-2 py-1 text-xs text-slate-200 outline-none"
        title="출력 비율 (프로젝터에 맞춤)"
      >
        <option value="16:9">16:9</option>
        <option value="4:3">4:3</option>
        <option value="fill">화면 채우기</option>
      </select>
    </div>
  )
}
