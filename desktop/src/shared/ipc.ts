// main <-> renderer 공유 계약 (IPC 채널 상수 + 타입)
// 이 파일은 main/preload/renderer 모두에서 import 되므로 순수 타입/상수만 둔다.

export const IPC = {
  LIVE_GET: 'live:get',
  LIVE_SET: 'live:set',
  LIVE_STATE: 'live:state',
  OUTPUT_OPEN: 'output:open',
  OUTPUT_CLOSE: 'output:close',
  OUTPUT_TOGGLE_FULLSCREEN: 'output:toggle-fullscreen',
  DISPLAYS_LIST: 'displays:list'
} as const

export type WindowRole = 'control' | 'output'

/** 가사/자막 오버레이 스타일 (1080p 기준 값, Output에서 해상도에 맞춰 스케일) */
export interface OverlayStyle {
  fontFamily: string
  /** 1080p 기준 px */
  fontSize: number
  color: string
  outlineColor: string
  /** 1080p 기준 px */
  outlineWidth: number
  align: 'left' | 'center' | 'right'
  shadow: boolean
}

/** 현재 송출 상태 (main이 단일 진실원으로 보유, Output/프리뷰가 구독) */
export interface LiveState {
  /** 현재 슬라이드 텍스트 (여러 줄 가능) */
  text: string
  /** 검정 화면 (B) */
  blackout: boolean
  /** 로고 화면 (L) */
  showLogo: boolean
  /** 일시정지 (P) — 전환 잠금 */
  paused: boolean
  /** 배경 (M0: CSS 색상. 이후 배경 이미지/영상으로 확장) */
  background: string
  overlay: OverlayStyle
}

export type LivePatch = Partial<Omit<LiveState, 'overlay'>> & {
  overlay?: Partial<OverlayStyle>
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  primary: boolean
}

export const DEFAULT_OVERLAY: OverlayStyle = {
  fontFamily:
    "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif",
  fontSize: 72,
  color: '#ffffff',
  outlineColor: '#000000',
  outlineWidth: 4,
  align: 'center',
  shadow: true
}

export const DEFAULT_LIVE_STATE: LiveState = {
  text: '',
  blackout: false,
  showLogo: false,
  paused: false,
  background: '#000000',
  overlay: DEFAULT_OVERLAY
}
