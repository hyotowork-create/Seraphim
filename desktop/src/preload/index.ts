import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type LiveState,
  type LivePatch,
  type DisplayInfo,
  type WindowRole,
  type PickedMedia,
  type DataDirInfo,
  type DbStats,
  type SongFilter,
  type SongInput,
  type SongListItem,
  type SongDetail,
  type Playlist,
  type PlaylistItem,
  type PlaylistItemType,
  type BibleListItem,
  type BibleDetail,
  type BibleInput,
  type ExtractMethod,
  type DupGroup,
  type OrderResolvedLine,
  type OrderApplyItem,
  type PptxExportRequest,
  type PptxExportResult,
  type OrderApplyResult,
  type BibleLookupResult,
  type BibleTranslationInfo,
  type BibleTextImportReport,
  type ImportOptions,
  type ImportReport,
  type ExtractOptions,
  type ExtractResult,
  type BulletinListItem
} from '../shared/ipc'
import type { BulletinData } from '../shared/bulletin'
import type { DiskInfo, StreamConfig, StreamKind, StreamPrepareResult, StreamProbe, StreamStatus } from '../shared/stream'

function resolveRole(): WindowRole {
  const arg = process.argv.find((a) => a.startsWith('--seraphim-role='))
  const role = arg?.split('=')[1]
  return role === 'output' || role === 'stream' ? role : 'control'
}

