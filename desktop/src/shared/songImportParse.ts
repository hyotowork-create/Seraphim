// 곡 가져오기 파서 — main/renderer 공용 순수 함수 (텍스트/JSON/PPTX 슬라이드 XML → 곡·절)
import { splitVerses } from './lyrics'

function basenameNoExt(p: string): string {
  const b = p.split(/[\\/]/).pop() ?? p
  return b.replace(/\.[^.]+$/, '')
}

export interface ParsedSong {
  title: string
  hymnNo: number | null
  author?: string | null
  category?: string | null
  verses: { label?: string | null; text: string }[]
}

/** "478장 참 아름다워라", "478. 제목", "[478] 제목" → { hymnNo: 478, title: '참 아름다워라' } */
export function parseTitleLine(line: string): { title: string; hymnNo: number | null } {
  const t = line.trim().replace(/\.(txt|pptx|json)$/i, '')
  // 장 번호는 최대 3자리(새찬송가 645장) — '2026-09-20 …' 같은 날짜 파일명은 번호로 보지 않음
  const m = t.match(/^\s*[\[(]?\s*(\d{1,3})(?!\d)\s*[\])]?\s*(?:장|\.|-|:)?\s*(.*)$/)
  if (m && m[2].trim()) return { hymnNo: Number(m[1]), title: m[2].trim() }
  return { hymnNo: null, title: t }
}

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u
const TAG_WORD = /\b(official|live(\s*clip)?|lyrics?|m\/?v|audio|video|clip|full\s*ver|ver|cover|performance|acoustic)\b/i

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 음원·유튜브 사이트에서 긁어온 제목 정리:
 *  - 수학 굵은 글꼴("𝑳𝒊𝒗𝒆 𝑪𝒍𝒊𝒑") → 보통 글자, 이모지 이후는 버림("… 🤲 마커스 목요예배")
 *  - "(Official)", "[Live Clip]" 같은 태그 괄호 제거 ("(시편 119편)"은 유지)
 *  - " - 팀명 …", "_인도자 인도" 같은 꼬리 제거 (팀·가수·채널 이름은 names로 전달)
 */
export function cleanImportTitle(raw: string, names: (string | null | undefined)[] = []): string {
  let t = raw.normalize('NFKC').replace(/\s+/g, ' ').trim()
  const em = t.search(EMOJI_RE)
  if (em > 0) t = t.slice(0, em).trim()
  // 태그 괄호: (Official) (Live) (Acoustic Ver.) [MV] (인도 : 심종호) 등
  t = t.replace(/\s*[(\[]([^()\[\]]*)[)\]]/g, (m, inner: string) => (TAG_WORD.test(inner) || /^\s*인도\s*[:：]/.test(inner) ? '' : m))
  for (const n of names) {
    const name = typeof n === 'string' ? n.normalize('NFKC').trim() : ''
    if (name.length < 2) continue
    t = t.replace(new RegExp(`\\s*[-–—|]\\s*${escapeRe(name)}(?![가-힣A-Za-z0-9]).*$`, 'i'), '')
  }
  t = t.replace(/\s+_\S.*$/, '') // "_심종호 인도"
  t = t.replace(/\s*[(\[][^)\]]*$/, '') // 닫히지 않은 괄호 꼬리 "(축복송"
  t = t.replace(/[\s\-–—|/]+$/, '').replace(/^[\s\-–—|/]+/, '').trim()
  return t || raw.trim()
}

const MULTI_HEADER_RE = /^###\s+(?:\[([^\]]*)\]\s*)?(.*?)\s*(?:\((?:\d{4}[-.]\d{1,2}[-.]\d{1,2}|undefined|null)[^)]*\))?\s*$/

/**
 * 여러 곡이 "### [팀] 제목 (날짜, 앨범)" 헤더로 이어진 텍스트 → 곡 목록 (벅스·유튜브 수집 txt 형식).
 * 헤더가 2개 이상일 때만 이 형식으로 본다. URL만 있는 줄은 버린다.
 */
function parseMultiSongTxt(lines: string[]): ParsedSong[] | null {
  const heads = lines.map((l, i) => (MULTI_HEADER_RE.test(l.trim()) && l.trim().startsWith('### ') ? i : -1)).filter((i) => i >= 0)
  if (heads.length < 2) return null
  const out: ParsedSong[] = []
  heads.forEach((start, k) => {
    const end = k + 1 < heads.length ? heads[k + 1] : lines.length
    const m = lines[start].trim().match(MULTI_HEADER_RE)!
    const team = (m[1] ?? '').trim() || null
    const title = cleanImportTitle(m[2], [team])
    const body = lines
      .slice(start + 1, end)
      .filter((l) => !/^\s*https?:\/\/\S+\s*$/.test(l))
      .join('\n')
    const verses = splitVerses(body)
    if (!title || !verses.length) return
    out.push({ title, hymnNo: null, author: team, verses })
  })
  return out
}

