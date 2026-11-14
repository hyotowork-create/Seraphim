// 예배 순서지(한 줄 = 한 항목) 해석 — main/renderer 공용 순수 함수
// 예) "1. 참 아름다워라(D) – 1-3절 – 2번 연결~", "478장", "요 3:16-18", "물 위를 걷는 자(A) - 후렴 2번 반복"
import { parseBibleRef, formatBibleRef, type BibleRef } from './bibleRef'

export type OrderLineKind = 'bible' | 'hymn' | 'song' | 'blank'

export interface OrderLine {
  /** 원문 줄 */
  raw: string
  kind: OrderLineKind
  /** 검색용으로 정리한 제목 (song) */
  query: string
  /** 찬송가 장 번호 (hymn) */
  hymnNo: number | null
  /** 성경 참조 (bible) */
  ref: BibleRef | null
  /** 표시용 참조 문자열 (bible) */
  refText: string | null
  /** "1-3절", "1,2절", "후렴 2번" 같은 절/반복 메모 */
  note: string | null
}

/** 순서지 텍스트 → 줄 항목. 빈 줄·제목줄("2026. 9. 20 주일1부 찬양…")은 blank로 둔다 */
export function parseOrderSheet(text: string): OrderLine[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(parseOrderLine)
}

export function parseOrderLine(rawLine: string): OrderLine {
  const raw = rawLine.trim()
  const empty: OrderLine = { raw, kind: 'blank', query: '', hymnNo: null, ref: null, refText: null, note: null }
  if (!raw) return empty
  let s = raw
  // 앞 번호 제거: "1.", "1)", "①", "(1)", "1 -"
  s = s.replace(/^\s*(?:[①-⑳]|[(\[]?\d{1,2}[.)\]]|\d{1,2}\s*[-–:])\s*/, '')
  // 날짜/제목줄("2026. 9. 20 주일1부 찬양(key는…)")은 항목 아님
  if (/^\d{4}\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{1,2}/.test(s) || /^(예배|찬양)\s*순서/.test(s)) return empty
  // 메모(절·반복) 추출
  const notes: string[] = []
  const noteRe = /(?:[-–~,:]\s*)?((?:\d{1,2}\s*[-~,]\s*)*\d{1,2}\s*절(?:\s*(?:만|까지))?|후렴\s*(?:\d+|한|두|세)?\s*번?\s*(?:더\s*)?반복|(?:\d+|한|두|세)\s*번\s*(?:더\s*)?(?:반복|연결)|전체|전곡)[!~]*/g
  s = s.replace(noteRe, (_m, g1: string) => {
    notes.push(g1.trim())
    return ' '
  })
  // 조표·키 표기 "(D)", "(Ab)", "(key: G)", "- D키"
  s = s.replace(/\(\s*(?:key\s*[:=]?\s*)?[A-G][#b]?m?\s*\)/gi, ' ').replace(/\s[A-G][#b]?\s*키\b/g, ' ')
  // 꼬리 장식 "~", "!", "-" 정리
  // 남은 구분자·장식 정리 (", ", "-", "~", "!")
  s = s.replace(/\s*[,\-–~!:]+\s*(?=[,\-–~!:]|$)/g, '').replace(/^\s*[,\-–~!:]+\s*/, '').replace(/\s{2,}/g, ' ').trim()
  const note = notes.length ? notes.join(', ') : null

  // 성경 참조?
  const ref = parseBibleRef(s)
  if (ref) return { raw, kind: 'bible', query: '', hymnNo: null, ref, refText: formatBibleRef(ref), note }

  // 찬송가 장 번호? "478장", "478", "새찬송가 478장", "찬송 478"
  const hm = s.match(/^(?:새?찬송가?|찬송|통일찬송가?)?\s*(\d{1,3})\s*장?\s*(.*)$/)
  if (hm && (hm[2].trim() === '' || /장/.test(s))) {
    const rest = hm[2].trim()
    return { raw, kind: 'hymn', query: rest, hymnNo: Number(hm[1]), ref: null, refText: null, note }
  }
  return { raw, kind: 'song', query: s, hymnNo: null, ref: null, refText: null, note }
}

/** 제목 비교용 정규화: 공백·구두점 제거, 소문자 */
export function normalizeSongQuery(t: string): string {
  return t
    .toLowerCase()
    .replace(/^\s*\d{1,3}\s*장\s*/, '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

/** 메모("1-3절", "1,2절", "2절만", "1-3절, 후렴 2번 반복")에서 부를 절 번호 집합. 절 표기가 없으면 null(전체) */
export function parseVerseSelection(note: string | null | undefined): Set<number> | null {
  if (!note) return null
  const nums = new Set<number>()
  const re = /((?:\d{1,2}\s*[-~,]\s*)*\d{1,2})\s*절/g
  let m: RegExpExecArray | null
  while ((m = re.exec(note))) {
    for (const part of m[1].split(',')) {
      const r = part.trim().match(/^(\d{1,2})\s*[-~]\s*(\d{1,2})$/)
      if (r) {
        const a = Number(r[1])
        const b = Number(r[2])
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) nums.add(i)
      } else if (/^\d{1,2}$/.test(part.trim())) nums.add(Number(part.trim()))
    }
  }
  return nums.size ? nums : null
}
