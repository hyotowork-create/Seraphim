import { create } from 'zustand'
import type { Playlist, PlaylistItem } from '@shared/ipc'

interface PlaylistStore {
  playlists: Playlist[]
  activeId: number | null
  items: PlaylistItem[]
  viewMode: 'browse' | 'playlist'
  loadPlaylists: () => Promise<void>
  open: (id: number) => Promise<void>
  closeView: () => void
  refreshItems: () => Promise<void>
  create: (name: string) => Promise<void>
  rename: (id: number, name: string) => Promise<void>
  remove: (id: number) => Promise<void>
  addSong: (songId: number) => Promise<void>
  removeItem: (itemId: number) => Promise<void>
  reorder: (from: number, to: number) => Promise<void>
}

export const usePlaylist = create<PlaylistStore>((set, get) => ({
  playlists: [],
  activeId: null,
  items: [],
  viewMode: 'browse',

  loadPlaylists: async () => set({ playlists: await window.seraphim.listPlaylists() }),

  open: async (id) => {
    const items = await window.seraphim.playlistItems(id)
    set({ activeId: id, items, viewMode: 'playlist' })
  },

  closeView: () => set({ viewMode: 'browse' }),

  refreshItems: async () => {
    const id = get().activeId
    if (id == null) return
    set({ items: await window.seraphim.playlistItems(id) })
    await get().loadPlaylists()
  },

  create: async (name) => {
    const id = await window.seraphim.createPlaylist(name)
    await get().loadPlaylists()
    await get().open(id)
  },

  rename: async (id, name) => {
    await window.seraphim.renamePlaylist(id, name)
    await get().loadPlaylists()
  },

  remove: async (id) => {
    await window.seraphim.deletePlaylist(id)
    if (get().activeId === id) set({ activeId: null, items: [], viewMode: 'browse' })
    await get().loadPlaylists()
  },

  addSong: async (songId) => {
    const id = get().activeId
    if (id == null) return
    await window.seraphim.addPlaylistItem(id, 'song', songId)
    await get().refreshItems()
  },

  removeItem: async (itemId) => {
    await window.seraphim.removePlaylistItem(itemId)
    await get().refreshItems()
  },

  reorder: async (from, to) => {
    const { activeId, items } = get()
    if (activeId == null || from === to) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    set({ items: next })
    await window.seraphim.reorderPlaylistItems(
      activeId,
      next.map((i) => i.id)
    )
  }
}))
