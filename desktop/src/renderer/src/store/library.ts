import { create } from 'zustand'
import type { SongFilter, SongListItem } from '@shared/ipc'

interface LibraryStore {
  filter: SongFilter
  songs: SongListItem[]
  loading: boolean
  reload: () => Promise<void>
  setFilter: (f: SongFilter) => Promise<void>
  setSearch: (q: string) => Promise<void>
  toggleFavorite: (id: number, fav: boolean) => Promise<void>
}

export const useLibrary = create<LibraryStore>((set, get) => ({
  filter: { scope: 'all' },
  songs: [],
  loading: false,
  reload: async () => {
    set({ loading: true })
    try {
      const songs = await window.seraphim.listSongs(get().filter)
      set({ songs })
    } finally {
      set({ loading: false })
    }
  },
  setFilter: async (f) => {
    set({ filter: { ...f, search: get().filter.search } })
    await get().reload()
  },
  setSearch: async (q) => {
    set({ filter: { ...get().filter, search: q } })
    await get().reload()
  },
  toggleFavorite: async (id, fav) => {
    await window.seraphim.setSongFavorite(id, fav)
    await get().reload()
  }
}))
