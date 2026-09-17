import { create } from 'zustand'

interface UiStore {
  editorOpen: boolean
  /** null = 신규 곡, number = 기존 곡 편집 */
  editSongId: number | null
  openEditor: (id?: number | null) => void
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
}

export const useUi = create<UiStore>((set) => ({
  editorOpen: false,
  editSongId: null,
  openEditor: (id = null) => set({ editorOpen: true, editSongId: id }),
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
  closeScore: () => set({ scoreOpen: false })
}))
