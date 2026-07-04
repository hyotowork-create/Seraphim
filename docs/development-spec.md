# 교회학교 도구 — 상세 개발 명세서 (SaaS 전환)

> 작성일: 2026-07-04
> 상위 문서: [`subscription-plan.md`](./subscription-plan.md)
> 확정 전제: **과금 모델 A+C** · **개인 교사 우선 → 교회 확장** · **텍스트 구독 포함 / 이미지 크레딧 별도**

이 문서는 결정된 사업 방향을 실제 구현으로 옮기기 위한 **API 설계 · DB 스키마 · 화면
흐름 · 플랜별 한도/크레딧 단가**를 정의합니다. 대상 코드는 단일 파일 도구
`tools/tool-v6.html`이며, 이미 존재하는 프롬프트 빌더(`buildSysPlan`,
`buildSysBulletin`, `buildSysLesson`, `buildSysScript`)와 렌더 로직은 그대로 재사용하고,
**AI 호출부(`callGeminiText` / 이미지 생성)만 서버 경유로 교체**하는 것을 원칙으로 합니다.

---

## 1. 시스템 아키텍처

```
[브라우저(기존 HTML/JS)]
   │  fetch('/api/...') + 세션 쿠키
   ▼
[Edge/Serverless API 계층]  ← 인증·구독·한도 검증, 서버 보관 키로만 AI 호출
   │                         ├─ Supabase Auth (카카오/이메일)
   │                         ├─ Postgres (사용자·구독·사용량·크레딧·생성이력)
   │                         └─ PortOne 정기결제 Webhook
   ▼
[Gemini API]  (텍스트: gemini-2.x / 이미지: Nano Banana)
```

- **보안 1원칙:** API 키는 서버 환경변수에만 존재. 프런트로 절대 내려보내지 않음.
- 모든 AI 호출은 `(로그인됨) AND (구독 유효) AND (한도/크레딧 잔여)` 검증 통과 후에만 실행.

### 산출물 타입 (기존 도구 기준)

| 타입 | 빌더 함수 | 과금 분류 |
|---|---|---|
| 기획(설교/커리큘럼) | `buildSysPlan` | 텍스트 — 월 한도 회수 차감 |
| 주보 | `buildSysBulletin` | 텍스트 — 구독 내 무제한 |
| 공과 | `buildSysLesson` | 텍스트 — 구독 내 무제한 |
| 설교 스크립트 | `buildSysScript` | 텍스트 — 구독 내 무제한 |
| 이미지 프롬프트(16장 세트) | 프롬프트 파서 | 텍스트 — 구독 내 무제한 |
| **실제 이미지 생성(Nano Banana)** | 이미지 엔드포인트 | **크레딧 별도 차감** |

---

## 2. API 설계

모든 응답은 JSON. 인증은 Supabase 세션 쿠키(HttpOnly). 실패 시 표준 에러 바디
`{ "error": { "code": "...", "message": "..." } }`.

### 2.1 인증/계정

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/api/auth/kakao` | 카카오 OAuth 콜백 → 세션 발급 |
| `POST` | `/api/auth/logout` | 세션 파기 |
| `GET` | `/api/me` | 현재 사용자·소속교회·플랜·잔여 한도/크레딧 |

`GET /api/me` 응답 예:
```json
{
  "user": { "id": "u_123", "email": "t@church.kr", "name": "홍길동" },
  "org": { "id": "o_9", "name": "은혜교회", "role": "teacher" },
  "plan": "personal",
  "period": { "start": "2026-07-01", "end": "2026-07-31" },
  "quota": { "plan": { "used": 3, "limit": 10 } },
  "credits": { "image": 84 }
}
```

### 2.2 생성 (핵심)

| 메서드 | 경로 | 과금 |
|---|---|---|
| `POST` | `/api/generate/text` | 타입별. `plan`이면 회수 차감, 그 외 무제한 |
| `POST` | `/api/generate/image` | 이미지 크레딧 차감 (장수만큼) |

`POST /api/generate/text` 요청:
```json
{ "type": "plan|bulletin|lesson|script|imagePrompt",
  "department": "yeong-a|yu-a|yu-nyeon|cho-deung|jung-go",
  "inputs": { "theme": "...", "passage": "...", "tone": "...", "weeks": 4 } }
