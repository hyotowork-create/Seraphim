// 가사 원문 → 절(verse) 자동 분할. main/renderer 공용 (순수 함수)

export interface SplitVerse {
  label: string
  text: string
}

// 절 구분 라벨로 인식할 한 줄 패턴 (예: "1절", "후렴", "후렴2", "간주", "Verse 1", "Chorus", "1.")
const LABEL_RE =
  /^(\d+\s*절|후렴(\s*\d+)?|간주|전주|후주|엔딩|브릿지|브리지|코러스|프리코러스|verse\s*\d*|chorus|bridge|pre-?chorus|intro|outro|tag)\s*[:.)]?\s*$/i

/**
 * 빈 줄(1줄 이상)을 기준으로 절을 나눈다.
 * - 블록 첫 줄이 라벨처럼 보이면 그 줄을 라벨로, 나머지를 가사로 사용
 * - 아니면 "1절, 2절 …" 자동 번호를 라벨로 부여
 */
/** 송출 시 한 화면에 보일 최대 줄 수 (가사 4줄 기준) */
export const PAGE_MAX_LINES = 4

/**
 * 한 절의 텍스트를 4줄 기준 페이지로 분할.
 * 긴 절은 4줄씩 여러 장으로 나눠 순차 송출한다.
 */
export function paginate(text: string, maxLines: number = PAGE_MAX_LINES): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const pages: string[] = []
  for (let i = 0; i < lines.length; i += maxLines) {
    pages.push(lines.slice(i, i + maxLines).join('\n'))
  }
  return pages.length ? pages : ['']
}

export function splitVerses(raw: string): SplitVerse[] {
  const blocks = raw.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/)
  const out: SplitVerse[] = []
  let autoNo = 0

  for (const block of blocks) {
    const trimmed = block.replace(/^\n+|\n+$/g, '')
    if (!trimmed.trim()) continue

    const lines = trimmed.split('\n')
    if (lines.length > 1 && LABEL_RE.test(lines[0].trim())) {
      const label = lines[0].trim().replace(/\s*[:.)]\s*$/, '')
      const text = lines.slice(1).join('\n').trim()
      if (text) out.push({ label, text })
    } else {
      autoNo += 1
      out.push({ label: `${autoNo}절`, text: trimmed.trim() })
    }
  }
  return out
}
