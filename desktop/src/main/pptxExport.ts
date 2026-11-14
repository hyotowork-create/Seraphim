import AdmZip from 'adm-zip'
import { nativeImage } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { extname, join } from 'path'
import type { LiveState, PptxExportRequest } from '../shared/ipc'
import { paginate, PAGE_MAX_LINES } from '../shared/lyrics'
import { parseVerseSelection } from '../shared/orderSheet'
import { buildPptxEntries, cssColorToHex, firstFontFamily, px1080ToPt, type PptxDoc, type PptxImage, type PptxImageExt, type PptxSlide, type PptxTextStyle } from '../shared/pptx'
import { getDataDir } from './datadir'
import { getSetting } from './db/dao'
import { getBible } from './db/bible'
import { getPlaylistItems, listPlaylists } from './db/playlists'
import { getMediaRelPath, getSong } from './db/songs'

/**
 * 플레이리스트/곡/말씀 → PPTX.
 * 송출과 같은 규칙으로 페이지를 나누고(설정 render.maxLines), 현재 송출 스타일(글꼴·크기·색·외곽선·그림자·배경·로고)을 그대로 옮긴다.
 * 동영상·카메라 배경은 PPT로 옮길 수 없어 배경색으로 대체하고 warnings 에 남긴다.
 */

export interface PptxBuild {
  buffer: Buffer
  slides: number
  warnings: string[]
  suggestedName: string
}

const IMAGE_EXT: Record<string, PptxImageExt> = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.bmp': 'bmp' }

class ImageBank {
  images: PptxImage[] = []
  private index = new Map<string, number>()
  constructor(private warnings: string[]) {}
  /** 미디어 상대경로 → images 인덱스 (지원하지 않는 형식/없는 파일이면 null) */
  add(relPath: string | null | undefined, what: string): number | null {
    if (!relPath) return null
    if (this.index.has(relPath)) return this.index.get(relPath)!
    const abs = join(getDataDir(), relPath)
    const ext = IMAGE_EXT[extname(abs).toLowerCase()]
    if (!ext) {
      this.warn(`${what}: ${extname(abs) || '알 수 없는'} 형식은 PPT에 넣을 수 없어 뺐습니다.`)
      return null
    }
    if (!existsSync(abs)) {
      this.warn(`${what}: 파일이 없어 뺐습니다.`)
      return null
    }
    const data = readFileSync(abs)
    const size = nativeImage.createFromBuffer(data).getSize()
    this.images.push({ data, ext, width: size.width, height: size.height })
    this.index.set(relPath, this.images.length - 1)
    return this.images.length - 1
  }
  private warn(msg: string): void {
    if (!this.warnings.includes(msg)) this.warnings.push(msg)
  }
}

function styleFromLive(live: LiveState): PptxTextStyle {
  const o = live.overlay
  return {
    fontFamily: firstFontFamily(o.fontFamily),
    fontSizePt: px1080ToPt(o.fontSize),
    color: cssColorToHex(o.color, 'FFFFFF'),
    outlineColor: cssColorToHex(o.outlineColor, '000000'),
    outlineWidthPt: px1080ToPt(o.outlineWidth),
    align: o.align === 'left' ? 'l' : o.align === 'right' ? 'r' : 'ctr',
    vAlign: o.vAlign === 'top' ? 't' : o.vAlign === 'bottom' ? 'b' : 'ctr',
    offsetYPct: o.offsetY ?? 0,
    shadow: !!o.shadow
  }
}

function maxLinesSetting(): number {
  const n = Number(getSetting('render.maxLines') ?? PAGE_MAX_LINES)
  return n >= 1 && n <= 12 ? n : PAGE_MAX_LINES
}

function logoRelPath(): string | null {
  const raw = getSetting('logo.mediaId')
  const id = raw ? Number(raw) : NaN
  return Number.isFinite(id) && id > 0 ? getMediaRelPath(id) : null
}

interface Bg {
  color: string
  image?: number
  dim?: number
}

