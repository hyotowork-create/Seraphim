// main <-> renderer 공유 계약 (IPC 채널 상수 + 타입)
// 이 파일은 main/preload/renderer 모두에서 import 되므로 순수 타입/상수만 둔다.

export const IPC = {
  LIVE_GET: 'live:get',
  LIVE_SET: 'live:set',
  LIVE_STATE: 'live:state',
  OUTPUT_OPEN: 'output:open',
  OUTPUT_CLOSE: 'output:close',
  OUTPUT_TOGGLE_FULLSCREEN: 'output:toggle-fullscreen',
  DISPLAYS_LIST: 'displays:list',
  MEDIA_PICK: 'media:pick',
  // 데이터 폴더 / 설정 / DB (M1)
  DATADIR_GET: 'datadir:get',
  DATADIR_CHOOSE: 'datadir:choose',
  DATADIR_OPEN: 'datadir:open',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  DB_STATS: 'db:stats',
  // 곡/가사 (M2)
  SONG_LIST: 'song:list',
  SONG_GET: 'song:get',
  SONG_SAVE: 'song:save',
  SONG_DELETE: 'song:delete',
  SONG_FAVORITE: 'song:favorite',
  SONG_TOUCH: 'song:touch'
} as const

/** 찬양 카테고리 */
export const SONG_CATEGORIES = ['새찬송가', '복음성가', '워십', '어린이', '특송'] as const
export type SongCategory = (typeof SONG_CATEGORIES)[number]

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

/** 배경 소스 종류: 단색 / 이미지 / 라이브 카메라 */
export type BackgroundKind = 'color' | 'image' | 'camera'

export interface Background {
  kind: BackgroundKind
  /** kind==='color' */
  color: string
  /** kind==='image' — 앱 미디어 프로토콜(seraphim-media://) URL */
  imageUrl?: string
  imageName?: string
  /** kind==='camera' — MediaDeviceInfo.deviceId */
  cameraDeviceId?: string
  cameraLabel?: string
  /** 배경 위에 덧입히는 어둡게(가독성용) 0~1 */
  dim: number
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
  background: Background
  overlay: OverlayStyle
}

export type LivePatch = Partial<Omit<LiveState, 'overlay' | 'background'>> & {
  overlay?: Partial<OverlayStyle>
  background?: Partial<Background>
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

export const DEFAULT_BACKGROUND: Background = {
  kind: 'color',
  color: '#000000',
  dim: 0
}

export const DEFAULT_LIVE_STATE: LiveState = {
  text: '',
  blackout: false,
  showLogo: false,
  paused: false,
  background: DEFAULT_BACKGROUND,
  overlay: DEFAULT_OVERLAY
}

// ── 데이터 폴더 / DB (M1) ─────────────────────────────

/** 데이터 폴더 위치·상태 */
export interface DataDirInfo {
  /** 데이터 저장 폴더 (SQLite DB + 미디어) */
  dataDir: string
  /** seraphim.db 절대경로 */
  dbPath: string
  /** 동기화 폴더(구글드라이브/드롭박스/원드라이브) 위에 있는 것으로 추정되는지 */
  looksSynced: boolean
}

/** DB 현황 (설정 화면 표시용) */
export interface DbStats {
  schemaVersion: number
  songs: number
  verses: number
  playlists: number
  bibleSlides: number
  media: number
}

export type MediaType =
  | 'background'
  | 'video'
  | 'overlay'
  | 'logo'
  | 'audio'
  | 'score'

/** 미디어 파일 (데이터 폴더 기준 상대경로 저장) */
export interface MediaRow {
  id: number
  type: MediaType
  /** 데이터 폴더 기준 상대경로 (예: 'media/backgrounds/uuid.png') */
  relPath: string
  name: string
}

/** 미디어 선택 결과 — url은 seraphim-media://local/<relPath> */
export interface PickedMedia {
  id: number
  url: string
  relPath: string
  name: string
}

// ── 곡/가사 (M2) ──────────────────────────────────────

export interface Verse {
  id: number
  label: string | null
  orderIndex: number
  text: string
}

/** 라이브러리 목록용 요약 */
export interface SongListItem {
  id: number
  title: string
  category: string
  favorite: boolean
  verseCount: number
}

/** 곡 상세 (편집/송출용) */
export interface SongDetail {
  id: number
  title: string
  category: string
  favorite: boolean
  subtitle: string | null
  author: string | null
  copyright: string | null
  verses: Verse[]
}

/** 저장 입력 (id 없으면 신규) */
export interface SongInput {
  id?: number
  title: string
  category: string
  favorite?: boolean
  subtitle?: string | null
  author?: string | null
  copyright?: string | null
  verses: { label?: string | null; text: string }[]
}

/** 라이브러리 필터 */
export interface SongFilter {
  scope: 'all' | 'favorite' | 'recent' | 'category'
  category?: string
  search?: string
}
