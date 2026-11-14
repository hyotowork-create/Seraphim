// main <-> renderer 공유 계약 (IPC 채널 상수 + 타입)
// 이 파일은 main/preload/renderer 모두에서 import 되므로 순수 타입/상수만 둔다.
import { emptyCameraSlots, type CameraPatch, type CameraSlot, type CameraSource } from './stream'
export type { CameraViewState, CameraSlot, CameraSource } from './stream'

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
  BACKUP_EXPORT: 'backup:export',
  BACKUP_IMPORT: 'backup:import',
  // 곡/가사 (M2)
  SONG_LIST: 'song:list',
  SONG_GET: 'song:get',
  SONG_SAVE: 'song:save',
  SONG_DELETE: 'song:delete',
  SONG_FAVORITE: 'song:favorite',
  SONG_TOUCH: 'song:touch',
  SONG_SET_BG: 'song:set-bg',
  SONG_IMPORT_PICK: 'song:import-pick',
  SONG_IMPORT: 'song:import',
  SONG_DUP_GROUPS: 'song:dup-groups',
  SONG_DUP_MERGE: 'song:dup-merge',
  // 플레이리스트 (M4)
  PLAYLIST_LIST: 'playlist:list',
  PLAYLIST_CREATE: 'playlist:create',
  PLAYLIST_RENAME: 'playlist:rename',
  PLAYLIST_DELETE: 'playlist:delete',
  PLAYLIST_ITEMS: 'playlist:items',
  PLAYLIST_ADD: 'playlist:add',
  PLAYLIST_REMOVE: 'playlist:remove',
  PLAYLIST_REORDER: 'playlist:reorder',
  // 순서지 → 플레이리스트 자동 구성
  ORDER_RESOLVE: 'order:resolve',
  ORDER_APPLY: 'order:apply',
  // 자막 → PPTX 내보내기
  EXPORT_PPTX: 'export:pptx',
  // YouTube 라이브 송출 / 녹화
  STREAM_PROBE: 'stream:probe',
  STREAM_CONFIG_GET: 'stream:config-get',
  STREAM_CONFIG_SET: 'stream:config-set',
  STREAM_CONFIG: 'stream:config',
  STREAM_KEY_HAS: 'stream:key-has',
  STREAM_KEY_SET: 'stream:key-set',
  STREAM_PREPARE: 'stream:prepare',
  STREAM_START: 'stream:start',
  STREAM_CHUNK: 'stream:chunk',
  STREAM_STOP: 'stream:stop',
  STREAM_STATUS: 'stream:status',
  STREAM_CLOSE_WINDOW: 'stream:close-window',
  STREAM_OPEN_FOLDER: 'stream:open-folder',
  STREAM_OPEN_STUDIO: 'stream:open-studio',
  STREAM_DISK: 'stream:disk',
  // 성경 (M4b)
  BIBLE_LIST: 'bible:list',
  BIBLE_GET: 'bible:get',
  BIBLE_SAVE: 'bible:save',
  BIBLE_DELETE: 'bible:delete',
  // 성경 본문 DB (구절 입력 → 본문 불러오기)
  BIBLE_TEXT_LOOKUP: 'bible-text:lookup',
  BIBLE_TEXT_TRANSLATIONS: 'bible-text:translations',
  BIBLE_TEXT_INSTALL_BUNDLED: 'bible-text:install-bundled',
  BIBLE_TEXT_IMPORT_PICK: 'bible-text:import-pick',
  BIBLE_TEXT_IMPORT: 'bible-text:import',
  BIBLE_TEXT_REMOVE: 'bible-text:remove',
  // 악보 가사 추출 (M6)
  SCORE_EXTRACT: 'score:extract',
  SCORE_PICK: 'score:pick',
  SCORE_SAVE_PAGE: 'score:save-page',
  GEMINI_SET_KEY: 'gemini:set-key',
  GEMINI_HAS_KEY: 'gemini:has-key',
  // 온라인 주보 (M7)
  BULLETIN_LIST: 'bulletin:list',
  BULLETIN_GET: 'bulletin:get',
  BULLETIN_SAVE: 'bulletin:save',
  BULLETIN_DELETE: 'bulletin:delete',
  BULLETIN_PUBLISH: 'bulletin:publish',
  BULLETIN_QR: 'bulletin:qr'
} as const

/** 찬양 카테고리 */
export const SONG_CATEGORIES = ['새찬송가', '복음성가', '워십', '어린이', '특송'] as const
export type SongCategory = (typeof SONG_CATEGORIES)[number]

