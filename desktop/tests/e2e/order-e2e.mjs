// 순서지 → 플레이리스트 E2E (격리 인스턴스): 곡 준비 → 해석 → 확정 → 플레이리스트/말씀 확인 → UI 버튼
const PORT = process.argv[2] || '9333'
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exc'); return r.result?.result?.value }
let fails = 0; const check = (ok, l, x = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++ }

// 곡 준비
const s1 = await ev(`window.seraphim.saveSong({ title: 'zz 참 아름다워라', hymnNo: 478, category: '새찬송가', verses: [{ label: '1절', text: 'a' }] })`)
const s2 = await ev(`window.seraphim.saveSong({ title: 'zz 물 위를 걷는 자', category: '워십', verses: [{ label: '1절', text: 'b' }] })`)
const s3 = await ev(`window.seraphim.saveSong({ title: 'zz 은혜', category: '복음성가', verses: [{ label: '1절', text: 'c' }] })`)
const s4 = await ev(`window.seraphim.saveSong({ title: 'zz 은혜 아니면', category: '복음성가', verses: [{ label: '1절', text: 'd' }] })`)
const s5 = await ev(`window.seraphim.saveSong({ title: 'zz 나', category: '복음성가', verses: [{ label: '1절', text: 'zz 나 가진 재물 없으나\\n나 남이 가진 지식 없으나' }] })`)
const s6 = await ev(`window.seraphim.saveSong({ title: 'zz 나는 예배자입니다 / 예배합니다', category: '워십', verses: [{ label: '1절', text: 'e' }] })`)
const sheet = `2026. 9. 20 주일1부 찬양(key는 변경될 수 있음)

1. zz 참 아름다워라(D) – 1-3절 – 2번 연결~
478장
요 3:16-18
2. zz 물 위를 걷는 자(A) - 후렴 2번 반복
zz 은혜
없는 곡 제목
시 23편
zz 나 가진 재물없으나
zz 예배합니다`
const tr = (await ev(`window.seraphim.listBibleTranslations()`))[0].code
const res = await ev(`window.seraphim.resolveOrder(${JSON.stringify(sheet)}, ${JSON.stringify(tr)})`)
const nb = res.filter((l) => l.kind !== 'blank')
console.log(nb.map((l) => `${l.kind}: ${l.song ? '♪' + l.song.title : l.bible ? '📖' + l.bible.reference : l.candidates ? '후보' + l.candidates.length : '✗' + l.error}`).join('\n'))
check(res[0].kind === 'blank' && res[1].kind === 'blank', '제목줄·빈 줄은 blank')
check(nb[0].song?.id === s1 && nb[0].note === '1-3절, 2번 연결', '곡 제목 + 메모 해석')
check(nb[1].song?.id === s1, '478장 → 장 번호로 찾기')
check(nb[2].bible?.reference === '요한복음 3:16-18' && nb[2].bible.verseCount === 3, '성경 참조 해석')
check(nb[3].song?.id === s2 && nb[3].note === '후렴 2번 반복', '조표·반복 메모 제거')
check(nb[4].song?.id === s3, '정규화 정확 일치가 부분 일치보다 우선 (은혜 vs 은혜 아니면)')
check(!!nb[5].error, '못 찾은 곡 → 오류', nb[5].error)
check(nb[6].bible?.reference === '시편 23' && nb[6].bible.verseCount === 6, '시 23편 장 전체')
check(nb[7].song?.id === s5, '제목 대신 가사 첫 줄로 찾기 (나 가진 재물없으나 → 제목 "나")', nb[7].error ?? '')
check(nb[8].song?.id === s6, '메들리 제목 부분 일치 (예배합니다)', nb[8].error ?? '')

// 확정
const items = nb.filter((l) => l.song || l.bible).map((l) => l.bible ? { kind: 'bible', note: l.note, bible: { book: l.bible.book, chapter: l.bible.chapter, verseRange: l.bible.verseRange, translation: l.bible.translationName, text: l.bible.text } } : { kind: 'song', note: l.note, songId: l.song.id })
const ap = await ev(`window.seraphim.applyOrder('zz 순서 테스트', ${JSON.stringify(items)})`)
check(ap.itemCount === 8, '플레이리스트 생성 항목 8개', JSON.stringify(ap))
const its = await ev(`window.seraphim.playlistItems(${ap.playlistId})`)
check(its.map((i) => i.itemType).join(',') === 'song,song,bible,song,song,bible,song,song', '항목 순서 유지', its.map((i) => i.itemType + ':' + i.title).join(' | '))
const bl = await ev(`window.seraphim.listBible('요한복음')`)
check(bl.some((b) => b.reference === '요한복음 3:16-18'), '말씀이 성경 목록에 저장')

// UI: 버튼 존재 → 모달 열림
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='순서로 만들기'); b && b.click(); return !!b })()`)
await new Promise((r) => setTimeout(r, 300))
check(/예배 순서로 플레이리스트 만들기/.test(await ev(`document.body.innerText`)), '"순서로 만들기" 버튼 → 모달')
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })

// 정리
await ev(`window.seraphim.deletePlaylist(${ap.playlistId})`)
for (const b of bl.filter((b) => b.reference === '요한복음 3:16-18')) await ev(`window.seraphim.deleteBible(${b.id})`)
for (const b of await ev(`window.seraphim.listBible('시편')`)) if (b.reference === '시편 23') await ev(`window.seraphim.deleteBible(${b.id})`)
for (const sid of [s1, s2, s3, s4, s5, s6]) await ev(`window.seraphim.deleteSong(${sid})`)
console.log(fails === 0 ? 'ORDER E2E PASS' : `${fails} FAILED`)
ws.close(); process.exit(fails ? 1 : 0)
