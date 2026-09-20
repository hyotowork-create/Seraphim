import { getDb } from './index'
import type { BulletinData } from '../../shared/bulletin'
import type { BulletinListItem } from '../../shared/ipc'

interface Row {
  id: number
  service_date: string
  church_name: string | null
  service_type: string | null
  data_json: string
  playlist_id: number | null
}

export function listBulletins(): BulletinListItem[] {
  const rows = getDb()
    .prepare(
      'SELECT id, service_date, church_name, service_type FROM bulletins ORDER BY service_date DESC, id DESC'
    )
    .all() as Row[]
  return rows.map((r) => ({
    id: r.id,
    serviceDate: r.service_date,
    churchName: r.church_name,
    serviceType: r.service_type
  }))
}

export function getBulletin(id: number): (BulletinData & { id: number }) | null {
  const r = getDb().prepare('SELECT * FROM bulletins WHERE id = ?').get(id) as Row | undefined
  if (!r) return null
  return { id: r.id, ...(JSON.parse(r.data_json) as BulletinData) }
}

export function saveBulletin(data: BulletinData, id?: number): number {
  const db = getDb()
  const json = JSON.stringify(data)
  if (id) {
    db.prepare(
      'UPDATE bulletins SET service_date=?, church_name=?, service_type=?, data_json=? WHERE id=?'
    ).run(data.date, data.churchName, data.serviceType, json, id)
    return id
  }
  const info = db
    .prepare(
      `INSERT INTO bulletins (service_date, church_name, service_type, data_json, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(data.date, data.churchName, data.serviceType, json, new Date().toISOString())
  return Number(info.lastInsertRowid)
}

export function deleteBulletin(id: number): void {
  getDb().prepare('DELETE FROM bulletins WHERE id = ?').run(id)
}
