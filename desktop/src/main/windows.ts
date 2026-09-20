import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type { WindowRole } from '../shared/ipc'

const RENDERER_URL = process.env['ELECTRON_RENDERER_URL']

let controlWindow: BrowserWindow | null = null
let outputWindow: BrowserWindow | null = null

const preloadPath = join(__dirname, '../preload/index.js')

/** dev: vite 데브서버 URL / prod: 번들된 html 파일 로드 */
function loadRenderer(win: BrowserWindow, page: 'index.html' | 'output.html'): void {
  if (RENDERER_URL) {
    void win.loadURL(`${RENDERER_URL}/${page}`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}`))
  }
}

function webPreferences(role: WindowRole) {
  return {
    preload: preloadPath,
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false,
    additionalArguments: [`--seraphim-role=${role}`]
  }
}

export function createControlWindow(): BrowserWindow {
  controlWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#151821',
    title: 'Seraphim — Control',
    autoHideMenuBar: true,
    webPreferences: webPreferences('control')
  })

  controlWindow.on('closed', () => {
    controlWindow = null
    // 운영자 창이 닫히면 송출 창도 함께 종료
    if (outputWindow && !outputWindow.isDestroyed()) outputWindow.close()
  })

  loadRenderer(controlWindow, 'index.html')
  return controlWindow
}

/** 지정 디스플레이(없으면 보조 디스플레이 우선)에 전체화면 송출 창 생성 */
export function createOutputWindow(displayId?: number): BrowserWindow {
  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.focus()
    return outputWindow
  }

  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const target =
    (displayId != null && displays.find((d) => d.id === displayId)) ||
    displays.find((d) => d.id !== primary.id) ||
    primary

  const { x, y, width, height } = target.bounds

  outputWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    backgroundColor: '#000000',
    title: 'Seraphim — Output',
    frame: false,
    fullscreen: target.id !== primary.id, // 보조 모니터면 즉시 전체화면
    autoHideMenuBar: true,
    webPreferences: webPreferences('output')
  })

  outputWindow.on('closed', () => {
    outputWindow = null
  })

  loadRenderer(outputWindow, 'output.html')
  return outputWindow
}

export function closeOutputWindow(): void {
  if (outputWindow && !outputWindow.isDestroyed()) outputWindow.close()
}

export function toggleOutputFullscreen(): boolean {
  if (!outputWindow || outputWindow.isDestroyed()) return false
  const next = !outputWindow.isFullScreen()
  outputWindow.setFullScreen(next)
  return next
}

export function getControlWindow(): BrowserWindow | null {
  return controlWindow
}

export function getOutputWindow(): BrowserWindow | null {
  return outputWindow
}
