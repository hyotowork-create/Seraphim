import { safeStorage } from 'electron'
import { getSetting, setSetting } from './db/dao'
import { DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_PRECISE_MODEL, type ExtractedSong } from '../shared/ipc'
import { normalizeSongs } from '../shared/scoreText'
import type { VisionImage } from './score'

// ── API 키 저장 (가능하면 OS 키체인으로 암호화) ───────────

export function setGeminiKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) {
    setSetting('gemini.key.enc', '')
    setSetting('gemini.key', '')
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    setSetting('gemini.key.enc', safeStorage.encryptString(trimmed).toString('base64'))
    setSetting('gemini.key', '')
  } else {
    setSetting('gemini.key', trimmed)
    setSetting('gemini.key.enc', '')
  }
}

export function getGeminiKey(): string | null {
  const enc = getSetting('gemini.key.enc')
  if (enc) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch {
      return null
    }
  }
  return getSetting('gemini.key') || null
}

export function hasGeminiKey(): boolean {
  return !!getGeminiKey()
}

/** 사용할 모델명 — 설정값이 없으면 기본값. (모델 종료 시 설정에서 교체) */
export function getGeminiModel(): string {
  return (getSetting('gemini.model') || '').trim() || DEFAULT_GEMINI_MODEL
}

/** 정밀 모드 모델명 (작은 글자·재시도) */
export function getGeminiPreciseModel(): string {
  return (getSetting('gemini.model.precise') || '').trim() || DEFAULT_GEMINI_PRECISE_MODEL
}

// ── 프롬프트 ─────────────────────────────────────────

const PROMPT = `당신은 교회 악보(찬송가, 복음성가, 워십 리드시트)에서 가사만 옮겨 적는 전문 필사자다.
첨부한 이미지들은 순서대로 이어지는 악보 페이지(또는 페이지의 일부 영역)다.
한 이미지에 곡이 하나일 수도, 두세 곡이 함께 있을 수도 있다.

곡 나누기:
- 새 제목, 새 곡 번호, 새 작사·작곡 표기, 조표·박자표가 다시 나오는 새 오선 시작은 다른 곡의 시작이다.
- 제목이 없어도 앞 곡의 가사와 이어지지 않으면 별개 곡으로 본다. 확실히 한 곡이 다음 페이지로 이어지는 경우에만 합친다.
- 곡마다 songs 배열의 원소 하나를 만든다. 곡이 하나면 원소도 하나다.

규칙:
1. 음표, 코드 기호(C, G/B, Am7 등), 마디 번호, 페이지 번호, 박자·조표, 저작권/출판사/CCLI 문구, 작사·작곡·편곡자 표기, 곡 번호는 모두 제외한다.
2. 한 보표(오선) 아래에 가사가 여러 줄 세로로 겹쳐 있으면 각 줄은 서로 다른 절이다. 위에서부터 1절, 2절, 3절… 이며, 절마다 그 절에 속한 줄만 모아 곡의 처음부터 끝까지 이어 붙인다. 절끼리 절대 섞지 않는다.
3. 음표에 맞춰 하이픈(-)이나 띄어쓰기로 쪼개진 음절은 원래 단어로 붙여 쓴다. (예: "하 - 나 - 님" → "하나님", "사랑 - 하 - 는" → "사랑하는")
4. 반복 기호(도돌이표, ×2, 1./2. 마침, D.S., D.C., Coda)는 실제로 부르는 순서대로 펼쳐 쓴다. 단, 후렴(Chorus/Refrain)은 한 번만 적고 label을 "후렴"으로 둔다.
5. lines의 각 원소는 화면 자막 한 줄이다. 악보의 한 줄(한 보표) 또는 자연스러운 구 단위로 나누고, 한 원소가 25자를 넘지 않게 한다.
6. label은 반드시 다음 중 하나만 사용한다: "1절", "2절", "3절", …, "후렴", "프리코러스", "브릿지", "간주", "전주", "후주". 다른 표현("Verse 1", "Chorus", "1절 (반복)" 등)은 쓰지 않는다.
7. title은 악보 상단의 곡 제목만 적는다(곡 번호·부제·영문 병기 제외). 읽을 수 없으면 빈 문자열.
8. 가사는 악보에 적힌 글자 그대로 옮긴다. 맞춤법·띄어쓰기·옛말을 고치거나 현대어로 바꾸지 않는다. (예: "그리어 볼 때"를 "그려 볼 때"로 바꾸지 않는다)
9. 가사를 전혀 찾지 못하면 verses를 빈 배열로 둔다. 지어내지 않는다.

반드시 아래 JSON 형식으로만 응답한다:
{"songs":[{"title":"곡 제목","verses":[{"label":"1절","lines":["첫째 줄","둘째 줄"]},{"label":"후렴","lines":["..."]}]}]}`

