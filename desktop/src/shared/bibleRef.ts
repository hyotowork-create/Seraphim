// 성경 참조(구절 표기) 파서 — main/renderer 공용 순수 모듈
// "요3:16", "요 3:16-18", "요한복음 3장 16절", "요한복음 3:16~18", "시 23편", "창1:1-2:3", "요일 1:9" 등을 해석

export interface BibleBook {
  /** 1~66 */
  no: number
  /** 정식 한글 이름 */
  name: string
  /** 약칭·별칭 (한글) */
  abbr: string[]
  /** 영문 약칭 (OSIS) */
  osis: string
  chapters: number
}

// 약칭은 대한성서공회·통용 약어 기준. 앞의 것이 우선.
export const BIBLE_BOOKS: BibleBook[] = [
  { no: 1, name: '창세기', abbr: ['창'], osis: 'Gen', chapters: 50 },
  { no: 2, name: '출애굽기', abbr: ['출'], osis: 'Exod', chapters: 40 },
  { no: 3, name: '레위기', abbr: ['레'], osis: 'Lev', chapters: 27 },
  { no: 4, name: '민수기', abbr: ['민'], osis: 'Num', chapters: 36 },
  { no: 5, name: '신명기', abbr: ['신'], osis: 'Deut', chapters: 34 },
  { no: 6, name: '여호수아', abbr: ['수', '여호수아서'], osis: 'Josh', chapters: 24 },
  { no: 7, name: '사사기', abbr: ['삿'], osis: 'Judg', chapters: 21 },
  { no: 8, name: '룻기', abbr: ['룻'], osis: 'Ruth', chapters: 4 },
  { no: 9, name: '사무엘상', abbr: ['삼상'], osis: '1Sam', chapters: 31 },
  { no: 10, name: '사무엘하', abbr: ['삼하'], osis: '2Sam', chapters: 24 },
  { no: 11, name: '열왕기상', abbr: ['왕상'], osis: '1Kgs', chapters: 22 },
  { no: 12, name: '열왕기하', abbr: ['왕하'], osis: '2Kgs', chapters: 25 },
  { no: 13, name: '역대상', abbr: ['대상'], osis: '1Chr', chapters: 29 },
  { no: 14, name: '역대하', abbr: ['대하'], osis: '2Chr', chapters: 36 },
  { no: 15, name: '에스라', abbr: ['스'], osis: 'Ezra', chapters: 10 },
  { no: 16, name: '느헤미야', abbr: ['느'], osis: 'Neh', chapters: 13 },
  { no: 17, name: '에스더', abbr: ['에'], osis: 'Esth', chapters: 10 },
  { no: 18, name: '욥기', abbr: ['욥'], osis: 'Job', chapters: 42 },
  { no: 19, name: '시편', abbr: ['시'], osis: 'Ps', chapters: 150 },
  { no: 20, name: '잠언', abbr: ['잠'], osis: 'Prov', chapters: 31 },
  { no: 21, name: '전도서', abbr: ['전'], osis: 'Eccl', chapters: 12 },
  { no: 22, name: '아가', abbr: ['아'], osis: 'Song', chapters: 8 },
  { no: 23, name: '이사야', abbr: ['사'], osis: 'Isa', chapters: 66 },
  { no: 24, name: '예레미야', abbr: ['렘'], osis: 'Jer', chapters: 52 },
  { no: 25, name: '예레미야애가', abbr: ['애', '애가'], osis: 'Lam', chapters: 5 },
  { no: 26, name: '에스겔', abbr: ['겔'], osis: 'Ezek', chapters: 48 },
  { no: 27, name: '다니엘', abbr: ['단'], osis: 'Dan', chapters: 12 },
  { no: 28, name: '호세아', abbr: ['호'], osis: 'Hos', chapters: 14 },
  { no: 29, name: '요엘', abbr: ['욜'], osis: 'Joel', chapters: 3 },
  { no: 30, name: '아모스', abbr: ['암'], osis: 'Amos', chapters: 9 },
  { no: 31, name: '오바댜', abbr: ['옵'], osis: 'Obad', chapters: 1 },
  { no: 32, name: '요나', abbr: ['욘'], osis: 'Jonah', chapters: 4 },
  { no: 33, name: '미가', abbr: ['미'], osis: 'Mic', chapters: 7 },
  { no: 34, name: '나훔', abbr: ['나'], osis: 'Nah', chapters: 3 },
  { no: 35, name: '하박국', abbr: ['합'], osis: 'Hab', chapters: 3 },
  { no: 36, name: '스바냐', abbr: ['습'], osis: 'Zeph', chapters: 3 },
  { no: 37, name: '학개', abbr: ['학'], osis: 'Hag', chapters: 2 },
  { no: 38, name: '스가랴', abbr: ['슥'], osis: 'Zech', chapters: 14 },
  { no: 39, name: '말라기', abbr: ['말'], osis: 'Mal', chapters: 4 },
  { no: 40, name: '마태복음', abbr: ['마', '마태'], osis: 'Matt', chapters: 28 },
  { no: 41, name: '마가복음', abbr: ['막', '마가'], osis: 'Mark', chapters: 16 },
  { no: 42, name: '누가복음', abbr: ['눅', '누가'], osis: 'Luke', chapters: 24 },
  { no: 43, name: '요한복음', abbr: ['요', '요한'], osis: 'John', chapters: 21 },
  { no: 44, name: '사도행전', abbr: ['행'], osis: 'Acts', chapters: 28 },
  { no: 45, name: '로마서', abbr: ['롬'], osis: 'Rom', chapters: 16 },
  { no: 46, name: '고린도전서', abbr: ['고전'], osis: '1Cor', chapters: 16 },
  { no: 47, name: '고린도후서', abbr: ['고후'], osis: '2Cor', chapters: 13 },
  { no: 48, name: '갈라디아서', abbr: ['갈'], osis: 'Gal', chapters: 6 },
  { no: 49, name: '에베소서', abbr: ['엡'], osis: 'Eph', chapters: 6 },
  { no: 50, name: '빌립보서', abbr: ['빌'], osis: 'Phil', chapters: 4 },
  { no: 51, name: '골로새서', abbr: ['골'], osis: 'Col', chapters: 4 },
  { no: 52, name: '데살로니가전서', abbr: ['살전'], osis: '1Thess', chapters: 5 },
  { no: 53, name: '데살로니가후서', abbr: ['살후'], osis: '2Thess', chapters: 3 },
  { no: 54, name: '디모데전서', abbr: ['딤전'], osis: '1Tim', chapters: 6 },
  { no: 55, name: '디모데후서', abbr: ['딤후'], osis: '2Tim', chapters: 4 },
  { no: 56, name: '디도서', abbr: ['딛'], osis: 'Titus', chapters: 3 },
  { no: 57, name: '빌레몬서', abbr: ['몬'], osis: 'Phlm', chapters: 1 },
  { no: 58, name: '히브리서', abbr: ['히'], osis: 'Heb', chapters: 13 },
  { no: 59, name: '야고보서', abbr: ['약'], osis: 'Jas', chapters: 5 },
  { no: 60, name: '베드로전서', abbr: ['벧전'], osis: '1Pet', chapters: 5 },
  { no: 61, name: '베드로후서', abbr: ['벧후'], osis: '2Pet', chapters: 3 },
  { no: 62, name: '요한일서', abbr: ['요일', '요1서', '요한1서'], osis: '1John', chapters: 5 },
  { no: 63, name: '요한이서', abbr: ['요이', '요2서', '요한2서'], osis: '2John', chapters: 1 },
  { no: 64, name: '요한삼서', abbr: ['요삼', '요3서', '요한3서'], osis: '3John', chapters: 1 },
  { no: 65, name: '유다서', abbr: ['유'], osis: 'Jude', chapters: 1 },
  { no: 66, name: '요한계시록', abbr: ['계', '계시록'], osis: 'Rev', chapters: 22 }
]