export function buildPptx(req: PptxExportRequest, live: LiveState): PptxBuild {
  const warnings: string[] = []
  const bank = new ImageBank(warnings)
  const maxLines = maxLinesSetting()
  const style = styleFromLive(live)
  const slides: PptxSlide[] = []
  let title = 'Seraphim'

  // 기본 배경: 현재 송출 배경 (이미지는 미디어 id로, 동영상·카메라는 색으로 대체)
  const liveBg: Bg = { color: cssColorToHex(live.background.color, '000000') }
  if (req.includeBackground) {
    const b = live.background
    if (b.kind === 'image') {
      const idx = bank.add(b.mediaId != null ? getMediaRelPath(b.mediaId) : null, '배경 이미지')
      if (idx != null) liveBg.image = idx
      else if (b.mediaId == null) warnings.push('배경 이미지가 라이브러리에 저장된 것이 아니어서 배경색으로 대체했습니다.')
    } else if (b.kind === 'video') {
      warnings.push('동영상 배경은 PPT로 옮길 수 없어 배경색으로 대체했습니다.')
    } else if (b.kind === 'camera') {
      warnings.push('카메라 배경은 PPT로 옮길 수 없어 배경색으로 대체했습니다.')
    }
    if (b.dim > 0) liveBg.dim = b.dim
  }
  const logoIdx = bank.add(logoRelPath(), '로고 이미지')

  const pushText = (verses: { label: string | null; text: string }[], bg: Bg): void => {
    for (const v of verses) {
      for (const page of paginate(v.text, maxLines)) {
        slides.push({ kind: 'text', text: page, label: req.showLabels ? v.label : null, bgColor: bg.color, bgImage: bg.image, dim: bg.dim })
      }
    }
  }

  const addSong = (songId: number, note: string | null): boolean => {
    const s = getSong(songId)
    if (!s) return false
    const bg: Bg = { ...liveBg }
    if (req.includeBackground && s.bgMediaId != null) {
      const idx = bank.add(getMediaRelPath(s.bgMediaId), `"${s.title}" 곡 배경`)
      if (idx != null) bg.image = idx
    }
    let verses = s.verses.map((v) => ({ label: v.label, text: v.text }))
    const sel = parseVerseSelection(note)
    if (sel && sel.size) {
      const kept = verses.filter((v) => {
        const m = (v.label ?? '').match(/^(\d{1,2})\s*절/)
        return m ? sel.has(Number(m[1])) : true
      })
      if (kept.some((v) => /^\d{1,2}\s*절/.test(v.label ?? ''))) verses = kept
    }
    if (req.titleSlides) {
      const sub = [s.hymnNo != null ? `${s.hymnNo}장` : null, s.author].filter(Boolean).join(' · ')
      slides.push({ kind: 'title', text: s.title, sub: sub || undefined, bgColor: bg.color, bgImage: bg.image, dim: bg.dim })
    }
    pushText(verses, bg)
    return true
  }

  const addBible = (bibleId: number): boolean => {
    const b = getBible(bibleId)
    if (!b) return false
    if (req.titleSlides) slides.push({ kind: 'title', text: b.reference, sub: b.translation ?? undefined, bgColor: liveBg.color, bgImage: liveBg.image, dim: liveBg.dim })
    pushText(b.verses, liveBg)
    return true
  }

  if (req.playlistId != null) {
    const pl = listPlaylists().find((p) => p.id === req.playlistId)
    title = pl?.name ?? '플레이리스트'
    for (const it of getPlaylistItems(req.playlistId)) {
      if (it.itemType === 'song' && it.refId != null) {
        if (!addSong(it.refId, it.note ?? null)) warnings.push(`"${it.title}": 삭제된 곡이라 뺐습니다.`)
      } else if (it.itemType === 'bible' && it.refId != null) {
        if (!addBible(it.refId)) warnings.push(`"${it.title}": 삭제된 말씀이라 뺐습니다.`)
      } else if (it.itemType === 'blank') {
        slides.push({ kind: 'blank', bgColor: '000000' })
      } else if (it.itemType === 'logo') {
        slides.push({ kind: 'logo', image: logoIdx ?? undefined, text: 'SERAPHIM', bgColor: '000000' })
      } else if (it.itemType === 'media' && it.refId != null) {
        const rel = getMediaRelPath(it.refId)
        const idx = rel && IMAGE_EXT[extname(rel).toLowerCase()] ? bank.add(rel, `"${it.title}"`) : null
        if (idx != null) slides.push({ kind: 'image', image: idx, bgColor: '000000' })
        else warnings.push(`"${it.title}": 동영상·오디오 항목은 PPT에 넣을 수 없어 뺐습니다.`)
      }
    }
  } else if (req.songId != null) {
    const s = getSong(req.songId)
    title = s?.title ?? '곡'
    if (!addSong(req.songId, null)) throw new Error('곡을 찾을 수 없습니다.')
  } else if (req.bibleId != null) {
    const b = getBible(req.bibleId)
    title = b?.reference ?? '말씀'
    if (!addBible(req.bibleId)) throw new Error('말씀을 찾을 수 없습니다.')
  } else {
    throw new Error('내보낼 플레이리스트/곡/말씀이 지정되지 않았습니다.')
  }
  if (!slides.length) throw new Error('내보낼 슬라이드가 없습니다. (빈 플레이리스트이거나 가사가 없는 곡)')

  const doc: PptxDoc = {
    title,
    aspect: live.aspect === '4:3' ? '4:3' : '16:9',
    style,
    slides,
    images: bank.images
  }
  const zip = new AdmZip()
  for (const e of buildPptxEntries(doc)) zip.addFile(e.name, typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : Buffer.from(e.data))
  const safe = title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Seraphim'
  return { buffer: zip.toBuffer(), slides: slides.length, warnings, suggestedName: `${safe}.pptx` }
}
