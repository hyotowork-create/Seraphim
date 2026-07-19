// 플랜별 한도 & 원가 상수 — cost-model.md / development-spec.md 5절과 동기화.
// 가격은 검증된 가안(원). 확정 시 이 파일만 수정하면 전체 반영.

export const PLANS = {
  free:     { label: "무료 체험", priceKrw: 0,      planQuota: 1,        seats: 1, imageIncluded: 0 },
  personal: { label: "개인",      priceKrw: 11900,  planQuota: 10,       seats: 1, imageIncluded: 0 },
  church:   { label: "교회",      priceKrw: 59000,  planQuota: 30,       seats: 5, imageIncluded: 0 },
};

// 이미지 크레딧 팩 (장수 -> 판매가). cost-model.md 4절.
export const CREDIT_PACKS = [
  { images: 100, priceKrw: 16000 },
  { images: 300, priceKrw: 42000 },
  { images: 500, priceKrw: 65000 },
];

// 원가 단가 (USD) — usage_events.cost_usd 계산용. cost-model.md 0절.
export const UNIT_COST_USD = {
  textInPerToken: 0.30 / 1e6,
  textOutPerToken: 2.50 / 1e6,
  imageStandard: 0.039,
  imageBatch: 0.0195,
};

export function planQuota(plan) {
  return (PLANS[plan] || PLANS.free).planQuota;
}

export function textCostUsd(usage) {
  if (!usage) return null;
  const inTok = usage.promptTokenCount || 0;
  const outTok = usage.candidatesTokenCount || 0;
  return inTok * UNIT_COST_USD.textInPerToken + outTok * UNIT_COST_USD.textOutPerToken;
}