```
서버 처리 순서:
1. 세션 검증 → 구독 유효 여부 확인
2. `type === 'plan'`이면 `quota.plan.used < limit` 확인, 아니면 통과
3. 서버에서 해당 `buildSys*` 시스템 프롬프트 구성 → Gemini 텍스트 호출
4. 토큰 사용량 기록(`usage_events`), 필요 시 카운터 증가
5. 결과 + 갱신된 잔여 한도 반환

`POST /api/generate/image` 요청:
```json
{ "prompts": ["...", "..."], "ratio": "1:1", "count": 16 }
```
- **선차감·실패환불** 원칙: `count`만큼 크레딧 홀드 → 성공한 장수만 확정 차감,
  실패분은 자동 환불(사용자가 실패 이미지에 과금되지 않도록).

### 2.3 사용량/결제

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/usage?period=YYYY-MM` | 기간별 사용량/토큰/이미지 통계 |
| `GET` | `/api/history` | 생성 이력(페이지네이션) |
| `POST` | `/api/billing/subscribe` | 플랜 구독 시작(PortOne billing key) |
| `POST` | `/api/billing/credits` | 이미지 크레딧 팩 구매 |
| `POST` | `/api/billing/webhook` | PortOne 결제 승인/정기결제 Webhook |

### 2.4 교회(기관) 관리 — 모델 C

| 메서드 | 경로 | 권한 |
|---|---|---|
| `POST` | `/api/org/invite` | admin — 교사 계정 초대 |
| `DELETE` | `/api/org/members/:id` | admin — 좌석 회수 |
| `GET` | `/api/org/stats` | admin — 부서별/교사별 사용 통계 |

---

## 3. DB 스키마 (PostgreSQL / Supabase)

```sql
-- 교회(기관) — 모델 C. 개인 사용자는 org 없이도 동작.
CREATE TABLE orgs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  seat_limit  INT  NOT NULL DEFAULT 5,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  org_id      UUID REFERENCES orgs(id) ON DELETE SET NULL,
  org_role    TEXT CHECK (org_role IN ('admin','teacher')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 구독: 개인은 user_id, 교회는 org_id에 귀속(둘 중 하나).
CREATE TABLE subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  org_id        UUID REFERENCES orgs(id)  ON DELETE CASCADE,
  plan          TEXT NOT NULL CHECK (plan IN ('free','personal','church')),
  status        TEXT NOT NULL CHECK (status IN ('active','past_due','canceled')),
  billing_key   TEXT,                         -- PortOne 정기결제 키
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  CHECK (num_nonnulls(user_id, org_id) = 1)
);

-- 월별 사용량 카운터(기획 회수 등 한도 차감 대상).
CREATE TABLE usage_counters (
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  period          DATE NOT NULL,              -- 해당 월 1일
  plan_used       INT  NOT NULL DEFAULT 0,    -- 기획 사용 회수
  PRIMARY KEY (subscription_id, period)
);

-- 이미지 크레딧 잔액(텍스트와 분리 과금).
CREATE TABLE image_credits (
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  owner_org_id  UUID REFERENCES orgs(id)  ON DELETE CASCADE,
  balance       INT NOT NULL DEFAULT 0,
  CHECK (num_nonnulls(owner_user_id, owner_org_id) = 1)
);

-- 원가 추적·감사용 개별 호출 로그.
CREATE TABLE usage_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id),
  kind          TEXT NOT NULL,   -- 'plan'|'bulletin'|'lesson'|'script'|'imagePrompt'|'image'
  department    TEXT,
  in_tokens     INT,
  out_tokens    INT,
  image_count   INT DEFAULT 0,
  cost_usd      NUMERIC(10,5),   -- 실측 단가 반영 원가
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 생성 결과 이력(재열람/다운로드).
CREATE TABLE generations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT,
  payload     JSONB,           -- 결과 텍스트/프롬프트/이미지 참조
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> Supabase Row Level Security로 `user_id = auth.uid()` 또는 동일 `org_id`만 접근 허용.

---

## 4. 화면 흐름

```
랜딩 ──► 카카오 로그인 ──► 대시보드
                              ├─ [생성] 부서 선택 → 타입 선택 → 입력 → 결과
                              │        (기획은 "잔여 N회" 표시, 이미지는 "크레딧 N" 표시)
                              ├─ [이력] 과거 생성물 재열람/다운로드(PPTX 등)
                              ├─ [사용량] 이번 달 기획 회수·이미지·토큰 그래프
                              ├─ [결제] 플랜 업그레이드 / 크레딧 팩 구매
                              └─ [교회관리] (admin만) 교사 초대·좌석·부서별 통계
