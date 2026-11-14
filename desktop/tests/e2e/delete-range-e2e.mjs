// E2E: 곡 삭제(플레이리스트 항목 정리·덱 해제) + 플레이리스트 메모 절 범위 송출 + 편집기 UI(삭제 버튼·절 나누기)
const PORT = process.argv[2] || '9333'
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exc'); return r.result?.result?.value }
let fails = 0; const check = (ok, l, x = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++ }

// 준비: 5절 + 후렴 곡, 플레이리스트에 "1-3절" 메모로 추가
const sid = await ev(`window.seraphim.saveSong({ title: 'zz 절범위 테스트곡', category: '복음성가', verses: [{ label: '1절', text: 'v1' }, { label: '2절', text: 'v2' }, { label: '후렴', text: 'ch' }, { label: '3절', text: 'v3' }, { label: '4절', text: 'v4' }, { label: '5절', text: 'v5' }] })`)
const pid = await ev(`window.seraphim.createPlaylist('zz 절범위')`)
await ev(`window.seraphim.addPlaylistItem(${pid}, 'song', ${sid}, '1-3절')`)
const items = await ev(`window.seraphim.playlistItems(${pid})`)
check(items.length === 1 && items[0].note === '1-3절', '플레이리스트 항목에 메모 저장', JSON.stringify(items[0]))

// UI: 플레이리스트 열기 → 항목 클릭 → 슬라이드 목록에 1,2,후렴,3절만
// 사이드바 플레이리스트 목록은 마운트 때 읽으므로 새로고침 후 진행
await send('Page.reload')
await new Promise((r) => setTimeout(r, 2500))
const plClicked = await ev(`(() => { const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0 && e.textContent.trim()==='zz 절범위'); el && el.click(); return !!el })()`)
check(plClicked, '사이드바에서 플레이리스트 열기')
await new Promise((r) => setTimeout(r, 600))
const clicked = await ev(`(() => { const el=[...document.querySelectorAll('div')].find(e=>e.className.includes('cursor-pointer') && /zz 절범위 테스트곡/.test(e.textContent) && /1-3절/.test(e.textContent)); el && el.click(); return !!el })()`)
check(clicked, '플레이리스트 항목 표시(메모 포함) 및 클릭')
await new Promise((r) => setTimeout(r, 600))
const labels = await ev(`document.body.innerText`)
check(/v1/.test(labels) && /v2/.test(labels) && /v3/.test(labels) && /ch/.test(labels) && !/v4/.test(labels) && !/v5/.test(labels), '슬라이드 목록: 1-3절 + 후렴만 (4·5절 제외)')

// 곡 삭제 API → 플레이리스트 항목 정리
const sid2 = await ev(`window.seraphim.saveSong({ title: 'zz 삭제 테스트곡', category: '복음성가', verses: [{ label: '1절', text: 'd1' }] })`)
await ev(`window.seraphim.addPlaylistItem(${pid}, 'song', ${sid2})`)
await ev(`window.seraphim.deleteSong(${sid2})`)
const after = await ev(`window.seraphim.playlistItems(${pid})`)
check(after.length === 1 && after[0].refId === sid, '곡 삭제 시 플레이리스트 항목도 제거', JSON.stringify(after.map((i) => i.title)))
check((await ev(`window.seraphim.getSong(${sid2})`)) === null, '삭제된 곡 조회 → null')

// 편집기 UI: 기존 곡 열면 "곡 삭제" 버튼, 절 나누기 도구 존재
await ev(`(() => { const el=[...document.querySelectorAll('div')].find(e=>e.className.includes('cursor-pointer') && /zz 절범위 테스트곡/.test(e.textContent)); el && el.click(); return !!el })()`)
await new Promise((r) => setTimeout(r, 300))
const opened = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>/편집|수정/.test(b.textContent) && b.textContent.trim().length < 8); if (b) { b.click(); return b.textContent.trim() } return null })()`)
await new Promise((r) => setTimeout(r, 400))
const txt = await ev(`document.body.innerText`)
const hasDelete = /곡 삭제/.test(txt)
const hasSplit = /절 나누기/.test(txt)
check(hasDelete && hasSplit, '편집기: 곡 삭제 버튼 + 절 나누기 도구', `열기버튼=${opened} 삭제=${hasDelete} 나누기=${hasSplit}`)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='취소'); b && b.click(); return !!b })()`)

// 정리
await ev(`window.seraphim.deletePlaylist(${pid})`)
await ev(`window.seraphim.deleteSong(${sid})`)
console.log(fails === 0 ? 'DELETE/RANGE E2E PASS' : `${fails} FAILED`)
ws.close(); process.exit(fails ? 1 : 0)
