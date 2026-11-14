import { app, BrowserWindow, ipcMain, screen, dialog, protocol, session, shell } from 'electron'
import { readFile, copyFile, writeFile as writeFileP } from 'fs/promises'
import { basename, extname, join, resolve, sep } from 'path'
import { randomUUID } from 'crypto'
import {
  createControlWindow,
  createOutputWindow,
  closeOutputWindow,
  toggleOutputFullscreen,
  openStreamWindow,
  closeStreamWindow,
  setControlCloseGuard
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
  getMediaRelPath,
  listSongScores
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
import { extractLyricsGemini, setGeminiKey, getGeminiKey, hasGeminiKey, getGeminiModel, getGeminiPreciseModel } from './gemini'
import { convertHeicToJpeg, imageDims, isHeic, prepareVisionImage, SCORE_IMAGE_EXTS } from './score'
import { isWeakResult } from '../shared/scoreText'
import { importSongFiles } from './importSongs'
import { resolveOrder, applyOrder } from './orderSheet'
import { findDuplicateGroups, mergeSongs } from './dedup'
import { buildPptx } from './pptxExport'
import {
  getStreamConfig,
  setStreamConfig,
  hasStreamKey,
  setStreamKey,
  probeFfmpeg,
  startStream,
  stopStream,
  writeStreamChunk,
  killStream,
  isStreaming,
  activeKinds,
  diskInfo,
  recordingsDir,
  legacyStreamCamera
} from './stream'
import { applyCameraPatch, normalizeCameraSlots, QUALITY_PRESETS, type StreamConfig, type StreamKind } from '../shared/stream'
import { ocrImages, ocrTextToSongs } from './ocr'
import { listTranslations, hasTranslation, replaceTranslation, removeTranslation, lookupPassage } from './db/bibleText'
import { parseBibleLines, parseBibleJson, type ParsedVerse } from '../shared/bibleTextParse'
import { gunzipSync } from 'zlib'
import { existsSync, readFileSync } from 'fs'
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
  type ExtractOptions,
  type ExtractResult,
  type ImportOptions,
  type ImportReport,
  type BibleTextImportReport,
  type OrderApplyItem,
  type PptxExportRequest,
  type PptxExportResult,
  BUNDLED_BIBLE_CODE,
  BUNDLED_BIBLE_NAME,
  BIBLE_TRANSLATION_NAMES
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
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
}

/** 데이터 폴더 기준 상대경로 → 앱 미디어 URL */
function mediaUrl(relPath: string): string {
  return `seraphim-media://local/${relPath.split(sep).join('/')}`
}

/** 내장 개역한글(저작권 만료) 데이터 파일 경로 — 패키징: Contents/Resources/bible, 개발: desktop/data/bible */
function bundledBiblePath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bible', 'krv.tsv.gz')
    : join(app.getAppPath(), 'data', 'bible', 'krv.tsv.gz')
}

/** 내장 성경을 DB에 설치. force=false면 이미 있을 때 건너뜀. 반환: 넣은 절 수(건너뛰면 0) */
function installBundledBible(force: boolean): number {
  if (!force && hasTranslation(BUNDLED_BIBLE_CODE)) return 0
  const file = bundledBiblePath()
  if (!existsSync(file)) throw new Error(`내장 성경 파일이 없습니다: ${file}`)
  const text = gunzipSync(readFileSync(file)).toString('utf8')
  return replaceTranslation(BUNDLED_BIBLE_CODE, BUNDLED_BIBLE_NAME, true, parseBibleLines(text).verses)
}

/** 설정에 저장된 로고 이미지를 송출 상태에 복원 (앱 시작·데이터 폴더 변경 시) */
function restoreLogo(): void {
  const raw = getSetting('logo.mediaId')
  const id = raw ? Number(raw) : NaN
  const rel = Number.isFinite(id) ? getMediaRelPath(id) : null
  liveState = { ...liveState, logoUrl: rel ? mediaUrl(rel) : null }
}

/** DB를 연 직후: 내장 성경이 없으면 설치 (앱 시작·데이터 폴더 변경 시) */
function ensureBundledBible(): void {
  try {
    installBundledBible(false)
  } catch (e) {
    console.error('내장 성경 설치 실패:', e)
  }
}

