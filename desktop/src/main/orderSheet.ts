import { getDb } from './db'
import { lookupPassage } from './db/bibleText'
import { saveBible } from './db/bible'
import { createPlaylist, addPlaylistItem } from './db/playlists'
import { normalizeSongQuery, parseOrderSheet } from '../shared/orderSheet'
import type { OrderApplyItem, OrderApplyResult, OrderCandidate, OrderResolvedLine } from '../shared/ipc'

// 순서지 → (1) 해석·미리보기(쓰기 없음) → (2) 확정: 말씀 저장 + 플레이리스트 생성

interface SongRow {
  id: number
  title: string
  hymn_no: number | null
  category: string
}

function allSongs(): SongRow[] {
  return getDb().prepare('SELECT id, title, hymn_no, category FROM songs').all() as SongRow[]
}

const toCand = (r: SongRow): OrderCandidate => ({ id: r.id, title: r.title, hymnNo: r.hymn_no, category: r.category })

/** 제목으로 곡 찾기: 정규화 일치 → 앞부분 일치 → 포함 → (단어 단위) 포함 */
function findSongs(query: string, rows: SongRow[]): OrderCandidate[] {
  const q = normalizeSongQuery(query)
  if (!q) return []
  const norm = rows.map((r) => ({ r, n: normalizeSongQuery(r.title) }))
  const exact = norm.filter((x) => x.n === q)
  if (exact.length) return exact.map((x) => toCand(x.r))
  // 앞부분 일치 — 제목이 아주 짧은 곡("나")이 긴 질의("나의 부르심")를 잡지 않도록 4글자 이상일 때만 역방향 허용
  const starts = norm.filter((x) => x.n.startsWith(q) || (x.n.length >= 4 && q.startsWith(x.n)))
  if (starts.length) return starts.map((x) => toCand(x.r)).slice(0, 8)
  const contains = norm.filter((x) => x.n.includes(q) || (q.length >= 4 && x.n.length >= 4 && q.includes(x.n)))
  if (contains.length) return contains.map((x) => toCand(x.r)).slice(0, 8)
  // 단어 단위: 질의의 단어(2글자 이상)가 모두 들어 있는 제목
  const words = query.split(/\s+/).map(normalizeSongQuery).filter((w) => w.length >= 2)
  if (words.length >= 2) {
    const hit = norm.filter((x) => words.every((w) => x.n.includes(w)))
    if (hit.length) return hit.map((x) => toCand(x.r)).slice(0, 8)
  }
  // 가사 첫 줄로 찾기: "나 가진 재물 없으나"처럼 제목("나")과 첫 가사가 다른 곡
  return findByFirstLine(q, rows)
}

/** 절의 첫 줄(라벨 제외)이 질의로 시작하는 곡 */
function findByFirstLine(q: string, rows: SongRow[]): OrderCandidate[] {
  if (q.length < 4) return []
  const byId = new Map(rows.map((r) => [r.id, r]))
  const verses = getDb()
    .prepare('SELECT song_id, text FROM verses WHERE order_index = 0')
    .all() as { song_id: number; text: string }[]
  const seen = new Set<number>()
  const out: OrderCandidate[] = []
  for (const v of verses) {
    const first = normalizeSongQuery(v.text.split('\n')[0] ?? '')
    if (!first || seen.has(v.song_id)) continue
    if (first.startsWith(q) || (q.length >= 6 && q.startsWith(first) && first.length >= 6)) {
      const r = byId.get(v.song_id)
      if (r) {
        seen.add(v.song_id)
        out.push(toCand(r))
      }
    }
    if (out.length >= 8) break
  }
  return out
}

export function resolveOrder(text: string, translation: string): OrderResolvedLine[] {
  const rows = allSongs()
  return parseOrderSheet(text).map((line, index): OrderResolvedLine => {
    const base: OrderResolvedLine = { index, raw: line.raw, kind: line.kind, note: line.note }
    if (line.kind === 'blank') return base
    if (line.kind === 'bible' && line.ref) {
      try {
        const r = lookupPassage(line.refText ?? line.query, translation)
        return {
          ...base,
          bible: {
            reference: r.reference,
            book: r.book,
            chapter: r.chapter,
            verseRange: r.verseRange,
            translation: r.translation,
            translationName: r.translationName,
            verseCount: r.verses.length,
            text: r.text
          }
        }
      } catch (e) {
        // 성경처럼 보였지만 본문이 없으면 곡 제목으로도 한 번 찾아본다
        const cands = findSongs(line.raw, rows)
        if (cands.length === 1) return { ...base, kind: 'song', song: cands[0] }
        return { ...base, error: e instanceof Error ? e.message : String(e) }
      }
    }
    if (line.kind === 'hymn' && line.hymnNo != null) {
      const byNo = rows.filter((r) => r.hymn_no === line.hymnNo)
      if (byNo.length === 1) return { ...base, song: toCand(byNo[0]) }
      if (byNo.length > 1) return { ...base, candidates: byNo.map(toCand) }
      // 장 번호로 못 찾으면 제목으로
      if (line.query) {
        const cands = findSongs(line.query, rows)
        if (cands.length === 1) return { ...base, song: cands[0] }
        if (cands.length > 1) return { ...base, candidates: cands }
      }
      return { ...base, error: `${line.hymnNo}장 찬송가가 라이브러리에 없습니다. 곡 가져오기로 새찬송가를 넣어 주세요.` }
    }
    // song
    const cands = findSongs(line.query, rows)
    if (cands.length === 1) return { ...base, song: cands[0] }
    if (cands.length > 1) return { ...base, candidates: cands }
    return { ...base, error: `"${line.query}" 곡을 찾지 못했습니다. 제목을 확인하거나 곡을 먼저 추가하세요.` }
  })
}

/** 확정: 말씀은 저장하고, 새 플레이리스트에 순서대로 추가 */
export function applyOrder(name: string, items: OrderApplyItem[]): OrderApplyResult {
  const db = getDb()
  const tx = db.transaction((): OrderApplyResult => {
    const playlistId = createPlaylist(name.trim() || `${new Date().toISOString().slice(0, 10)} 예배`)
    let n = 0
    for (const it of items) {
      if (it.kind === 'song' && it.songId != null) {
        addPlaylistItem(playlistId, 'song', it.songId, it.note)
        n++
      } else if (it.kind === 'bible' && it.bible) {
        const id = saveBible({
          book: it.bible.book,
          chapter: it.bible.chapter,
          verseRange: it.bible.verseRange,
          translation: it.bible.translation,
          text: it.bible.text
        })
        addPlaylistItem(playlistId, 'bible', id, it.note)
        n++
      }
    }
    return { playlistId, itemCount: n }
  })
  return tx()
}
