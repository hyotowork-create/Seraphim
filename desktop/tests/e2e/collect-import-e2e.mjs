// E2E: 수집 형식(벅스 json/tsv/txt 동일 내용 + 유튜브 json) 폴더째 가져오기 — txt 중복 무시, 제목 정리, 트랙 번호 오인 없음
// 사용: node tests/e2e/collect-import-e2e.mjs <port> <fixtureDir>
const PORT = process.argv[2] || '9333'
const DIR = process.argv[3]
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exc'); return r.result?.result?.value }
let fails = 0; const check = (ok, l, x = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++ }
const before = await ev(`window.seraphim.listSongs({ scope: 'all', search: '' }).then(l => l.length)`)
const maxIdBefore = await ev(`window.seraphim.listSongs({ scope: 'all', search: '' }).then(l => Math.max(0, ...l.map(s => s.id)))`)
const rep = await ev(`window.seraphim.importSongs([${JSON.stringify(DIR)}], { category: '워십', onDuplicate: 'skip' })`)
console.log('report:', JSON.stringify({ ...rep, titles: rep.titles.slice(0, 5) }))
const after = await ev(`window.seraphim.listSongs({ scope: 'all', search: '' }).then(l => l.length)`)
check(rep.failed.length === 0, '실패 파일 없음', JSON.stringify(rep.failed))
check(rep.imported + rep.skipped >= 297 + 28 && rep.imported + rep.skipped <= 297 + 28 + 2, '벅스 297 + 유튜브 28곡만 처리(txt·tsv 중복 없음)', `${rep.imported}+${rep.skipped}`)
check(after - before === rep.imported, '추가 수 = 라이브러리 증가 수', `${before}→${after}`)
const junk = await ev(`window.seraphim.listSongs({ scope: 'all', search: '최신워십' }).then(l => l.map(s => s.title))`)
check(junk.length === 0, '파일명 제목의 쓰레기 곡 없음', JSON.stringify(junk))
// 실제 DB 사본에 같은 제목이 이미 있으면 건너뛰므로(작사자 없음) 이번에 실제로 추가된 제목으로 검사
const ytTitle = rep.titles[0]
const detail = (q) => ev(`window.seraphim.listSongs({ scope: 'all', search: ${JSON.stringify(q)} }).then(l => Promise.all(l.map(s => window.seraphim.getSong(s.id)))).then(l => l.map(s => [s.title, s.hymnNo, s.author]))`)
const t1 = await detail(ytTitle)
check(t1.some(([t, no, a]) => t === ytTitle && no == null && /워십/.test(a || '')), '유튜브 곡: 제목 정리·장 번호 없음·팀 작사자', JSON.stringify(t1))
const bgTitle = rep.titles.find((t, i) => i >= 28 && !/^\d/.test(t)) || rep.titles[40]
const t2 = await detail(bgTitle)
check(t2.some(([t, no, a]) => t === bgTitle && no == null && (a || '').length > 0), '벅스 곡: 가수 → 작사자, 장 번호 없음', JSON.stringify(t2))
const piaNum = await ev(`window.seraphim.listSongs({ scope: 'all', search: '나는 일어섭니다' }).then(l => l.map(s => [s.title, s.hymnNo]))`)
check(piaNum.every(([t, no]) => !/^\d+\./.test(t) && (no == null || no !== 1)), '"1. 나는 일어섭니다" 트랙 번호가 장 번호/제목에 남지 않음', JSON.stringify(piaNum))
// 이전부터 있던 곡은 제외(실제 DB 사본에는 예전 가져오기의 꼬리표 제목이 남아 있을 수 있음)
const bad = await ev(`Promise.all(['Official', '인도 :', 'Acoustic Ver'].map(q => window.seraphim.listSongs({ scope: 'all', search: q }))).then(ls => ls.flat().filter(s => s.id > ${maxIdBefore}).map(s => s.title).filter(t => /Official|인도\\s*:|Acoustic Ver/.test(t)))`)
check(bad.length === 0, '"(Official)" "(인도 : …)" "(Acoustic Ver.)" 꼬리 남은 제목 없음', JSON.stringify(bad.slice(0, 5)))
console.log(fails === 0 ? 'COLLECT IMPORT E2E PASS' : `${fails} FAILED`)
ws.close(); process.exit(fails ? 1 : 0)