export function parseTxt(content: string, fileName: string): ParsedSong[] {
  const text = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const multi = parseMultiSongTxt(lines)
  if (multi) return multi
  const firstIdx = lines.findIndex((l) => l.trim())
  if (firstIdx < 0) return []
  let head = parseTitleLine(lines[firstIdx])
  let body = lines.slice(firstIdx + 1).join('\n')
  // 첫 줄이 라벨("1절")이거나 제목이 너무 길면 파일명을 제목으로
  if (/^(\d+\s*절|후렴|verse|chorus)/i.test(lines[firstIdx].trim()) || head.title.length > 40) {
    head = parseTitleLine(basenameNoExt(fileName))
    body = lines.slice(firstIdx).join('\n')
  }
  const verses = splitVerses(body)
  if (!verses.length) return []
  return [{ title: head.title, hymnNo: head.hymnNo, verses }]
}

export function parseJson(content: string): ParsedSong[] {
  const raw = JSON.parse(content.replace(/^﻿/, '')) as unknown
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { songs?: unknown }).songs)
      ? ((raw as { songs: unknown[] }).songs)
      : []
  const out: ParsedSong[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const titleRaw = typeof o.title === 'string' ? o.title : ''
    if (!titleRaw.trim()) continue
    const parsed = parseTitleLine(titleRaw)
    // hymnNo | number | no 필드, 또는 제목의 "478장" 표기에서 장 번호.
    // "12. 제목"처럼 점·괄호 번호는 음원 트랙 번호일 수 있으므로 카테고리가 찬송가일 때만 장 번호로 본다
    const noField = o.hymnNo ?? o.number ?? o.no
    const isHymnal = typeof o.category === 'string' && /찬송/.test(o.category)
    const hymnNo =
      typeof noField === 'number'
        ? noField
        : typeof noField === 'string' && /^\d+$/.test(noField)
          ? Number(noField)
          : parsed.hymnNo != null && (isHymnal || /^\s*[\[(]?\s*\d{1,3}\s*[\])]?\s*장/.test(titleRaw))
            ? parsed.hymnNo
            : null
    let verses: { label?: string | null; text: string }[] = []
    if (Array.isArray(o.verses)) {
      verses = o.verses
        .map((v) => {
          if (typeof v === 'string') return { text: v.trim() }
          const vv = (v ?? {}) as { label?: unknown; text?: unknown; lines?: unknown }
          const text =
            typeof vv.text === 'string' ? vv.text : Array.isArray(vv.lines) ? vv.lines.map(String).join('\n') : ''
          return { label: typeof vv.label === 'string' ? vv.label : null, text: text.trim() }
        })
        .filter((v) => v.text)
    } else if (typeof o.lyrics === 'string') {
      // "1. 가사…" 처럼 절 번호가 첫 줄에 붙어 있으면 라벨로 분리
      verses = splitVerses(o.lyrics).map((v) => {
        const m = v.text.match(/^\(?(\d{1,2})[.)]\s+([\s\S]*)$/)
        return m ? { label: `${Number(m[1])}절`, text: m[2].trim() } : v
      })
    }
    if (!verses.length) continue
    // 작사자: author > artist(가수) > team(팀) > channelName(유튜브 채널) 순으로 채움 (벅스·유튜브 수집 형식 대응)
    const authorField = [o.author, o.artist, o.singer, o.team, o.channelName].find((v) => typeof v === 'string' && v.trim())
    // 제목: 장 번호로 인식됐거나 트랙 번호("12. ")가 붙어 있으면 번호를 떼고, 사이트 꼬리표를 정리
    const titleBase = parsed.hymnNo != null ? parsed.title : titleRaw
    const title = cleanImportTitle(titleBase, [o.team, o.artist, o.singer, o.channelName].filter((v): v is string => typeof v === 'string'))
    if (!title) continue
    out.push({
      title,
      hymnNo,
      author: typeof authorField === 'string' ? authorField.trim() : null,
      category: typeof o.category === 'string' ? o.category : null,
      verses
    })
  }
  return out
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

/** 슬라이드 XML → 문단 배열 (각 문단은 <a:t> 조각을 이어 붙인 것) */
export function slideXmlToParagraphs(xml: string): string[] {
  return slideXmlInfo(xml).paragraphs
}

