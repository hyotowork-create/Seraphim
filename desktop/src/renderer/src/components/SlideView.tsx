import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Background, LiveState } from '@shared/ipc'

interface Props {
  state: LiveState
  /** 1080p 기준 값에 곱할 스케일 (Output 해상도 대응). 프리뷰는 컨테이너 높이/1080 */
  scale: number
  /** 프리뷰에서 카메라 실제 스트림 대신 표시만 (기본 false = 실제 렌더) */
  cameraPlaceholder?: boolean
}

/** 라이브 카메라 배경 — getUserMedia로 지정 장치를 실시간 렌더 */
function CameraView({ deviceId }: { deviceId?: string }): JSX.Element {
  const ref = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    setError(null)

    navigator.mediaDevices
      .getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (ref.current) {
          ref.current.srcObject = s
          void ref.current.play().catch(() => {})
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : '카메라를 열 수 없습니다')
      })

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [deviceId])

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-slate-400 text-sm gap-2">
        <span>📷</span>
        <span>{error}</span>
      </div>
    )
  }
  return <video ref={ref} className="w-full h-full object-cover" muted playsInline />
}

function BackgroundLayer({
  bg,
  cameraPlaceholder
}: {
  bg: Background
  cameraPlaceholder?: boolean
}): JSX.Element {
  if (bg.kind === 'image' && bg.imageUrl) {
    return (
      <img src={bg.imageUrl} alt="" className="w-full h-full object-cover" draggable={false} />
    )
  }
  if (bg.kind === 'video' && bg.videoUrl) {
    return (
      <video
        key={bg.videoUrl}
        src={bg.videoUrl}
        className="w-full h-full object-cover"
        autoPlay
        loop
        muted
        playsInline
      />
    )
  }
  if (bg.kind === 'camera') {
    if (cameraPlaceholder) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black text-slate-400 text-sm gap-2">
          <span>📷</span>
          <span>{bg.cameraLabel || '라이브 카메라'}</span>
        </div>
      )
    }
    return <CameraView deviceId={bg.cameraDeviceId} />
  }
  return <div className="w-full h-full" style={{ background: bg.color || '#000' }} />
}

/**
 * 자막/가사 렌더러 — Control 프리뷰와 Output 송출이 동일 컴포넌트를 공유.
 * 배경(색상/이미지/카메라) 위에 어둡게(dim) 레이어, 그 위에 흰색+검정 외곽선 가사.
 */
export function SlideView({ state, scale, cameraPlaceholder }: Props): JSX.Element {
  if (state.blackout) {
    return <div className="w-full h-full bg-black" />
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
  const vClass =
    o.vAlign === 'top' ? 'items-start' : o.vAlign === 'bottom' ? 'items-end' : 'items-center'

  const fade = state.transition?.type === 'fade'
  const dur = state.transition?.durationMs ?? 0
  const contentKey = `${state.showLogo ? 'logo' : 'text'}|${state.text}`

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* 배경 레이어 */}
      <div className="absolute inset-0">
        <BackgroundLayer bg={state.background} cameraPlaceholder={cameraPlaceholder} />
      </div>
      {/* 가독성용 어둡게 레이어 */}
      {state.background.dim > 0 && (
        <div
          className="absolute inset-0 bg-black pointer-events-none"
          style={{ opacity: state.background.dim }}
        />
      )}
      {/* 콘텐츠 (로고 / 가사) — 전환 시 페이드 인 (key 변경으로 애니메이션 재생) */}
      <div
        key={fade ? contentKey : undefined}
        className={`absolute inset-0 flex ${vClass} ${justify} py-[4%]`}
        style={{
          transform: o.offsetY ? `translateY(${o.offsetY}%)` : undefined,
          animation: fade && dur > 0 ? `seraphimFade ${dur}ms ease` : undefined
        }}
      >
        {state.showLogo ? (
          <div
            className="w-full text-center font-bold tracking-[0.3em] text-white/90 select-none"
            style={{ fontSize: 64 * scale, textShadow: '0 4px 16px rgba(0,0,0,.7)' }}
          >
            SERAPHIM
          </div>
        ) : (
          <div style={textStyle} className="w-full">
            {state.text || ' '}
          </div>
        )}
      </div>
    </div>
  )
}
