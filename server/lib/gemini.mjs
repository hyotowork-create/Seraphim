// 서버 전용 Gemini 클라이언트. tool-v6.html 의 callGeminiText 를 이식하되,
// API 키는 서버 환경변수(GEMINI_API_KEY)에서만 읽는다. 클라이언트로 절대 노출 금지.

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

function apiKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY 미설정");
  return k;
}

export async function generateText(sys, userText, { useSearch = false, maxTok } = {}) {
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.8 },
  };
  if (maxTok) body.generationConfig.maxOutputTokens = maxTok;
  if (useSearch) body.tools = [{ google_search: {} }];

  const res = await fetch(BASE + TEXT_MODEL + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
  }

  let text = "";
  const cand = data.candidates && data.candidates[0];
  if (cand && cand.content && cand.content.parts) {
    for (const p of cand.content.parts) if (p.text) text += p.text;
  }
  if (!text) throw new Error("텍스트가 반환되지 않았습니다(차단 또는 토큰상한 확인).");

  const sources = [];
  const gm = cand && cand.groundingMetadata;
  if (gm && gm.groundingChunks) {
    for (const c of gm.groundingChunks) {
      if (c.web && c.web.uri) sources.push({ title: c.web.title || c.web.uri, uri: c.web.uri });
    }
  }
  return { text, usage: data.usageMetadata || null, sources };
}

// 이미지 1장 생성. 실패 시 throw → 상위에서 크레딧 환불 처리.
export async function generateImage(prompt) {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
  const res = await fetch(BASE + IMAGE_MODEL + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ("HTTP " + res.status));

  const cand = data.candidates && data.candidates[0];
  const parts = (cand && cand.content && cand.content.parts) || [];
  const img = parts.find((p) => p.inlineData && p.inlineData.data);
  if (!img) throw new Error("이미지가 반환되지 않았습니다.");
  return { mimeType: img.inlineData.mimeType || "image/png", data: img.inlineData.data, usage: data.usageMetadata || null };
}
