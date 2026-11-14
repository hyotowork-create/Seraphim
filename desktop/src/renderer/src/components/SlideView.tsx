import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Background, LiveState } from '@shared/ipc'
import { DEFAULT_CAMERA_VIEW, cameraTransformCss, resolveCameraLayers, type CameraSlot, type CameraSource, type CameraViewState } from '@shared/stream'

const DEFAULT_CAMERA_IDEAL = { width: 1920, height: 1080 }

interface Props {
  state: LiveState
  /** 1080p 기준 값에 곱할 스케일 (Output 해상도 대응). 프리뷰는 컨테이너 높이/1080 */
  scale: number
  /** 프리뷰에서 카메라 실제 스트림 대신 표시만 (기본 false = 실제 렌더) */
  cameraPlaceholder?: boolean
  /** 방송 하단 자막: 글자 뒤에 아래쪽 어두운 띠를 깐다 */
  band?: boolean
  /** 카메라 요청 해상도 (방송 창은 방송 화질에 맞춤) */
  cameraIdeal?: { width: number; height: number }
}

/**
 * 라이브 카메라 — getUserMedia로 지정 장치를 실시간 렌더.
 * 기본 1080p를 요청하고(방송 창은 화질에 맞춰 더 크게), 카메라가 못 주면 가능한 최대로 받는다(아이폰 연속성 카메라는 1080p까지).
 * 줌/위치는 디지털(CSS)로 적용해 어떤 카메라에서도 같게 동작한다.
 */
export function CameraView({
  deviceId,
  view = DEFAULT_CAMERA_VIEW,
  ideal = DEFAULT_CAMERA_IDEAL
}: {
  deviceId?: string
  view?: CameraViewState
  ideal?: { width: number; height: number }
}): JSX.Element {
  const ref = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    setError(null)

    navigator.mediaDevices
      .getUserMedia({
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: ideal.width },
          height: { ideal: ideal.height },
          frameRate: { ideal: 30 }
        },
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
  }, [deviceId, ideal.width, ideal.height])

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-slate-400 text-sm gap-2">
        <span>📷</span>
        <span>{error}</span>
      </div>
    )
  }
  return (
    <div className="w-full h-full overflow-hidden">
      <video
        ref={ref}
        className="w-full h-full object-cover"
        style={{ ...cameraTransformCss(view), transition: 'transform 300ms ease, transform-origin 300ms ease' }}
        data-camera-zoom={view.zoom}
        muted
        playsInline
      />
    </div>
  )
}

/**
 * 카메라 1·2·3 겹쳐 두기 — 출처가 '카메라 전환 따라감'이면 설정된 카메라를 모두 미리 재생해 두고
 * 전환된 카메라만 보이게 한다(검은 화면 없이 바로 바뀜, 페이드 설정이면 서서히).
 */
export function CameraStack({
  slots,
  active,
  source,
  ideal,
  fadeMs = 0
}: {
  slots: CameraSlot[]
  active: number
  source: CameraSource
  ideal?: { width: number; height: number }
  fadeMs?: number
}): JSX.Element {
  const { layers, visible } = resolveCameraLayers(slots, active, source)
  if (!layers.length) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-slate-400 text-sm gap-2">
        <span>📷</span>
        <span>{typeof source === 'number' ? `카메라 ${source + 1}이(가) 연결되지 않았습니다` : '연결된 카메라가 없습니다 (프리뷰 아래 카메라 칸에서 연결)'}</span>
      </div>
    )
  }
  return (
    // isolate: 카메라 칸끼리의 z-index가 위의 가사·띠를 덮지 않도록 여기서 쌓임 맥락을 닫는다
    <div className="relative w-full h-full bg-black isolate" data-camera-stack>
      {layers.map(({ index, slot }) => (
        <div
          key={index}
          className="absolute inset-0"
          data-camera-slot={index}
          data-camera-visible={index === visible ? '1' : '0'}
          style={{ opacity: index === visible ? 1 : 0, transition: `opacity ${fadeMs}ms ease`, zIndex: index === visible ? 1 : 0 }}
        >
          <CameraView deviceId={slot.deviceId ?? undefined} view={slot.view} ideal={ideal} />
        </div>
      ))}
    </div>
  )
}

function BackgroundLayer({
  bg,
  state,
  cameraPlaceholder,
  cameraIdeal
}: {
  bg: Background
  state: LiveState
  cameraPlaceholder?: boolean
  cameraIdeal?: { width: number; height: number }
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
    const source = bg.cameraSource ?? 'program'
    if (cameraPlaceholder) {
      const vis = resolveCameraLayers(state.cameras, state.activeCamera, source).visible
      const slot = vis != null ? state.cameras[vis] : null
      return (
        <div className="w-full h-full flex items-center justify-center bg-black text-slate-400 text-sm gap-2">
          <span>📷</span>
          <span>{slot ? `카메라 ${vis! + 1} · ${slot.label || '카메라'}` : '카메라 없음'}</span>
          {slot && slot.view.zoom > 1 && <span className="text-slate-500">· {slot.view.zoom.toFixed(1)}×</span>}
        </div>
      )
    }
    const fadeMs = state.transition?.type === 'fade' ? state.transition.durationMs : 0
    return (
      <CameraStack slots={state.cameras} active={state.activeCamera} source={source} ideal={cameraIdeal ?? state.cameraCapture} fadeMs={fadeMs} />
    )
  }
  return <div className="w-full h-full" style={{ background: bg.color || '#000' }} />
}

/**
 * 자막/가사 렌더러 — Control 프리뷰와 Output 송출이 동일 컴포넌트를 공유.
 * 배경(색상/이미지/카메라) 위에 어둡게(dim) 레이어, 그 위에 흰색+검정 외곽선 가사.
 */
export function SlideView({ state, scale, cameraPlaceholder, band, cameraIdeal }: Props): JSX.Element {
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
        <BackgroundLayer bg={state.background} state={state} cameraPlaceholder={cameraPlaceholder} cameraIdeal={cameraIdeal} />
      </div>
      {/* 가독성용 어둡게 레이어 */}
      {state.background.dim > 0 && (
        <div
          className="absolute inset-0 bg-black pointer-events-none"
          style={{ opacity: state.background.dim }}
        />
      )}
      {/* 방송 하단 자막용 어두운 띠 (가사가 있을 때만) */}
      {band && !state.showLogo && state.text.trim() && (
        <div
          className="absolute inset-x-0 bottom-0 h-[42%] pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,.45) 55%, rgba(0,0,0,0))' }}
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
          state.logoUrl ? (
            <div className="w-full h-full flex items-center justify-center">
              <img
                src={state.logoUrl}
                alt="로고"
                draggable={false}
                className="select-none"
                style={{ maxWidth: '60%', maxHeight: '60%', objectFit: 'contain', filter: 'drop-shadow(0 4px 16px rgba(0,0,0,.6))' }}
              />
            </div>
          ) : (
            <div
              className="w-full text-center font-bold tracking-[0.3em] text-white/90 select-none"
              style={{ fontSize: 64 * scale, textShadow: '0 4px 16px rgba(0,0,0,.7)' }}
            >
              SERAPHIM
            </div>
          )
        ) : (
          <div style={textStyle} className="w-full">
            {state.text || ' '}
          </div>
        )}
      </div>
    </div>
  )
}
