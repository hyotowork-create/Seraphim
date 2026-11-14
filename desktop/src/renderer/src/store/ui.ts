import { create } from 'zustand'

interface UiStore {
  editorOpen: boolean
  /** null = 신규 곡, number = 기존 곡 편집 */
  editSongId: number | null
  /** 새 곡 편집기를 열 때 미리 채울 제목 (순서지에서 못 찾은 곡 등) */
  editorPrefillTitle: string | null
  openEditor: (id?: number | null, prefillTitle?: string | null) => void
  closeEditor: () => void
  /** 플레이리스트에 곡 추가 피커 */
  pickerOpen: boolean
  openPicker: () => void
  closePicker: () => void
  /** 성경 편집기 (null = 신규) */
  bibleEditorOpen: boolean
  bibleEditId: number | null
  openBibleEditor: (id?: number | null) => void
  closeBibleEditor: () => void
  /** 악보에서 가져오기 */
  scoreOpen: boolean
  openScore: () => void
  closeScore: () => void
  /** 온라인 주보 발행 */
  bulletinOpen: boolean
  openBulletin: () => void
  closeBulletin: () => void
  /** 순서지 → 플레이리스트 자동 구성 */
  orderOpen: boolean
  openOrder: () => void
  closeOrder: () => void
  /** 자막 → PPTX 내보내기 */
  pptxOpen: boolean
  pptxTarget: PptxTarget | null
  openPptx: (target: PptxTarget) => void
  closePptx: () => void
  /** YouTube 라이브 방송 */
  broadcastOpen: boolean
  openBroadcast: () => void
  closeBroadcast: () => void
  /** 카메라 N 설정 창 (null = 닫힘) */
  cameraSetup: number | null
  openCameraSetup: (index: number) => void
  closeCameraSetup: () => void
}

export interface PptxTarget {
  name: string
  playlistId?: number
  songId?: number
  bibleId?: number
}

export const useUi = create<UiStore>((set) => ({
  editorOpen: false,
  editSongId: null,
  editorPrefillTitle: null,
  openEditor: (id = null, prefillTitle = null) => set({ editorOpen: true, editSongId: id, editorPrefillTitle: prefillTitle }),
  closeEditor: () => set({ editorOpen: false }),
  pickerOpen: false,
  openPicker: () => set({ pickerOpen: true }),
  closePicker: () => set({ pickerOpen: false }),
  bibleEditorOpen: false,
  bibleEditId: null,
  openBibleEditor: (id = null) => set({ bibleEditorOpen: true, bibleEditId: id }),
  closeBibleEditor: () => set({ bibleEditorOpen: false }),
  scoreOpen: false,
  openScore: () => set({ scoreOpen: true }),
  closeScore: () => set({ scoreOpen: false }),
  bulletinOpen: false,
  openBulletin: () => set({ bulletinOpen: true }),
  closeBulletin: () => set({ bulletinOpen: false }),
  orderOpen: false,
  openOrder: () => set({ orderOpen: true }),
  closeOrder: () => set({ orderOpen: false }),
  pptxOpen: false,
  pptxTarget: null,
  openPptx: (target) => set({ pptxOpen: true, pptxTarget: target }),
  closePptx: () => set({ pptxOpen: false }),
  broadcastOpen: false,
  openBroadcast: () => set({ broadcastOpen: true }),
  closeBroadcast: () => set({ broadcastOpen: false }),
  cameraSetup: null,
  openCameraSetup: (index) => set({ cameraSetup: index }),
  closeCameraSetup: () => set({ cameraSetup: null })
}))