export type WindowRole = 'control' | 'output' | 'stream'

/** 가사/자막 오버레이 스타일 (1080p 기준 값, Output에서 해상도에 맞춰 스케일) */
export interface OverlayStyle {
  fontFamily: string
  /** 1080p 기준 px */
  fontSize: number
  color: string
  outlineColor: string
  /** 1080p 기준 px */
  outlineWidth: number
  /** 가로 정렬 */
  align: 'left' | 'center' | 'right'
  /** 세로 정렬 */
  vAlign: 'top' | 'middle' | 'bottom'
  /** 세로 미세 위치 (화면 높이 대비 %, + = 아래로) */
  offsetY: number
  shadow: boolean
}

/** 배경 소스 종류: 단색 / 이미지 / 영상 / 라이브 카메라 */
export type BackgroundKind = 'color' | 'image' | 'video' | 'camera'

export interface Background {
  kind: BackgroundKind
  /** kind==='color' */
  color: string
  /** kind==='image' — 앱 미디어 프로토콜(seraphim-media://) URL */
  imageUrl?: string
  imageName?: string
  /** kind==='video' */
  videoUrl?: string
  videoName?: string
  /** kind==='image'|'video' — media 테이블 id (곡별 배경 저장용) */
  mediaId?: number
  /** kind==='camera' — 'program'(카메라 전환을 따라감, 기본) 또는 카메라 번호(0부터) */
  cameraSource?: CameraSource
  /** @deprecated 예전 단일 카메라 — 카메라 1·2·3(LiveState.cameras)으로 옮김 */
  cameraDeviceId?: string
  cameraLabel?: string
  /** 배경 위에 덧입히는 어둡게(가독성용) 0~1 */
  dim: number
}

/** 슬라이드 전환 효과 */
export interface Transition {
  type: 'none' | 'fade'
  /** 지속 시간 ms */
  durationMs: number
}

export const DEFAULT_TRANSITION: Transition = { type: 'fade', durationMs: 400 }

/** 미디어 선택 종류 */
export type PickKind = 'image' | 'video' | 'audio' | 'score' | 'logo'

/** 악보 가사 추출 방식 */
export type ExtractMethod = 'gemini' | 'ocr'

/** Gemini 모델 (설정 'gemini.model'로 변경 가능 — 모델 종료 시 코드 수정 없이 교체) */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash'
/** 정밀 모드(작은 글자·재시도)용 모델 — 설정 'gemini.model.precise' */
export const DEFAULT_GEMINI_PRECISE_MODEL = 'gemini-3.8-flash'
export const GEMINI_MODEL_CHOICES = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'] as const

/** 긴 변이 이 값 미만이면 "해상도 낮음" 경고 (전송 시 자동 확대) */
export const SCORE_LOW_RES_EDGE = 1200

/** 악보 이미지 안의 영역 (0~1 비율, 이미지 좌상단 기준) */
export interface CropRegion {
  relPath: string
  x: number
  y: number
  w: number
  h: number
}

/** 추출 옵션 */
export interface ExtractOptions {
  /** 정밀 모드: 확대 + 정밀 모델로 바로 시도 */
  precise?: boolean
  /** 지정 시 이미지 전체 대신 이 영역들만 잘라서 전송 */
  regions?: CropRegion[]
}

/** PDF 한 파일에서 변환할 최대 페이지 수 */
export const SCORE_PDF_MAX_PAGES = 20

/** 가사 추출 결과 — 곡 하나 */
export interface ExtractedSong {
  title: string
  verses: { label: string; lines: string[] }[]
}

/** 가사 추출 결과 — 이미지에 곡이 여러 개일 수 있음 */
export interface ExtractResult {
  songs: ExtractedSong[]
  meta: {
    model: string
    /** 정밀 모드로 처리됨 */
    precise: boolean
    /** 1차 결과가 빈약해 정밀 모드로 자동 재시도함 */
    retried: boolean
  }
}

// ── 온라인 주보 (M7) ─────────────────────────────────

export interface BulletinListItem {
  id: number
  serviceDate: string
  churchName: string | null
  serviceType: string | null
}

/** 출력 비율 (프로젝터 대응) */
export type OutputAspect = '16:9' | '4:3' | 'fill'

