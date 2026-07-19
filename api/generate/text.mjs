// POST /api/generate/text — 서버 경유 텍스트 생성.
// 인증 -> (기획이면) 한도 검사·차감 -> 서버 키로 Gemini 호출 -> 사용량 기록.
import { authUser, getSubscription, consumePlanQuota, rollbackPlanQuota, logUsage } from "../../server/lib/account.mjs";
import { buildForType } from "../../server/lib/prompts.mjs";
import { generateText } from "../../server/lib/gemini.mjs";
import { textCostUsd, planQuota } from "../../server/lib/plans.mjs";

const TYPES = new Set(["plan", "script", "bulletin", "lesson", "imagePrompt"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: { code: "method_not_allowed", message: "POST only" } });

  const user = await authUser(req);
  if (!user) return res.status(401).json({ error: { code: "unauthorized", message: "로그인이 필요합니다." } });

  const body = req.body || {};
  const { type, department, tone, inputs = {} } = body;
  if (!TYPES.has(type)) return res.status(400).json({ error: { code: "bad_type", message: "지원하지 않는 생성 타입" } });

  const { sub, plan } = await getSubscription(user.id);

  // 기획(plan)만 월 한도 차감. 나머지는 구독 내 무제한.
  const built = buildForType(type, { dept: department, tone, trendMonths: inputs.trendMonths, maxTok: inputs.maxTok });
  if (!built) return res.status(400).json({ error: { code: "bad_type", message: "빌더 없음" } });

  let quota = null;
  if (built.metered) {
    if (!sub) return res.status(402).json({ error: { code: "no_subscription", message: "구독이 필요합니다." } });
    const c = await consumePlanQuota(sub.id, plan);
    if (!c.ok) return res.status(429).json({ error: { code: "quota_exceeded", message: `이번 달 기획 한도(${c.limit}회)를 모두 사용했습니다.` } });
    quota = { used: c.used, limit: c.limit };
  }

  // 사용자 프롬프트 구성
  const userText = type === "plan"
    ? ("오늘(요청일) 기준으로 작성합니다. 설교 본문: " + (inputs.passage || "").trim())
    : (inputs.plan || "").trim();
  if (!userText) return res.status(400).json({ error: { code: "empty_input", message: type === "plan" ? "설교 본문을 입력하세요." : "먼저 기획을 생성하세요." } });

  try {
    const r = await generateText(built.sys, userText, { useSearch: built.useSearch, maxTok: built.maxTok });
    await logUsage({
      user_id: user.id, kind: type, department,
      in_tokens: r.usage && r.usage.promptTokenCount,
      out_tokens: r.usage && r.usage.candidatesTokenCount,
      cost_usd: textCostUsd(r.usage),
    });
    return res.status(200).json({ text: r.text, usage: r.usage, sources: r.sources, quota });
  } catch (e) {
    // 생성 실패 시 차감한 기획 한도는 롤백(사용자가 실패에 과금되지 않도록).
    if (built.metered && quota && sub) {
      await rollbackPlanQuota(sub.id);
    }
    return res.status(502).json({ error: { code: "generation_failed", message: e.message } });
  }
}