const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase()

/** 책 이름/약칭 → 책 (없으면 null). 정식명·약칭·"…서" 생략형·OSIS 영문 지원 */
export function findBook(raw: string): BibleBook | null {
  const key = norm(raw)
  if (!key) return null
  for (const b of BIBLE_BOOKS) {
    if (norm(b.name) === key) return b
    if (b.abbr.some((a) => norm(a) === key)) return b
    if (b.osis.toLowerCase() === key) return b
  }
  // "로마", "갈라디아", "고린도전" 처럼 뒤에 서/기/복음이 빠진 경우 → 앞부분 일치 (2글자 이상)
  if (key.length >= 2) {
    const hit = BIBLE_BOOKS.filter((b) => norm(b.name).startsWith(key))
    if (hit.length === 1) return hit[0]
  }
  return null
}

export interface BibleRef {
  book: BibleBook
  chapter: number
  /** 시작 절 (없으면 장 전체) */
  verseStart: number | null
  /** 끝 절 (없으면 단일 절 또는 장 전체) */
  verseEnd: number | null
  /** 장을 넘어가는 범위("창1:1-2:3")의 끝 장 */
  endChapter: number | null
}

/**
 * 참조 문자열 해석. 지원 예:
 *  "요3:16" "요 3:16" "요 3:16-18" "요3:16~18" "요3,16" "요한복음 3장 16절" "요한복음 3장 16-18절"
 *  "시 23편" "시23" (장 전체) "창1:1-2:3" (장 넘김) "요일 1:9" "John 3:16"
 */
