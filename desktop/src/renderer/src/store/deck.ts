import { create } from 'zustand'
import type { SongDetail, SongInput } from '@shared/ipc'
import { paginate } from '@shared/lyrics'

/** 송출 단위 = 페이지(4줄 기준). 긴 절은 여러 페이지로 나뉜다. */
export interface Page {
  verseIndex: number
  verseLabel: string | null
  pageInVerse: number
  totalPagesInVerse: number
  text: string
}

function buildPages(song: SongDetail): Page[] {
  const pages: Page[] = []
  song.verses.forEach((v, vi) => {
    const chunks = paginate(v.text)
    chunks.forEach((text, pi) =>
      pages.push({
        verseIndex: vi,
        verseLabel: v.label,
        pageInVerse: pi,
        totalPagesInVerse: chunks.length,
        text
      })
    )
  })
  return pages
}

interface DeckStore {
  song: SongDetail | null
  pages: Page[]
  activeIndex: number
  load: (id: number) => Promise<void>
  reloadCurrent: () => Promise<void>
  clear: () => void
  goTo: (pageIndex: number) => Promise<void>
  goToVerse: (verseIndex: number) => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  reorderVerses: (from: number, to: number) => Promise<void>
  setSongBackground: (mediaId: number | null) => Promise<void>
}

export const useDeck = create<DeckStore>((set, get) => ({
  song: null,
  pages: [],
  activeIndex: -1,

  load: async (id) => {
    const song = await window.seraphim.getSong(id)
    set({ song, pages: song ? buildPages(song) : [], activeIndex: -1 })
    if (!song) return
    void window.seraphim.touchSong(id)
    // 곡에 저장된 배경이 있으면 자동 적용, 없으면 현재 배경 유지
    if (song.bgUrl) {
      await window.seraphim.setLive({
        background: { kind: 'image', imageUrl: song.bgUrl, mediaId: song.bgMediaId ?? undefined }
      })
    }
  },

  reloadCurrent: async () => {
    const id = get().song?.id
    if (id == null) return
    const song = await window.seraphim.getSong(id)
    set((s) => ({
      song,
      pages: song ? buildPages(song) : [],
      activeIndex: song ? Math.min(s.activeIndex, buildPages(song).length - 1) : -1
    }))
  },

  clear: () => set({ song: null, pages: [], activeIndex: -1 }),

  goTo: async (pageIndex) => {
    const { pages } = get()
    if (pageIndex < 0 || pageIndex >= pages.length) return
    set({ activeIndex: pageIndex })
    await window.seraphim.setLive({ text: pages[pageIndex].text })
  },

  goToVerse: async (verseIndex) => {
    const { pages, goTo } = get()
    const idx = pages.findIndex((p) => p.verseIndex === verseIndex)
    if (idx >= 0) await goTo(idx)
  },

  next: async () => {
    const { pages, activeIndex, goTo } = get()
    if (pages.length === 0) return
    await goTo(activeIndex < 0 ? 0 : Math.min(activeIndex + 1, pages.length - 1))
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
  },

  setSongBackground: async (mediaId) => {
    const id = get().song?.id
    if (id == null) return
    await window.seraphim.setSongBackground(id, mediaId)
    await get().reloadCurrent()
  }
}))
