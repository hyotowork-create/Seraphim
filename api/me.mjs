// GET /api/me — 현재 사용자·플랜·잔여 한도/크레딧.
import { authUser, getSubscription, getPlanUsage, getImageCredits } from "../server/lib/account.mjs";
import { PLANS, planQuota } from "../server/lib/plans.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: { code: "method_not_allowed", message: "GET only" } });
  const user = await authUser(req);
  if (!user) return res.status(401).json({ error: { code: "unauthorized", message: "로그인이 필요합니다." } });

  const { sub, orgId, orgRole, plan } = await getSubscription(user.id);
  const used = sub ? await getPlanUsage(sub.id) : 0;
  const credits = await getImageCredits(user.id, orgId);

  return res.status(200).json({
    user: { id: user.id, email: user.email, name: user.user_metadata && user.user_metadata.name },
    org: orgId ? { id: orgId, role: orgRole } : null,
    plan,
    planLabel: (PLANS[plan] || PLANS.free).label,
    period: sub ? { start: sub.period_start, end: sub.period_end } : null,
    quota: { plan: { used, limit: planQuota(plan) } },
    credits: { image: credits },
  });
}