export function parseBibleRef(input: string): BibleRef | null {
  let s = input.trim().replace(/[~–—]/g, '-').replace(/[，、]/g, ',')
  if (!s) return null
  // 책 이름 부분: 숫자로 시작하는 책(1John 등)도 허용 → 첫 "숫자 뒤에 : 또는 장/편" 패턴 앞까지를 책으로 본다
  // 장·절 구분: ':' ',' '.' 또는 '3장 16절'처럼 공백
  const m = s.match(/^(.+?)\s*(\d{1,3})\s*(?:장|편)?\s*(?:[:：,.\s]\s*(\d{1,3})\s*(?:절)?)?\s*(?:-\s*(?:(\d{1,3})\s*[:：]\s*)?(\d{1,3})\s*(?:절)?)?\s*$/)
  if (!m) return null
  const book = findBook(m[1])
  if (!book) return null
  const chapter = Number(m[2])
  if (chapter < 1 || chapter > book.chapters) return null
  const verseStart = m[3] ? Number(m[3]) : null
  let verseEnd: number | null = m[5] ? Number(m[5]) : null
  let endChapter: number | null = m[4] ? Number(m[4]) : null
  if (verseStart == null && verseEnd != null && endChapter == null) {
    // "시 23-24" 처럼 절 없이 범위가 오면 장 범위로 해석
    endChapter = verseEnd
    verseEnd = null
  }
  if (endChapter != null && (endChapter < chapter || endChapter > book.chapters)) return null
  if (verseStart != null && verseEnd != null && endChapter == null && verseEnd < verseStart) return null
  return { book, chapter, verseStart, verseEnd, endChapter }
}

/** 표시용: "요한복음 3:16-18", "시편 23", "창세기 1:1-2:3" */
export function formatBibleRef(r: BibleRef): string {
  const b = r.book.name
  if (r.verseStart == null) {
    return r.endChapter != null ? `${b} ${r.chapter}-${r.endChapter}` : `${b} ${r.chapter}`
  }
  if (r.endChapter != null) return `${b} ${r.chapter}:${r.verseStart}-${r.endChapter}:${r.verseEnd ?? ''}`
  if (r.verseEnd != null && r.verseEnd !== r.verseStart) return `${b} ${r.chapter}:${r.verseStart}-${r.verseEnd}`
  return `${b} ${r.chapter}:${r.verseStart}`
}

/** 절 범위 문자열(BibleInput.verseRange 용): "16-18", "16", "" (장 전체) */
export function verseRangeString(r: BibleRef): string {
  if (r.verseStart == null) return ''
  if (r.endChapter != null) return `${r.verseStart}-${r.endChapter}:${r.verseEnd ?? ''}`
  if (r.verseEnd != null && r.verseEnd !== r.verseStart) return `${r.verseStart}-${r.verseEnd}`
  return String(r.verseStart)
}
