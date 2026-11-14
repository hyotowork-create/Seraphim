// 패키징 앱(격리 인스턴스)에서 곡 가져오기 E2E: 폴더 가져오기 → 보고 → 검색(장번호/본문) → 중복 건너뛰기/덮어쓰기 → 편집기 장번호
const PORT = process.argv[2] || '9333'
const FIX = process.argv[3]
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exception'); return r.result?.result?.value }
let fails = 0
const check = (ok, label, extra = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }
const imp = (mode) => ev(`window.seraphim.importSongs([${JSON.stringify(FIX)}], { category: '복음성가', onDuplicate: '${mode}' })`)
const search = (q) => ev(`window.seraphim.listSongs({ scope: 'all', search: ${JSON.stringify(q)} }).then(l => l.map(s => ({ id: s.id, t: s.title, no: s.hymnNo, c: s.category, n: s.verseCount })))`)

const r1 = await imp('skip')
console.log('1차 보고:', JSON.stringify(r1))
check(r1.imported + r1.skipped === 7, '폴더(하위폴더 포함) 가져오기: 곡 7개 (기존 DB와 중복은 건너뜀)', `imported=${r1.imported} skipped=${r1.skipped}`)
check(r1.failed.length === 0, '실패 없음(.docx는 무시)', JSON.stringify(r1.failed))
const all = await search('')
const byTitle = Object.fromEntries(all.map((s) => [s.t, s]))
check(byTitle['참 아름다워라']?.no === 478 && byTitle['참 아름다워라']?.c === '새찬송가' && byTitle['참 아름다워라']?.n === 2, 'txt: 478장, 새찬송가, 2절', JSON.stringify(byTitle['참 아름다워라']))
check(byTitle['주 안에 있는 나에게']?.c === '복음성가' && byTitle['주 안에 있는 나에게']?.n === 2, 'txt(하위폴더): 파일명 제목, 지정 카테고리', JSON.stringify(byTitle['주 안에 있는 나에게']))
check(byTitle['나 같은 죄인 살리신']?.no === 305, 'json: 제목에서 장번호 추출')
check(byTitle['물 위를 걷는 자']?.c === '워십' && byTitle['물 위를 걷는 자']?.n === 2, 'json: 카테고리 유지, verses/lines 형식')
check(!!byTitle['황무지가 장미꽃같이'] && byTitle['주 하나님 지으신 모든 세계']?.n === 2, 'pptx: 제목 슬라이드로 2곡 분리')
check(byTitle['주의 손에 나의 손을']?.n === 11, 'pptx: 단일 곡 11슬라이드 순서(10>9)', `n=${byTitle['주의 손에 나의 손을']?.n}`)
const ord = (await ev(`window.seraphim.getSong(${byTitle['주의 손에 나의 손을'].id}).then(s => s.verses.map(v => v.text))`))
check(ord[8] === '9번째 페이지 가사' && ord[9] === '10번째 페이지 가사' && ord[10] === '11번째 페이지 가사', '슬라이드 숫자 정렬(slide10 뒤에 옴)')
const ent = await ev(`window.seraphim.getSong(${byTitle['주 하나님 지으신 모든 세계'].id}).then(s => s.verses[1].text)`)
check(ent.includes('시험 가사 & 기호 줄'), 'pptx: XML 엔티티(&amp;) 복원', ent)

// 검색
check((await search('478')).some((s) => s.no === 478), '검색: "478" → 장 번호')
check((await search('478장')).some((s) => s.no === 478), '검색: "478장"')
const body = await search('은빛 시험 문장')
check(body.length === 1 && body[0].no === 478, '검색: 가사 본문 부분 일치', JSON.stringify(body))
check((await search('조영준')).some((s) => s.t === '물 위를 걷는 자'), '검색: 작사자')
const first = (await search(''))[0]
check(first.no === 305, '목록 정렬: 장 번호 순(305 먼저)', `first=${first.no} ${first.t}`)

// 중복
const r2 = await imp('skip')
check(r2.imported === 0 && r2.skipped === 7, '재가져오기: 7곡 모두 중복 건너뜀', JSON.stringify(r2))
const r3 = await imp('overwrite')
check(r3.overwritten === 7 && r3.imported === 0, '덮어쓰기 모드: 7곡 갱신', JSON.stringify(r3))
check((await search('')).length === all.length, '덮어쓰기 후 곡 수 동일')

// 편집기 장 번호 저장/조회
const nid = await ev(`window.seraphim.saveSong({ title: 'zz 장번호 테스트', category: '새찬송가', hymnNo: 999, verses: [{ label: '1절', text: 't' }] })`)
check((await ev(`window.seraphim.getSong(${nid}).then(s => s.hymnNo)`)) === 999, '곡 저장 시 hymnNo 저장')
const r4 = await ev(`window.seraphim.importSongs([${JSON.stringify(FIX + '/478장 참 아름다워라.txt')}], { category: '복음성가', onDuplicate: 'skip' })`)
check(r4.skipped === 1, '단일 파일 지정 + 장 번호 중복 판별')
await ev(`window.seraphim.deleteSong(${nid})`)

// UI: 라이브러리에 "478장" 표시 (찬양 섹션으로 전환)
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='전체'); b && b.click(); return !!b })()`)
await new Promise((r) => setTimeout(r, 300))
await ev(`(() => { const i = document.querySelector('input[placeholder*="검색"]'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '478'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
await new Promise((r) => setTimeout(r, 800))
const uiTxt = await ev(`document.body.innerText`)
check(/478장/.test(uiTxt) && /참 아름다워라/.test(uiTxt), '라이브러리 목록에 장 번호 표시')
console.log(fails === 0 ? 'IMPORT E2E PASS' : `${fails} FAILED`)
ws.close(); process.exit(fails ? 1 : 0)
