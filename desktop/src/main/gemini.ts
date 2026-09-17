import { safeStorage } from 'electron'
import { getSetting, setSetting } from './db/dao'
import type { ExtractedSong } from '../shared/ipc'

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

// ── Vision 추출 ──────────────────────────────────────

const PROMPT = `이 악보 이미지에서 가사만 추출하라.
- 음표, 코드(기호), 마디 번호, 페이지 번호, 저작권 문구는 제외한다.
- 절(1절, 2절, 후렴 등)을 노래 순서대로 구분한다.
- 각 절의 각 행을 lines 배열의 한 원소로 넣는다.
- 반드시 아래 JSON 형식으로만 응답한다:
{"title": "곡 제목", "verses": [{"label": "1절", "lines": ["첫째 줄", "둘째 줄"]}]}`

/** Gemini Vision으로 악보 이미지에서 가사 추출 */
export async function extractLyricsGemini(
  base64: string,
  mimeType: string,
  apiKey: string
): Promise<ExtractedSong> {
  const model = 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`
  const body = {
    contents: [
      {
        parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }]
      }
    ],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini 오류 ${res.status}: ${detail.slice(0, 300)}`)
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  let parsed: ExtractedSong
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('응답을 해석하지 못했습니다. 다시 시도해 주세요.')
  }
  return {
    title: typeof parsed.title === 'string' ? parsed.title : '',
    verses: Array.isArray(parsed.verses) ? parsed.verses : []
  }
}
