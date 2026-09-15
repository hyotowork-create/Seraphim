import { app, BrowserWindow, ipcMain, screen, dialog, protocol, session } from 'electron'
import { readFile } from 'fs/promises'
import { basename, extname } from 'path'
import { randomUUID } from 'crypto'
import {
  createControlWindow,
  createOutputWindow,
  closeOutputWindow,
  toggleOutputFullscreen
} from './windows'
import {
  IPC,
  DEFAULT_LIVE_STATE,
  type LiveState,
  type LivePatch,
  type DisplayInfo
} from '../shared/ipc'

// 커스텀 미디어 스킴을 privileged로 등록 (app ready 이전 필수)
// 배경 이미지/영상 파일을 거대한 dataURL 없이 seraphim-media://<id> 로 서빙
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'seraphim-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

// id -> 절대경로 (M1에서 데이터 폴더 상대경로 저장으로 전환 예정)
const mediaRegistry = new Map<string, string>()

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

/** 로컬 파일을 seraphim-media 프로토콜로 서빙하기 위해 등록하고 URL 반환 */
function registerMedia(absPath: string): string {
  const id = randomUUID()
  mediaRegistry.set(id, absPath)
  return `seraphim-media://${id}`
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
    // 새 창에 현재 상태 즉시 반영
    broadcastLiveState()
    return true
  })
  ipcMain.handle(IPC.OUTPUT_CLOSE, () => {
    closeOutputWindow()
    return true
  })
  ipcMain.handle(IPC.OUTPUT_TOGGLE_FULLSCREEN, () => toggleOutputFullscreen())

  ipcMain.handle(IPC.MEDIA_PICK_IMAGE, async () => {
    const r = await dialog.showOpenDialog({
      title: '배경 이미지 선택',
      properties: ['openFile'],
      filters: [{ name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
    })
    const p = r.filePaths[0]
    if (r.canceled || !p) return null
    return { url: registerMedia(p), name: basename(p) }
  })
}

/** 커스텀 미디어 프로토콜 핸들러 등록 (배경 이미지/영상 파일 서빙) */
function registerMediaProtocol(): void {
  protocol.handle('seraphim-media', async (request) => {
    const id = new URL(request.url).hostname
    const filePath = mediaRegistry.get(id)
    if (!filePath) return new Response(null, { status: 404 })
    try {
      const data = await readFile(filePath)
      const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
      return new Response(new Uint8Array(data), { headers: { 'content-type': type } })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

app.whenReady().then(() => {
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
