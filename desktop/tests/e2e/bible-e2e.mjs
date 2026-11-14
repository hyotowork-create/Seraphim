// 패키징 앱(격리 인스턴스)에서 성경 본문 E2E: 내장 개역한글 자동 설치 → 구절 조회 → 번역본 가져오기/삭제 → 빠른 추가 UI
import { writeFile, mkdir } from 'fs/promises'
const PORT = process.argv[2] || '9333'
const TMP = process.argv[3] || '/tmp/seraphim-bible-fixture'
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exception'); return r.result?.result?.value }
let fails = 0
const check = (ok, label, extra = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }
const lookup = (ref, code = 'KRV') => ev(`window.seraphim.lookupBible(${JSON.stringify(ref)}, ${JSON.stringify(code)}).then(r => ({ ok: true, r }), e => ({ ok: false, msg: String(e.message || e) }))`)

const tr = await ev(`window.seraphim.listBibleTranslations()`)
console.log('translations:', JSON.stringify(tr))
check(tr.some((t) => t.code === 'KRV' && t.bundled && t.verseCount === 31102), '앱 시작 시 내장 개역한글 자동 설치 (31,102절)')

const j = await lookup('요 3:16')
check(j.ok && j.r.reference === '요한복음 3:16' && j.r.verses.length === 1 && /하나님이 세상을 이처럼 사랑하사/.test(j.r.text) && j.r.text.startsWith('16 '), '요 3:16', j.ok ? j.r.text : j.msg)
const j2 = await lookup('요한복음 3장 16-18절')
check(j2.ok && j2.r.verses.length === 3 && j2.r.verseRange === '16-18' && j2.r.book === '요한복음' && j2.r.chapter === 3, '요한복음 3장 16-18절 → 3절, verseRange 16-18')
const ps = await lookup('시 23편')
check(ps.ok && ps.r.verses.length === 6 && ps.r.verseRange === '' && /여호와는 나의 목자시니/.test(ps.r.text), '시 23편 → 장 전체 6절', ps.ok ? ps.r.text.split('\n')[0] : ps.msg)
const g = await lookup('창1:1-2:3')
check(g.ok && g.r.verses.length === 34 && g.r.text.startsWith('1:1 ') && /2:3 /.test(g.r.text), '창1:1-2:3 → 장 넘김 34절, "장:절" 표기', g.ok ? `n=${g.r.verses.length}` : g.msg)
const one = await lookup('요일 1:9')
check(one.ok && one.r.book === '요한일서' && /죄를 자백하면/.test(one.r.text), '요일 1:9 (요한일서)', one.ok ? one.r.text : one.msg)
const rev = await lookup('계 22:21')
check(rev.ok && rev.r.verses.length === 1, '계 22:21 (마지막 절)')
const bad = await lookup('요 99:1')
check(!bad.ok && /구절을 이해하지/.test(bad.msg), '잘못된 장 → 안내 오류', bad.msg)
const bad2 = await lookup('요 3:200')
check(!bad2.ok && /본문이 없습니다/.test(bad2.msg), '없는 절 → 안내 오류', bad2.msg)
const bad3 = await lookup('요 3:16', 'NKRV')
check(!bad3.ok && /설치되어 있지 않습니다/.test(bad3.msg), '미설치 번역본 → 안내 오류', bad3.msg)

// 번역본 가져오기 (테스트용 가짜 본문 120절, "창1:1 …" 형식)
await mkdir(TMP, { recursive: true })
const fake = Array.from({ length: 120 }, (_, i) => `창${Math.floor(i / 31) + 1}:${(i % 31) + 1} 테스트 본문 ${i + 1}`).join('\n') + '\n요3:16 테스트 요삼십육\n'
await writeFile(`${TMP}/test-bible.txt`, fake, 'utf8')
const imp = await ev(`window.seraphim.importBibleText([${JSON.stringify(TMP + '/test-bible.txt')}], 'test1', '테스트역').then(r => ({ ok: true, r }), e => ({ ok: false, msg: String(e.message || e) }))`)
check(imp.ok && imp.r.code === 'TEST1' && imp.r.inserted === 121, '본문 파일 가져오기 (코드 대문자화, 121절)', imp.ok ? JSON.stringify(imp.r) : imp.msg)
const t2 = await lookup('요 3:16', 'TEST1')
check(t2.ok && t2.r.text === '16 테스트 요삼십육' && t2.r.translationName === '테스트역', '가져온 번역본으로 조회')
const tr2 = await ev(`window.seraphim.listBibleTranslations()`)
check(tr2.some((t) => t.code === 'TEST1' && !t.bundled && t.verseCount === 121), '번역본 목록에 표시')
const tiny = await ev(`window.seraphim.importBibleText([${JSON.stringify(TMP + '/test-bible.txt')}], 'KRV', 'x').then(r => ({ ok: true }), e => ({ ok: false, msg: String(e.message || e) }))`)
check(!tiny.ok && /내장 번역본 코드/.test(tiny.msg), '내장 코드 덮어쓰기 차단')
await ev(`window.seraphim.removeBibleTranslation('TEST1')`)
check(!(await ev(`window.seraphim.listBibleTranslations()`)).some((t) => t.code === 'TEST1'), '번역본 삭제')
const rm = await ev(`window.seraphim.removeBibleTranslation('KRV').then(() => 'ok', e => String(e.message))`)
check(/내장 번역본은 삭제할 수 없습니다/.test(rm), '내장 번역본 삭제 차단')

// UI: 라이브러리 성경 섹션 빠른 입력 → 말씀 저장 + 목록 표시
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>/성경/.test(b.textContent) && b.textContent.trim().length < 8); b && b.click(); return !!b })()`)
await new Promise((r) => setTimeout(r, 300))
const hasQuick = await ev(`!!document.querySelector('input[placeholder*="구절 입력 후 Enter"]')`)
check(hasQuick, '성경 섹션에 구절 빠른 입력 표시')
if (hasQuick) {
  await ev(`(() => { const i = document.querySelector('input[placeholder*="구절 입력 후 Enter"]'); i.focus(); return true })()`)
  await send('Input.insertText', { text: '롬 8:28' })
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await new Promise((r) => setTimeout(r, 800))
  const txt = await ev(`document.body.innerText`)
  check(/로마서 8:28/.test(txt) && /1절 추가/.test(txt), '빠른 입력 Enter → 말씀 저장·목록 표시', (txt.match(/로마서 8:28[^\n]*/) || [''])[0])
  const saved = await ev(`window.seraphim.listBible('로마서').then(l => l.map(b => ({ id: b.id, ref: b.reference, tr: b.translation })))`)
  check(saved.some((b) => b.ref === '로마서 8:28' && b.tr === '개역한글'), '저장된 말씀에 번역본 이름')
  for (const b of saved.filter((b) => b.ref === '로마서 8:28')) await ev(`window.seraphim.deleteBible(${b.id})`)
}
console.log(fails === 0 ? 'BIBLE E2E PASS' : `${fails} FAILED`)
ws.close(); process.exit(fails ? 1 : 0)
