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
import { exportZip, importZip } from './backup'
import {
  listSongs,
  getSong,
  saveSong,
  deleteSong,
  setFavorite,
  touchSong,
  setSongBackground,
  getMediaRelPath
} from './db/songs'
import {
  listPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  getPlaylistItems,
  addPlaylistItem,
  removePlaylistItem,
  reorderPlaylistItems,
  seedDefaultPlaylists
} from './db/playlists'
import { listBible, getBible, saveBible, deleteBible } from './db/bible'
import { extractLyricsGemini, setGeminiKey, getGeminiKey, hasGeminiKey } from './gemini'
import { listBulletins, getBulletin, saveBulletin, deleteBulletin } from './db/bulletins'
import { buildBulletinHtml, type BulletinData } from '../shared/bulletin'
import QRCode from 'qrcode'
import { writeFile } from 'fs/promises'
import {
  IPC,
  DEFAULT_LIVE_STATE,
  type LiveState,
  type LivePatch,
  type DisplayInfo,
  type PickedMedia,
  type SongFilter,
  type SongInput,
  type PlaylistItemType,
  type BibleInput,
  type PickKind,
  type MediaType,
  type ExtractMethod,
  type ExtractedSong
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
    background: { ...liveState.background, ...(patch.background ?? {}) },
    transition: { ...liveState.transition, ...(patch.transition ?? {}) }
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
  ipcMain.handle(IPC.MEDIA_PICK, async (_e, kind: PickKind = 'image'): Promise<PickedMedia | null> => {
    const spec = {
      image: {
        title: '배경 이미지 선택',
        dir: 'backgrounds',
        type: 'background' as MediaType,
        filters: [{ name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
      },
      video: {
        title: '배경 영상 선택',
        dir: 'videos',
        type: 'video' as MediaType,
        filters: [{ name: '영상', extensions: ['mp4', 'webm', 'mov', 'm4v'] }]
      },
      audio: {
        title: '오디오(MP3) 선택',
        dir: 'audio',
        type: 'audio' as MediaType,
        filters: [{ name: '오디오', extensions: ['mp3', 'm4a', 'wav', 'ogg', 'aac'] }]
      },
      score: {
        title: '악보 이미지 선택',
        dir: 'scores',
        type: 'score' as MediaType,
        filters: [{ name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
      }
    }[kind]

    const r = await dialog.showOpenDialog({
      title: spec.title,
      properties: ['openFile'],
      filters: spec.filters
    })
    const src = r.filePaths[0]
    if (r.canceled || !src) return null
    const ext = (extname(src) || '').toLowerCase()
    const relPath = join('media', spec.dir, `${randomUUID()}${ext}`)
    await copyFile(src, join(getDataDir(), relPath))
    const row = insertMedia(spec.type, relPath, basename(src))
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

  // 백업/복원 (.zip)
  ipcMain.handle(IPC.BACKUP_EXPORT, async () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const r = await dialog.showSaveDialog({
      title: '프로젝트 내보내기 (.zip)',
      defaultPath: `Seraphim-backup-${stamp}.zip`,
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    })
    if (r.canceled || !r.filePath) return null
    exportZip(r.filePath)
    return r.filePath
  })
  ipcMain.handle(IPC.BACKUP_IMPORT, async () => {
    const r = await dialog.showOpenDialog({
      title: '프로젝트 가져오기 (.zip)',
      properties: ['openFile'],
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    })
    const src = r.filePaths[0]
    if (r.canceled || !src) return false
    const ok = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['취소', '가져오기(덮어쓰기)'],
      defaultId: 1,
      cancelId: 0,
      message: '현재 데이터 폴더의 DB와 미디어를 백업 내용으로 덮어씁니다. 계속할까요?'
    })
    if (ok.response !== 1) return false
    importZip(src)
    return true
  })

  // 곡/가사 (M2)
  ipcMain.handle(IPC.SONG_LIST, (_e, filter: SongFilter) => listSongs(filter))
  ipcMain.handle(IPC.SONG_GET, (_e, id: number) => {
    const song = getSong(id)
    if (song && song.bgMediaId != null) {
      const rel = getMediaRelPath(song.bgMediaId)
      song.bgUrl = rel ? mediaUrl(rel) : null
    }
    return song
  })
  ipcMain.handle(IPC.SONG_SAVE, (_e, input: SongInput) => saveSong(input))
  ipcMain.handle(IPC.SONG_SET_BG, (_e, songId: number, mediaId: number | null) => {
    setSongBackground(songId, mediaId)
    return true
  })
  ipcMain.handle(IPC.SONG_DELETE, (_e, id: number) => {
    deleteSong(id)
    return true
  })
  ipcMain.handle(IPC.SONG_FAVORITE, (_e, id: number, favorite: boolean) => {
    setFavorite(id, favorite)
    return true
  })
  ipcMain.handle(IPC.SONG_TOUCH, (_e, id: number) => {
    touchSong(id)
    return true
  })

  // 플레이리스트 (M4)
  ipcMain.handle(IPC.PLAYLIST_LIST, () => listPlaylists())
  ipcMain.handle(IPC.PLAYLIST_CREATE, (_e, name: string) => createPlaylist(name))
  ipcMain.handle(IPC.PLAYLIST_RENAME, (_e, id: number, name: string) => {
    renamePlaylist(id, name)
    return true
  })
  ipcMain.handle(IPC.PLAYLIST_DELETE, (_e, id: number) => {
    deletePlaylist(id)
    return true
  })
  ipcMain.handle(IPC.PLAYLIST_ITEMS, (_e, playlistId: number) => getPlaylistItems(playlistId))
  ipcMain.handle(
    IPC.PLAYLIST_ADD,
    (_e, playlistId: number, itemType: PlaylistItemType, refId: number | null) =>
      addPlaylistItem(playlistId, itemType, refId)
  )
  ipcMain.handle(IPC.PLAYLIST_REMOVE, (_e, itemId: number) => {
    removePlaylistItem(itemId)
    return true
  })
  ipcMain.handle(IPC.PLAYLIST_REORDER, (_e, playlistId: number, orderedIds: number[]) => {
    reorderPlaylistItems(playlistId, orderedIds)
    return true
  })

  // 악보 가사 추출 (M6)
  ipcMain.handle(IPC.GEMINI_HAS_KEY, () => hasGeminiKey())
  ipcMain.handle(IPC.GEMINI_SET_KEY, (_e, key: string) => {
    setGeminiKey(key)
    return true
  })
  ipcMain.handle(
    IPC.SCORE_EXTRACT,
    async (_e, relPath: string, method: ExtractMethod): Promise<ExtractedSong> => {
      const abs = join(getDataDir(), relPath)
      const data = await readFile(abs)
      const ext = extname(abs).toLowerCase()
      const mime = MIME[ext] ?? 'image/png'
      if (method === 'ocr') {
        throw new Error('로컬 OCR은 다음 단계에서 제공됩니다. 지금은 Gemini 방식을 사용하세요.')
      }
      const key = getGeminiKey()
      if (!key) throw new Error('설정에서 Gemini API 키를 먼저 입력하세요.')
      return extractLyricsGemini(data.toString('base64'), mime, key)
    }
  )

  // 성경 (M4b)
  ipcMain.handle(IPC.BIBLE_LIST, (_e, search?: string) => listBible(search))
  ipcMain.handle(IPC.BIBLE_GET, (_e, id: number) => getBible(id))
  ipcMain.handle(IPC.BIBLE_SAVE, (_e, input: BibleInput) => saveBible(input))
  ipcMain.handle(IPC.BIBLE_DELETE, (_e, id: number) => {
    deleteBible(id)
    return true
  })

  // 온라인 주보 (M7)
  ipcMain.handle(IPC.BULLETIN_LIST, () => listBulletins())
  ipcMain.handle(IPC.BULLETIN_GET, (_e, id: number) => getBulletin(id))
  ipcMain.handle(IPC.BULLETIN_SAVE, (_e, data: BulletinData, id?: number) => saveBulletin(data, id))
  ipcMain.handle(IPC.BULLETIN_DELETE, (_e, id: number) => {
    deleteBulletin(id)
    return true
  })
  ipcMain.handle(IPC.BULLETIN_PUBLISH, async (_e, data: BulletinData) => {
    const html = buildBulletinHtml(data)
    const defaultName = `bulletin-${data.date || 'untitled'}.html`
    const r = await dialog.showSaveDialog({
      title: '주보 HTML 저장',
      defaultPath: join(getDataDir(), 'exports', defaultName),
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, html, 'utf8')
    return r.filePath
  })
  ipcMain.handle(IPC.BULLETIN_QR, async (_e, url: string) => {
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 1 })
    return dataUrl
  })
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

  // 예배별 기본 플레이리스트 시드 (최초 1회 — 이후 사용자가 지워도 재생성 안 함)
  if (getSetting('seeded.playlists') !== '1') {
    seedDefaultPlaylists()
    setSetting('seeded.playlists', '1')
  }

  // 저장된 출력 비율 복원
  const savedAspect = getSetting('render.aspect')
  if (savedAspect === '16:9' || savedAspect === '4:3' || savedAspect === 'fill') {
    liveState = { ...liveState, aspect: savedAspect }
  }

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
