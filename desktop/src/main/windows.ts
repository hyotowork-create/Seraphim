import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type { WindowRole } from '../shared/ipc'

const RENDERER_URL = process.env['ELECTRON_RENDERER_URL']

let controlWindow: BrowserWindow | null = null
let outputWindow: BrowserWindow | null = null
let streamWindow: BrowserWindow | null = null
let streamSize: { width: number; height: number } | null = null
/** 운영자 창을 닫기 전에 확인 (방송 중이면 true를 돌려 닫기를 막는다) */
let controlCloseGuard: (() => boolean) | null = null

export function setControlCloseGuard(fn: () => boolean): void {
  controlCloseGuard = fn
}

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

  controlWindow.on('close', (e) => {
    if (controlCloseGuard && controlCloseGuard()) e.preventDefault()
  })

  controlWindow.on('closed', () => {
    controlWindow = null
    // 운영자 창이 닫히면 송출 창·방송 창도 함께 종료
    if (outputWindow && !outputWindow.isDestroyed()) outputWindow.close()
    closeStreamWindow()
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

/**
 * 방송 전용 숨은 창 — output.html을 role=stream으로 띄워 탭 캡처한다.
 * 캡처 프레임이 정확히 width×height 픽셀이 되도록 DIP 크기 = 픽셀 ÷ 화면 배율로 만든다. 창은 화면에 나타나지 않는다.
 */
export async function openStreamWindow(width: number, height: number): Promise<BrowserWindow> {
  const sf = screen.getPrimaryDisplay().scaleFactor || 1
  const dip = { width: Math.round(width / sf), height: Math.round(height / sf) }
  if (streamWindow && !streamWindow.isDestroyed()) {
    if (!streamSize || streamSize.width !== dip.width || streamSize.height !== dip.height) {
      streamWindow.setContentSize(dip.width, dip.height)
      streamSize = dip
    }
    return streamWindow
  }
  const win = new BrowserWindow({
    width: dip.width,
    height: dip.height,
    useContentSize: true,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#000000',
    title: 'Seraphim — Stream',
    webPreferences: { ...webPreferences('stream'), backgroundThrottling: false }
  })
  streamWindow = win
  streamSize = dip
  win.on('closed', () => {
    if (streamWindow === win) {
      streamWindow = null
      streamSize = null
    }
  })
  const loaded = new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
  loadRenderer(win, 'output.html')
  await loaded
  // 탭 캡처가 시작되면 Chromium이 캡처 대상 페이지를 '보이는 상태'로 유지하므로 숨은 창도 계속 그려진다
  return win
}

export function closeStreamWindow(): void {
  const win = streamWindow
  streamWindow = null
  streamSize = null
  if (win && !win.isDestroyed()) win.close()
}

export function getStreamWindow(): BrowserWindow | null {
  return streamWindow && !streamWindow.isDestroyed() ? streamWindow : null
}

export function getControlWindow(): BrowserWindow | null {
  return controlWindow
}

export function getOutputWindow(): BrowserWindow | null {
  return outputWindow
}
