import { getDb, schemaVersion } from './index'
import type { DbStats, MediaRow, MediaType } from '../../shared/ipc'

// ── settings (key/value) ──────────────────────────────

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value)
}

// ── media (상대경로 저장) ──────────────────────────────

export function insertMedia(type: MediaType, relPath: string, name: string): MediaRow {
  const info = getDb()
    .prepare('INSERT INTO media (type, rel_path, name, created_at) VALUES (?, ?, ?, ?)')
    .run(type, relPath, name, new Date().toISOString())
  return { id: Number(info.lastInsertRowid), type, relPath, name }
}

export function listMedia(type?: MediaType): MediaRow[] {
  const rows = (
    type
      ? getDb()
          .prepare('SELECT id, type, rel_path, name FROM media WHERE type = ? ORDER BY id DESC')
          .all(type)
      : getDb().prepare('SELECT id, type, rel_path, name FROM media ORDER BY id DESC').all()
  ) as { id: number; type: MediaType; rel_path: string; name: string }[]
  return rows.map((r) => ({ id: r.id, type: r.type, relPath: r.rel_path, name: r.name }))
}

// ── stats (설정 화면 표시용) ───────────────────────────

function count(table: string): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }
  return row.c
}

export function dbStats(): DbStats {
  return {
    schemaVersion: schemaVersion(),
    songs: count('songs'),
    verses: count('verses'),
    playlists: count('playlists'),
    bibleSlides: count('bible_slides'),
    media: count('media')
  }
}
