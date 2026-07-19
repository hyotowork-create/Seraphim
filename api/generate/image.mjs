// POST /api/generate/image — 서버 경유 이미지 생성(크레딧 차감).
// 선차감(홀드) -> 각 프롬프트 생성 -> 실패분 자동 환불. cost-model.md 4절.
import { authUser, getSubscription, holdImageCredits, refundImageCredits, logUsage } from "../../server/lib/account.mjs";
import { generateImage } from "../../server/lib/gemini.mjs";
import { UNIT_COST_USD } from "../../server/lib/plans.mjs";

const MAX_BATCH = 16;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: { code: "method_not_allowed", message: "POST only" } });

  const user = await authUser(req);
  if (!user) return res.status(401).json({ error: { code: "unauthorized", message: "로그인이 필요합니다." } });

  const prompts = Array.isArray(req.body && req.body.prompts) ? req.body.prompts.filter(Boolean) : [];
  if (!prompts.length) return res.status(400).json({ error: { code: "empty_prompts", message: "프롬프트가 없습니다." } });
  if (prompts.length > MAX_BATCH) return res.status(400).json({ error: { code: "too_many", message: `한 번에 최대 ${MAX_BATCH}장` } });

  const { orgId } = await getSubscription(user.id);

  // 1) 전체 장수 선차감(홀드)
  const hold = await holdImageCredits(user.id, orgId, prompts.length);
  if (!hold.ok) return res.status(402).json({ error: { code: "insufficient_credits", message: "이미지 크레딧이 부족합니다." }, balance: hold.balance });

  // 2) 생성(실패는 모아서 환불)
  const images = [];
  let failed = 0;
  for (const prompt of prompts) {
    try {
      const img = await generateImage(prompt);
      images.push({ ok: true, mimeType: img.mimeType, data: img.data });
    } catch (e) {
      failed += 1;
      images.push({ ok: false, error: e.message });
    }
  }

  // 3) 실패분 환불 + 성공분만 확정 차감
  if (failed) await refundImageCredits(user.id, orgId, failed);
  const succeeded = prompts.length - failed;
  await logUsage({ user_id: user.id, kind: "image", image_count: succeeded, cost_usd: succeeded * UNIT_COST_USD.imageStandard });

  const balance = hold.balance + failed;
  return res.status(200).json({ images, succeeded, failed, credits: { image: balance } });
}
