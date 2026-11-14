// PPTX 생성기 — 의존성 없이 OOXML(zip 안의 XML 파트)을 직접 만든다. main/renderer 공용 순수 함수.
// 송출 화면의 "페이지 = 슬라이드 한 장" 원칙: 텍스트 상자 하나에 줄마다 문단, 앱과 같은 글꼴·크기·색·외곽선·그림자·배경.

export type PptxImageExt = 'png' | 'jpeg' | 'gif' | 'bmp'

export interface PptxImage {
  data: Uint8Array
  ext: PptxImageExt
  /** 픽셀 크기 — 로고·배경 이미지의 비율 유지(object-fit)에 사용 */
  width: number
  height: number
}

export interface PptxTextStyle {
  /** PowerPoint 글꼴 이름 (CSS font-family 목록의 첫 글꼴) */
  fontFamily: string
  /** 본문 글자 크기(pt) */
  fontSizePt: number
  /** RRGGBB */
  color: string
  outlineColor: string
  /** pt, 0이면 외곽선 없음 */
  outlineWidthPt: number
  align: 'l' | 'ctr' | 'r'
  vAlign: 't' | 'ctr' | 'b'
  /** 세로 위치 보정 (슬라이드 높이 대비 %, + = 아래로) */
  offsetYPct: number
  shadow: boolean
}

export interface PptxSlide {
  kind: 'text' | 'title' | 'blank' | 'logo' | 'image'
  /** text/title: 본문 (줄바꿈 = 문단). logo: 이미지가 없을 때 글자 로고 */
  text?: string
  /** title: 부제(장 번호·작사자) */
  sub?: string
  /** 왼쪽 위 작은 라벨(1절·후렴) */
  label?: string | null
  /** 배경색 RRGGBB (이미지 배경이 있어도 뒤에 깔림) */
  bgColor: string
  /** 배경 이미지 (images 인덱스) — object-cover 로 채움 */
  bgImage?: number
  /** 배경 위 어둡게 0~1 */
  dim?: number
  /** logo/image: 가운데 배치할 이미지 (images 인덱스) — object-contain */
  image?: number
}

export interface PptxDoc {
  title: string
  aspect: '16:9' | '4:3'
  style: PptxTextStyle
  slides: PptxSlide[]
  images: PptxImage[]
}

export interface PptxEntry {
  name: string
  data: string | Uint8Array
}

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

export function slideSizeEmu(aspect: '16:9' | '4:3'): { cx: number; cy: number } {
  return aspect === '4:3' ? { cx: 9144000, cy: 6858000 } : { cx: 12192000, cy: 6858000 }
}

export function escapeXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** '#ffffff' | 'rgb(255,255,255)' | 'white' → 'FFFFFF' (모르면 fallback) */
export function cssColorToHex(c: string | undefined, fallback = '000000'): string {
  if (!c) return fallback
  const s = c.trim()
  const m6 = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i)
  if (m6) return m6[1].toUpperCase()
  const m3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  if (m3) return (m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]).toUpperCase()
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('').toUpperCase()
  const named: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', yellow: 'FFFF00', blue: '0000FF', green: '008000', gray: '808080', grey: '808080', navy: '000080' }
  return named[s.toLowerCase()] ?? fallback
}

