import AdmZip from 'adm-zip'
import { readFile, readdir, stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import type { ImportOptions, ImportReport, SongInput } from '../shared/ipc'
import { parseJson, parseTxt, slidesToSongs, slideXmlInfo, type ParsedSong } from '../shared/songImportParse'
import { findDuplicateSong, saveSong } from './db/songs'

/**
 * 곡 대량 가져오기 — 교회가 이미 가진 자료(찬양 PPT, 텍스트, JSON)를 곡/절로 나눠 DB에 넣는다.
 *  - .txt  : 첫 줄 제목("478장 참 아름다워라" 형식이면 장 번호 인식), 이후 가사(빈 줄로 절 구분)
 *            "### [팀] 제목 (날짜)" 헤더가 여럿이면 한 파일에 여러 곡(벅스·유튜브 수집 형식)
 *  - .json : [{title, hymnNo?, category?, author?, lyrics? | verses?:[{label?,text}]}] 또는 {songs:[...]}
 *  - .pptx : 파일 = 곡(제목은 파일명), 슬라이드 = 절(페이지). 짧은 제목 슬라이드가 중간에 나오면 새 곡으로 나눔
 *  - 폴더  : 위 확장자를 재귀로 수집
 * 파싱 규칙 자체는 shared/songImportParse.ts (순수 함수) 참고.
 */

const SUPPORTED = new Set(['.txt', '.json', '.pptx'])

/** PPTX 바이너리 → 슬라이드별 텍스트+최대 글자 크기(순서대로) */
export function pptxToSlides(buf: Buffer): { text: string; maxSz: number | null }[] {
  const zip = new AdmZip(buf)
  const entries = zip
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide(\d+)\.xml$/.test(e.entryName))
    .sort((a, b) => Number(a.entryName.match(/slide(\d+)/)![1]) - Number(b.entryName.match(/slide(\d+)/)![1]))
  return entries.map((e) => {
    const info = slideXmlInfo(e.getData().toString('utf8'))
    return { text: info.paragraphs.join('\n'), maxSz: info.maxSz }
  })
}

async function collectFiles(paths: string[]): Promise<string[]> {
  const out: string[] = []
  const walk = async (p: string): Promise<void> => {
    const st = await stat(p)
    if (st.isDirectory()) {
      for (const name of await readdir(p)) {
        if (name.startsWith('.') || name.startsWith('~$')) continue
        await walk(join(p, name))
      }
    } else if (SUPPORTED.has(extname(p).toLowerCase())) {
      out.push(p)
    }
  }
  for (const p of paths) await walk(p)
  // 같은 이름의 .json과 .txt가 함께 있으면(수집 도구가 여러 형식으로 내보낸 경우) 구조가 있는 .json만 쓴다
  const jsonStems = new Set(out.filter((f) => extname(f).toLowerCase() === '.json').map((f) => f.slice(0, -5)))
  const picked = out.filter((f) => !(extname(f).toLowerCase() === '.txt' && jsonStems.has(f.slice(0, -4))))
  return picked.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

export async function parseFile(file: string): Promise<ParsedSong[]> {
  const ext = extname(file).toLowerCase()
  if (ext === '.pptx') return slidesToSongs(pptxToSlides(await readFile(file)), file)
  const content = await readFile(file, 'utf8')
  if (ext === '.json') return parseJson(content)
  return parseTxt(content, file)
}

/** 파일/폴더 목록을 가져와 DB에 저장하고 결과 보고 */
export async function importSongFiles(paths: string[], opts: ImportOptions): Promise<ImportReport> {
  const report: ImportReport = { imported: 0, overwritten: 0, skipped: 0, failed: [], titles: [] }
  const files = await collectFiles(paths)
  if (!files.length) {
    report.failed.push({ file: paths.join(', '), reason: '지원하는 파일(.txt/.json/.pptx)이 없습니다.' })
    return report
  }
  for (const file of files) {
    let songs: ParsedSong[]
    try {
      songs = await parseFile(file)
    } catch (e) {
      report.failed.push({ file: basename(file), reason: e instanceof Error ? e.message : String(e) })
      continue
    }
    if (!songs.length) {
      report.failed.push({ file: basename(file), reason: '가사를 찾지 못했습니다.' })
      continue
    }
    for (const s of songs) {
      const dup = findDuplicateSong(s.title, s.hymnNo)
      if (dup != null && opts.onDuplicate === 'skip') {
        report.skipped++
        continue
      }
      const input: SongInput = {
        id: dup ?? undefined,
        title: s.title,
        hymnNo: s.hymnNo,
        category: s.category || (s.hymnNo != null ? '새찬송가' : opts.category),
        author: s.author ?? null,
        verses: s.verses
      }
      saveSong(input)
      if (dup != null) report.overwritten++
      else report.imported++
      if (report.titles.length < 50) report.titles.push(s.hymnNo != null ? `${s.hymnNo}장 ${s.title}` : s.title)
    }
  }
  return report
}
