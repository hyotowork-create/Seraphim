// 성경 본문 파일 파서 — 여러 흔한 형식을 (책번호, 장, 절, 본문) 행으로 통일 (순수 함수)
import { findBook } from './bibleRef'

export interface ParsedVerse {
  book: number
  chapter: number
  verse: number
  text: string
}

export interface ParseStats {
  verses: ParsedVerse[]
  unparsed: number
}

/**
 * 지원 형식 (줄 단위, 빈 줄·주석(#) 무시):
 *  - "1\t1\t1\t태초에…"            (내장 형식: 책번호 장 절 본문, 탭 구분)
 *  - "창1:1 태초에…" / "창 1:1 태초에…" / "창세기 1:1 태초에…"  (한국 교회 PPT용 성경 txt에 흔함)
 *  - "1\t창세기\t창\t1\t1\t태초에…"   (책번호 책이름 약칭 장 절 본문, 위키문헌 정리본 TSV)
 *  - "창세기,1,1,태초에…" (CSV — 본문에 쉼표가 있으면 첫 3칸만 구분)
 *  - "Gen 1:1 In the beginning…" (OSIS 영문 약칭)
 */
export function parseBibleLines(content: string): ParseStats {
  const out: ParsedVerse[] = []
  let unparsed = 0
  const lines = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  // 구획형("== 창세기 (창) ==" 뒤에 "[1장]" 그리고 "1 본문") 상태
  let curBook: number | null = null
  let curChapter: number | null = null
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (/^book_no\t|^book\t|^번호\t|^약어\t/i.test(line)) continue // 헤더
    const h = line.match(/^=+\s*([가-힣0-9A-Za-z ]+?)\s*(?:\([^)]*\))?\s*=+$/)
    if (h) {
      const b = findBook(h[1])
      if (b) {
        curBook = b.no
        curChapter = null
        continue
      }
    }
    const ch = line.match(/^[\[【]?\s*(\d{1,3})\s*(?:장|편)\s*[\]】]?$/)
    if (ch && curBook != null) {
      curChapter = Number(ch[1])
      continue
    }
    const v = parseBibleLine(line)
    if (v) {
      out.push(v)
      continue
    }
    if (curBook != null && curChapter != null) {
      const vm = line.match(/^(\d{1,3})[.)]?\s+(.+)$/)
      if (vm) {
        const mv = mk(curBook, curChapter, Number(vm[1]), vm[2])
        if (mv) {
          out.push(mv)
          continue
        }
      }
    }
    unparsed++
  }
  return { verses: out, unparsed }
}

export function parseBibleLine(line: string): ParsedVerse | null {
  // 탭 구분
  if (line.includes('\t')) {
    const c = line.split('\t')
    if (c.length >= 4 && /^\d+$/.test(c[0]) && /^\d+$/.test(c[1]) && /^\d+$/.test(c[2])) {
      return mk(Number(c[0]), Number(c[1]), Number(c[2]), c.slice(3).join('\t'))
    }
    if (c.length >= 6 && /^\d+$/.test(c[0]) && /^\d+$/.test(c[3]) && /^\d+$/.test(c[4])) {
      return mk(Number(c[0]), Number(c[3]), Number(c[4]), c.slice(5).join('\t'))
    }
    if (c.length >= 4 && /^\d+$/.test(c[1]) && /^\d+$/.test(c[2])) {
      const b = findBook(c[0])
      if (b) return mk(b.no, Number(c[1]), Number(c[2]), c.slice(3).join('\t'))
    }
    // "약어\t책이름\t장\t절\t본문" 또는 "책이름\t약어\t장\t절\t본문"
    if (c.length >= 5 && /^\d+$/.test(c[2]) && /^\d+$/.test(c[3])) {
      const b = findBook(c[1]) ?? findBook(c[0])
      if (b) return mk(b.no, Number(c[2]), Number(c[3]), c.slice(4).join('\t'))
    }
  }
  // "책 장:절 본문"  (책은 한글/영문, 장:절 사이 : 또는 장 절 표기)
  let m = line.match(/^([가-힣A-Za-z0-9]{1,10}?)\s*(\d{1,3})\s*[:：]\s*(\d{1,3})\s+(.+)$/)
  if (m) {
    const b = findBook(m[1])
    if (b) return mk(b.no, Number(m[2]), Number(m[3]), m[4])
  }
  m = line.match(/^([가-힣]{1,10}?)\s*(\d{1,3})\s*장\s*(\d{1,3})\s*절\s+(.+)$/)
  if (m) {
    const b = findBook(m[1])
    if (b) return mk(b.no, Number(m[2]), Number(m[3]), m[4])
  }
  // CSV: 책,장,절,본문
  m = line.match(/^([^,]{1,12}),(\d{1,3}),(\d{1,3}),(.+)$/)
  if (m) {
    const b = /^\d+$/.test(m[1]) ? { no: Number(m[1]) } : findBook(m[1])
    if (b) return mk(b.no, Number(m[2]), Number(m[3]), m[4].replace(/^"|"$/g, ''))
  }
  return null
}

function mk(book: number, chapter: number, verse: number, text: string): ParsedVerse | null {
  const t = text.trim()
  if (!t || book < 1 || book > 66 || chapter < 1 || verse < 1) return null
  return { book, chapter, verse, text: t }
}

/** JSON: [{book|bookNo|book_no, chapter, verse, text}] 또는 {verses:[...]} / {books:[{book, chapters:[{chapter, verses:[{verse,text}]}]}]} */
export function parseBibleJson(content: string): ParseStats {
  const raw = JSON.parse(content.replace(/^﻿/, '')) as unknown
  const out: ParsedVerse[] = []
  let unparsed = 0
  const push = (book: unknown, chapter: unknown, verse: unknown, text: unknown): void => {
    const bookNo =
      typeof book === 'number' ? book : typeof book === 'string' ? (/^\d+$/.test(book) ? Number(book) : (findBook(book)?.no ?? 0)) : 0
    const v = mk(bookNo, Number(chapter), Number(verse), String(text ?? ''))
    if (v) out.push(v)
    else unparsed++
  }
  const flat = Array.isArray(raw) ? raw : (raw as { verses?: unknown })?.verses
  if (Array.isArray(flat)) {
    for (const it of flat) {
      const o = (it ?? {}) as Record<string, unknown>
      push(o.book ?? o.bookNo ?? o.book_no ?? o.bookName, o.chapter ?? o.ch, o.verse ?? o.v, o.text ?? o.content)
    }
    return { verses: out, unparsed }
  }
  const books = (raw as { books?: unknown })?.books
  if (Array.isArray(books)) {
    for (const b of books) {
      const bo = (b ?? {}) as Record<string, unknown>
      const chapters = Array.isArray(bo.chapters) ? bo.chapters : []
      for (const c of chapters) {
        const co = (c ?? {}) as Record<string, unknown>
        const verses = Array.isArray(co.verses) ? co.verses : []
        for (const v of verses) {
          const vo = (v ?? {}) as Record<string, unknown>
          push(bo.book ?? bo.bookNo ?? bo.book_no ?? bo.name, co.chapter ?? co.number, vo.verse ?? vo.number, vo.text)
        }
      }
    }
  }
  return { verses: out, unparsed }
}
