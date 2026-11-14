import { useEffect, useState } from 'react'
import { DEFAULT_LIVE_STATE, type LiveState } from '@shared/ipc'
import { streamViewState, type StreamConfig } from '@shared/stream'
import { Stage } from '../components/Stage'

/**
 * Output(송출) 창 — main의 송출 상태를 구독해 전체화면 렌더링.
 * role=stream(방송 전용 숨은 창)이면 방송 설정의 화면 구성(송출 그대로 / 카메라 + 하단 자막)으로 그린다.
 */
export function OutputApp(): JSX.Element {
  const [state, setState] = useState<LiveState>(DEFAULT_LIVE_STATE)
  const isStream = window.seraphim.role === 'stream'
  const [cfg, setCfg] = useState<StreamConfig | null>(null)

  useEffect(() => {
    let unsub = (): void => {}
    void window.seraphim.getLive().then(setState)
    unsub = window.seraphim.onLive(setState)
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!isStream) return
    void window.seraphim.getStreamConfig().then(setCfg)
    return window.seraphim.onStreamConfig(setCfg)
  }, [isStream])

  if (isStream) {
    const view = cfg ? streamViewState(state, cfg) : { ...state, aspect: 'fill' as const }
    return (
      <div className="w-screen h-screen bg-black relative overflow-hidden">
        <Stage state={view} band={cfg?.layout === 'lowerThird'} />
        {/* 화면이 멈춰 있어도 캡처 프레임이 끊기지 않도록 눈에 안 보이는 2px 깜빡임 (정지 화면에서 방송이 끊기는 것 방지) */}
        <style>{'@keyframes seraphimBeat { from { opacity: .02 } to { opacity: .05 } }'}</style>
        <div
          data-stream-heartbeat
          style={{ position: 'fixed', right: 0, bottom: 0, width: 2, height: 2, background: '#000', animation: 'seraphimBeat 0.5s linear infinite alternate', pointerEvents: 'none' }}
        />
      </div>
    )
  }

  return (
    <div className="w-screen h-screen bg-black">
      <Stage state={state} />
    </div>
  )
}