// ── 송출 상태 (단일 진실원) ─────────────────────────────
let liveState: LiveState = structuredClone(DEFAULT_LIVE_STATE)

function broadcastLiveState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.LIVE_STATE, liveState)
  }
}

let saveCamerasTimer: ReturnType<typeof setTimeout> | null = null

/** 카메라 1·2·3과 전환 상태를 설정에 저장 (줌 슬라이더처럼 연달아 바뀌면 0.5초 모아서) */
function saveCameras(): void {
  if (saveCamerasTimer) clearTimeout(saveCamerasTimer)
  saveCamerasTimer = setTimeout(() => {
    saveCamerasTimer = null
    setSetting('camera.slots', JSON.stringify(liveState.cameras))
    setSetting('camera.active', String(liveState.activeCamera))
  }, 500)
}

function applyPatch(patch: LivePatch): LiveState {
  const { camera, cameraSlot, activeCamera, ...rest } = patch
  const cam = applyCameraPatch(liveState.cameras, liveState.activeCamera, { camera, cameraSlot, activeCamera })
  liveState = {
    ...liveState,
    ...rest,
    overlay: { ...liveState.overlay, ...(patch.overlay ?? {}) },
    background: { ...liveState.background, ...(patch.background ?? {}) },
    transition: { ...liveState.transition, ...(patch.transition ?? {}) },
    ...cam
  }
  if (camera || cameraSlot || activeCamera !== undefined) saveCameras()
  broadcastLiveState()
  return liveState
}

