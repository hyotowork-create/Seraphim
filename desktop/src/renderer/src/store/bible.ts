import { create } from 'zustand'
import type { BibleListItem } from '@shared/ipc'

interface BibleStore {
  list: BibleListItem[]
  search: string
  reload: () => Promise<void>
  setSearch: (q: string) => Promise<void>
}

export const useBible = create<BibleStore>((set, get) => ({
  list: [],
  search: '',
  reload: async () => set({ list: await window.seraphim.listBible(get().search) }),
  setSearch: async (q) => {
    set({ search: q })
    await get().reload()
  }
}))
