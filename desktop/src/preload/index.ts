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
  type BibleInput
} from '../shared/ipc'

function resolveRole(): WindowRole {
  const arg = process.argv.find((a) => a.startsWith('--seraphim-role='))
  const role = arg?.split('=')[1]
  return role === 'output' ? 'output' : 'control'
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
  pickBackgroundImage: (): Promise<PickedMedia | null> =>
    ipcRenderer.invoke(IPC.MEDIA_PICK, 'image'),
  pickBackgroundVideo: (): Promise<PickedMedia | null> =>
    ipcRenderer.invoke(IPC.MEDIA_PICK, 'video'),
  pickAudio: (): Promise<PickedMedia | null> => ipcRenderer.invoke(IPC.MEDIA_PICK, 'audio'),
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
  setSongFavorite: (id: number, favorite: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SONG_FAVORITE, id, favorite),
  touchSong: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.SONG_TOUCH, id),
  setSongBackground: (songId: number, mediaId: number | null): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SONG_SET_BG, songId, mediaId),

  // 플레이리스트 (M4)
  listPlaylists: (): Promise<Playlist[]> => ipcRenderer.invoke(IPC.PLAYLIST_LIST),
  createPlaylist: (name: string): Promise<number> => ipcRenderer.invoke(IPC.PLAYLIST_CREATE, name),
  renamePlaylist: (id: number, name: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.PLAYLIST_RENAME, id, name),
  deletePlaylist: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.PLAYLIST_DELETE, id),
  playlistItems: (playlistId: number): Promise<PlaylistItem[]> =>
    ipcRenderer.invoke(IPC.PLAYLIST_ITEMS, playlistId),
  addPlaylistItem: (
    playlistId: number,
    itemType: PlaylistItemType,
    refId: number | null
  ): Promise<number> => ipcRenderer.invoke(IPC.PLAYLIST_ADD, playlistId, itemType, refId),
  removePlaylistItem: (itemId: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC.PLAYLIST_REMOVE, itemId),
  reorderPlaylistItems: (playlistId: number, orderedIds: number[]): Promise<boolean> =>
    ipcRenderer.invoke(IPC.PLAYLIST_REORDER, playlistId, orderedIds),

  // 성경 (M4b)
  listBible: (search?: string): Promise<BibleListItem[]> =>
    ipcRenderer.invoke(IPC.BIBLE_LIST, search),
  getBible: (id: number): Promise<BibleDetail | null> => ipcRenderer.invoke(IPC.BIBLE_GET, id),
  saveBible: (input: BibleInput): Promise<number> => ipcRenderer.invoke(IPC.BIBLE_SAVE, input),
  deleteBible: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.BIBLE_DELETE, id)
}

export type SeraphimApi = typeof api

contextBridge.exposeInMainWorld('seraphim', api)
