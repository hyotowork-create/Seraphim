import { create } from 'zustand'
import type { SongInput } from '@shared/ipc'
import { paginate } from '@shared/lyrics'

/** 송출 단위 = 페이지(4줄 기준). 긴 절은 여러 페이지로 나뉜다. */
export interface Page {
  verseIndex: number
  verseLabel: string | null
  pageInVerse: number
  totalPagesInVerse: number
  text: string
}

export interface DeckVerse {
  id: number
  label: string | null
  text: string
}

/** 현재 로드된 소스 (곡 또는 성경) */
export interface Loaded {
  kind: 'song' | 'bible'
  id: number
  title: string
  bgMediaId: number | null
  bgUrl: string | null
  verses: DeckVerse[]
}

function buildPages(verses: DeckVerse[]): Page[] {
  const pages: Page[] = []
  verses.forEach((v, vi) => {
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
  loaded: Loaded | null
  pages: Page[]
  activeIndex: number
  load: (id: number) => Promise<void> // 곡 로드 (기존 호환)
  loadBible: (id: number) => Promise<void>
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
  loaded: null,
  pages: [],
  activeIndex: -1,

  load: async (id) => {
    const s = await window.seraphim.getSong(id)
    if (!s) return
    const loaded: Loaded = {
      kind: 'song',
      id: s.id,
      title: s.title,
      bgMediaId: s.bgMediaId,
      bgUrl: s.bgUrl,
      verses: s.verses.map((v) => ({ id: v.id, label: v.label, text: v.text }))
    }
    set({ loaded, pages: buildPages(loaded.verses), activeIndex: -1 })
    void window.seraphim.touchSong(id)
    if (s.bgUrl) {
      await window.seraphim.setLive({
        background: { kind: 'image', imageUrl: s.bgUrl, mediaId: s.bgMediaId ?? undefined }
      })
    }
  },

  loadBible: async (id) => {
    const b = await window.seraphim.getBible(id)
    if (!b) return
    const loaded: Loaded = {
      kind: 'bible',
      id: b.id,
      title: b.reference,
      bgMediaId: null,
      bgUrl: null,
      verses: b.verses.map((v, i) => ({ id: i, label: v.label, text: v.text }))
    }
    set({ loaded, pages: buildPages(loaded.verses), activeIndex: -1 })
  },

  reloadCurrent: async () => {
    const cur = get().loaded
    if (!cur) return
    if (cur.kind === 'song') await get().load(cur.id)
    else await get().loadBible(cur.id)
  },

  clear: () => set({ loaded: null, pages: [], activeIndex: -1 }),

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
    const cur = get().loaded
    if (!cur || cur.kind !== 'song' || from === to) return
    const s = await window.seraphim.getSong(cur.id)
    if (!s) return
    const verses = [...s.verses]
    const [moved] = verses.splice(from, 1)
    verses.splice(to, 0, moved)
    const input: SongInput = {
      id: s.id,
      title: s.title,
      category: s.category,
      favorite: s.favorite,
      subtitle: s.subtitle,
      author: s.author,
      copyright: s.copyright,
      verses: verses.map((v) => ({ label: v.label, text: v.text }))
    }
    await window.seraphim.saveSong(input)
    await get().reloadCurrent()
  },

  setSongBackground: async (mediaId) => {
    const cur = get().loaded
    if (!cur || cur.kind !== 'song') return
    await window.seraphim.setSongBackground(cur.id, mediaId)
    await get().reloadCurrent()
  }
}))
