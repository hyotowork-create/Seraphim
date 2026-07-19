# 서버(MVP 1~2단계) — 서버 경유 AI 호출

`development-spec.md` 7절 우선순위의 **1(인증/DB) + 2(서버 경유 텍스트 생성)**를 구현한
최소 스캐폴드입니다. 기존 도구(`tools/tool-v6.html`)의 프롬프트 로직을 그대로 이식하고,
**AI 호출만 서버로 옮겨** 키를 감추고 구독·한도를 검증합니다.

## 구성

```
db/migrations/0001_init.sql   DB 스키마 (Supabase/Postgres)
server/lib/
  presets.mjs                 부서/톤 프리셋 (도구와 동일 값)
  prompts.mjs                 buildSys* 프롬프트 빌더 (dept/tone 인자화)
  gemini.mjs                  서버 전용 Gemini 텍스트/이미지 클라이언트
  plans.mjs                   플랜 한도·크레딧 팩·원가 단가 (cost-model.md 동기화)
  account.mjs                 인증·구독·한도 차감·크레딧 홀드/환불
api/
  me.mjs                      GET  /api/me
  generate/text.mjs           POST /api/generate/text
  generate/image.mjs          POST /api/generate/image
```

## 배포 전제 (Vercel)

- `api/**/*.mjs` 는 Vercel Serverless Functions 로 자동 매핑 (`req`, `res` 시그니처).
- Node 18+ (전역 `fetch` 사용).
- 루트는 Eleventy(CommonJS) 사이트라 `package.json` 에 `type: module` 을 두지 않고,
  서버 코드만 `.mjs` 확장자로 ESM 처리합니다.

## 셋업

1. `.env.example` → `.env` 복사 후 값 채우기 (Gemini/Supabase 키).
2. Supabase 프로젝트 생성 → `db/migrations/0001_init.sql` 실행.
3. Supabase Auth 에 카카오/이메일 프로바이더 설정.
4. `npm install` (─ `@supabase/supabase-js`), `npm run check:api` 로 문법 확인.
5. Vercel 프로젝트에 동일 환경변수 등록 후 배포.

## API 요약

| 메서드 | 경로 | 인증 | 과금 |
|---|---|---|---|
| GET  | `/api/me` | Bearer | — |
| POST | `/api/generate/text` | Bearer | `type=plan` 이면 월 한도 1 차감, 그 외 무제한 |
| POST | `/api/generate/image` | Bearer | 장수만큼 크레딧 선차감, 실패분 자동 환불 |

`/api/generate/text` 요청 예:
```json
{ "type": "plan", "department": "middle",
  "inputs": { "passage": "요한복음 3:16", "trendMonths": 3 } }
```
후속 산출물(script/bulletin/lesson/imagePrompt)은 `inputs.plan` 에 기획 텍스트를 넣어 호출.

## 아직 안 한 것 (다음 단계)

- 카카오 OAuth 콜백 라우트, PortOne 정기결제/Webhook (3단계)
- 대시보드 UI, 도구의 호출부를 `callGeminiText` → `/api/generate/text` 로 교체 (4단계)
- `usage_counters` 원자적 증가용 Postgres 함수(동시성 강화)
- 이미지 배치 API 전환(원가 절반)
