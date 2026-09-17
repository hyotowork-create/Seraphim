import AdmZip from 'adm-zip'
import { existsSync } from 'fs'
import { join } from 'path'
import { getDataDir, ensureStructure } from './datadir'
import { getDb, openDb, closeDb } from './db'
import { dbPath } from './datadir'

/**
 * 프로젝트 백업(.zip): DB + 미디어를 하나의 zip으로.
 * 동기화 폴더를 못 쓰는 오프라인 교회 PC로 USB 이동할 때 사용.
 */
export function exportZip(destPath: string): void {
  const dir = getDataDir()
  // WAL을 본 파일로 합쳐 완전한 db를 담는다
  try {
    getDb().pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* ignore */
  }
  const zip = new AdmZip()
  const db = join(dir, 'seraphim.db')
  if (existsSync(db)) zip.addLocalFile(db)
  const media = join(dir, 'media')
  if (existsSync(media)) zip.addLocalFolder(media, 'media')
  zip.writeZip(destPath)
}

/**
 * 백업 zip 복원: 현재 데이터 폴더에 덮어쓴다.
 * DB를 닫고 압축을 푼 뒤 다시 연다.
 */
export function importZip(srcPath: string): void {
  const dir = getDataDir()
  closeDb()
  const zip = new AdmZip(srcPath)
  zip.extractAllTo(dir, /* overwrite */ true)
  ensureStructure(dir)
  openDb(dbPath())
}
