import { useEffect, useState } from 'react'
import { useLive } from '../store/live'
import { useDeck } from '../store/deck'
import { PreviewPanel } from './PreviewPanel'
import { QuickPanel } from './QuickPanel'
import { EditorPanel } from './EditorPanel'
import { MediaPanel } from './MediaPanel'
import { AudioPanel } from './AudioPanel'
import { TransitionPanel } from './TransitionPanel'
import { OutputBar } from './OutputBar'
import { SettingsModal } from './SettingsModal'
import { LibraryPanel } from './LibraryPanel'
import { SlideListPanel } from './SlideListPanel'
import { SongEditorModal } from './SongEditorModal'
import { SongPickerModal } from './SongPickerModal'
import { BibleEditorModal } from './BibleEditorModal'
import { ScoreImportModal } from './ScoreImportModal'
import { BulletinModal } from './BulletinModal'
import { useUi } from '../store/ui'
import { useShortcuts } from './useShortcuts'

export function ControlApp(): JSX.Element {
  const init = useLive((s) => s.init)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openBulletin = useUi((s) => s.openBulletin)
  useShortcuts()

  useEffect(() => {
    let unsub = (): void => {}
    void init().then((fn) => (unsub = fn))
    void useDeck.getState().initSettings()
    return () => unsub()
  }, [init])

  return (
    <div className="flex flex-col h-screen bg-panel text-slate-100 select-none">
      {/* 상단 바 */}
      <header className="flex items-center gap-3 px-4 h-11 border-b border-line bg-panel2 shrink-0">
        <span className="font-bold tracking-wide text-accent">SERAPHIM</span>
        <span className="text-xs text-slate-400">예배 송출 · 자막 · 주보</span>
        <button
          onClick={openBulletin}
          className="ml-auto px-3 py-1 rounded border border-line bg-panel text-xs text-slate-200 hover:border-slate-500"
        >
          📰 주보 발행
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="px-3 py-1 rounded border border-line bg-panel text-xs text-slate-200 hover:border-slate-500"
        >
          ⚙️ 설정
        </button>
        <span className="text-[11px] text-slate-500">v0.1</span>
      </header>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <SongEditorModal />
      <SongPickerModal />
      <BibleEditorModal />
      <ScoreImportModal />
      <BulletinModal />

      {/* 본문: 좌 라이브러리 / 중 슬라이드 / 프리뷰+퀵 */}
      <div className="flex-1 grid grid-cols-[240px_260px_1fr] gap-2 p-2 min-h-0">
        <LibraryPanel />
        <SlideListPanel />

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
        <MediaPanel />
        <AudioPanel />
        <TransitionPanel />
      </div>
    </div>
  )
}
