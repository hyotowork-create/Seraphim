# FaithOps AI Studio

**본문기반 예배 콘텐츠 자동화 스튜디오**

성경본문 하나를 입력하면 설교문, 주보, PPT 구성안, 유튜브 콘텐츠 패키지,
Slack 일일보고가 한 번에 생성되는 웹 대시보드입니다. (1차 MVP)

> 이 시스템의 시작점은 유튜브 링크나 기존 설교 자료가 아니라 **오직 성경본문**입니다.

---

## 핵심 기능 (1차 MVP)

| 기능 | 설명 |
|---|---|
| 성경본문 입력 | 본문 주소 + 본문 텍스트 직접 입력 |
| 본문 분석 | 관찰 · 해석 · 핵심 메시지 |
| 설교문 생성 | 대상별 설교문 초안 |
| 주보 문안 | 말씀 요약 · 묵상 질문 · 기도제목 |
| PPT 구성안 | 10장 내외 슬라이드 + 이미지 프롬프트 |
| 유튜브 패키지 | 제목 · 대본 · 썸네일 · 설명란 |
| Slack 보고 | 일일보고 초안 + Webhook 전송 |
| 대시보드 | 탭별 확인 · 복사 · 다시 생성 · 검수 상태 · 보관함 |

---

## 기술 스택

- **Next.js 14 (App Router)** + **TypeScript**
- **Tailwind CSS** (shadcn 스타일 경량 UI 컴포넌트)
- **AI Provider 추상화** — 현재 `mockProvider` 로 동작하며, OpenAI / Claude /
  Gemini 등 실제 모델로 교체 가능 (`lib/ai/provider.ts`)
- **localStorage** 기반 프로젝트 저장 (추후 Supabase/SQLite 로 교체 가능)

---

## 실행 방법

```bash
npm install
cp .env.example .env.local   # 선택: AI/Slack 설정
npm run dev                  # http://localhost:3000
```

API 키가 없어도 **mock provider** 로 전체 흐름이 동작합니다.

### 빌드

```bash
npm run build
npm start
```

---

## 폴더 구조

```text
app/
  page.tsx                 홈
  create/page.tsx          본문 입력
  projects/page.tsx        자료 보관함 (프로젝트 목록)
  results/[id]/page.tsx    결과 대시보드 (탭)
  api/generate/route.ts    산출물 생성 API
  api/slack/route.ts       Slack 전송 API
components/
  BibleInputForm, OutputTabs, OutputCard, ProgressDashboard,
  CopyButton, Markdown, ui/*
lib/
  ai/{provider, mockProvider, prompts}.ts
  storage.ts  slack.ts  types.ts  utils.ts
data/
  sample-project.json
```

---

## AI 모델 교체 방법

`lib/ai/provider.ts` 의 `getProvider()` 에서 `AI_PROVIDER` 환경변수에 따라
provider 를 선택합니다. 실제 모델 provider 는 `AIProvider` 인터페이스
(`generate`, `generateAll`) 를 구현해 등록하면 화면 코드 변경 없이 교체됩니다.

```ts
aiProvider.generate('sermon', input)
aiProvider.generateAll(input, types)
```

---

## 산출물 품질 원칙

- 모든 결과물은 **AI 초안**이며 사람의 검수가 필요합니다 (각 산출물에 표시).
- 성경본문을 최우선 근거로 삼고, 본문에 없는 내용을 단정하지 않습니다.
- 어린이 대상 자료는 공포 · 폭력 · 정죄 중심 표현을 피합니다.
- 성경 번역본 저작권을 고려해 본문 텍스트는 사용자가 직접 입력합니다.

---

## 제외 범위 (1차 MVP)

실제 PPT/이미지 자동 생성, 네이버 블로그 자동 발행, 유튜브 자동 업로드,
QR 실시간 퀴즈, 사용자 계정/권한, 다중 교회 SaaS 구조는 2차 이후 과제입니다.
