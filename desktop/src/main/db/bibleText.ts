import { getDb } from './index'
import { BIBLE_BOOKS, formatBibleRef, parseBibleRef, verseRangeString, type BibleRef } from '../../shared/bibleRef'
import { BIBLE_TRANSLATION_NAMES, type BibleLookupResult, type BibleTranslationInfo } from '../../shared/ipc'

// 성경 본문 DB — 번역본별 (책, 장, 절) → 본문. 구절 표기를 치면 본문을 불러오는 데 사용.

export interface VerseRow {
  book: number
  chapter: number
  verse: number
  text: string
}

export function listTranslations(): BibleTranslationInfo[] {
  const rows = getDb()
    .prepare(
      `SELECT t.code, t.name, t.bundled,
         (SELECT COUNT(*) FROM bible_text b WHERE b.translation = t.code) AS verseCount
       FROM bible_translations t ORDER BY t.bundled DESC, t.created_at ASC`
    )
    .all() as { code: string; name: string; bundled: number; verseCount: number }[]
  return rows.map((r) => ({ code: r.code, name: r.name, bundled: !!r.bundled, verseCount: r.verseCount }))
}

export function hasTranslation(code: string): boolean {
  return translationName(code) != null
}

/** 설치된 번역본 이름 (없으면 null) */
export function translationName(code: string): string | null {
  const r = getDb().prepare('SELECT name FROM bible_translations WHERE code = ?').get(code) as { name: string } | undefined
  return r?.name ?? null
}

/** 번역본 본문 전량 교체(같은 코드가 있으면 지우고 다시 넣음). 반환: 넣은 절 수 */
export function replaceTranslation(code: string, name: string, bundled: boolean, verses: VerseRow[]): number {
  const db = getDb()
  const tx = db.transaction((): number => {
    db.prepare('DELETE FROM bible_text WHERE translation = ?').run(code)
    db.prepare(
      `INSERT INTO bible_translations (code, name, bundled, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET name = excluded.name, bundled = excluded.bundled`
    ).run(code, name, bundled ? 1 : 0, new Date().toISOString())
    const ins = db.prepare(
      'INSERT OR REPLACE INTO bible_text (translation, book, chapter, verse, text) VALUES (?, ?, ?, ?, ?)'
    )
    let n = 0
    for (const v of verses) {
      if (v.book < 1 || v.book > 66 || v.chapter < 1 || v.verse < 1 || !v.text) continue
      ins.run(code, v.book, v.chapter, v.verse, v.text)
      n++
    }
    return n
  })
  return tx()
}

export function removeTranslation(code: string): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM bible_text WHERE translation = ?').run(code)
    db.prepare('DELETE FROM bible_translations WHERE code = ?').run(code)
  })()
}

function fetchVerses(code: string, r: BibleRef): VerseRow[] {
  const db = getDb()
  const bookNo = r.book.no
  if (r.verseStart == null) {
    // 장 전체(또는 장 범위)
    const endCh = r.endChapter ?? r.chapter
    return db
      .prepare(
        `SELECT book, chapter, verse, text FROM bible_text
         WHERE translation = ? AND book = ? AND chapter BETWEEN ? AND ? ORDER BY chapter, verse`
      )
      .all(code, bookNo, r.chapter, endCh) as VerseRow[]
  }
  if (r.endChapter != null) {
    // 장을 넘어가는 범위: (chapter, verseStart) ~ (endChapter, verseEnd|끝)
    return db
      .prepare(
        `SELECT book, chapter, verse, text FROM bible_text
         WHERE translation = ? AND book = ?
           AND ((chapter = ? AND verse >= ?) OR (chapter > ? AND chapter < ?) OR (chapter = ? AND verse <= ?))
         ORDER BY chapter, verse`
      )
      .all(code, bookNo, r.chapter, r.verseStart, r.chapter, r.endChapter, r.endChapter, r.verseEnd ?? 999) as VerseRow[]
  }
  const endV = r.verseEnd ?? r.verseStart
  return db
    .prepare(
      `SELECT book, chapter, verse, text FROM bible_text
       WHERE translation = ? AND book = ? AND chapter = ? AND verse BETWEEN ? AND ? ORDER BY verse`
    )
    .all(code, bookNo, r.chapter, r.verseStart, endV) as VerseRow[]
}

/**
 * 구절 표기 → 본문. 번역본이 없거나 참조를 해석 못 하면 Error.
 * 편집기 형식: 한 줄 = "절번호 본문" (장 범위면 "3:16 본문"처럼 장:절 표기)
 */
export function lookupPassage(refText: string, code: string): BibleLookupResult {
  const r = parseBibleRef(refText)
  if (!r) {
    throw new Error(`구절을 이해하지 못했습니다: "${refText}". 예) 요 3:16, 요한복음 3장 16-18절, 시 23편`)
  }
  const name = translationName(code)
  if (name == null) {
    throw new Error(`번역본(${BIBLE_TRANSLATION_NAMES[code] ?? code})이 설치되어 있지 않습니다. 설정 → 성경 본문에서 설치하세요.`)
  }
  const verses = fetchVerses(code, r)
  if (!verses.length) {
    throw new Error(`${formatBibleRef(r)} 본문이 없습니다. 장·절 번호를 확인하세요.`)
  }
  const multiChapter = verses.some((v) => v.chapter !== r.chapter)
  const text = verses.map((v) => `${multiChapter ? `${v.chapter}:` : ''}${v.verse} ${v.text}`).join('\n')
  return {
    reference: formatBibleRef(r),
    book: r.book.name,
    chapter: r.chapter,
    verseRange: verseRangeString(r),
    translation: code,
    translationName: name,
    verses: verses.map((v) => ({ chapter: v.chapter, verse: v.verse, text: v.text })),
    text
  }
}

export { BIBLE_BOOKS }
