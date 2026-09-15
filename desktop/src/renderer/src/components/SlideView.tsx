import type { CSSProperties } from 'react'
import type { LiveState } from '@shared/ipc'

interface Props {
  state: LiveState
  /** 1080p 기준 값에 곱할 스케일 (Output 해상도 대응). 프리뷰는 컨테이너 높이/1080 */
  scale: number
}

/**
 * 자막/가사 렌더러 — Control 프리뷰와 Output 송출이 동일 컴포넌트를 공유.
 * 흰색 글자 + 검정 외곽선/그림자로 어떤 배경에서도 가독성 확보.
 */
export function SlideView({ state, scale }: Props): JSX.Element {
  if (state.blackout) {
    return <div className="w-full h-full bg-black" />
  }

  const bg: CSSProperties = { background: state.background || '#000' }

  if (state.showLogo) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={bg}>
        <div
          className="font-bold tracking-[0.3em] text-white/90 select-none"
          style={{ fontSize: 64 * scale, textShadow: '0 4px 16px rgba(0,0,0,.7)' }}
        >
          SERAPHIM
        </div>
      </div>
    )
  }

  const o = state.overlay
  const textStyle: CSSProperties = {
    fontFamily: o.fontFamily,
    fontSize: o.fontSize * scale,
    color: o.color,
    textAlign: o.align,
    lineHeight: 1.28,
    fontWeight: 700,
    whiteSpace: 'pre-wrap',
    wordBreak: 'keep-all',
    padding: `0 ${6 * scale}%`,
    WebkitTextStrokeWidth: `${o.outlineWidth * scale}px`,
    WebkitTextStrokeColor: o.outlineColor,
    paintOrder: 'stroke fill',
    textShadow: o.shadow ? `0 ${4 * scale}px ${14 * scale}px rgba(0,0,0,.85)` : 'none',
    maxHeight: '100%',
    overflow: 'hidden'
  }

  const justify =
    o.align === 'left' ? 'justify-start' : o.align === 'right' ? 'justify-end' : 'justify-center'

  return (
    <div className={`w-full h-full flex items-center ${justify}`} style={bg}>
      <div style={textStyle} className="w-full">
        {state.text || ' '}
      </div>
    </div>
  )
}