/** 현재 송출 상태 (main이 단일 진실원으로 보유, Output/프리뷰가 구독) */
export interface LiveState {
  /** 현재 슬라이드 텍스트 (여러 줄 가능) */
  text: string
  /** 검정 화면 (B) */
  blackout: boolean
  /** 로고 화면 (L) */
  showLogo: boolean
  /** 로고 이미지 URL (seraphim-media://). 없으면 "SERAPHIM" 글자 로고 */
  logoUrl: string | null
  /** 일시정지 (P) — 전환 잠금 */
  paused: boolean
  /** 출력 비율 */
  aspect: OutputAspect
  background: Background
  overlay: OverlayStyle
  transition: Transition
  /** 카메라 1·2·3 — 장치와 카메라별 줌/위치 (설정에 저장) */
  cameras: CameraSlot[]
  /** 지금 전환된 카메라 번호 (0부터) */
  activeCamera: number
  /** 모든 창의 카메라 요청 해상도 — 같은 장치를 여러 창이 쓸 때 먼저 연 창의 해상도로 고정되지 않도록 통일 (방송 화질에 맞춤) */
  cameraCapture: { width: number; height: number }
}

export type LivePatch = Partial<Omit<LiveState, 'overlay' | 'background' | 'transition' | 'cameras' | 'activeCamera'>> & {
  overlay?: Partial<OverlayStyle>
  background?: Partial<Background>
  transition?: Partial<Transition>
} & CameraPatch

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
  vAlign: 'middle',
  offsetY: 0,
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
  logoUrl: null,
  paused: false,
  aspect: '16:9',
  background: DEFAULT_BACKGROUND,
  overlay: DEFAULT_OVERLAY,
  transition: DEFAULT_TRANSITION,
  cameras: emptyCameraSlots(),
  activeCamera: 0,
  cameraCapture: { width: 1920, height: 1080 }
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
  /** 이미지 픽셀 크기 (악보 선택 시 채움) */
  width?: number
  height?: number
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
  /** 찬송가 장 번호 (없으면 null) */
  hymnNo: number | null
}

/** 곡 상세 (편집/송출용) */
export interface SongDetail {
  id: number
  title: string
  category: string
  favorite: boolean
  /** 찬송가 장 번호 */
  hymnNo: number | null
  subtitle: string | null
  author: string | null
  copyright: string | null
  /** 곡에 연결된 배경 미디어 id */
  bgMediaId: number | null
  /** 배경 미디어의 앱 URL (main이 상대경로로부터 해석) */
  bgUrl: string | null
  /** 이 곡의 원본 악보 이미지(페이지 순) — 재검수/재추출용 */
  scores: { mediaId: number; url: string }[]
  verses: Verse[]
}

/** 저장 입력 (id 없으면 신규) */
export interface SongInput {
  id?: number
  title: string
  category: string
  favorite?: boolean
  hymnNo?: number | null
  subtitle?: string | null
  author?: string | null
  copyright?: string | null
  verses: { label?: string | null; text: string }[]
  /** 지정 시 곡의 악보 이미지 연결을 전량 교체 (undefined면 유지) */
  scoreMediaIds?: number[]
}

/** 라이브러리 필터 — search는 제목·작사자·장 번호·가사 본문을 함께 검색 */
export interface SongFilter {
  scope: 'all' | 'favorite' | 'recent' | 'category'
  category?: string
  search?: string
}

// ── 순서지 → 플레이리스트 자동 구성 ───────────────────

export interface OrderCandidate {
  id: number
  title: string
  hymnNo: number | null
  category: string
}

/** 해석된 순서지 한 줄 (미리보기·확정용) */
export interface OrderResolvedLine {
  index: number
  raw: string
  kind: 'bible' | 'hymn' | 'song' | 'blank'
  note: string | null
  /** 성경: 해석된 참조와 번역본, 본문 절 수 */
  bible?: { reference: string; book: string; chapter: number; verseRange: string; translation: string; translationName: string; verseCount: number; text: string }
  /** 곡: 확정된 곡(정확히 하나 찾음) */
  song?: OrderCandidate
  /** 곡: 후보 여러 개(사용자 선택 필요) */
  candidates?: OrderCandidate[]
  /** 못 찾음/오류 사유 */
  error?: string
}

export interface OrderApplyItem {
  kind: 'bible' | 'song'
  note: string | null
  songId?: number
  bible?: { book: string; chapter: number; verseRange: string; translation: string; text: string }
}

export interface OrderApplyResult {
  playlistId: number
  itemCount: number
}

// ── 유사 제목 곡 정리 ─────────────────────────────────

