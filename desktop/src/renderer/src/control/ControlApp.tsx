import { useEffect } from 'react'
import { useLive } from '../store/live'
import { PreviewPanel } from './PreviewPanel'
import { QuickPanel } from './QuickPanel'
import { EditorPanel } from './EditorPanel'
import { OutputBar } from './OutputBar'
import { useShortcuts } from './useShortcuts'

function Placeholder({ title, note }: { title: string; note: string }): JSX.Element {
  return (
    <div className="flex flex-col h-full border border-line rounded-lg bg-panel2/40 p-3">
      <div className="text-xs font-semibold text-slate-300 mb-2">{title}</div>
      <div className="flex-1 flex items-center justify-center text-[11px] text-slate-500 text-center px-2">
        {note}
      </div>
    </div>
  )
}

export function ControlApp(): JSX.Element {
  const init = useLive((s) => s.init)
  useShortcuts()

  useEffect(() => {
    let unsub = (): void => {}
    void init().then((fn) => (unsub = fn))
    return () => unsub()
  }, [init])

  return (
    <div className="flex flex-col h-screen bg-panel text-slate-100 select-none">
      {/* 상단 바 */}
      <header className="flex items-center gap-3 px-4 h-11 border-b border-line bg-panel2 shrink-0">
        <span className="font-bold tracking-wide text-accent">SERAPHIM</span>
        <span className="text-xs text-slate-400">예배 송출 · 자막 · 주보</span>
        <span className="ml-auto text-[11px] text-slate-500">v0.1 · MVP M0</span>
      </header>

      {/* 본문: 좌 라이브러리 / 중 슬라이드 / 프리뷰+퀵 */}
      <div className="flex-1 grid grid-cols-[220px_240px_1fr] gap-2 p-2 min-h-0">
        {/* [1] 라이브러리 트리 + 플레이리스트 */}
        <Placeholder
          title="[1] 라이브러리"
          note="전체·즐겨찾기·찬양·성경말씀·미디어·플레이리스트 (M2)"
        />
        {/* [2] 슬라이드 목록 */}
        <Placeholder title="[2] 슬라이드 목록" note="선택 곡/말씀의 절별 썸네일 (M2/M3)" />

        {/* 중앙: 출력바 + [3] 프리뷰 + [4] 빠른 기능 */}
        <div className="flex flex-col gap-2 min-h-0">
          <OutputBar />
          <div className="flex-1 grid grid-cols-[1fr_200px] gap-2 min-h-0">
            <PreviewPanel />
            <QuickPanel />
          </div>
        </div>
      </div>

      {/* 하단: [5] 에디터 / [6] 미디어 / [7] 오디오 / [8] 전환 */}
      <div className="grid grid-cols-[1fr_260px_220px_200px] gap-2 p-2 pt-0 h-[240px] shrink-0">
        <EditorPanel />
        <Placeholder title="[6] 미디어" note="배경이미지·영상·오버레이·로고 (M5)" />
        <Placeholder title="[7] 오디오" note="MP3 재생·볼륨 (M5)" />
        <Placeholder title="[8] 전환 효과" note="Fade·지속시간·자동전환 (M5)" />
      </div>
    </div>
  )
}
