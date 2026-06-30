// FaithOps AI Studio - Mock Provider
// 실제 AI API 없이도 화면과 흐름이 완전히 동작하도록 입력 기반으로
// 한국어 산출물을 생성한다. 추후 실제 provider 로 교체할 수 있다.

import type { AIProvider } from './provider';
import { OUTPUT_META } from '@/lib/types';
import type { ProjectInput, GeneratedOutput, OutputType } from '@/lib/types';

const REVIEW_TAG = '> ⚠️ 본 자료는 AI가 생성한 **초안**입니다. 신학적 표현과 오탈자는 반드시 사람이 검수하세요.';

function audienceTone(audience: ProjectInput['audience']): string {
  switch (audience) {
    case '아동부':
      return '쉽고 따뜻한 문장, 질문형, 예화 중심';
    case '청소년부':
      return '현실 고민과 정체성, 관계 중심';
    case '청년부':
      return '삶의 결단과 소명, 공동체 중심';
    default:
      return '본문 해석과 삶의 적용의 균형';
  }
}

function ref(input: ProjectInput): string {
  return input.bibleReference || '(본문 미입력)';
}

function genBibleAnalysis(input: ProjectInput): string {
  return `# 본문 관찰 · 해석 — ${ref(input)}

${REVIEW_TAG}

## 1. 본문 요약
${ref(input)} 본문은 하나님께서 인물들의 상황 속에서 어떻게 일하시는지를 보여줍니다.
${input.bibleText ? '입력된 본문 흐름을 따라 사건과 인물의 변화를 중심으로 메시지를 정리합니다.' : '본문 텍스트가 입력되면 더 정밀한 흐름 분석이 가능합니다.'}

## 2. 등장인물
- 하나님 / 예수님: 본문에서 주도적으로 일하시는 분
- 주요 인물: 본문 속에서 부르심과 응답을 보여주는 사람들
- 주변 집단: 메시지의 배경이 되는 무리

## 3. 핵심 사건
- 본문에서 일어나는 결정적 사건과 전환점
- 인물의 태도가 바뀌는 지점

## 4. 핵심 단어
- 반복어와 신학적 핵심어 (예: 사랑, 은혜, 순종, 회복)
- 상징어와 그 의미

## 5. 문맥 분석
- 앞뒤 문맥: 본문 전후의 흐름
- 장르와 배경: 본문이 속한 책의 상황

## 6. 신학적 메시지
- 하나님은 어떤 분이신가
- 인간은 어떤 존재인가
- 본문이 가리키는 복음

## 7. 오해 주의점
- 본문을 행위 공로로만 적용하지 않도록 주의 [검토 필요]
- 인물의 행동을 무비판적으로 모범화하지 않기

## 8. 대상별 적용 (${input.audience})
- 적용 톤: ${audienceTone(input.audience)}
- ${input.audience} 눈높이에 맞는 한 가지 결단으로 좁혀 적용`;
}

function genSermon(input: ProjectInput): string {
  return `# 설교문 초안 — ${ref(input)}
**대상:** ${input.audience} · **유형:** ${input.serviceType} · **길이:** ${input.sermonLength} · **방향:** ${input.tone}

${REVIEW_TAG}

## 설교 제목 후보
1. 하나님이 먼저 찾아오시는 사랑
2. 오늘 우리에게 주시는 부르심
3. 돌아서는 그 자리에서 만나주시는 분

## 핵심 메시지 (한 문장)
하나님은 ${ref(input)} 본문을 통해 우리를 먼저 사랑하시고, 그 사랑에 응답하는 삶으로 부르신다.

---

### 1. 도입 — 우리의 현실
오늘 우리는 ${audienceTone(input.audience).split(',')[0]}으로 시작합니다.
${input.audience} 여러분, 우리는 종종 스스로 자격이 없다고 느낄 때가 있습니다.

### 2. 본문 설명 — ${ref(input)}
본문의 상황과 인물을 살펴봅니다. 하나님은 이 장면에서 분명한 뜻을 보여주십니다.

### 3. 핵심 메시지
본문이 보여주는 하나님의 마음은 "기다림"과 "회복"입니다.
우리의 조건이 아니라 하나님의 은혜가 출발점입니다.

### 4. 적용 — 오늘 우리의 순종
- 개인: 오늘 하나님 앞에 정직하게 나아가기
- 가정/공동체: 서로를 정죄가 아닌 사랑으로 품기

### 5. 결론 — 복음적 초청과 기도
하나님은 지금도 우리를 기다리십니다. 함께 기도합시다.

> (${input.sermonLength} 분량 기준 초안 — 실제 설교 시 예화와 호흡을 더하세요.)`;
}

function genBulletin(input: ProjectInput): string {
  const church = input.churchName || '{{교회명}}';
  const dept = input.departmentName || input.audience;
  const date = input.serviceDate || '{{예배일}}';
  return `# 주보 문안 — ${church} ${dept}

${REVIEW_TAG}

| 항목 | 내용 |
|---|---|
| 예배일 | ${date} |
| 본문 | ${ref(input)} |
| 말씀 제목 | 하나님이 먼저 찾아오시는 사랑 |

## 말씀 요약
하나님은 ${ref(input)} 본문을 통해 우리를 먼저 사랑하시고 기다리십니다.
우리의 자격이 아니라 하나님의 은혜가 모든 회복의 출발점입니다.
오늘 우리는 그 사랑 앞에 응답하도록 부름받았습니다.

## 한 줄 메시지
**"하나님은 오늘도 당신을 기다리고 계십니다."**

## 묵상 질문
1. 나는 어떤 부분에서 하나님께 돌아서야 할까요?
2. 이번 한 주, 그 사랑을 누구에게 전할 수 있을까요?

## 기도 제목
1. 하나님의 사랑을 날마다 누리는 한 주가 되도록
2. ${dept} 공동체가 서로를 사랑으로 품도록

## 가정 나눔 질문
- 우리 가정은 서로에게 어떻게 사랑을 표현하고 있나요?

## 광고
- (담당자 입력란) ____________________________________`;
}

