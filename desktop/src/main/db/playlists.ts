import { getDb } from './index'
import { bibleReference } from './bible'
import type { Playlist, PlaylistItem, PlaylistItemType } from '../../shared/ipc'

const DEFAULT_PLAYLISTS = ['주일1부', '주일2부', '수요예배', '금요기도회', '청년부']

export function listPlaylists(): Playlist[] {
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.name,
        (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id = p.id) AS itemCount
       FROM playlists p ORDER BY p.id ASC`
    )
    .all() as Playlist[]
  return rows
}

export function createPlaylist(name: string): number {
  const info = getDb()
    .prepare('INSERT INTO playlists (name, created_at) VALUES (?, ?)')
    .run(name, new Date().toISOString())
  return Number(info.lastInsertRowid)
}

export function renamePlaylist(id: number, name: string): void {
  getDb().prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, id)
}

export function deletePlaylist(id: number): void {
  getDb().prepare('DELETE FROM playlists WHERE id = ?').run(id)
}

/** 항목 목록 — song이면 곡 제목/카테고리를 조인해 표시용으로 채움 */
export function getPlaylistItems(playlistId: number): PlaylistItem[] {
  const rows = getDb()
    .prepare(
      `SELECT i.id, i.item_type, i.ref_id, i.order_index, i.note,
              s.title AS song_title, s.category AS song_category
       FROM playlist_items i
       LEFT JOIN songs s ON i.item_type = 'song' AND s.id = i.ref_id
       WHERE i.playlist_id = ?
       ORDER BY i.order_index ASC`
    )
    .all(playlistId) as {
    id: number
    item_type: PlaylistItemType
    ref_id: number | null
    order_index: number
    note: string | null
    song_title: string | null
    song_category: string | null
  }[]

  return rows.map((r) => {
    let title = r.note ?? ''
    let subtitle: string | undefined
    if (r.item_type === 'song') {
      title = r.song_title ?? '(삭제된 곡)'
      subtitle = r.song_category ?? undefined
    } else if (r.item_type === 'bible') {
      title = (r.ref_id != null ? bibleReference(r.ref_id) : null) ?? '(삭제된 말씀)'
      subtitle = '성경'
    } else if (r.item_type === 'blank') {
      title = '검정 화면'
    } else if (r.item_type === 'logo') {
      title = '로고 화면'
    }
    return {
      id: r.id,
      itemType: r.item_type,
      refId: r.ref_id,
      orderIndex: r.order_index,
      title,
      subtitle
    }
  })
}

export function addPlaylistItem(
  playlistId: number,
  itemType: PlaylistItemType,
  refId: number | null
): number {
  const db = getDb()
  const row = db
    .prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM playlist_items WHERE playlist_id = ?')
    .get(playlistId) as { next: number }
  const info = db
    .prepare(
      'INSERT INTO playlist_items (playlist_id, item_type, ref_id, order_index) VALUES (?, ?, ?, ?)'
    )
    .run(playlistId, itemType, refId, row.next)
  return Number(info.lastInsertRowid)
}

export function removePlaylistItem(itemId: number): void {
  getDb().prepare('DELETE FROM playlist_items WHERE id = ?').run(itemId)
}

/** 항목 순서 재배치 — 전달된 id 배열 순서대로 order_index 재작성 */
export function reorderPlaylistItems(playlistId: number, orderedIds: number[]): void {
  const db = getDb()
  const upd = db.prepare('UPDATE playlist_items SET order_index = ? WHERE id = ? AND playlist_id = ?')
  const tx = db.transaction(() => {
    orderedIds.forEach((id, i) => upd.run(i, id, playlistId))
  })
  tx()
}

/** 최초 실행 시 예배별 기본 플레이리스트 시드 (1회) */
export function seedDefaultPlaylists(): void {
  const db = getDb()
  const count = (db.prepare('SELECT COUNT(*) AS c FROM playlists').get() as { c: number }).c
  if (count > 0) return
  const ins = db.prepare('INSERT INTO playlists (name, created_at) VALUES (?, ?)')
  const now = new Date().toISOString()
  const tx = db.transaction(() => DEFAULT_PLAYLISTS.forEach((n) => ins.run(n, now)))
  tx()
}
