// 성경 본문 → 절 단위 분할 (main/renderer 공용)

export interface BibleVerseSplit {
  label: string | null
  text: string
}

/**
 * 본문을 줄 단위로 나눠 절 슬라이드를 만든다.
 * 각 줄이 절 번호로 시작하면("16 하나님이…") 그 번호를 라벨로 사용.
 */
export function splitBibleVerses(text: string): BibleVerseSplit[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)[.)]?\s+(.*)$/)
      if (m) return { label: m[1], text: m[2] }
      return { label: null, text: line }
    })
}

/** 표시용 성경 참조: "요한복음 3:16-17" */
export function formatReference(book: string, chapter: number | string, range: string): string {
  const r = range.trim()
  return r ? `${book} ${chapter}:${r}` : `${book} ${chapter}`
}