function genPptOutline(input: ProjectInput): string {
  const slides: [number, string, string][] = [
    [1, '표지', `${ref(input)} · ${input.churchName || '교회명'}`],
    [2, '오늘의 질문', '우리는 언제 사랑받는다고 느낄까요?'],
    [3, '본문 소개', `${ref(input)} 함께 읽기`],
    [4, '본문 장면 1', '본문 속 첫 번째 장면'],
    [5, '본문 장면 2', '전환점이 되는 장면'],
    [6, '핵심 메시지', '하나님은 먼저 찾아오시는 분'],
    [7, '적용 1', '오늘 나의 응답'],
    [8, '적용 2', '공동체로서의 응답'],
    [9, '함께 생각하기', '나눔 질문'],
    [10, '기도 제목', '함께 드리는 기도'],
  ];
  const rows = slides
    .map(
      ([n, title, line]) =>
        `### 슬라이드 ${n} — ${title}
- 화면 문구: ${line}
- 발표자 메모: ${title} 장면을 ${input.audience} 눈높이로 설명
- 이미지 설명: ${title} 분위기의 ${input.imageStyle} 이미지
- 이미지 프롬프트: \`${input.imageStyle} 스타일 16:9, ${ref(input)} ${title} 장면, 따뜻하고 평화로운 분위기, 화면 안 한글 텍스트 "${line}" 또렷하게 렌더링\``
    )
    .join('\n\n');
  return `# PPT 구성안 (10장) — ${ref(input)}
**이미지 스타일:** ${input.imageStyle}

${REVIEW_TAG}

${rows}`;
}

function genYoutube(input: ProjectInput): string {
  return `# 유튜브 콘텐츠 패키지 — ${ref(input)}

${REVIEW_TAG}

## 제목 후보
1. 하나님은 아직도 당신을 기다리고 계십니다
2. ${ref(input)}, 오늘 우리에게 주시는 메시지
3. 다시 돌아갈 수 있습니다
4. 먼저 찾아오시는 사랑
5. ${input.audience}와 함께 보는 ${ref(input)}

## 긴 설교 영상 대본 (10~20분)
구어체로 풀어낸 본문 설명 → 핵심 메시지 → 적용 → 기도 흐름.
(설교문 탭의 본문을 카메라 앞 구어체로 전환해 사용)

## 3분 말씀 영상 대본
${ref(input)} 핵심 한 가지를 짧고 분명하게 전달합니다.

## 60초 쇼츠 대본
"우리가 완벽해서가 아닙니다. 하나님은 돌아오는 자를 품으십니다.
오늘 그 사랑 앞으로 한 걸음 나아가 보세요."

## 썸네일 문구
- 아직 늦지 않았습니다
- 하나님은 포기하지 않으십니다

## 설명란
본문: ${ref(input)}
오늘의 말씀 요약과 적용 질문, 그리고 교회 안내를 담습니다.
${input.churchName ? `교회: ${input.churchName}` : ''}

## 고정 댓글
오늘 말씀 중 가장 마음에 남는 한 문장은 무엇이었나요? 댓글로 함께 나눠요. 🙏

## 챕터 타임라인
00:00 인사 / 01:00 본문 읽기 / 03:30 핵심 메시지 / 08:00 적용 / 12:00 기도`;
}

function genSlackReport(input: ProjectInput): string {
  return `\`\`\`
[FaithOps AI Studio 일일보고]

이번 주 본문: ${ref(input)}
대상: ${input.audience} ${input.serviceType}

생성 완료:
- 본문 해석
- 설교문 초안
- 주보 문안
- PPT 구성안
- 유튜브 콘텐츠 패키지

검수 필요:
- 설교문 신학적 표현 확인
- PPT 이미지 문구 오탈자 확인
- 주보 광고란 입력

현재 준비율: 75%
다음 작업: 슬라이드 이미지 생성 및 최종 PPT 조립
\`\`\``;
}

const GENERATORS: Record<OutputType, (input: ProjectInput) => string> = {
  bibleAnalysis: genBibleAnalysis,
  sermon: genSermon,
  bulletin: genBulletin,
  pptOutline: genPptOutline,
  youtube: genYoutube,
  slackReport: genSlackReport,
};

function nowIso(): string {
  return new Date().toISOString();
}

export const mockProvider: AIProvider = {
  name: 'mock',

  async generate(type, input) {
    // 실제 API 호출 대신 짧은 지연으로 생성 경험을 흉내낸다.
    await new Promise((r) => setTimeout(r, 250));
    const output: GeneratedOutput = {
      type,
      title: OUTPUT_META[type].label,
      content: GENERATORS[type](input),
      status: 'draft',
      createdAt: nowIso(),
    };
    return output;
  },

  async generateAll(input, types) {
    const results: GeneratedOutput[] = [];
    for (const type of types) {
      results.push(await this.generate(type, input));
    }
    return results;
  },
};