export interface SlideInfo {
  paragraphs: string[]
  /** 슬라이드에서 가장 큰 글자 크기(1/100pt, <a:rPr sz>). 없으면 null */
  maxSz: number | null
}

/** 슬라이드 XML → 문단 + 최대 글자 크기 (제목 슬라이드 판별용) */
export function slideXmlInfo(xml: string): SlideInfo {
  const paras: string[] = []
  let maxSz: number | null = null
  const pRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g
  let pm: RegExpExecArray | null
  while ((pm = pRe.exec(xml))) {
    const inner = pm[1]
    let text = ''
    const tRe = /<a:t>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g
    let tm: RegExpExecArray | null
    while ((tm = tRe.exec(inner))) {
      text += tm[1] !== undefined ? decodeXml(tm[1]) : '\n'
    }
    const cleaned = text.replace(/[ \t]+$/gm, '').trim()
    if (cleaned) {
      paras.push(cleaned)
      const szRe = /<a:(?:rPr|endParaRPr|defRPr)\b[^>]*\bsz="(\d+)"/g
      let sm: RegExpExecArray | null
      while ((sm = szRe.exec(inner))) {
        const n = Number(sm[1])
        if (n > 0 && (maxSz == null || n > maxSz)) maxSz = n
      }
    }
  }
  return { paragraphs: paras, maxSz }
}

/** 슬라이드 텍스트가 "제목 슬라이드"처럼 보이는지 (한 줄, 짧음, 라벨 아님) */
function looksLikeTitleSlide(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim())
  return lines.length === 1 && lines[0].trim().length <= 20 && !/^(\d+\s*절|후렴)/.test(lines[0].trim())
}

/** 가사 슬라이드처럼 보이는지 (두 줄 이상, 또는 한 줄이라도 제법 김) */
function looksLikeLyricSlide(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim())
  return lines.length >= 2 || (lines.length === 1 && lines[0].trim().length > 20)
}

/**
 * 슬라이드 목록 → 곡 목록.
 * 기본: 파일 = 곡, 슬라이드 = 절(페이지). 중간에 제목 슬라이드가 나오면 그 뒤를 새 곡으로 나눈다.
 */
export function slidesToSongs(slides: (string | { text: string; maxSz: number | null })[], fileName: string): ParsedSong[] {
  const items = slides
    .map((s) => (typeof s === 'string' ? { text: s.trim(), maxSz: null as number | null } : { text: s.text.trim(), maxSz: s.maxSz }))
    .filter((s) => s.text)
  if (!items.length) return []
  const nonEmpty = items.map((s) => s.text)
  // 글자 크기 기준: 두 줄 이상인(가사) 슬라이드들의 최대 글자 크기 중앙값. 제목 슬라이드는 보통 이보다 뚜렷이 크다
  const lyricSizes = items.filter((s) => s.maxSz != null && looksLikeLyricSlide(s.text)).map((s) => s.maxSz as number).sort((a, b) => a - b)
  const medianSz = lyricSizes.length ? lyricSizes[Math.floor(lyricSizes.length / 2)] : null
  const bigFont = (i: number): boolean => {
    const sz = items[i].maxSz
    return medianSz != null && sz != null && sz >= medianSz * 1.3
  }
  const songs: ParsedSong[] = []
  const fileTitle = parseTitleLine(basenameNoExt(fileName))
  let cur: ParsedSong | null = null
  const startSong = (title: string, hymnNo: number | null): void => {
    cur = { title, hymnNo, verses: [] }
    songs.push(cur)
  }
  nonEmpty.forEach((text, i) => {
    const next = nonEmpty[i + 1]
    // 제목 슬라이드 = 짧은 한 줄이면서 (글자가 가사 슬라이드보다 뚜렷이 크거나, 바로 뒤에 가사 슬라이드가 오는) 경우
    // 글자 크기 정보가 있는 파일은 크기로만 판별(한 줄짜리 가사 슬라이드 오인 방지), 없으면 뒤 슬라이드 모양으로 추정
    const isTitle = looksLikeTitleSlide(text) && (medianSz != null ? bigFont(i) : !!next && looksLikeLyricSlide(next))
    if (isTitle) {
      const t = parseTitleLine(text)
      startSong(t.title, t.hymnNo)
      return
    }
    if (!cur) startSong(fileTitle.title, fileTitle.hymnNo)
    cur!.verses.push({ text })
  })
  return songs.filter((s) => s.verses.length > 0)
}

