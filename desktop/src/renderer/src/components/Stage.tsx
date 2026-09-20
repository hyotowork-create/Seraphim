import { useEffect, useRef, useState } from 'react'
import type { LiveState } from '@shared/ipc'
import { SlideView } from './SlideView'

interface Props {
  state: LiveState
  /** 프리뷰에서 카메라 실제 스트림 대신 표시만 */
  cameraPlaceholder?: boolean
}

const RATIO: Record<string, number | null> = { '16:9': 16 / 9, '4:3': 4 / 3, fill: null }

/**
 * 출력 무대 — 지정 비율(16:9/4:3)로 레터박스 처리한 중앙 박스 안에 SlideView 렌더.
 * 'fill'은 화면 전체를 채운다. 스케일은 박스 높이/1080 기준.
 */
export function Stage({ state, cameraPlaceholder }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ratio = RATIO[state.aspect] ?? null
  let boxW = size.w
  let boxH = size.h
  if (ratio && size.w > 0 && size.h > 0) {
    boxW = Math.min(size.w, size.h * ratio)
    boxH = boxW / ratio
  }
  const scale = boxH > 0 ? boxH / 1080 : 0.3

  return (
    <div ref={ref} className="w-full h-full bg-black flex items-center justify-center overflow-hidden">
      <div className="relative" style={{ width: boxW || '100%', height: boxH || '100%' }}>
        {scale > 0 && <SlideView state={state} scale={scale} cameraPlaceholder={cameraPlaceholder} />}
      </div>
    </div>
  )
}