// ── Vision 호출 ───────────────────────────────────────

const TIMEOUT_MS = 90_000

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    finishReason?: string
  }[]
  promptFeedback?: { blockReason?: string }
  error?: { code?: number; message?: string; status?: string }
}

function friendlyHttpError(status: number, bodyText: string, model: string): Error {
  let msg = ''
  try {
    const j = JSON.parse(bodyText) as GeminiResponse
    msg = j.error?.message ?? ''
  } catch {
    msg = bodyText.slice(0, 200)
  }
  if (status === 404 || /not found|is not supported/i.test(msg)) {
    return new Error(`모델 "${model}"을(를) 사용할 수 없습니다. 설정에서 Gemini 모델명을 확인하세요. (${msg.slice(0, 120)})`)
  }
  if (status === 400 && /API key|API_KEY/i.test(msg)) return new Error('Gemini API 키가 올바르지 않습니다. 설정에서 다시 입력하세요.')
  if (status === 401 || status === 403) return new Error(`Gemini 인증 실패 (${status}): API 키와 권한을 확인하세요.`)
  if (status === 429) return new Error('Gemini 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.')
  if (status >= 500) return new Error(`Gemini 서버 오류 (${status}). 잠시 후 다시 시도하세요.`)
  return new Error(`Gemini 오류 ${status}: ${msg.slice(0, 200)}`)
}

/** Gemini Vision으로 악보 이미지(여러 페이지/영역)에서 가사 추출 — 이미지에 곡이 여러 개면 여러 곡 반환 */
export async function extractLyricsGemini(
  images: VisionImage[],
  apiKey: string,
  model: string = getGeminiModel()
): Promise<ExtractedSong[]> {
  if (images.length === 0) throw new Error('추출할 악보 이미지가 없습니다.')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const body = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          ...images.map((im) => ({ inline_data: { mime_type: im.mimeType, data: im.base64 } }))
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      maxOutputTokens: 16384
    }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      // 키는 URL 대신 헤더로 전달 (로그·프록시 노출 최소화)
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error(`응답이 ${TIMEOUT_MS / 1000}초 안에 오지 않았습니다. 페이지 수를 줄이거나 다시 시도하세요.`)
    throw new Error('Gemini에 연결할 수 없습니다. 인터넷 연결을 확인하세요.')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw friendlyHttpError(res.status, detail, model)
  }

  const json = (await res.json()) as GeminiResponse
  if (json.promptFeedback?.blockReason) {
    throw new Error(`Gemini가 요청을 차단했습니다 (${json.promptFeedback.blockReason}). 다른 이미지로 시도하세요.`)
  }
  const cand = json.candidates?.[0]
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  if (!text.trim()) {
    const reason = cand?.finishReason
    if (reason === 'SAFETY') throw new Error('안전 필터로 응답이 비었습니다. 다른 이미지로 시도하세요.')
    if (reason === 'MAX_TOKENS') throw new Error('응답이 너무 깁니다. 페이지를 나눠서 시도하세요.')
    throw new Error(`Gemini가 빈 응답을 보냈습니다${reason ? ` (${reason})` : ''}. 다시 시도하세요.`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // 모델이 ```json 펜스를 붙이는 경우 대비
    const m = text.match(/\{[\s\S]*\}/)
    try {
      parsed = m ? JSON.parse(m[0]) : null
    } catch {
      parsed = null
    }
    if (!parsed) {
      if (cand?.finishReason === 'MAX_TOKENS') throw new Error('응답이 잘렸습니다. 페이지를 나눠서 시도하세요.')
      throw new Error('응답을 해석하지 못했습니다. 다시 시도해 주세요.')
    }
  }
  return normalizeSongs(parsed)
}
