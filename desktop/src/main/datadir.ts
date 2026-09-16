import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { DataDirInfo } from '../shared/ipc'

/**
 * 데이터 폴더 관리 (멀티 PC 이동성의 핵심).
 * - 데이터 폴더 경로 자체는 DB에 넣을 수 없으므로(닭-달걀) userData의 부트스트랩 config에 저장
 * - 이 폴더에 SQLite DB + 모든 미디어를 두고, 미디어는 폴더 기준 상대경로로 참조
 * - 사용자가 이 폴더를 구글드라이브/드롭박스/원드라이브 동기화 폴더로 지정하면 멀티 PC 공유
 */

const SUBDIRS = [
  'media',
  'media/backgrounds',
  'media/videos',
  'media/logos',
  'media/audio',
  'media/overlays',
  'media/scores',
  'media/thumbs',
  'exports'
] as const

let currentDataDir = ''

function bootstrapPath(): string {
  return join(app.getPath('userData'), 'seraphim-config.json')
}

function defaultDataDir(): string {
  return join(app.getPath('documents'), 'SeraphimData')
}

function readBootstrap(): { dataDir?: string } {
  try {
    return JSON.parse(readFileSync(bootstrapPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeBootstrap(cfg: { dataDir?: string }): void {
  try {
    writeFileSync(bootstrapPath(), JSON.stringify(cfg, null, 2), 'utf8')
  } catch {
    /* 무시 — 다음 실행 때 기본값 사용 */
  }
}

/** 데이터 폴더 + 하위 구조 생성 (idempotent) */
export function ensureStructure(dir: string): void {
  mkdirSync(dir, { recursive: true })
  for (const s of SUBDIRS) mkdirSync(join(dir, s), { recursive: true })
}

/** 부트스트랩 config로부터 데이터 폴더 초기화 (없으면 기본값) */
export function initDataDir(): string {
  const cfg = readBootstrap()
  currentDataDir = cfg.dataDir && existsSync(cfg.dataDir) ? cfg.dataDir : cfg.dataDir || defaultDataDir()
  ensureStructure(currentDataDir)
  writeBootstrap({ dataDir: currentDataDir })
  return currentDataDir
}

export function getDataDir(): string {
  return currentDataDir
}

/** 데이터 폴더 전환 (구조 생성 + 부트스트랩 갱신). DB 재오픈은 호출측 책임 */
export function setDataDir(dir: string): void {
  ensureStructure(dir)
  currentDataDir = dir
  writeBootstrap({ dataDir: dir })
}

export function dbPath(): string {
  return join(currentDataDir, 'seraphim.db')
}

/** 경로가 클라우드 동기화 폴더 위에 있는지 대략 추정 (안내 문구용) */
function looksSynced(dir: string): boolean {
  return /GoogleDrive|Google Drive|Dropbox|OneDrive|iCloud/i.test(dir)
}

export function dataDirInfo(): DataDirInfo {
  return {
    dataDir: currentDataDir,
    dbPath: dbPath(),
    looksSynced: looksSynced(currentDataDir)
  }
}
