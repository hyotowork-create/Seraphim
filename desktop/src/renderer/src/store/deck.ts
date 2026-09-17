import { create } from 'zustand'
import type { SongDetail, SongInput } from '@shared/ipc'

interface DeckStore {
  song: SongDetail | null
  activeIndex: number
  load: (id: number) => Promise<void>
  reloadCurrent: () => Promise<void>
  clear: () => void
  goTo: (index: number) => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  reorderVerses: (from: number, to: number) => Promise<void>
}

export const useDeck = create<DeckStore>((set, get) => ({
  song: null,
  activeIndex: -1,

  load: async (id) => {
    const song = await window.seraphim.getSong(id)
    set({ song, activeIndex: -1 })
    if (song) void window.seraphim.touchSong(id)
  },

  reloadCurrent: async () => {
    const id = get().song?.id
    if (id == null) return
    const song = await window.seraphim.getSong(id)
    set((s) => ({ song, activeIndex: Math.min(s.activeIndex, (song?.verses.length ?? 0) - 1) }))
  },

  clear: () => set({ song: null, activeIndex: -1 }),

  goTo: async (index) => {
    const { song } = get()
    if (!song || index < 0 || index >= song.verses.length) return
    set({ activeIndex: index })
    await window.seraphim.setLive({ text: song.verses[index].text })
  },

  next: async () => {
    const { song, activeIndex, goTo } = get()
    if (!song) return
    await goTo(activeIndex < 0 ? 0 : Math.min(activeIndex + 1, song.verses.length - 1))
  },

  prev: async () => {
    const { activeIndex, goTo } = get()
    await goTo(Math.max(activeIndex - 1, 0))
  },

  reorderVerses: async (from, to) => {
    const { song } = get()
    if (!song || from === to) return
    const verses = [...song.verses]
    const [moved] = verses.splice(from, 1)
    verses.splice(to, 0, moved)
    const input: SongInput = {
      id: song.id,
      title: song.title,
      category: song.category,
      favorite: song.favorite,
      subtitle: song.subtitle,
      author: song.author,
      copyright: song.copyright,
      verses: verses.map((v) => ({ label: v.label, text: v.text }))
    }
    await window.seraphim.saveSong(input)
    await get().reloadCurrent()
  }
}))