```

기존 도구 화면은 그대로 [생성] 탭 안으로 편입. 변경점은:
- 상단에 **로그인 상태 + 잔여 한도/크레딧 배지**
- 기획 실행 버튼 옆 **"이번 달 3/10회"** 카운터 (기존 `refreshCount` 재활용)
- 이미지 생성 버튼에 **"16장 = 16크레딧 차감"** 사전 고지 + 잔액 부족 시 결제 유도

---

## 5. 플랜별 한도 · 크레딧 단가

### 5.1 플랜 한도

| 항목 | 무료 체험 | 개인 | 교회 |
|---|---|---|---|
| 월 요금 | 0원 | 11,900원(가안) | 59,000원(가안) |
| 부서 5종 | 전체 | 전체 | 전체 |
| 기획(`plan`) | 1회(가입 시) | **월 10회** | **월 30회(공유)** |
| 주보/공과/스크립트/이미지 프롬프트 | 체험 1세트 | **무제한** | **무제한** |
| 이미지 생성 | 없음 | 크레딧 구매 | 크레딧 구매 |
| 교사 좌석 | 1 | 1 | **5** |
| 부서별 사용 통계 | — | — | ✅ |
| 우선 지원 | — | — | ✅ |

> 가격 숫자는 4절 "비용 실측" 완료 후 확정. 여기서는 한도 구조만 고정.

### 5.2 이미지 크레딧

- **1 크레딧 = 이미지 1장 생성.** 프롬프트 텍스트 생성은 구독에 포함(크레딧 소모 없음),
  실제 이미지 렌더링만 크레딧 차감.
- 팩 예시(가안): 100장 팩 / 300장 팩 / 500장 팩 — 대용량일수록 장당 단가 인하.
- **실패 자동 환불**: 생성 실패 장수는 차감하지 않음(2.2 선차감·실패환불 로직).
- 크레딧은 이월 정책 명시 필요(예: 유효기간 12개월). — 정책 결정 필요.

---

## 6. 비용 실측 시뮬레이션 (구독가 확정 전 필수)

기존 도구 실측치: **기획 1회 ≈ 합계 약 5,200토큰**(입력 ~300 / 출력 ~3,000 관측 + 시스템
프롬프트 포함). 이를 기준으로 개인 플랜 헤비 유저 원가를 추정.

| 시나리오 | 월 사용량 | 텍스트 토큰(추정) | 비고 |
|---|---|---|---|
| 라이트 개인 | 기획 3 + 주보/공과 10 | ≈ 5.2K×3 + 3K×10 ≈ 45K | 원가 미미 |
| 헤비 개인 | 기획 10(한도) + 부속물 40 | ≈ 5.2K×10 + 3K×40 ≈ 172K | 여전히 텍스트는 저렴 |
| 이미지 사용자 | 위 + 이미지 100장 | 이미지가 **원가 대부분** | 크레딧으로 별도 회수 |

- **핵심 결론:** 텍스트는 한도만 걸면 원가 리스크 낮음 → 구독 포함이 합리적.
  **적자 포인트는 이미지 1장 단가** → 반드시 크레딧으로 분리 회수(이번 결정과 일치).
- **다음 액션:** 실제 Gemini 텍스트/Nano Banana 이미지 단가를 대입해
  `cost_usd` 컬럼 기준 1인당 월 원가를 산출 → `원가 + PG수수료(~3%) + 마진`으로
  개인 11,900 / 교회 59,000 가안을 검증·확정.

---

## 7. 구현 우선순위 (MVP 최소 절단선)

1. Supabase Auth(카카오) + `users`/`subscriptions` 최소 테이블
2. `/api/generate/text` 서버 경유화 (기존 `callGeminiText` 대체) + `plan` 한도 차감
3. PortOne 개인 단일 플랜 정기결제 + Webhook
4. 대시보드 [생성]/[사용량] 최소 화면
5. (그다음) 이미지 크레딧(`/api/generate/image` + 팩 구매)
6. (그다음) 교회 플랜: `orgs`/좌석/부서별 통계

> MVP는 **개인 텍스트 구독**까지만으로도 "과금 가능한 서비스" 성립. 이미지 크레딧과
> 교회 플랜은 검증 후 순차 추가(사업안 로드맵 1→2→3 단계와 일치).