/** CSS font-family 목록에서 첫 실제 글꼴 이름 */
export function firstFontFamily(css: string, fallback = 'Malgun Gothic'): string {
  const generic = new Set(['system-ui', 'sans-serif', 'serif', 'monospace', 'ui-sans-serif', 'inherit'])
  for (const raw of css.split(',')) {
    const f = raw.trim().replace(/^['"]|['"]$/g, '').trim()
    if (f && !generic.has(f.toLowerCase())) return f
  }
  return fallback
}

/** 1080p 기준 px → pt (슬라이드 높이 7.5in = 540pt ↔ 1080px) */
export function px1080ToPt(px: number): number {
  return Math.round(px * 0.5 * 100) / 100
}

function relsXml(rels: { id: string; type: string; target: string }[]): string {
  return (
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${escapeXml(r.target)}"/>`).join('') +
    '</Relationships>'
  )
}

const EMPTY_TREE_HEAD =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

function themeXml(font: string): string {
  const f = escapeXml(font)
  const fill =
    '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
  const ln =
    '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
  const eff = '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
  return (
    XML_HEAD +
    `<a:theme xmlns:a="${NS_A}" name="Seraphim"><a:themeElements>` +
    '<a:clrScheme name="Seraphim"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="E5E7EB"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="4F46E5"/></a:accent1><a:accent2><a:srgbClr val="0EA5E9"/></a:accent2><a:accent3><a:srgbClr val="22C55E"/></a:accent3><a:accent4><a:srgbClr val="F59E0B"/></a:accent4><a:accent5><a:srgbClr val="EF4444"/></a:accent5><a:accent6><a:srgbClr val="A855F7"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
    `<a:fontScheme name="Seraphim"><a:majorFont><a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="Seraphim">${fill}${ln}${eff}${fill.replace('fillStyleLst', 'bgFillStyleLst').replace('fillStyleLst', 'bgFillStyleLst')}</a:fmtScheme>` +
    '</a:themeElements></a:theme>'
  )
}

function masterXml(): string {
  return (
    XML_HEAD +
    `<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>` +
    '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
    `<p:spTree>${EMPTY_TREE_HEAD}</p:spTree></p:cSld>` +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    '<p:txStyles><p:titleStyle><a:lvl1pPr/></p:titleStyle><p:bodyStyle><a:lvl1pPr/></p:bodyStyle><p:otherStyle><a:lvl1pPr/></p:otherStyle></p:txStyles>' +
    '</p:sldMaster>'
  )
}

function layoutXml(): string {
  return (
    XML_HEAD +
    `<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${EMPTY_TREE_HEAD}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  )
}

function xfrm(x: number, y: number, cx: number, cy: number): string {
  const r = (n: number): number => Math.round(n)
  return `<a:xfrm><a:off x="${r(x)}" y="${r(y)}"/><a:ext cx="${r(cx)}" cy="${r(cy)}"/></a:xfrm>`
}

/** 이미지 채우기 사각형 계산 — cover(꽉 채우고 잘림) / contain(전체 보이게) */
function fitRect(box: { w: number; h: number }, img: { width: number; height: number }, mode: 'cover' | 'contain'): { srcRect: string; x: number; y: number; w: number; h: number } {
  const ia = img.width > 0 && img.height > 0 ? img.width / img.height : box.w / box.h
  const ba = box.w / box.h
  if (mode === 'cover') {
    // srcRect: 잘라낼 비율(1/1000 %)
    if (ia > ba) {
      const cut = (1 - ba / ia) / 2
      const v = Math.round(cut * 100000)
      return { srcRect: `<a:srcRect l="${v}" r="${v}"/>`, x: 0, y: 0, w: box.w, h: box.h }
    }
    const cut = (1 - ia / ba) / 2
    const v = Math.round(cut * 100000)
    return { srcRect: `<a:srcRect t="${v}" b="${v}"/>`, x: 0, y: 0, w: box.w, h: box.h }
  }
  if (ia > ba) {
    const h = box.w / ia
    return { srcRect: '', x: 0, y: (box.h - h) / 2, w: box.w, h }
  }
  const w = box.h * ia
  return { srcRect: '', x: (box.w - w) / 2, y: 0, w, h: box.h }
}

function runProps(st: PptxTextStyle, sizePt: number, opts: { outline?: boolean; shadow?: boolean } = {}): string {
  const outline = opts.outline ?? st.outlineWidthPt > 0
  const shadow = opts.shadow ?? st.shadow
  // CSS paint-order: stroke fill 은 외곽선이 글자 뒤에 깔리므로 보이는 두께가 절반 — PowerPoint 선은 가운데 정렬이라 절반 두께로
  const lnW = Math.max(3175, Math.round((st.outlineWidthPt / 2) * 12700))
  const f = escapeXml(st.fontFamily)
  return (
    `<a:rPr lang="ko-KR" altLang="en-US" sz="${Math.round(sizePt * 100)}" b="1" dirty="0">` +
    (outline ? `<a:ln w="${lnW}"><a:solidFill><a:srgbClr val="${st.outlineColor}"/></a:solidFill></a:ln>` : '') +
    `<a:solidFill><a:srgbClr val="${st.color}"/></a:solidFill>` +
    (shadow
      ? '<a:effectLst><a:outerShdw blurRad="177800" dist="50800" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="85000"/></a:srgbClr></a:outerShdw></a:effectLst>'
      : '') +
    `<a:latin typeface="${f}"/><a:ea typeface="${f}"/></a:rPr>`
  )
}

function paragraphs(text: string, st: PptxTextStyle, sizePt: number, opts?: { outline?: boolean; shadow?: boolean }): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  return lines
    .map((l) => `<a:p><a:pPr algn="${st.align}"><a:lnSpc><a:spcPct val="128000"/></a:lnSpc></a:pPr>` + (l.trim() ? `<a:r>${runProps(st, sizePt, opts)}<a:t>${escapeXml(l)}</a:t></a:r>` : `<a:endParaRPr lang="ko-KR" sz="${Math.round(sizePt * 100)}"/>`) + '</a:p>')
    .join('')
}

function textBox(id: number, name: string, box: { x: number; y: number; w: number; h: number }, anchor: 't' | 'ctr' | 'b', body: string): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(box.x, box.y, box.w, box.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${anchor}" anchorCtr="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`
  )
}

function picture(id: number, name: string, rId: string, box: { x: number; y: number; w: number; h: number }, srcRect: string): string {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${rId}"/>${srcRect}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrm(box.x, box.y, box.w, box.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  )
}

function slideXml(s: PptxSlide, doc: PptxDoc, imageRels: Map<number, string>): string {
  const { cx, cy } = slideSizeEmu(doc.aspect)
  const st = doc.style
  let shapes = ''
  let id = 2
  // 배경: 색 + (이미지는 그림 개체로 깔아 object-cover 재현)
  const bgColor = s.kind === 'blank' ? '000000' : s.bgColor
  const bg = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgColor}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
  if (s.kind !== 'blank' && s.bgImage != null && imageRels.has(s.bgImage)) {
    const img = doc.images[s.bgImage]
    const r = fitRect({ w: cx, h: cy }, img, 'cover')
    shapes += picture(id++, '배경', imageRels.get(s.bgImage)!, r, r.srcRect)
  }
  if (s.kind !== 'blank' && s.dim && s.dim > 0) {
    shapes +=
      `<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="어둡게"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, cx, cy)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
      `<a:solidFill><a:srgbClr val="000000"><a:alpha val="${Math.round(Math.min(1, s.dim) * 100000)}"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
  }
  const padX = cx * 0.06
  const offY = (st.offsetYPct / 100) * cy
  const mainBox = { x: padX, y: offY, w: cx - padX * 2, h: cy }
  if (s.kind === 'text') {
    shapes += textBox(id++, '가사', mainBox, st.vAlign, paragraphs(s.text ?? '', st, st.fontSizePt))
  } else if (s.kind === 'title') {
    const titleSt: PptxTextStyle = { ...st, align: 'ctr' }
    let body = paragraphs(s.text ?? '', titleSt, st.fontSizePt * 1.1)
    if (s.sub) body += paragraphs(s.sub, titleSt, st.fontSizePt * 0.55, { outline: false })
    shapes += textBox(id++, '제목', { x: padX, y: 0, w: cx - padX * 2, h: cy }, 'ctr', body)
  } else if ((s.kind === 'logo' || s.kind === 'image') && s.image != null && imageRels.has(s.image)) {
    const img = doc.images[s.image]
    const box = s.kind === 'logo' ? { w: cx * 0.5, h: cy * 0.5 } : { w: cx, h: cy }
    const r = fitRect(box, img, 'contain')
    const ox = (cx - box.w) / 2
    const oy = (cy - box.h) / 2
    shapes += picture(id++, s.kind === 'logo' ? '로고' : '이미지', imageRels.get(s.image)!, { x: ox + r.x, y: oy + r.y, w: r.w, h: r.h }, '')
  } else if (s.kind === 'logo') {
    const logoSt: PptxTextStyle = { ...st, align: 'ctr' }
    shapes += textBox(id++, '로고', { x: padX, y: 0, w: cx - padX * 2, h: cy }, 'ctr', paragraphs(s.text || 'SERAPHIM', logoSt, st.fontSizePt * 1.2))
  }
  if (s.label && s.kind === 'text') {
    const labelSt: PptxTextStyle = { ...st, align: 'l' }
    shapes += textBox(id++, '라벨', { x: cx * 0.03, y: cy * 0.03, w: cx * 0.4, h: cy * 0.12 }, 't', paragraphs(s.label, labelSt, st.fontSizePt * 0.4, { shadow: false }))
  }
  return (
    XML_HEAD +
    `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>${bg}<p:spTree>${EMPTY_TREE_HEAD}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  )
}

/** PptxDoc → zip 에 넣을 파트 목록 (파일 이름 → 내용) */
export function buildPptxEntries(doc: PptxDoc): PptxEntry[] {
  const { cx, cy } = slideSizeEmu(doc.aspect)
  const entries: PptxEntry[] = []
  const n = doc.slides.length
  const usedExts = new Set<PptxImageExt>()
  doc.images.forEach((im) => usedExts.add(im.ext))

  entries.push({
    name: '[Content_Types].xml',
    data:
      XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      [...usedExts].map((e) => `<Default Extension="${e}" ContentType="image/${e}"/>`).join('') +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      Array.from({ length: n }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>'
  })
  entries.push({
    name: '_rels/.rels',
    data: relsXml([
      { id: 'rId1', type: `${REL}/officeDocument`, target: 'ppt/presentation.xml' },
      { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' },
      { id: 'rId3', type: `${REL}/extended-properties`, target: 'docProps/app.xml' }
    ])
  })
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  entries.push({
    name: 'docProps/core.xml',
    data:
      XML_HEAD +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${escapeXml(doc.title)}</dc:title><dc:creator>Seraphim</dc:creator><cp:lastModifiedBy>Seraphim</cp:lastModifiedBy>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`
  })
  entries.push({
    name: 'docProps/app.xml',
    data:
      XML_HEAD +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      `<Application>Seraphim</Application><Slides>${n}</Slides><PresentationFormat>${doc.aspect === '4:3' ? 'On-screen Show (4:3)' : 'Widescreen'}</PresentationFormat></Properties>`
  })
  entries.push({
    name: 'ppt/presentation.xml',
    data:
      XML_HEAD +
      `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1">` +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      `<p:sldIdLst>${Array.from({ length: n }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst>` +
      `<p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/>` +
      '<p:defaultTextStyle><a:defPPr><a:defRPr lang="ko-KR"/></a:defPPr></p:defaultTextStyle></p:presentation>'
  })
  entries.push({
    name: 'ppt/_rels/presentation.xml.rels',
    data: relsXml([
      { id: 'rId1', type: `${REL}/slideMaster`, target: 'slideMasters/slideMaster1.xml' },
      { id: 'rId2', type: `${REL}/theme`, target: 'theme/theme1.xml' },
      ...Array.from({ length: n }, (_, i) => ({ id: `rId${i + 3}`, type: `${REL}/slide`, target: `slides/slide${i + 1}.xml` }))
    ])
  })
  entries.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: masterXml() })
  entries.push({
    name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    data: relsXml([
      { id: 'rId1', type: `${REL}/slideLayout`, target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: `${REL}/theme`, target: '../theme/theme1.xml' }
    ])
  })
  entries.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: layoutXml() })
  entries.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: relsXml([{ id: 'rId1', type: `${REL}/slideMaster`, target: '../slideMasters/slideMaster1.xml' }]) })
  entries.push({ name: 'ppt/theme/theme1.xml', data: themeXml(doc.style.fontFamily) })
  doc.images.forEach((im, i) => entries.push({ name: `ppt/media/image${i + 1}.${im.ext}`, data: im.data }))

  doc.slides.forEach((s, i) => {
    const imageRels = new Map<number, string>()
    const rels: { id: string; type: string; target: string }[] = [{ id: 'rId1', type: `${REL}/slideLayout`, target: '../slideLayouts/slideLayout1.xml' }]
    for (const idx of [s.bgImage, s.image]) {
      if (idx == null || !doc.images[idx] || imageRels.has(idx)) continue
      const id = `rId${rels.length + 1}`
      rels.push({ id, type: `${REL}/image`, target: `../media/image${idx + 1}.${doc.images[idx].ext}` })
      imageRels.set(idx, id)
    }
    entries.push({ name: `ppt/slides/slide${i + 1}.xml`, data: slideXml(s, doc, imageRels) })
    entries.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: relsXml(rels) })
  })
  return entries
}
