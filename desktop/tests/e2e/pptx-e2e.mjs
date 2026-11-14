// E2E: 플레이리스트/곡 → PPTX (outPath 로 대화상자 생략) → zip 파트·슬라이드 수·되읽기 확인
// 사용: node tests/e2e/pptx-e2e.mjs <port> <outDir>
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
const PORT = process.argv[2] || '9333'
const OUT = process.argv[3] || '/tmp/seraphim-pptx'
mkdirSync(OUT, { recursive: true })
let page
for (let i = 0; i < 60 && !page; i++) {
  const list = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => [])
  page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
  if (!page) await new Promise((r) => setTimeout(r, 500))
}
if (!page) { console.log('앱 창을 찾지 못함'); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exc'); return r.result?.result?.value }
let fails = 0; const check = (ok, l, x = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++ }
const unzipList = (p) => execFileSync('unzip', ['-Z1', p]).toString().trim().split('\n')

// 1) 플레이리스트: 곡 2 + 말씀 1 + 검정 + 로고
const songs = await ev(`window.seraphim.listSongs({ scope: 'all', search: '' }).then(l => l.filter(s => s.verseCount >= 2).slice(0, 2).map(s => s.id))`)
const bible = await ev(`window.seraphim.saveBible({ book: '요한복음', chapter: 3, verseRange: '16-17', translation: 'KRV', text: '16 하나님이 세상을 이처럼 사랑하사\\n17 하나님이 그 아들을 세상에 보내신 것은' })`)
const plId = await ev(`window.seraphim.createPlaylist('zz-pptx 테스트')`)
for (const sid of songs) await ev(`window.seraphim.addPlaylistItem(${plId}, 'song', ${sid})`)
await ev(`window.seraphim.addPlaylistItem(${plId}, 'bible', ${bible})`)
await ev(`window.seraphim.addPlaylistItem(${plId}, 'blank', null)`)
await ev(`window.seraphim.addPlaylistItem(${plId}, 'logo', null)`)
const detail = await ev(`Promise.all(${JSON.stringify(songs)}.map(id => window.seraphim.getSong(id))).then(l => l.map(s => ({ title: s.title, verses: s.verses.map(v => v.text.split('\\n').length) })))`)
const maxLines = Number((await ev(`window.seraphim.getSetting('render.maxLines')`)) || 4)
const expectPages = detail.reduce((n, s) => n + s.verses.reduce((m, lines) => m + Math.ceil(lines / maxLines), 0), 0)
const out1 = join(OUT, 'playlist.pptx')
const r1 = await ev(`window.seraphim.exportPptx({ playlistId: ${plId}, titleSlides: true, showLabels: true, includeBackground: true, outPath: ${JSON.stringify(out1)} })`)
console.log('playlist export:', JSON.stringify(r1))
check(r1 && existsSync(out1) && statSync(out1).size > 5000, 'PPTX 파일 생성', out1)
// 제목 2 + 곡 페이지 + 말씀 제목 1 + 말씀 절 페이지 + 검정 + 로고
const bibleVerses = await ev(`window.seraphim.getBible(${bible}).then(b => b.verses.length)`)
const expectSlides = 2 + expectPages + 1 + bibleVerses + 1 + 1
check(r1.slides === expectSlides, `슬라이드 수 = 제목·페이지·말씀·검정·로고 합 (${expectSlides})`, String(r1.slides))
const parts = unzipList(out1)
check(parts.includes('[Content_Types].xml') && parts.includes('ppt/presentation.xml') && parts.filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).length === r1.slides, 'zip 파트 구성', `${parts.length} parts`)
// 첫 슬라이드 = 첫 곡 제목
const s1 = execFileSync('unzip', ['-p', out1, 'ppt/slides/slide1.xml']).toString()
check(s1.includes(`<a:t>${detail[0].title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a:t>`), '첫 슬라이드 = 첫 곡 제목', detail[0].title)
const s2 = execFileSync('unzip', ['-p', out1, 'ppt/slides/slide2.xml']).toString()
check(/<a:t>[^<]*절<\/a:t>|<a:t>후렴<\/a:t>/.test(s2) || !/절|후렴/.test(s2), '둘째 슬라이드에 가사(라벨 옵션)')
// 2) 곡 하나만, 제목 없이
const out2 = join(OUT, 'song.pptx')
const r2 = await ev(`window.seraphim.exportPptx({ songId: ${songs[0]}, titleSlides: false, showLabels: false, includeBackground: false, outPath: ${JSON.stringify(out2)} })`)
check(r2 && r2.slides === detail[0].verses.reduce((m, lines) => m + Math.ceil(lines / maxLines), 0), '곡 하나: 슬라이드 수 = 페이지 수', JSON.stringify(r2))
// 3) 4:3 비율 반영
await ev(`window.seraphim.setLive({ aspect: '4:3' })`)
const out3 = join(OUT, 'song43.pptx')
await ev(`window.seraphim.exportPptx({ songId: ${songs[0]}, titleSlides: false, showLabels: false, includeBackground: false, outPath: ${JSON.stringify(out3)} })`)
check(execFileSync('unzip', ['-p', out3, 'ppt/presentation.xml']).toString().includes('cx="9144000"'), '4:3 슬라이드 크기')
await ev(`window.seraphim.setLive({ aspect: '16:9' })`)
// 4) 빈 플레이리스트 → 오류 메시지
const plEmpty = await ev(`window.seraphim.createPlaylist('zz-empty')`)
const err = await ev(`window.seraphim.exportPptx({ playlistId: ${plEmpty}, titleSlides: true, showLabels: false, includeBackground: true, outPath: '/tmp/zz.pptx' }).then(() => null, e => String(e.message))`)
check(err && /슬라이드가 없습니다/.test(err), '빈 플레이리스트 → 안내 오류', err)
// 정리
await ev(`window.seraphim.deletePlaylist(${plId})`); await ev(`window.seraphim.deletePlaylist(${plEmpty})`); await ev(`window.seraphim.deleteBible(${bible})`)
console.log(fails === 0 ? 'PPTX E2E PASS' : `${fails} FAILED`)
ws.close(); process.exit(fails ? 1 : 0)
