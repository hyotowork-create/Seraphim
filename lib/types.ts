// FaithOps AI Studio - 공통 데이터 타입

export type Audience = '아동부' | '청소년부' | '청년부' | '장년부';

export type OutputType =
  | 'bibleAnalysis'
  | 'sermon'
  | 'bulletin'
  | 'pptOutline'
  | 'youtube'
  | 'slackReport';

export type OutputStatus = 'draft' | 'reviewed' | 'approved';

export interface ProjectInput {
  bibleReference: string;
  bibleText: string;
  audience: Audience;
  serviceType: string;
  sermonLength: string;
  tone: string;
  imageStyle: string;
  churchName?: string;
  departmentName?: string;
  serviceDate?: string;
  outputs: OutputType[];
}

export interface GeneratedOutput {
  type: OutputType;
  title: string;
  /** 사람이 바로 읽고 복사할 수 있는 마크다운/텍스트 본문 */
  content: string;
  status: OutputStatus;
  createdAt: string;
}

export interface FaithOpsProject {
  id: string;
  input: ProjectInput;
  outputs: GeneratedOutput[];
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export const OUTPUT_META: Record<
  OutputType,
  { label: string; short: string; description: string }
> = {
  bibleAnalysis: {
    label: '본문 분석',
    short: '본문 분석',
    description: '관찰 · 해석 · 핵심 메시지',
  },
  sermon: {
    label: '설교문',
    short: '설교문',
    description: '대상별 설교문 초안',
  },
  bulletin: {
    label: '주보 문안',
    short: '주보',
    description: '말씀 요약 · 묵상 질문 · 기도제목',
  },
  pptOutline: {
    label: 'PPT 구성안',
    short: 'PPT',
    description: '10장 내외 슬라이드 구성',
  },
  youtube: {
    label: '유튜브 패키지',
    short: '유튜브',
    description: '제목 · 대본 · 썸네일 · 설명란',
  },
  slackReport: {
    label: 'Slack 보고',
    short: 'Slack',
    description: '사역 운영 일일보고 초안',
  },
};

export const ALL_OUTPUT_TYPES: OutputType[] = [
  'bibleAnalysis',
  'sermon',
  'bulletin',
  'pptOutline',
  'youtube',
  'slackReport',
];

export const AUDIENCES: Audience[] = ['아동부', '청소년부', '청년부', '장년부'];

export const SERVICE_TYPES = ['주일예배', '절기예배', '특별예배', '교육 콘텐츠'];

export const SERMON_LENGTHS = ['5분', '10분', '20분', '30분'];

export const TONES = ['복음 중심', '적용 중심', '교육 중심', '절기 중심'];

export const IMAGE_STYLES = [
  '어린이 성경 그림책',
  '수채화',
  '성경 애니메이션',
  '실사풍',
];
