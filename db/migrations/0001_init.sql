-- 교회학교 도구 SaaS — 초기 스키마 (Supabase / PostgreSQL)
-- development-spec.md 3절 스키마의 실제 마이그레이션.
-- 실행: supabase db push  또는  psql < 0001_init.sql

-- 교회(기관) — 모델 C. 개인 사용자는 org 없이도 동작.
CREATE TABLE IF NOT EXISTS orgs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  seat_limit  INT  NOT NULL DEFAULT 5,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  org_id      UUID REFERENCES orgs(id) ON DELETE SET NULL,
  org_role    TEXT CHECK (org_role IN ('admin','teacher')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 구독: 개인은 user_id, 교회는 org_id에 귀속(둘 중 정확히 하나).
CREATE TABLE IF NOT EXISTS subscriptions (
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
CREATE TABLE IF NOT EXISTS usage_counters (
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  period          DATE NOT NULL,              -- 해당 월 1일
  plan_used       INT  NOT NULL DEFAULT 0,    -- 기획 사용 회수
  PRIMARY KEY (subscription_id, period)
);

-- 이미지 크레딧 잔액(텍스트와 분리 과금).
CREATE TABLE IF NOT EXISTS image_credits (
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  owner_org_id  UUID REFERENCES orgs(id)  ON DELETE CASCADE,
  balance       INT NOT NULL DEFAULT 0,
  CHECK (num_nonnulls(owner_user_id, owner_org_id) = 1)
);

-- 원가 추적·감사용 개별 호출 로그.
CREATE TABLE IF NOT EXISTS usage_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id),
  kind          TEXT NOT NULL,   -- 'plan'|'bulletin'|'lesson'|'script'|'imagePrompt'|'image'
  department    TEXT,
  in_tokens     INT,
  out_tokens    INT,
  image_count   INT DEFAULT 0,
  cost_usd      NUMERIC(10,5),   -- cost-model.md 단가 반영 원가
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events(user_id, created_at);

-- 생성 결과 이력(재열람/다운로드).
CREATE TABLE IF NOT EXISTS generations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT,
  payload     JSONB,           -- 결과 텍스트/프롬프트/이미지 참조
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generations_user_created ON generations(user_id, created_at);

-- RLS: 본인 또는 동일 org 데이터만 접근. (Supabase Auth uid 기준)
ALTER TABLE generations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY generations_owner ON generations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY usage_events_owner ON usage_events
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY subscriptions_owner ON subscriptions
  FOR SELECT USING (user_id = auth.uid());
