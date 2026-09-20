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
    where.push('(s.title LIKE @q OR s.author LIKE @q)')
    params.q = `%${filter.search.trim()}%`
  }

  let sql = `
    SELECT s.id, s.title, s.category, s.favorite,
      (SELECT COUNT(*) FROM verses v WHERE v.song_id = s.id) AS verseCount
    FROM songs s`
  if (where.length) sql += ' WHERE ' + where.join(' AND ')
  sql +=
    filter.scope === 'recent'
      ? ' ORDER BY s.last_used_at DESC LIMIT 50'
      : ' ORDER BY s.title COLLATE NOCASE ASC'

  const rows = getDb().prepare(sql).all(params) as (SongRow & { verseCount: number })[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    favorite: !!r.favorite,
    verseCount: r.verseCount
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
    subtitle: s.subtitle,
    author: s.author,
    copyright: s.copyright,
    bgMediaId: s.bg_media_id,
    bgUrl: null, // main의 SONG_GET 핸들러가 상대경로로부터 채움
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
        `UPDATE songs SET title=?, category=?, favorite=?, subtitle=?, author=?, copyright=?, updated_at=?
         WHERE id=?`
      ).run(
        input.title,
        input.category,
        input.favorite ? 1 : 0,
        input.subtitle ?? null,
        input.author ?? null,
        input.copyright ?? null,
        now,
        id
      )
      db.prepare('DELETE FROM verses WHERE song_id=?').run(id)
    } else {
      const info = db
        .prepare(
          `INSERT INTO songs (title, category, favorite, subtitle, author, copyright, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.title,
          input.category,
          input.favorite ? 1 : 0,
          input.subtitle ?? null,
          input.author ?? null,
          input.copyright ?? null,
          now,
          now
        )
      id = Number(info.lastInsertRowid)
    }
    const ins = db.prepare('INSERT INTO verses (song_id, label, order_index, text) VALUES (?, ?, ?, ?)')
    input.verses.forEach((v, i) => ins.run(id, v.label ?? null, i, v.text))
    return id as number
  })
  return tx()
}

export function deleteSong(id: number): void {
  getDb().prepare('DELETE FROM songs WHERE id = ?').run(id)
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

/** 미디어 id → 상대경로 (없으면 null) */
export function getMediaRelPath(id: number): string | null {
  const row = getDb().prepare('SELECT rel_path FROM media WHERE id = ?').get(id) as
    | { rel_path: string }
    | undefined
  return row?.rel_path ?? null
}
