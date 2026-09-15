import { app, BrowserWindow, ipcMain, screen } from 'electron'
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
    overlay: { ...liveState.overlay, ...(patch.overlay ?? {}) }
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
    // 새 창에 현재 상태 즉시 반영
    broadcastLiveState()
    return true
  })
  ipcMain.handle(IPC.OUTPUT_CLOSE, () => {
    closeOutputWindow()
    return true
  })
  ipcMain.handle(IPC.OUTPUT_TOGGLE_FULLSCREEN, () => toggleOutputFullscreen())
}

app.whenReady().then(() => {
  registerIpc()
  createControlWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