/** 시작 시: 저장된 카메라 1·2·3 복원 + 예전 방송 설정의 단일 카메라를 카메라 1로 옮김 + 카메라 요청 해상도 */
function restoreCameras(): void {
  let saved: unknown = null
  try {
    saved = JSON.parse(getSetting('camera.slots') || 'null')
  } catch {
    saved = null
  }
  const cameras = normalizeCameraSlots(saved)
  const legacy = legacyStreamCamera()
  if (legacy && cameras.every((c) => !c.deviceId)) {
    cameras[0] = { ...cameras[0], deviceId: legacy.deviceId, label: legacy.label }
    setSetting('camera.slots', JSON.stringify(cameras))
  }
  const active = Number(getSetting('camera.active'))
  const cfg = getStreamConfig()
  liveState = {
    ...liveState,
    cameras,
    activeCamera: Number.isInteger(active) && active >= 0 && active < cameras.length ? active : 0,
    cameraCapture: (QUALITY_PRESETS[cfg.quality] ?? QUALITY_PRESETS['720p']).camera
  }
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
      },
      logo: {
        title: '로고 이미지 선택 (PNG 투명 배경 권장)',
        dir: 'logos',
        type: 'logo' as MediaType,
        filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]
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
    ensureBundledBible()
    restoreLogo()
  restoreLogo()
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
    if (song) {
      song.scores = listSongScores(id)
        .map((mediaId) => {
          const rel = getMediaRelPath(mediaId)
          return rel ? { mediaId, url: mediaUrl(rel) } : null
        })
        .filter((x): x is { mediaId: number; url: string } => x !== null)
    }
    return song
  })
  ipcMain.handle(IPC.SONG_SAVE, (_e, input: SongInput) => saveSong(input))
  ipcMain.handle(IPC.SONG_SET_BG, (_e, songId: number, mediaId: number | null) => {
    setSongBackground(songId, mediaId)
    return true
  })
  // 곡 대량 가져오기 (텍스트/JSON/PPTX, 폴더 가능)
  ipcMain.handle(IPC.SONG_IMPORT_PICK, async (): Promise<string[]> => {
    const r = await dialog.showOpenDialog({
      title: '가져올 파일 또는 폴더 선택 (.txt / .json / .pptx)',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [{ name: '가사 파일', extensions: ['txt', 'json', 'pptx'] }]
    })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle(
    IPC.SONG_IMPORT,
    (_e, paths: string[], opts: ImportOptions): Promise<ImportReport> => importSongFiles(paths, opts)
  )
  // 유사 제목 곡 정리
  ipcMain.handle(IPC.SONG_DUP_GROUPS, () => findDuplicateGroups())
  ipcMain.handle(IPC.SONG_DUP_MERGE, (_e, keepId: number, removeIds: number[]) => mergeSongs(keepId, removeIds))
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
  // 순서지 → 플레이리스트 자동 구성
  ipcMain.handle(IPC.ORDER_RESOLVE, (_e, text: string, translation: string) => resolveOrder(text, translation))
  ipcMain.handle(IPC.ORDER_APPLY, (_e, name: string, items: OrderApplyItem[]) => applyOrder(name, items))
  // YouTube 라이브 송출 / 녹화
  ipcMain.handle(IPC.STREAM_PROBE, () => probeFfmpeg())
  ipcMain.handle(IPC.STREAM_CONFIG_GET, () => getStreamConfig())
  ipcMain.handle(IPC.STREAM_CONFIG_SET, (_e, patch: Partial<StreamConfig>) => {
    const cfg = setStreamConfig(patch)
    // 방송 화질이 바뀌면 모든 창의 카메라 요청 해상도도 맞춘다
    if (patch.quality) applyPatch({ cameraCapture: (QUALITY_PRESETS[cfg.quality] ?? QUALITY_PRESETS['720p']).camera })
    return cfg
  })
  ipcMain.handle(IPC.STREAM_KEY_HAS, () => hasStreamKey())
  ipcMain.handle(IPC.STREAM_KEY_SET, (_e, key: string) => {
    setStreamKey(key)
    return hasStreamKey()
  })
  ipcMain.handle(IPC.STREAM_PREPARE, async (e) => {
    const q = QUALITY_PRESETS[getStreamConfig().quality] ?? QUALITY_PRESETS['720p']
    const win = await openStreamWindow(q.width, q.height)
    return { sourceId: win.webContents.getMediaSourceId(e.sender), width: q.width, height: q.height, fps: q.fps }
  })
  const kindOf = (k: unknown): StreamKind => (k === 'record' ? 'record' : 'live')
  ipcMain.handle(IPC.STREAM_START, (e, kind: StreamKind) => startStream(e.sender, kindOf(kind)))
  ipcMain.on(IPC.STREAM_CHUNK, (_e, sess: number, data: ArrayBuffer | Uint8Array) => writeStreamChunk(sess, data))
  ipcMain.handle(IPC.STREAM_STOP, async (_e, kind: StreamKind) => {
    await stopStream(kindOf(kind))
    return true
  })
  ipcMain.handle(IPC.STREAM_DISK, () => diskInfo())
  ipcMain.handle(IPC.STREAM_CLOSE_WINDOW, () => {
    if (!isStreaming()) closeStreamWindow()
    return true
  })
  ipcMain.handle(IPC.STREAM_OPEN_FOLDER, (_e, path?: string) => {
    if (path) shell.showItemInFolder(path)
    else void shell.openPath(recordingsDir())
    return true
  })
  ipcMain.handle(IPC.STREAM_OPEN_STUDIO, () => shell.openExternal('https://studio.youtube.com/'))

  // 자막 → PPTX (송출 스타일 그대로)
  ipcMain.handle(IPC.EXPORT_PPTX, async (_e, req: PptxExportRequest): Promise<PptxExportResult | null> => {
    const built = buildPptx(req, liveState)
    let outPath = req.outPath
    if (!outPath) {
      const r = await dialog.showSaveDialog({
        title: 'PPTX로 내보내기',
        defaultPath: built.suggestedName,
        filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
      })
      if (r.canceled || !r.filePath) return null
      outPath = r.filePath
    }
    await writeFileP(outPath, built.buffer)
    return { path: outPath, slides: built.slides, warnings: built.warnings }
  })
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
    (_e, playlistId: number, itemType: PlaylistItemType, refId: number | null, note: string | null = null) =>
      addPlaylistItem(playlistId, itemType, refId, note)
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
  // 악보 선택 (여러 장 + HEIC 자동 변환 + PDF는 렌더러가 페이지 이미지로 변환)
  ipcMain.handle(IPC.SCORE_PICK, async (): Promise<PickedMedia[]> => {
    const r = await dialog.showOpenDialog({
      title: '악보 이미지/PDF 선택 (여러 장 가능)',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '악보 (이미지·PDF)', extensions: [...SCORE_IMAGE_EXTS, 'pdf'] },
        { name: '이미지', extensions: SCORE_IMAGE_EXTS },
        { name: 'PDF', extensions: ['pdf'] }
      ]
    })
    if (r.canceled || r.filePaths.length === 0) return []
    // 파일명 순 = 페이지 순 (IMG_0001, IMG_0002 …)
    const files = [...r.filePaths].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const out: PickedMedia[] = []
    for (const src of files) {
      let ext = (extname(src) || '').toLowerCase()
      let relPath: string
      if (isHeic(src)) {
        ext = '.jpg'
        relPath = join('media', 'scores', `${randomUUID()}${ext}`)
        await convertHeicToJpeg(src, join(getDataDir(), relPath))
      } else {
        relPath = join('media', 'scores', `${randomUUID()}${ext}`)
        await copyFile(src, join(getDataDir(), relPath))
      }
      const row = insertMedia('score', relPath, basename(src))
      const dims = (await imageDims(join(getDataDir(), relPath))) ?? undefined
      out.push({ id: row.id, url: mediaUrl(row.relPath), relPath: row.relPath, name: row.name, ...dims })
    }
    return out
  })

  // 렌더러가 PDF 페이지를 PNG로 변환해 보내면 악보 이미지로 저장
  ipcMain.handle(
    IPC.SCORE_SAVE_PAGE,
    async (_e, pngBase64: string, name: string): Promise<PickedMedia> => {
      const relPath = join('media', 'scores', `${randomUUID()}.png`)
      await writeFileP(join(getDataDir(), relPath), Buffer.from(pngBase64, 'base64'))
      const row = insertMedia('score', relPath, name)
      const dims = (await imageDims(join(getDataDir(), relPath))) ?? undefined
      return { id: row.id, url: mediaUrl(row.relPath), relPath: row.relPath, name: row.name, ...dims }
    }
  )

  ipcMain.handle(
    IPC.SCORE_EXTRACT,
    async (_e, relPaths: string[], method: ExtractMethod, opts: ExtractOptions = {}): Promise<ExtractResult> => {
      const key = method === 'ocr' ? null : getGeminiKey()
      if (method !== 'ocr' && !key) throw new Error('설정에서 Gemini API 키를 먼저 입력하세요.')
      const base = resolve(getDataDir())
      const safeAbs = (rel: string): string => {
        const abs = resolve(base, rel)
        if (abs !== base && !abs.startsWith(base + sep)) throw new Error('잘못된 악보 경로입니다.')
        if (extname(abs).toLowerCase() === '.pdf') throw new Error('PDF는 페이지 이미지로 변환한 뒤 추출하세요.')
        return abs
      }
      // 전송 단위: 영역이 지정되면 영역만, 아니면 페이지 전체
      const units: { abs: string; crop?: { x: number; y: number; w: number; h: number } }[] =
        opts.regions && opts.regions.length
          ? opts.regions.map((r) => ({ abs: safeAbs(r.relPath), crop: { x: r.x, y: r.y, w: r.w, h: r.h } }))
          : relPaths.map((rel) => ({ abs: safeAbs(rel) }))
      if (units.length === 0) throw new Error('추출할 악보 이미지가 없습니다.')

      const run = async (precise: boolean): Promise<ExtractResult['songs']> => {
        const images = []
        for (const u of units) {
          images.push(
            await prepareVisionImage(u.abs, MIME[extname(u.abs).toLowerCase()] ?? 'image/png', {
              precise,
              crop: u.crop
            })
          )
        }
        return extractLyricsGemini(images, key as string, precise ? getGeminiPreciseModel() : getGeminiModel())
      }

      if (method === 'ocr') {
        // 오프라인 OCR: 확대(정밀 모드) 전처리 후 tesseract. 곡 분리·절 구조는 거칠므로 검수 필수
        const images = []
        for (const u of units) {
          images.push(await prepareVisionImage(u.abs, MIME[extname(u.abs).toLowerCase()] ?? 'image/png', { precise: true, crop: u.crop }))
        }
        const songs = ocrTextToSongs(await ocrImages(images))
        if (songs.length === 0) throw new Error('OCR로 가사를 읽지 못했습니다. 이미지를 더 크게 하거나 가사 영역만 선택해 보세요.')
        return { songs, meta: { model: 'tesseract(kor+eng, 오프라인)', precise: true, retried: false } }
      }

      let precise = !!opts.precise
      let songs = await run(precise)
      let retried = false
      // 1차 결과가 빈약하면 정밀 모드(확대 + 정밀 모델)로 한 번 더
      if (!precise && isWeakResult(songs)) {
        retried = true
        precise = true
        try {
          const second = await run(true)
          if (!isWeakResult(second) || second.length > songs.length) songs = second
        } catch (e) {
          if (songs.length === 0) throw e
        }
      }
      if (songs.length === 0) {
        throw new Error(
          '이미지에서 가사를 찾지 못했습니다. 글자가 작으면 가사 영역만 선택해 다시 시도하거나, 더 선명하게 촬영/스캔해 주세요.'
        )
      }
      return {
        songs,
        meta: { model: precise ? getGeminiPreciseModel() : getGeminiModel(), precise, retried }
      }
    }
  )

  // ── 성경 본문 DB (구절 입력 → 본문) ──
  ipcMain.handle(IPC.BIBLE_TEXT_LOOKUP, (_e, ref: string, code: string) => lookupPassage(ref, code))
  ipcMain.handle(IPC.BIBLE_TEXT_TRANSLATIONS, () => listTranslations())
  ipcMain.handle(IPC.BIBLE_TEXT_INSTALL_BUNDLED, () => installBundledBible(true))
  ipcMain.handle(IPC.BIBLE_TEXT_REMOVE, (_e, code: string) => {
    if (code === BUNDLED_BIBLE_CODE) throw new Error('내장 번역본은 삭제할 수 없습니다.')
    removeTranslation(code)
    return true
  })
  ipcMain.handle(IPC.BIBLE_TEXT_IMPORT_PICK, async (): Promise<string[]> => {
    const r = await dialog.showOpenDialog({
      title: '성경 본문 파일 선택 (.txt / .tsv / .csv / .json — 여러 개 가능)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '성경 본문', extensions: ['txt', 'tsv', 'csv', 'json'] }]
    })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle(
    IPC.BIBLE_TEXT_IMPORT,
    async (_e, paths: string[], code: string, name: string): Promise<BibleTextImportReport> => {
      const c = code.trim().toUpperCase()
      if (!/^[A-Z0-9_-]{2,12}$/.test(c)) throw new Error('번역본 코드는 영문·숫자 2~12자여야 합니다 (예: NKRV).')
      if (c === BUNDLED_BIBLE_CODE) throw new Error('내장 번역본 코드(KRV)는 덮어쓸 수 없습니다.')
      const all: ParsedVerse[] = []
      let unparsed = 0
      for (const f of paths) {
        const content = await readFile(f, 'utf8')
        const st = extname(f).toLowerCase() === '.json' ? parseBibleJson(content) : parseBibleLines(content)
        all.push(...st.verses)
        unparsed += st.unparsed
      }
      if (all.length < 100) {
        throw new Error(`해석한 절이 ${all.length}개뿐입니다. 파일 형식을 확인하세요 (예: "창1:1 태초에…" 한 줄에 한 절).`)
      }
      const finalName = name.trim() || BIBLE_TRANSLATION_NAMES[c] || c
      const inserted = replaceTranslation(c, finalName, false, all)
      return { code: c, name: finalName, inserted, unparsed, files: paths.map((f) => basename(f)) }
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
  ensureBundledBible()
  restoreLogo()
  restoreCameras()

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
  // 방송·녹화 중에 운영자 창을 닫으려 하면 확인 (실수로 끊기지 않게)
  setControlCloseGuard(() => {
    if (!isStreaming()) return false
    const kinds = activeKinds()
    const what = kinds.length === 2 ? '방송과 녹화' : kinds[0] === 'record' ? '녹화' : '방송'
    const r = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['취소', `${what} 끝내고 닫기`],
      defaultId: 0,
      cancelId: 0,
      message: `지금 ${what} 중입니다.`,
      detail: `창을 닫으면 ${what}${what === '방송' ? '이' : '가'} 끝납니다.${kinds.includes('record') ? ' 지금까지 녹화한 부분은 저장됩니다.' : ''} 계속할까요?`
    })
    if (r === 0) return true
    killStream()
    return false
  })
  createControlWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow()
  })
})

app.on('before-quit', () => {
  killStream()
  closeDb()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
