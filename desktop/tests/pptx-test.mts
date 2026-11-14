import { buildPptxEntries, cssColorToHex, firstFontFamily, px1080ToPt, escapeXml, type PptxDoc } from '../src/shared/pptx.ts'
import { slideXmlInfo } from '../src/shared/songImportParse.ts'
let fail = 0
const check = (ok: boolean, label: string, extra = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fail++ }
check(cssColorToHex('#ffffff') === 'FFFFFF' && cssColorToHex('#abc') === 'AABBCC' && cssColorToHex('rgb(0, 128, 255)') === '0080FF' && cssColorToHex('nope', '123456') === '123456', '색 변환')
check(firstFontFamily("'Pretendard', 'Malgun Gothic', system-ui, sans-serif") === 'Pretendard' && firstFontFamily('system-ui, sans-serif') === 'Malgun Gothic', '첫 글꼴 이름')
check(px1080ToPt(72) === 36 && px1080ToPt(4) === 2, '1080p px → pt')
check(escapeXml('a<b>&"c"\'') === 'a&lt;b&gt;&amp;&quot;c&quot;&apos;', 'XML 이스케이프')
const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const doc: PptxDoc = {
  title: '테스트 & 예배',
  aspect: '16:9',
  style: { fontFamily: 'Malgun Gothic', fontSizePt: 36, color: 'FFFFFF', outlineColor: '000000', outlineWidthPt: 2, align: 'ctr', vAlign: 'ctr', offsetYPct: 0, shadow: true },
  slides: [
    { kind: 'title', text: '참 아름다워라', sub: '478장', bgColor: '000000', bgImage: 0, dim: 0.3 },
    { kind: 'text', text: '주 하나님 지으신 모든 세계\n시험 가사 둘째 줄', label: '1절', bgColor: '000000', bgImage: 0, dim: 0.3 },
    { kind: 'text', text: '하늘의 별 <울려> & 퍼지는', bgColor: '112233' },
    { kind: 'blank', bgColor: '000000' },
    { kind: 'logo', image: 0, bgColor: '000000' },
    { kind: 'logo', text: 'SERAPHIM', bgColor: '000000' }
  ],
  images: [{ data: png1x1, ext: 'png', width: 1, height: 1 }]
}
const entries = buildPptxEntries(doc)
const names = entries.map((e) => e.name)
check(names.includes('[Content_Types].xml') && names.includes('ppt/presentation.xml') && names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length === 6, '필수 파트 + 슬라이드 6장', names.join(','))
check(names.includes('ppt/media/image1.png') && names.filter((n) => n.endsWith('.rels')).length === 1 + 1 + 1 + 1 + 6, '이미지·관계 파일')
const text = (n: string) => String(entries.find((e) => e.name === n)!.data)
// 잘 만들어진 XML인지: 파이썬 xml 파서로 모든 파트를 실제 파싱
import { execFileSync } from 'child_process'
let badXml = 0
for (const e of entries.filter((x) => x.name.endsWith('.xml') || x.name.endsWith('.rels'))) {
  try {
    execFileSync('python3', ['-c', 'import sys,xml.dom.minidom; xml.dom.minidom.parseString(sys.stdin.buffer.read())'], { input: String(e.data) })
  } catch (err) { badXml++; check(false, `XML 파싱: ${e.name}`, String((err as { stderr?: Buffer }).stderr ?? err).slice(-200)) }
}
check(badXml === 0, '모든 XML 파트가 정상 파싱됨')
const s2 = text('ppt/slides/slide2.xml')
check(s2.includes('<a:t>주 하나님 지으신 모든 세계</a:t>') && s2.includes('<a:t>시험 가사 둘째 줄</a:t>') && s2.includes('<a:t>1절</a:t>'), '가사 줄 → 문단, 라벨')
check(s2.includes('r:embed="rId2"') && text('ppt/slides/_rels/slide2.xml.rels').includes('../media/image1.png') && s2.includes('<a:alpha val="30000"/>'), '배경 이미지 관계 + 어둡게 30%')
check(s2.includes('sz="3600"') && s2.includes('<a:ln w="12700">') && s2.includes('outerShdw') && s2.includes('typeface="Malgun Gothic"'), '글자 크기·외곽선(절반 두께)·그림자·글꼴')
const s3 = text('ppt/slides/slide3.xml')
check(s3.includes('&lt;울려&gt; &amp;') && s3.includes('<a:srgbClr val="112233"/>') && !s3.includes('r:embed'), '특수문자 이스케이프, 배경색만')
check(text('ppt/slides/slide4.xml').includes('val="000000"') && !text('ppt/slides/slide4.xml').includes('<a:t>'), '검정 화면')
check(text('ppt/slides/slide5.xml').includes('<p:pic>') && text('ppt/slides/slide6.xml').includes('<a:t>SERAPHIM</a:t>'), '로고: 이미지 / 글자')
check(text('ppt/presentation.xml').includes('cx="12192000" cy="6858000"') && text('docProps/core.xml').includes('테스트 &amp; 예배'), '16:9 크기, 제목')
// 앱의 PPT 가져오기 파서로 되읽기: 제목 슬라이드는 큰 글자, 가사는 문단
const info = slideXmlInfo(s2)
check(info.paragraphs.length === 3 && info.maxSz === 3600, '가져오기 파서로 되읽기(문단 3, 최대 글자 3600)', JSON.stringify(info))
const info1 = slideXmlInfo(text('ppt/slides/slide1.xml'))
check(info1.paragraphs[0] === '참 아름다워라' && (info1.maxSz ?? 0) > 3600, '제목 슬라이드 글자가 더 큼', JSON.stringify(info1))
console.log(fail === 0 ? 'PPTX TESTS PASS' : `${fail} FAILED`)