export interface DupSong {
  id: number
  title: string
  hymnNo: number | null
  category: string
  author: string | null
  verseCount: number
  lineCount: number
  hasScore: boolean
  playlistCount: number
}

export interface DupGroup {
  /** 묶음 키(정규화 제목) */
  key: string
  songs: DupSong[]
  /** 추천 유지 곡 (장 번호 > 악보 > 가사 분량) */
  recommendedKeepId: number
}

// ── 곡 가져오기 (텍스트 / JSON / PPTX) ─────────────────

export interface ImportOptions {
  /** 장 번호가 없는 곡에 붙일 카테고리 */
  category: string
  /** 같은 장 번호·제목이 있으면 건너뜀(기본) / 덮어쓰기 */
  onDuplicate: 'skip' | 'overwrite'
}

export interface ImportReport {
  imported: number
  overwritten: number
  skipped: number
  /** 파일별 실패 사유 */
  failed: { file: string; reason: string }[]
  /** 처리한 곡 제목(최대 50개, 표시용) */
  titles: string[]
}

// ── 플레이리스트 (M4) ─────────────────────────────────

export type PlaylistItemType = 'song' | 'bible' | 'media' | 'blank' | 'logo'

export interface Playlist {
  id: number
  name: string
  itemCount: number
}

export interface PlaylistItem {
  id: number
  itemType: PlaylistItemType
  refId: number | null
  orderIndex: number
  /** 표시용 제목 (song이면 곡 제목 등) */
  title: string
  /** 부가 정보(카테고리 등) */
  subtitle?: string
  /** 순서지 메모 — "1-3절", "후렴 2번 반복" 등. 절 범위는 송출 시 반영 */
  note: string | null
}

// ── 성경 슬라이드 (M4b) ───────────────────────────────

export interface BibleListItem {
  id: number
  reference: string
  translation: string | null
  verseCount: number
}

export interface BibleDetail {
  id: number
  book: string
  chapter: number
  verseRange: string
  translation: string | null
  reference: string
  text: string
  verses: { label: string | null; text: string }[]
}

export interface BibleInput {
  id?: number
  book: string
  chapter: number
  verseRange: string
  translation?: string | null
  text: string
}

// ── 성경 본문 DB ──────────────────────────────────────

/** 내장 번역본 코드(개역한글, 저작권 만료). 개역개정 등은 교회가 가진 본문 파일을 가져와 추가 */
export const BUNDLED_BIBLE_CODE = 'KRV'
export const BUNDLED_BIBLE_NAME = '개역한글'
/** 앱에서 흔히 쓰는 번역본 코드 → 표시 이름 */
export const BIBLE_TRANSLATION_NAMES: Record<string, string> = {
  KRV: '개역한글',
  NKRV: '개역개정',
  RNKSV: '새번역',
  KOEB: '쉬운성경',
  CTB: '공동번역',
  NIV: 'NIV',
  ESV: 'ESV',
  KJV: 'KJV'
}

export interface BibleTranslationInfo {
  code: string
  name: string
  verseCount: number
  /** 내장 데이터 여부 */
  bundled: boolean
}

export interface BibleLookupResult {
  /** 해석된 참조 표시 ("요한복음 3:16-18") */
  reference: string
  book: string
  chapter: number
  verseRange: string
  translation: string
  translationName: string
  verses: { chapter: number; verse: number; text: string }[]
  /** 편집기 본문 형식("16 하나님이 …" 한 줄 = 한 절) */
  text: string
}

export interface BibleTextImportReport {
  code: string
  name: string
  inserted: number
  /** 형식을 해석하지 못한 줄 수 */
  unparsed: number
  files: string[]
}

// ── 자막 → PPTX 내보내기 ─────────────────────────────

export interface PptxExportRequest {
  /** 셋 중 하나 */
  playlistId?: number
  songId?: number
  bibleId?: number
  /** 곡·말씀마다 제목 슬라이드 넣기 */
  titleSlides: boolean
  /** 절 라벨(1절·후렴)을 왼쪽 위에 작게 표시 */
  showLabels: boolean
  /** 배경 이미지·어둡게 포함 (끄면 배경색만) */
  includeBackground: boolean
  /** 저장 대화상자 없이 이 경로에 저장 (테스트용) */
  outPath?: string
}

export interface PptxExportResult {
  path: string
  slides: number
  /** 옮기지 못한 항목(동영상 배경 등) 안내 */
  warnings: string[]
}
