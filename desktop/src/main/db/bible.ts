import { getDb } from './index'
import { splitBibleVerses, formatReference } from '../../shared/bible'
import type { BibleDetail, BibleInput, BibleListItem } from '../../shared/ipc'

// bible_slides 테이블의 한 행 = 하나의 성경 본문(passage).
// text에 본문을 담고, 송출 시 절 단위로 분할한다(가사와 동일한 방식).

interface Row {
  id: number
  book: string
  chapter: number
  verse_range: string
  text: string
  translation: string | null
}

export function listBible(search?: string): BibleListItem[] {
  let sql = 'SELECT id, book, chapter, verse_range, text, translation FROM bible_slides'
  const params: Record<string, unknown> = {}
  if (search && search.trim()) {
    sql += ' WHERE book LIKE @q OR text LIKE @q'
    params.q = `%${search.trim()}%`
  }
  sql += ' ORDER BY id DESC'
  const rows = getDb().prepare(sql).all(params) as Row[]
  return rows.map((r) => ({
    id: r.id,
    reference: formatReference(r.book, r.chapter, r.verse_range),
    translation: r.translation,
    verseCount: splitBibleVerses(r.text).length
  }))
}

export function getBible(id: number): BibleDetail | null {
  const r = getDb().prepare('SELECT * FROM bible_slides WHERE id = ?').get(id) as Row | undefined
  if (!r) return null
  return {
    id: r.id,
    book: r.book,
    chapter: r.chapter,
    verseRange: r.verse_range,
    translation: r.translation,
    reference: formatReference(r.book, r.chapter, r.verse_range),
    text: r.text,
    verses: splitBibleVerses(r.text)
  }
}

export function saveBible(input: BibleInput): number {
  const db = getDb()
  if (input.id) {
    db.prepare(
      'UPDATE bible_slides SET book=?, chapter=?, verse_range=?, text=?, translation=? WHERE id=?'
    ).run(input.book, input.chapter, input.verseRange, input.text, input.translation ?? null, input.id)
    return input.id
  }
  const info = db
    .prepare(
      'INSERT INTO bible_slides (book, chapter, verse_range, text, translation) VALUES (?, ?, ?, ?, ?)'
    )
    .run(input.book, input.chapter, input.verseRange, input.text, input.translation ?? null)
  return Number(info.lastInsertRowid)
}

export function deleteBible(id: number): void {
  getDb().prepare('DELETE FROM bible_slides WHERE id = ?').run(id)
}

/** 플레이리스트 항목 표시용 참조 문자열 */
export function bibleReference(id: number): string | null {
  const r = getDb()
    .prepare('SELECT book, chapter, verse_range FROM bible_slides WHERE id = ?')
    .get(id) as Pick<Row, 'book' | 'chapter' | 'verse_range'> | undefined
  return r ? formatReference(r.book, r.chapter, r.verse_range) : null
}
