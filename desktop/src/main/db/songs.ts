import { getDb } from './index'
import type { SongDetail, SongFilter, SongInput, SongListItem, Verse } from '../../shared/ipc'

interface SongRow {
  id: number
  title: string
  category: string
  favorite: number
  subtitle: string | null
  author: string | null
  copyright: string | null
  bg_media_id: number | null
  hymn_no: number | null
}

interface VerseRow {
  id: number
  label: string | null
  order_index: number
  text: string
}

export function listSongs(filter: SongFilter): SongListItem[] {
  const where: string[] = []
  const params: Record<string, unknown> = {}

  if (filter.scope === 'favorite') where.push('s.favorite = 1')
  if (filter.scope === 'category' && filter.category) {
    where.push('s.category = @category')
    params.category = filter.category
  }
  if (filter.scope === 'recent') where.push('s.last_used_at IS NOT NULL')
  if (filter.search && filter.search.trim()) {
    const q = filter.search.trim()
    // "478" / "478장" → 장 번호 검색, 그 외 → 제목·작사자·가사 본문(부분 일치)
    const m = q.match(/^(\d{1,4})\s*장?$/)
    if (m) {
      where.push('(s.hymn_no = @no OR s.title LIKE @q)')
      params.no = Number(m[1])
    } else {
      where.push(
        '(s.title LIKE @q OR s.author LIKE @q OR EXISTS (SELECT 1 FROM verses v WHERE v.song_id = s.id AND v.text LIKE @q))'
      )
    }
    params.q = `%${q}%`
  }

  let sql = `
    SELECT s.id, s.title, s.category, s.favorite, s.hymn_no,
      (SELECT COUNT(*) FROM verses v WHERE v.song_id = s.id) AS verseCount
    FROM songs s`
  if (where.length) sql += ' WHERE ' + where.join(' AND ')
  sql +=
    filter.scope === 'recent'
      ? ' ORDER BY s.last_used_at DESC LIMIT 50'
      : ' ORDER BY (s.hymn_no IS NULL), s.hymn_no ASC, s.title COLLATE NOCASE ASC'

  const rows = getDb().prepare(sql).all(params) as (SongRow & { verseCount: number })[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    favorite: !!r.favorite,
    verseCount: r.verseCount,
    hymnNo: r.hymn_no ?? null
  }))
}

export function getSong(id: number): SongDetail | null {
  const s = getDb().prepare('SELECT * FROM songs WHERE id = ?').get(id) as SongRow | undefined
  if (!s) return null
  const verses = getDb()
    .prepare('SELECT id, label, order_index, text FROM verses WHERE song_id = ? ORDER BY order_index')
    .all(id) as VerseRow[]
  return {
    id: s.id,
    title: s.title,
    category: s.category,
    favorite: !!s.favorite,
    hymnNo: s.hymn_no ?? null,
    subtitle: s.subtitle,
    author: s.author,
    copyright: s.copyright,
    bgMediaId: s.bg_media_id,
    bgUrl: null, // main의 SONG_GET 핸들러가 상대경로로부터 채움
    scores: listSongScores(id).map((mediaId) => ({ mediaId, url: '' })), // url은 SONG_GET에서 채움
    verses: verses.map(
      (v): Verse => ({ id: v.id, label: v.label, orderIndex: v.order_index, text: v.text })
    )
  }
}

/** 곡 upsert — 절은 전량 교체(순서=배열 인덱스) */
export function saveSong(input: SongInput): number {
  const db = getDb()
  const now = new Date().toISOString()
  const tx = db.transaction((): number => {
    let id = input.id
    if (id) {
      db.prepare(
        `UPDATE songs SET title=?, category=?, favorite=?, subtitle=?, author=?, copyright=?, hymn_no=?, updated_at=?
         WHERE id=?`
      ).run(
        input.title,
        input.category,
        input.favorite ? 1 : 0,
        input.subtitle ?? null,
        input.author ?? null,
        input.copyright ?? null,
        input.hymnNo ?? null,
        now,
        id
      )
      db.prepare('DELETE FROM verses WHERE song_id=?').run(id)
    } else {
      const info = db
        .prepare(
          `INSERT INTO songs (title, category, favorite, subtitle, author, copyright, hymn_no, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.title,
          input.category,
          input.favorite ? 1 : 0,
          input.subtitle ?? null,
          input.author ?? null,
          input.copyright ?? null,
          input.hymnNo ?? null,
          now,
          now
        )
      id = Number(info.lastInsertRowid)
    }
    const ins = db.prepare('INSERT INTO verses (song_id, label, order_index, text) VALUES (?, ?, ?, ?)')
    input.verses.forEach((v, i) => ins.run(id, v.label ?? null, i, v.text))
    if (input.scoreMediaIds) {
      db.prepare('DELETE FROM song_scores WHERE song_id=?').run(id)
      const insScore = db.prepare('INSERT INTO song_scores (song_id, media_id, order_index) VALUES (?, ?, ?)')
      input.scoreMediaIds.forEach((mid, i) => insScore.run(id, mid, i))
    }
    return id as number
  })
  return tx()
}

/** 곡 삭제 — 절·악보 연결은 FK로, 플레이리스트 항목은 여기서 함께 정리 */
export function deleteSong(id: number): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare("DELETE FROM playlist_items WHERE item_type = 'song' AND ref_id = ?").run(id)
    db.prepare('DELETE FROM songs WHERE id = ?').run(id)
  })()
}

export function setFavorite(id: number, favorite: boolean): void {
  getDb().prepare('UPDATE songs SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id)
}

/** 최근 사용 갱신 */
export function touchSong(id: number): void {
  getDb().prepare('UPDATE songs SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), id)
}

/** 곡에 배경 미디어 연결/해제 */
export function setSongBackground(songId: number, mediaId: number | null): void {
  getDb().prepare('UPDATE songs SET bg_media_id = ? WHERE id = ?').run(mediaId, songId)
}

/** 제목 정규화(중복 판별용): 공백·구두점 제거, 소문자 */
export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/^\s*\d{1,3}\s*장\s*/, '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

/**
 * 중복 곡 id — 없으면 null.
 *  - 장 번호가 있는 곡(찬송가)은 같은 장 번호만 중복으로 본다. 제목이 같아도 장이 다르면 다른 곡(예: 같은 제목의 찬송 여러 장).
 *  - 장 번호가 없는 곡은 정규화 제목이 같으면 중복.
 */
export function findDuplicateSong(title: string, hymnNo: number | null): number | null {
  const db = getDb()
  if (hymnNo != null) {
    const r = db.prepare('SELECT id FROM songs WHERE hymn_no = ? LIMIT 1').get(hymnNo) as { id: number } | undefined
    return r?.id ?? null
  }
  const key = normalizeTitle(title)
  if (!key) return null
  const rows = db.prepare('SELECT id, title FROM songs').all() as { id: number; title: string }[]
  const hit = rows.find((r) => normalizeTitle(r.title) === key)
  return hit?.id ?? null
}

/** 곡에 연결된 악보 미디어 id 목록(페이지 순) */
export function listSongScores(songId: number): number[] {
  const rows = getDb()
    .prepare('SELECT media_id FROM song_scores WHERE song_id = ? ORDER BY order_index')
    .all(songId) as { media_id: number }[]
  return rows.map((r) => r.media_id)
}

/** 미디어 id → 상대경로 (없으면 null) */
export function getMediaRelPath(id: number): string | null {
  const row = getDb().prepare('SELECT rel_path FROM media WHERE id = ?').get(id) as
    | { rel_path: string }
    | undefined
  return row?.rel_path ?? null
}