const api = {
  role: resolveRole(),

  getLive: (): Promise<LiveState> => ipcRenderer.invoke(IPC.LIVE_GET),
  setLive: (patch: LivePatch): Promise<LiveState> => ipcRenderer.invoke(IPC.LIVE_SET, patch),

  /** 송출 상태 구독. 반환값을 호출하면 구독 해제 */
  onLive: (cb: (state: LiveState) => void): (() => void) => {
    const listener = (_e: unknown, state: LiveState): void => cb(state)
    ipcRenderer.on(IPC.LIVE_STATE, listener)
    return () => ipcRenderer.removeListener(IPC.LIVE_STATE, listener)
  },

  listDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke(IPC.DISPLAYS_LIST),

  // YouTube 라이브 송출 / 녹화
  streamProbe: (): Promise<StreamProbe> => ipcRenderer.invoke(IPC.STREAM_PROBE),
  getStreamConfig: (): Promise<StreamConfig> => ipcRenderer.invoke(IPC.STREAM_CONFIG_GET),
  setStreamConfig: (patch: Partial<StreamConfig>): Promise<StreamConfig> => ipcRenderer.invoke(IPC.STREAM_CONFIG_SET, patch),
  onStreamConfig: (cb: (cfg: StreamConfig) => void): (() => void) => {
    const l = (_e: unknown, cfg: StreamConfig): void => cb(cfg)
    ipcRenderer.on(IPC.STREAM_CONFIG, l)
    return () => ipcRenderer.removeListener(IPC.STREAM_CONFIG, l)
  },
  hasStreamKey: (): Promise<boolean> => ipcRenderer.invoke(IPC.STREAM_KEY_HAS),
  setStreamKey: (key: string): Promise<boolean> => ipcRenderer.invoke(IPC.STREAM_KEY_SET, key),
  /** 방송 창을 열고 탭 캡처 소스 id를 받는다 */
  streamPrepare: (): Promise<StreamPrepareResult> => ipcRenderer.invoke(IPC.STREAM_PREPARE),
  streamStart: (kind: StreamKind): Promise<StreamStatus> => ipcRenderer.invoke(IPC.STREAM_START, kind),
  streamChunk: (session: number, data: ArrayBuffer): void => ipcRenderer.send(IPC.STREAM_CHUNK, session, data),
  streamStop: (kind: StreamKind): Promise<boolean> => ipcRenderer.invoke(IPC.STREAM_STOP, kind),
  streamDisk: (): Promise<DiskInfo> => ipcRenderer.invoke(IPC.STREAM_DISK),
  streamCloseWindow: (): Promise<boolean> => ipcRenderer.invoke(IPC.STREAM_CLOSE_WINDOW),
  onStreamStatus: (cb: (s: StreamStatus) => void): (() => void) => {
    const l = (_e: unknown, st: StreamStatus): void => cb(st)
    ipcRenderer.on(IPC.STREAM_STATUS, l)
    return () => ipcRenderer.removeListener(IPC.STREAM_STATUS, l)
  },
  openRecordings: (path?: string): Promise<boolean> => ipcRenderer.invoke(IPC.STREAM_OPEN_FOLDER, path),
  openYoutubeStudio: (): Promise<void> => ipcRenderer.invoke(IPC.STREAM_OPEN_STUDIO),
  pickBackgroundImage: (): Promise<PickedMedia | null> =>
    ipcRenderer.invoke(IPC.MEDIA_PICK, 'image'),
  pickBackgroundVideo: (): Promise<PickedMedia | null> =>
    ipcRenderer.invoke(IPC.MEDIA_PICK, 'video'),
  pickAudio: (): Promise<PickedMedia | null> => ipcRenderer.invoke(IPC.MEDIA_PICK, 'audio'),
  pickLogo: (): Promise<PickedMedia | null> => ipcRenderer.invoke(IPC.MEDIA_PICK, 'logo'),
  openOutput: (displayId?: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC.OUTPUT_OPEN, displayId),
  closeOutput: (): Promise<boolean> => ipcRenderer.invoke(IPC.OUTPUT_CLOSE),
  toggleOutputFullscreen: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.OUTPUT_TOGGLE_FULLSCREEN),

  // 데이터 폴더 / 설정 / DB (M1)
  getDataDir: (): Promise<DataDirInfo> => ipcRenderer.invoke(IPC.DATADIR_GET),
  chooseDataDir: (): Promise<DataDirInfo> => ipcRenderer.invoke(IPC.DATADIR_CHOOSE),
  openDataDir: (): Promise<string> => ipcRenderer.invoke(IPC.DATADIR_OPEN),
  getSetting: (key: string): Promise<string | null> => ipcRenderer.invoke(IPC.SETTINGS_GET, key),
  setSetting: (key: string, value: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, key, value),
  dbStats: (): Promise<DbStats> => ipcRenderer.invoke(IPC.DB_STATS),
  exportBackup: (): Promise<string | null> => ipcRenderer.invoke(IPC.BACKUP_EXPORT),
  importBackup: (): Promise<boolean> => ipcRenderer.invoke(IPC.BACKUP_IMPORT),

  // 곡/가사 (M2)
  listSongs: (filter: SongFilter): Promise<SongListItem[]> =>
    ipcRenderer.invoke(IPC.SONG_LIST, filter),
  getSong: (id: number): Promise<SongDetail | null> => ipcRenderer.invoke(IPC.SONG_GET, id),
  saveSong: (input: SongInput): Promise<number> => ipcRenderer.invoke(IPC.SONG_SAVE, input),
  deleteSong: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.SONG_DELETE, id),
  /** 유사 제목 곡 묶음 조회 / 하나로 합치기 */
  dupGroups: (): Promise<DupGroup[]> => ipcRenderer.invoke(IPC.SONG_DUP_GROUPS),
  mergeSongs: (keepId: number, removeIds: number[]): Promise<number> =>
    ipcRenderer.invoke(IPC.SONG_DUP_MERGE, keepId, removeIds),
  /** 가져올 파일/폴더 선택 (취소 시 []) */
  pickImportFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.SONG_IMPORT_PICK),
  /** 텍스트/JSON/PPTX 파일(또는 폴더)에서 곡 가져오기 */
  importSongs: (paths: string[], opts: ImportOptions): Promise<ImportReport> =>
    ipcRenderer.invoke(IPC.SONG_IMPORT, paths, opts),
  setSongFavorite: (id: number, favorite: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SONG_FAVORITE, id, favorite),
  touchSong: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.SONG_TOUCH, id),
  setSongBackground: (songId: number, mediaId: number | null): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SONG_SET_BG, songId, mediaId),

  // 플레이리스트 (M4)
  listPlaylists: (): Promise<Playlist[]> => ipcRenderer.invoke(IPC.PLAYLIST_LIST),
  /** 순서지 텍스트 해석(미리보기, 쓰기 없음) */
  resolveOrder: (text: string, translation: string): Promise<OrderResolvedLine[]> =>
    ipcRenderer.invoke(IPC.ORDER_RESOLVE, text, translation),
  /** 순서지 확정 → 말씀 저장 + 플레이리스트 생성 */
  applyOrder: (name: string, items: OrderApplyItem[]): Promise<OrderApplyResult> =>
    ipcRenderer.invoke(IPC.ORDER_APPLY, name, items),
  /** 플레이리스트/곡/말씀 → PPTX 파일 (취소하면 null) */
  exportPptx: (req: PptxExportRequest): Promise<PptxExportResult | null> => ipcRenderer.invoke(IPC.EXPORT_PPTX, req),
  createPlaylist: (name: string): Promise<number> => ipcRenderer.invoke(IPC.PLAYLIST_CREATE, name),
  renamePlaylist: (id: number, name: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.PLAYLIST_RENAME, id, name),
  deletePlaylist: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.PLAYLIST_DELETE, id),
  playlistItems: (playlistId: number): Promise<PlaylistItem[]> =>
    ipcRenderer.invoke(IPC.PLAYLIST_ITEMS, playlistId),
  addPlaylistItem: (
    playlistId: number,
    itemType: PlaylistItemType,
    refId: number | null,
    note: string | null = null
  ): Promise<number> => ipcRenderer.invoke(IPC.PLAYLIST_ADD, playlistId, itemType, refId, note),
  removePlaylistItem: (itemId: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC.PLAYLIST_REMOVE, itemId),
  reorderPlaylistItems: (playlistId: number, orderedIds: number[]): Promise<boolean> =>
    ipcRenderer.invoke(IPC.PLAYLIST_REORDER, playlistId, orderedIds),

  // 성경 (M4b)
  listBible: (search?: string): Promise<BibleListItem[]> =>
    ipcRenderer.invoke(IPC.BIBLE_LIST, search),
  getBible: (id: number): Promise<BibleDetail | null> => ipcRenderer.invoke(IPC.BIBLE_GET, id),
  saveBible: (input: BibleInput): Promise<number> => ipcRenderer.invoke(IPC.BIBLE_SAVE, input),
  deleteBible: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.BIBLE_DELETE, id),
  /** 구절 표기("요 3:16") → 본문 (설치된 번역본 코드 필요) */
  lookupBible: (ref: string, code: string): Promise<BibleLookupResult> =>
    ipcRenderer.invoke(IPC.BIBLE_TEXT_LOOKUP, ref, code),
  listBibleTranslations: (): Promise<BibleTranslationInfo[]> => ipcRenderer.invoke(IPC.BIBLE_TEXT_TRANSLATIONS),
  installBundledBible: (): Promise<number> => ipcRenderer.invoke(IPC.BIBLE_TEXT_INSTALL_BUNDLED),
  pickBibleTextFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.BIBLE_TEXT_IMPORT_PICK),
  importBibleText: (paths: string[], code: string, name: string): Promise<BibleTextImportReport> =>
    ipcRenderer.invoke(IPC.BIBLE_TEXT_IMPORT, paths, code, name),
  removeBibleTranslation: (code: string): Promise<boolean> => ipcRenderer.invoke(IPC.BIBLE_TEXT_REMOVE, code),

  // 악보 가사 추출 (M6)
  /** 악보 이미지/PDF 여러 장 선택 (HEIC는 JPG로 자동 변환, PDF는 relPath가 .pdf로 반환됨) */
  pickScores: (): Promise<PickedMedia[]> => ipcRenderer.invoke(IPC.SCORE_PICK),
  /** PDF 페이지를 렌더러에서 PNG로 변환한 결과를 악보 이미지로 저장 */
  saveScorePage: (pngBase64: string, name: string): Promise<PickedMedia> =>
    ipcRenderer.invoke(IPC.SCORE_SAVE_PAGE, pngBase64, name),
  extractScore: (relPaths: string[], method: ExtractMethod, opts?: ExtractOptions): Promise<ExtractResult> =>
    ipcRenderer.invoke(IPC.SCORE_EXTRACT, relPaths, method, opts ?? {}),
  hasGeminiKey: (): Promise<boolean> => ipcRenderer.invoke(IPC.GEMINI_HAS_KEY),
  setGeminiKey: (key: string): Promise<boolean> => ipcRenderer.invoke(IPC.GEMINI_SET_KEY, key),

  // 온라인 주보 (M7)
  listBulletins: (): Promise<BulletinListItem[]> => ipcRenderer.invoke(IPC.BULLETIN_LIST),
  getBulletin: (id: number): Promise<(BulletinData & { id: number }) | null> =>
    ipcRenderer.invoke(IPC.BULLETIN_GET, id),
  saveBulletin: (data: BulletinData, id?: number): Promise<number> =>
    ipcRenderer.invoke(IPC.BULLETIN_SAVE, data, id),
  deleteBulletin: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.BULLETIN_DELETE, id),
  publishBulletin: (data: BulletinData): Promise<string | null> =>
    ipcRenderer.invoke(IPC.BULLETIN_PUBLISH, data),
  bulletinQr: (url: string): Promise<string> => ipcRenderer.invoke(IPC.BULLETIN_QR, url)
}

export type SeraphimApi = typeof api

contextBridge.exposeInMainWorld('seraphim', api)
