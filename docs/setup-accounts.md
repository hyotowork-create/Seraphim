# 실계정·키 준비 가이드 (Supabase · PortOne · Gemini)

> 목적: MVP 배포·동작 검증에 필요한 외부 계정과 키를 직접 발급받는 순서.
> 발급한 값은 `.env`(로컬)와 Vercel 환경변수에 넣습니다. **키는 절대 커밋 금지.**
> 대응 변수명은 [`.env.example`](../.env.example) 참조.

---

## A. Supabase (로그인 + 데이터베이스)

1. https://supabase.com 접속 → GitHub/구글로 가입 → **New project**.
2. 입력: Organization 선택, **Project name**(예: seraphim), **DB Password**(강력하게, 별도 보관),
   **Region**은 `Northeast Asia (Seoul)` 권장.
3. 생성 후(1~2분) → 좌측 **Project Settings → API** 에서 아래 3개 복사:
   - `Project URL` → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (브라우저 노출 허용)
   - `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY` (**서버 전용, 절대 노출 금지**)
4. **DB 스키마 넣기**: 좌측 **SQL Editor → New query** → 저장소
   `db/migrations/0001_init.sql` 내용 붙여넣기 → **Run**.
5. **카카오 로그인 켜기**: 좌측 **Authentication → Providers → Kakao** 활성화.
   (아래 B-카카오에서 발급한 REST 키/시크릿을 여기에 입력)

### 카카오 로그인 키 (Supabase Auth 용)
1. https://developers.kakao.com → 로그인 → **내 애플리케이션 → 애플리케이션 추가**.
2. **앱 키**에서 `REST API 키` 복사.
3. **카카오 로그인 → 활성화 ON**, **Redirect URI** 에 Supabase가 알려주는 콜백 URL 등록
   (Supabase Kakao Provider 화면에 표시됨: `https://<프로젝트>.supabase.co/auth/v1/callback`).
4. **보안 → Client Secret** 생성 → Supabase Kakao Provider 에 REST 키 + Secret 입력.

---

## B. PortOne(구 아임포트) — 정기결제 (3단계에서 사용)

> 국내 카드 정기결제. **가맹 심사·PG 계약이 필요**해 시간이 걸리니 미리 시작하세요.

1. https://portone.io → 가입 → 콘솔 로그인.
2. **결제 연동 → PG사 설정**: 정기결제(빌링) 지원 PG 선택(예: 나이스페이먼츠/토스페이먼츠/KG이니시스).
   - **개인/개인사업자/법인**에 따라 필요 서류가 다름. 통신판매업 신고번호·사업자등록증이
     대개 필요(개인 테스트는 테스트 모드로 우선 진행 가능).
3. **테스트 모드**로 먼저 연동 검증 → 심사 완료 후 **실결제 모드** 전환.
4. 콘솔 **결제 연동 → 식별코드·API Keys** 에서:
   - `API Secret`(V2) → `PORTONE_API_SECRET`
   - **Webhook** 설정 화면에서 서명 시크릿 → `PORTONE_WEBHOOK_SECRET`,
     수신 URL 은 배포 후 `https://<도메인>/api/billing/webhook` 로 등록.

> 팁: 결제는 MVP의 마지막 관문입니다. **A(Supabase)와 C(Gemini)를 먼저 붙여
> 로그인+생성이 도는 걸 확인**하고, PortOne 심사는 병행으로 진행하면 시간을 아낍니다.

---

## C. Gemini API 키 (AI 호출 — 서버 전용)

1. https://aistudio.google.com/app/apikey → 구글 로그인 → **Create API key**.
2. 발급된 키 → `GEMINI_API_KEY` (**서버에서만 사용, 프런트 노출 금지**).
3. 모델 변수(기본값 그대로 두어도 됨):
   - `GEMINI_TEXT_MODEL=gemini-2.5-flash`
   - `GEMINI_IMAGE_MODEL=gemini-2.5-flash-image`
4. **유료 결제 등록**: 무료 티어는 한도가 낮으므로, 실서비스 전 Google Cloud 결제 계정 연결.
   (약관상 "AI 결과물 유료 제공"은 일반적으로 허용, "키 재판매/전대"는 금지 — 우리는 전자.)

---

## D. 값 넣는 곳

### 로컬
```bash
cp .env.example .env    # 그리고 위에서 받은 값들을 채움
npm install
npm run check:api       # 문법 확인
```

### Vercel(배포)
1. https://vercel.com → 이 저장소 Import.
2. **Settings → Environment Variables** 에 `.env` 와 동일한 키/값 등록.
3. Deploy → `/api/me`, `/api/generate/text` 동작 확인.

---

## E. 최소 진행 순서 (권장)

1. **Gemini 키** 발급 (가장 빠름)
2. **Supabase** 프로젝트 + 스키마 + 카카오 로그인
3. 위 둘로 **로그인→생성**이 도는지 배포 검증
4. **PortOne** 심사는 1~3과 병행 → 완료되면 결제 붙이기

> 준비되는 대로 각 값을 알려주시면(또는 Vercel/Supabase에 직접 넣으시면),
> 그에 맞춰 로그인 콜백·결제 라우트·대시보드 연결(3~4단계)을 이어서 구현합니다.
> **키 원문을 이 대화나 저장소에 붙여넣지 마세요** — 노출 위험이 있습니다.
