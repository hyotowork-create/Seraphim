import { app, BrowserWindow, ipcMain, screen, dialog, protocol, session, shell } from 'electron'
import { readFile, copyFile } from 'fs/promises'
import { basename, extname, join, resolve, sep } from 'path'
import { randomUUID } from 'crypto'
import {
  createControlWindow,
  createOutputWindow,
  closeOutputWindow,
  toggleOutputFullscreen
} from './windows'
import { initDataDir, setDataDir, getDataDir, dbPath, dataDirInfo } from './datadir'
import { openDb, closeDb } from './db'
import { getSetting, setSetting, insertMedia, dbStats } from './db/dao'
import {
  IPC,
  DEFAULT_LIVE_STATE,
  type LiveState,
  type LivePatch,
  type DisplayInfo,
  type PickedMedia
} from '../shared/ipc'

// 커스텀 미디어 스킴을 privileged로 등록 (app ready 이전 필수)
// 미디어 파일을 거대한 dataURL 없이 seraphim-media://local/<상대경로> 로 서빙
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'seraphim-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
}

/** 데이터 폴더 기준 상대경로 → 앱 미디어 URL */
function mediaUrl(relPath: string): string {
  return `seraphim-media://local/${relPath.split(sep).join('/')}`
}

// ── 송출 상태 (단일 진실원) ─────────────────────────────
let liveState: LiveState = structuredClone(DEFAULT_LIVE_STATE)

function broadcastLiveState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.LIVE_STATE, liveState)
  }
}

function applyPatch(patch: LivePatch): LiveState {
  liveState = {
    ...liveState,
    ...patch,
    overlay: { ...liveState.overlay, ...(patch.overlay ?? {}) },
    background: { ...liveState.background, ...(patch.background ?? {}) }
  }
  broadcastLiveState()
  return liveState
}

function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `디스플레이 ${i + 1} (${d.size.width}×${d.size.height})`,
    bounds: d.bounds,
    primary: d.id === primaryId
  }))
}

function registerIpc(): void {
  ipcMain.handle(IPC.LIVE_GET, () => liveState)
  ipcMain.handle(IPC.LIVE_SET, (_e, patch: LivePatch) => applyPatch(patch))
  ipcMain.handle(IPC.DISPLAYS_LIST, () => listDisplays())

  ipcMain.handle(IPC.OUTPUT_OPEN, (_e, displayId?: number) => {
    createOutputWindow(displayId)
    broadcastLiveState()
    return true
  })
  ipcMain.handle(IPC.OUTPUT_CLOSE, () => {
    closeOutputWindow()
    return true
  })
  ipcMain.handle(IPC.OUTPUT_TOGGLE_FULLSCREEN, () => toggleOutputFullscreen())

  // 미디어 선택 → 데이터 폴더로 복사(상대경로 저장) → DB 등록
  ipcMain.handle(IPC.MEDIA_PICK, async (): Promise<PickedMedia | null> => {
    const r = await dialog.showOpenDialog({
      title: '배경 이미지 선택',
      properties: ['openFile'],
      filters: [{ name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
    })
    const src = r.filePaths[0]
    if (r.canceled || !src) return null
    const ext = (extname(src) || '.png').toLowerCase()
    const relPath = join('media', 'backgrounds', `${randomUUID()}${ext}`)
    await copyFile(src, join(getDataDir(), relPath))
    const row = insertMedia('background', relPath, basename(src))
    return { id: row.id, url: mediaUrl(row.relPath), relPath: row.relPath, name: row.name }
  })

  // 데이터 폴더 / 설정 / DB
  ipcMain.handle(IPC.DATADIR_GET, () => dataDirInfo())
  ipcMain.handle(IPC.DATADIR_OPEN, () => shell.openPath(getDataDir()))
  ipcMain.handle(IPC.DATADIR_CHOOSE, async () => {
    const r = await dialog.showOpenDialog({
      title: '데이터 저장 폴더 선택 (구글드라이브/드롭박스 등 동기화 폴더 지정 가능)',
      properties: ['openDirectory', 'createDirectory']
    })
    const dir = r.filePaths[0]
    if (r.canceled || !dir) return dataDirInfo()
    setDataDir(dir)
    openDb(dbPath()) // 새 폴더의 DB로 재오픈
    return dataDirInfo()
  })

  ipcMain.handle(IPC.SETTINGS_GET, (_e, key: string) => getSetting(key))
  ipcMain.handle(IPC.SETTINGS_SET, (_e, key: string, value: string) => {
    setSetting(key, value)
    return true
  })
  ipcMain.handle(IPC.DB_STATS, () => dbStats())
}

/** 커스텀 미디어 프로토콜: 데이터 폴더 기준 상대경로 파일 서빙 (경로 탈출 차단) */
function registerMediaProtocol(): void {
  protocol.handle('seraphim-media', async (request) => {
    // seraphim-media://local/media/backgrounds/x.png
    const rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
    const base = resolve(getDataDir())
    const abs = resolve(base, rel)
    if (abs !== base && !abs.startsWith(base + sep)) {
      return new Response(null, { status: 403 })
    }
    try {
      const data = await readFile(abs)
      const type = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream'
      return new Response(new Uint8Array(data), { headers: { 'content-type': type } })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

app.whenReady().then(() => {
  // 데이터 폴더 + DB 초기화 (멀티 PC 이동성 기반)
  initDataDir()
  openDb(dbPath())

  registerMediaProtocol()

  // 카메라(라이브 배경)·전체화면 등 미디어 권한 허용
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media' || permission === 'fullscreen')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'fullscreen'
  })

  registerIpc()
  createControlWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow()
  })
})

app.on('before-quit', () => {
  closeDb()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
