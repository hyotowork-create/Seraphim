import Database from 'better-sqlite3'
import { MIGRATIONS } from './schema'

let db: Database.Database | null = null

/** DB 열기 + WAL + 외래키 + 마이그레이션 */
export function openDb(path: string): Database.Database {
  closeDb()
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('DB가 아직 열리지 않았습니다')
  return db
}

/** 동기화 폴더 안전성을 위해 WAL 체크포인트 후 닫기 */
export function closeDb(): void {
  if (!db) return
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* ignore */
  }
  db.close()
  db = null
}

function migrate(conn: Database.Database): void {
  conn.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT)`
  )
  const row = conn.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
    v: number | null
  }
  const current = row.v ?? 0
  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version)
  if (pending.length === 0) return

  const tx = conn.transaction(() => {
    for (const m of pending) {
      conn.exec(m.sql)
      conn
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(m.version, new Date().toISOString())
    }
  })
  tx()
}

export function schemaVersion(): number {
  const row = getDb().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
    v: number | null
  }
  return row.v ?? 0
}
