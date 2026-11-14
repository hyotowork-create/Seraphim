// 악보 추출 결과 정규화 — main/renderer 공용 순수 함수 (Gemini 응답 → 앱 절 규칙)
import type { ExtractedSong, ExtractResult } from './ipc'

/** 모델이 준 라벨을 앱의 절 라벨 규칙(shared/lyrics.ts LABEL_RE)에 맞게 정규화. 모르면 '' (자동 번호). */
export function normalizeLabel(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  let m = s.match(/^(?:verse|v\.?|절)?\s*(\d+)\s*(?:절)?\s*(?:[(\[].*)?$/i)
  if (m) return `${Number(m[1])}절`
  m = s.match(/(\d+)\s*절/)
  if (m) return `${Number(m[1])}절`
  if (/pre-?\s*chorus|프리\s*코러스/i.test(s)) return '프리코러스'
  if (/후렴|chorus|refrain|코러스/i.test(s)) {
    const n = s.match(/(\d+)/)
    return n ? `후렴${n[1]}` : '후렴'
  }
  if (/bridge|브릿지|브리지/i.test(s)) return '브릿지'
  if (/intro|전주/i.test(s)) return '전주'
  if (/outro|ending|후주|엔딩/i.test(s)) return '후주'
  if (/interlude|간주/i.test(s)) return '간주'
  if (/^tag$/i.test(s)) return 'tag'
  return ''
}

/** 하이픈 멜리스마 분리("하-나-님") 붙이기 + 공백 정리 */
export function cleanLine(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u2010\u2011\u2212]/g, '-') // 하이픈 변형 → '-' (멜리스마 분리 기호)
    .replace(/[\u2012-\u2015]/g, ' ') // 엔/엠 대시는 문장 부호 → 공백
    .replace(/(?<=[가-힣ㄱ-ㅎㅏ-ㅣ])\s*-\s*(?=[가-힣ㄱ-ㅎㅏ-ㅣ])/g, '')
    // 영문은 " - " 처럼 공백이 낀 하이픈만 음절 분리로 보고 붙임 (well-known 같은 복합어는 유지)
    .replace(/(?<=[A-Za-z])(?:\s+-\s*|\s*-\s+)(?=[A-Za-z])/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function normalizeExtracted(parsed: unknown): ExtractedSong {
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as {
    title?: unknown
    verses?: unknown
  }
  const versesIn = Array.isArray(obj.verses) ? obj.verses : []
  const verses = versesIn
    .map((v) => {
      const vv = (v && typeof v === 'object' ? v : {}) as { label?: unknown; lines?: unknown }
      const lines = (Array.isArray(vv.lines) ? vv.lines : typeof vv.lines === 'string' ? [vv.lines] : [])
        .map(cleanLine)
        .filter(Boolean)
      return { label: normalizeLabel(vv.label), lines }
    })
    .filter((v) => v.lines.length > 0)
  return {
    title: typeof obj.title === 'string' ? cleanLine(obj.title) : '',
    verses
  }
}


/** 모델 응답(곡 목록 또는 구형 단일 곡 형태) → 곡 목록. 가사가 없는 곡은 제거 */
export function normalizeSongs(parsed: unknown): ExtractedSong[] {
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as { songs?: unknown; verses?: unknown }
  const list = Array.isArray(obj.songs) ? obj.songs : Array.isArray(obj.verses) ? [obj] : []
  return list.map(normalizeExtracted).filter((s) => s.verses.length > 0)
}

/** 결과가 빈약한지(정밀 재시도 필요) — 곡이 없거나, 절 1개에 줄 2개 이하 */
export function isWeakResult(songs: ExtractedSong[]): boolean {
  if (songs.length === 0) return true
  const totalLines = songs.reduce((n, s) => n + s.verses.reduce((m, v) => m + v.lines.length, 0), 0)
  return songs.length === 1 && songs[0].verses.length <= 1 && totalLines <= 2
}

export type { ExtractResult }
