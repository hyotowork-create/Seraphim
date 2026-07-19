# 배포 방안 (Deployment Plan)

> 작성일: 2026-07-19
> 대상: Eleventy 정적 사이트 + `api/**` 서버리스 함수 + Supabase(DB/Auth) + PortOne(결제)
> 원칙: **작게 시작, 키는 서버에만, 되돌리기 쉽게.**

---

## 0. 한 줄 요약

**Vercel 하나에 프런트(정적)와 API(서버리스)를 함께 올리고, DB/로그인은 Supabase,
결제는 PortOne**로 붙입니다. GitHub에 push 하면 자동 배포되고, 문제가 생기면
직전 배포로 즉시 롤백합니다.

---

## 1. 무엇을 어디에 올리나

| 구성 | 플랫폼 | 이유 |
|---|---|---|
| 프런트(도구 HTML, Eleventy 사이트) | **Vercel (정적)** | `npm run build` → `_site/` 정적 서빙 |
| 백엔드 API (`api/**/*.mjs`) | **Vercel Serverless Functions** | 같은 저장소·같은 도메인, 키 은닉 |
| DB · 로그인 | **Supabase** | Postgres + Auth(카카오) 한 번에 |
| 결제 | **PortOne** | 국내 카드 정기결제 + Webhook |
| AI 호출 | **Gemini API** | 서버에서만 키 사용 |

> 프런트와 API가 같은 도메인이라 CORS 이슈가 없고, `fetch('/api/...')`로 바로 호출됩니다.

---

## 2. 환경 분리 (2단계)

| 환경 | 용도 | 브랜치 | 데이터 |
|---|---|---|---|
| **Preview** | 개발·검증 | 기능 브랜치 push 시 자동 | Supabase **개발 프로젝트** + PortOne **테스트 모드** |
| **Production** | 실서비스 | `main` 병합 시 자동 | Supabase **운영 프로젝트** + PortOne **실결제** |

- Supabase는 **개발/운영 프로젝트를 분리**(키·DB 별도)해 실데이터 오염 방지.
- 환경변수는 Vercel의 **Preview / Production 스코프로 각각** 등록.

---

## 3. 배포 파이프라인 (GitHub → Vercel 자동)

```
코드 push → GitHub → Vercel 빌드(npm run build) → 배포
   ├─ 기능 브랜치  → Preview URL 자동 생성(공유·검증용)
   └─ main 병합    → Production 도메인 반영
```

- 별도 CI 서버 불필요(Vercel 내장). 원하면 GitHub Actions로 `npm run check:api`
  (문법검사)를 PR 게이트로 추가.
- **빌드 설정(Vercel)**: Framework `Other`, Build `npm run build`, Output `_site`.

---

## 4. 최초 배포 절차 (체크리스트)

1. **키 준비** — `docs/setup-accounts.md` 대로 Gemini / Supabase / (PortOne) 발급.
2. **DB 스키마** — Supabase SQL Editor에서 `db/migrations/0001_init.sql` 실행.
3. **Vercel 프로젝트 생성** — 이 저장소 Import → 빌드 설정(3절) 지정.
4. **환경변수 등록** — `.env.example` 항목을 Vercel Preview/Production에 각각 입력
   (특히 `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`는 **서버 전용**).
5. **첫 배포** — Deploy 후 확인:
   - `GET /api/me` (미로그인 → 401 정상)
   - 로그인 후 `POST /api/generate/text`로 기획 1건 생성
6. **도메인 연결** — Vercel Domains에 커스텀 도메인 등록 + DNS(CNAME) 설정, HTTPS 자동.
7. **Webhook 등록(결제 붙일 때)** — PortOne 수신 URL을
   `https://<도메인>/api/billing/webhook`로 설정.

---

## 5. 배포 순서(위험 낮추는 롤아웃)

1. **1차: 텍스트 생성만** (로그인 + `/api/generate/text`) — 결제 없이 내부/베타 검증.
2. **2차: 결제 연결** (PortOne 테스트 → 실결제) — 소수 유료 베타.
3. **3차: 이미지 크레딧 + 교회 플랜** — 검증 후 순차 오픈.

각 단계는 **기능 플래그/플랜 제한**으로 껐다 켤 수 있게 해, 문제가 보이면 노출만 내립니다.

---

## 6. 롤백·안전장치

- **즉시 롤백**: Vercel Deployments에서 직전 성공 배포를 **Promote to Production**(수초).
- **DB 마이그레이션**: 파괴적 변경(컬럼 삭제 등)은 피하고, 되돌리는 `down` SQL을 함께 보관.
- **키 유출 대응**: 유출 즉시 해당 콘솔에서 키 **재발급(rotate)** → Vercel 변수 교체 → 재배포.
- **비용 폭주 차단**: 플랜 한도(rate limit)와 이미지 크레딧 선차감이 1차 방어선.
  Google Cloud/Gemini에 **예산 알림(budget alert)** 설정 권장.

---

## 7. 관측(모니터링)

- **Vercel**: 함수 로그·에러율·응답시간 대시보드 기본 제공.
- **Supabase**: DB 사용량·Auth 로그.
- **자체 지표**: `usage_events` 테이블로 사용량·원가(`cost_usd`) 집계 → 월별 손익 확인.
- 알림: 에러 급증/결제 실패는 이메일 또는 슬랙 웹훅으로 통지(추후).

---

## 8. 비용(초기 월 고정비 추정)

| 항목 | 요금(대략) | 비고 |
|---|---|---|
| Vercel | 무료(Hobby)~$20(Pro) | 트래픽 늘면 Pro |
| Supabase | 무료~$25(Pro) | 사용자 늘면 Pro |
| 도메인 | 연 1~2만원 | |
| Gemini/이미지 | 사용량 비례 | 원가, 구독가로 회수 |

→ 초기 고정비 월 **4만원 안팎** — 유료 개인 **4~5명**이면 회수(원가모델과 일치).

---

## 9. 지금 당장 가능한 최소 배포

키가 아직 없어도 **정적 사이트만 먼저 배포**해 도메인·빌드 파이프라인을 검증할 수 있습니다:

1. Vercel에 저장소 Import → `npm run build` / `_site` 설정 → Deploy
2. Preview URL로 Eleventy 사이트·도구 페이지 열람 확인
3. 이후 키가 준비되면 환경변수만 채워 API를 활성화

> 준비되면 진행 순서: **정적 배포 검증 → Gemini/Supabase 연결 → 텍스트 생성 확인 →
> PortOne 결제 → 이미지/교회 플랜**.
