import { create } from 'zustand'
import { DEFAULT_LIVE_STATE, type LiveState, type LivePatch } from '@shared/ipc'

interface LiveStore {
  state: LiveState
  ready: boolean
  /** main으로부터 받은 상태를 반영 (브로드캐스트 수신) */
  _sync: (s: LiveState) => void
  /** main에 패치 전송 → 응답으로 로컬 반영 */
  patch: (p: LivePatch) => Promise<void>
  /** 초기화: 현재 상태 로드 + 구독 시작 */
  init: () => Promise<() => void>
}

export const useLive = create<LiveStore>((set) => ({
  state: DEFAULT_LIVE_STATE,
  ready: false,
  _sync: (s) => set({ state: s, ready: true }),
  patch: async (p) => {
    const next = await window.seraphim.setLive(p)
    set({ state: next })
  },
  init: async () => {
    const current = await window.seraphim.getLive()
    set({ state: current, ready: true })
    const unsub = window.seraphim.onLive((s) => set({ state: s }))
    return unsub
  }
}))
