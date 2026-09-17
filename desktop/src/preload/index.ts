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
  type SongDetail
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
  pickBackgroundImage: (): Promise<PickedMedia | null> => ipcRenderer.invoke(IPC.MEDIA_PICK),
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

  // 곡/가사 (M2)
  listSongs: (filter: SongFilter): Promise<SongListItem[]> =>
    ipcRenderer.invoke(IPC.SONG_LIST, filter),
  getSong: (id: number): Promise<SongDetail | null> => ipcRenderer.invoke(IPC.SONG_GET, id),
  saveSong: (input: SongInput): Promise<number> => ipcRenderer.invoke(IPC.SONG_SAVE, input),
  deleteSong: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.SONG_DELETE, id),
  setSongFavorite: (id: number, favorite: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SONG_FAVORITE, id, favorite),
  touchSong: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.SONG_TOUCH, id)
}

export type SeraphimApi = typeof api

contextBridge.exposeInMainWorld('seraphim', api)
