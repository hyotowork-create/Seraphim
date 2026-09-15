import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type LiveState,
  type LivePatch,
  type DisplayInfo,
  type WindowRole
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
  pickBackgroundImage: (): Promise<{ url: string; name: string } | null> =>
    ipcRenderer.invoke(IPC.MEDIA_PICK_IMAGE),
  openOutput: (displayId?: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC.OUTPUT_OPEN, displayId),
  closeOutput: (): Promise<boolean> => ipcRenderer.invoke(IPC.OUTPUT_CLOSE),
  toggleOutputFullscreen: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.OUTPUT_TOGGLE_FULLSCREEN)
}

export type SeraphimApi = typeof api

contextBridge.exposeInMainWorld('seraphim', api)
