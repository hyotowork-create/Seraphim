import { create } from 'zustand'

interface UiStore {
  editorOpen: boolean
  /** null = 신규 곡, number = 기존 곡 편집 */
  editSongId: number | null
  openEditor: (id?: number | null) => void
  closeEditor: () => void
}

export const useUi = create<UiStore>((set) => ({
  editorOpen: false,
  editSongId: null,
  openEditor: (id = null) => set({ editorOpen: true, editSongId: id }),
  closeEditor: () => set({ editorOpen: false })
}))
