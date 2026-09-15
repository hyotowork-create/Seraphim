import { useEffect, useState } from 'react'
import { DEFAULT_LIVE_STATE, type LiveState } from '@shared/ipc'
import { SlideView } from '../components/SlideView'

/** Output(송출) 창 — main의 송출 상태를 구독해 전체화면 렌더링 */
export function OutputApp(): JSX.Element {
  const [state, setState] = useState<LiveState>(DEFAULT_LIVE_STATE)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    let unsub = (): void => {}
    void window.seraphim.getLive().then(setState)
    unsub = window.seraphim.onLive(setState)
    return () => unsub()
  }, [])

  // 1080p 기준 값 → 실제 창 높이에 맞춰 스케일
  useEffect(() => {
    const update = (): void => setScale(window.innerHeight / 1080)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <div className="w-screen h-screen bg-black">
      <SlideView state={state} scale={scale} />
    </div>
  )
}
