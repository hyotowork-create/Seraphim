// E2E: 유사 제목 곡 묶음 → 추천 유지 → 합치기(플레이리스트·악보 연결 이전) → 설정 UI 섹션
const PORT = process.argv[2] || '9333'
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exc'); return r.result?.result?.value }
let fails = 0; const check = (ok, l, x = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++ }

const a = await ev(`window.seraphim.saveSong({ title: 'zzq 예수 사랑하심은', category: '복음성가', verses: [{ label: '1절', text: 'l1\\nl2\\nl3' }] })`)
const b = await ev(`window.seraphim.saveSong({ title: 'zzq 예수사랑 하심을!', category: '워십', verses: [{ label: '1절', text: 'l1' }] })`)
const c = await ev(`window.seraphim.saveSong({ title: 'zzq 참 아름다워라', hymnNo: 9478, category: '새찬송가', verses: [{ label: '1절', text: 'x' }] })`)
const d = await ev(`window.seraphim.saveSong({ title: 'zzq 참 아름다와라', category: '복음성가', verses: [{ label: '1절', text: 'y\\ny2' }] })`)
const e = await ev(`window.seraphim.saveSong({ title: 'zzq 참 아름다워라', hymnNo: 9479, category: '새찬송가', verses: [{ label: '1절', text: 'z' }] })`)
const pid = await ev(`window.seraphim.createPlaylist('zzq dedup')`)
await ev(`window.seraphim.addPlaylistItem(${pid}, 'song', ${b})`)
const groups = await ev(`window.seraphim.dupGroups().then(g => g.filter(x => x.songs.some(s => s.title.startsWith('zzq '))))`)
console.log(groups.map((g) => g.key + ': ' + g.songs.map((s) => s.title + (s.hymnNo ? `(${s.hymnNo})` : '')).join(' | ') + ' → keep ' + g.recommendedKeepId).join('\n'))
const g1 = groups.find((g) => g.songs.some((s) => s.id === a))
check(!!g1 && g1.songs.length === 2 && g1.recommendedKeepId === a, '끝 조사·공백·구두점 차이 묶음, 가사 긴 곡 추천', JSON.stringify(g1?.songs.map((s) => s.id)))
const g2 = groups.find((g) => g.songs.some((s) => s.id === d))
check(!g2, '모음 표기가 다른 "아름다와라/아름다워라"는 묶지 않음(오합침 방지)')
check(!groups.some((g) => g.songs.some((s) => s.id === c) && g.songs.some((s) => s.id === e)), '장 번호가 다른 같은 제목 찬송은 묶지 않음')

const merged = await ev(`window.seraphim.mergeSongs(${a}, [${b}])`)
check(merged === 1, '합치기 실행')
const items = await ev(`window.seraphim.playlistItems(${pid})`)
check(items.length === 1 && items[0].refId === a, '플레이리스트 항목이 남긴 곡으로 이전', JSON.stringify(items[0]))
check((await ev(`window.seraphim.getSong(${b})`)) === null, '합쳐진 곡 삭제됨')

// 설정 UI
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>/설정/.test(b.textContent)); b && b.click(); return !!b })()`)
await new Promise((r) => setTimeout(r, 400))
const clicked = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='유사 곡 찾기'); b && b.click(); return !!b })()`)
await new Promise((r) => setTimeout(r, 800))
const txt = await ev(`document.body.innerText`)
check(clicked && /개 묶음/.test(txt) && /선택한 곡만 남기기/.test(txt), '설정 → 유사 곡 찾기 → 묶음 표시', clicked ? (txt.match(/\d+개 묶음/) || [''])[0] : 'button not found')
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='✕'); b && b.click(); return !!b })()`)

await ev(`window.seraphim.deletePlaylist(${pid})`)
for (const sid of [a, c, d, e]) await ev(`window.seraphim.deleteSong(${sid})`)
console.log(fails === 0 ? 'DEDUP E2E PASS' : `${fails} FAILED`)
ws.close(); process.exit(fails ? 1 : 0)
