import { useEffect, useState } from 'react'
import { DEFAULT_LIVE_STATE, type LiveState } from '@shared/ipc'
import { Stage } from '../components/Stage'

/** Output(송출) 창 — main의 송출 상태를 구독해 전체화면 렌더링 */
export function OutputApp(): JSX.Element {
  const [state, setState] = useState<LiveState>(DEFAULT_LIVE_STATE)

  useEffect(() => {
    let unsub = (): void => {}
    void window.seraphim.getLive().then(setState)
    unsub = window.seraphim.onLive(setState)
    return () => unsub()
  }, [])

  return (
    <div className="w-screen h-screen bg-black">
      <Stage state={state} />
    </div>
  )
}
