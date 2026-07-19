// 인증·구독·한도·크레딧 헬퍼. Supabase 서비스 롤로 서버에서만 실행.
// 요청은 Authorization: Bearer <supabase access token> 를 싣는다.

import { createClient } from "@supabase/supabase-js";
import { planQuota } from "./plans.mjs";

let _admin;
function admin() {
  if (!_admin) {
    _admin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return _admin;
}

function periodStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

// Bearer 토큰 -> 인증 사용자. 실패 시 null.
export async function authUser(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user;
}

// 사용자의 활성 구독을 조회(개인 또는 소속 교회). 없으면 free 로 간주.
export async function getSubscription(userId) {
  const db = admin();
  const { data: u } = await db.from("users").select("id, org_id, org_role").eq("id", userId).maybeSingle();
  const orgId = u && u.org_id;
  const q = db.from("subscriptions").select("*").eq("status", "active").limit(1);
  const { data } = orgId
    ? await q.or(`user_id.eq.${userId},org_id.eq.${orgId}`)
    : await q.eq("user_id", userId);
  const sub = (data && data[0]) || null;
  return { sub, orgId, orgRole: u && u.org_role, plan: sub ? sub.plan : "free" };
}

// 이번 달 기획 사용량 조회.
export async function getPlanUsage(subscriptionId) {
  if (!subscriptionId) return 0;
  const { data } = await admin()
    .from("usage_counters")
    .select("plan_used")
    .eq("subscription_id", subscriptionId)
    .eq("period", periodStart())
    .maybeSingle();
  return (data && data.plan_used) || 0;
}

// 기획 한도 검사 후 사용량 1 증가(원자적 upsert). 초과 시 false.
export async function consumePlanQuota(subscriptionId, plan) {
  const limit = planQuota(plan);
  const used = await getPlanUsage(subscriptionId);
  if (used >= limit) return { ok: false, used, limit };
  const period = periodStart();
  // upsert + 증가. 경쟁 상황은 DB 함수(increment_plan_used)로 강화 권장.
  await admin().from("usage_counters").upsert(
    { subscription_id: subscriptionId, period, plan_used: used + 1 },
    { onConflict: "subscription_id,period" }
  );
  return { ok: true, used: used + 1, limit };
}

// 생성 실패 시 차감했던 기획 한도를 1 되돌린다(best-effort).
export async function rollbackPlanQuota(subscriptionId) {
  if (!subscriptionId) return;
  const used = await getPlanUsage(subscriptionId);
  if (used <= 0) return;
  await admin().from("usage_counters").upsert(
    { subscription_id: subscriptionId, period: periodStart(), plan_used: used - 1 },
    { onConflict: "subscription_id,period" }
  );
}

export async function logUsage(row) {
  try {
    await admin().from("usage_events").insert(row);
  } catch (_) { /* 로깅 실패가 응답을 막지 않도록 */ }
}

export async function getImageCredits(userId, orgId) {
  const db = admin();
  const { data } = orgId
    ? await db.from("image_credits").select("balance").eq("owner_org_id", orgId).maybeSingle()
    : await db.from("image_credits").select("balance").eq("owner_user_id", userId).maybeSingle();
  return (data && data.balance) || 0;
}

async function setImageCredits(userId, orgId, balance) {
  const db = admin();
  const row = orgId ? { owner_org_id: orgId, balance } : { owner_user_id: userId, balance };
  const onConflict = orgId ? "owner_org_id" : "owner_user_id";
  await db.from("image_credits").upsert(row, { onConflict });
}

// count 만큼 선차감(홀드). 잔액 부족 시 false.
export async function holdImageCredits(userId, orgId, count) {
  const bal = await getImageCredits(userId, orgId);
  if (bal < count) return { ok: false, balance: bal };
  await setImageCredits(userId, orgId, bal - count);
  return { ok: true, balance: bal - count };
}

// 실패한 장수만큼 환불.
export async function refundImageCredits(userId, orgId, count) {
  if (count <= 0) return;
  const bal = await getImageCredits(userId, orgId);
  await setImageCredits(userId, orgId, bal + count);
}
