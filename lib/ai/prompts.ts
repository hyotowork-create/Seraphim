// FaithOps AI Studio - 프롬프트 설계 (섹션 9)
// 실제 모델 연동 시 이 템플릿들을 그대로 사용한다.
// mock provider 도 동일한 입력 구조를 기준으로 동작한다.

import type { ProjectInput, OutputType } from '@/lib/types';

/** 모든 생성 프롬프트가 공유하는 공통 원칙 (섹션 9.1) */
export const COMMON_PRINCIPLES = `너는 보수적이고 균형 잡힌 성경해석 보조자다.
다음 원칙을 반드시 지켜라.
1. 성경본문을 최우선 근거로 삼는다.
2. 본문에 없는 내용을 단정하지 않는다. 본문 근거와 적용을 구분한다.
3. 청중 대상에 맞게 언어 수준을 조절한다.
4. 설교문, 주보, PPT, 유튜브 메시지의 핵심을 일관되게 유지한다.
5. 결과물은 사람이 검수해야 하는 "초안"이다.
6. 신학적 논쟁 가능성이 있는 표현은 [검토 필요] 표시를 한다.
7. 어린이 대상 자료는 공포, 폭력, 정죄 중심 표현을 피한다.`;

function inputBlock(input: ProjectInput): string {
  return `[입력 정보]
- 성경본문: ${input.bibleReference}
- 본문 텍스트: ${input.bibleText || '(사용자 미입력)'}
- 대상: ${input.audience}
- 예배 유형: ${input.serviceType}
- 설교 길이: ${input.sermonLength}
- 설교 방향: ${input.tone}
- 이미지 스타일: ${input.imageStyle}
- 교회명: ${input.churchName || '(미입력)'}
- 부서명: ${input.departmentName || '(미입력)'}
- 예배일: ${input.serviceDate || '(미입력)'}`;
}

const TASK_INSTRUCTIONS: Record<OutputType, string> = {
  bibleAnalysis: `[작업] 입력된 본문을 설교 준비에 사용할 수 있도록 관찰 → 해석 → 적용 순서로 분석하라.
다음 항목을 포함하라: 본문 요약, 등장인물, 핵심 사건, 핵심 단어, 문맥 분석, 신학적 메시지, 오해 주의점, 대상별 적용.`,
  sermon: `[작업] 본문 분석과 설교 기획을 바탕으로 현장에서 실제 말할 수 있는 설교문을 작성하라.
도입 → 본문 설명 → 핵심 메시지 → 적용 → 결론(복음적 초청과 기도) 구조를 따르라.
대상과 설교 길이에 맞게 분량과 언어 수준을 조절하라.`,
  bulletin: `[작업] 주보에 들어갈 문안을 작성하라.
포함 항목: 이번 주 말씀 제목, 본문, 말씀 요약(3~5문장), 한 줄 메시지, 묵상 질문(2~3개), 기도 제목(2~3개), 가정 나눔 질문, 광고 자리 표시.`,
  pptOutline: `[작업] 설교 흐름에 맞는 10장 내외의 슬라이드 구성안을 작성하라.
각 슬라이드마다 번호, 제목, 화면 문구, 발표자 메모, 이미지 설명, 이미지 프롬프트를 제시하라.`,
  youtube: `[작업] 본문을 기준으로 유튜브 업로드용 콘텐츠 패키지를 작성하라.
포함 항목: 제목 후보 5개, 긴 설교 영상 대본 개요, 3분 말씀 대본, 60초 쇼츠 대본, 썸네일 문구, 설명란, 고정 댓글, 챕터 타임라인.`,
  slackReport: `[작업] 생성된 콘텐츠 상태와 미완료 작업을 정리한 Slack 일일보고 메시지를 작성하라.
포함 항목: 이번 주 본문/대상, 생성 완료 목록, 검수 필요 목록, 현재 준비율, 다음 작업.`,
};

/** 출력 유형별 최종 프롬프트를 조립한다. */
export function buildPrompt(type: OutputType, input: ProjectInput): string {
  return [
    COMMON_PRINCIPLES,
    inputBlock(input),
    TASK_INSTRUCTIONS[type],
    '결과는 사람이 바로 읽고 복사할 수 있도록 한국어 마크다운 형식으로 작성하라.',
  ].join('\n\n');
}
