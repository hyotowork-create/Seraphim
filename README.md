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
- **AI Provider 추상화** (`lib/ai/provider.ts`)
  - **Claude(Opus 4.8) 실제 연동** — `ANTHROPIC_API_KEY` 설정 시 실제 LLM 이 산출물 생성
  - **mockProvider** — 키가 없을 때 자동 폴백(데모/오프라인)
  - OpenAI / Gemini 등도 동일 인터페이스로 추가 가능
- **localStorage** 기반 프로젝트 저장 (추후 Supabase/SQLite 로 교체 가능)

---

## 실행 방법

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 를 채우면 실제 Claude 로 생성
npm run dev                  # http://localhost:3000
```

### 동작 모드

| 조건 | provider | 결과 |
|---|---|---|
| `ANTHROPIC_API_KEY` 설정 | **claude** | Claude(Opus 4.8) 가 실제 산출물 생성 |
| 키 없음 | **mock** | 입력 기반 더미 생성 (데모용, 키 불필요) |

- `.env.local` 에 `ANTHROPIC_API_KEY=sk-ant-...` 만 넣으면 자동으로 실제 생성으로 전환됩니다.
- `AI_PROVIDER=mock` 으로 강제 지정하면 키가 있어도 데모 모드로 동작합니다.
- 실제 생성 중 일부 산출물이 일시 오류(rate limit 등)로 실패하면 **해당 항목만** mock 으로
  폴백해 전체 생성이 중단되지 않습니다.

### 빌드

```bash
npm run build
npm start
```

---

## Vercel 배포

표준 Next.js 앱이라 별도 설정 없이 배포됩니다. (저장소 루트에 앱이 있음)

### 방법 A — GitHub 연동 (권장)

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → 이 저장소 선택
2. Framework: **Next.js** (자동 감지), Root Directory: `./`, 기본값 그대로 **Deploy**
3. 배포 후 **Settings → Environment Variables** 에 추가:
   - `ANTHROPIC_API_KEY = sk-ant-...` (실제 Claude 생성용)
   - (선택) `SLACK_WEBHOOK_URL`, `AI_PROVIDER`
4. **Deployments → Redeploy** 로 환경변수 반영

### 방법 B — Vercel CLI

```bash
npm i -g vercel
vercel                       # 최초 1회: 프로젝트 연결
vercel env add ANTHROPIC_API_KEY
vercel --prod                # 프로덕션 배포
```

### ⚠️ 함수 타임아웃 (중요)

`/api/generate` 는 실제 Claude 로 최대 6개 산출물을 병렬 생성하므로 시간이 걸립니다.
`maxDuration = 60` 으로 설정되어 있습니다.

- **Hobby(무료) 플랜**: 함수 최대 **60초**. 전체 패키지 생성이 60초에 근접할 수 있으니,
  필요하면 입력 화면에서 **산출물을 나눠 생성**하세요.
- **Pro 플랜**: 최대 300초까지 가능 (`maxDuration` 을 더 늘릴 수 있음).
- `ANTHROPIC_API_KEY` 미설정 시에는 mock 으로 즉시 생성되어 타임아웃과 무관합니다.

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

## AI 모델 구조 / 교체 방법

`lib/ai/provider.ts` 의 `getProvider()` 가 `AI_PROVIDER` 와 `ANTHROPIC_API_KEY` 를
보고 provider 를 선택합니다. 모든 provider 는 동일한 `AIProvider` 인터페이스
(`generate`, `generateAll`) 를 구현하므로 화면/API 코드 변경 없이 교체됩니다.

```ts
aiProvider.generate('sermon', input)        // 단일 산출물
aiProvider.generateAll(input, types)        // 여러 산출물 병렬 생성
```

- `lib/ai/claudeProvider.ts` — Claude(Opus 4.8) 연동. 스트리밍 + adaptive 토큰 처리,
  산출물 병렬 생성. 프롬프트는 `lib/ai/prompts.ts` 의 템플릿을 그대로 사용.
- 다른 모델(OpenAI, Gemini)도 `AIProvider` 를 구현해 `getProvider()` 의 switch 에
  한 줄 추가하면 됩니다.

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
