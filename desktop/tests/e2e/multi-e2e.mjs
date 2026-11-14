// E2E(실제 Gemini): (1) 한 이미지에 2곡 → songs 2개, (2) 영역 선택으로 2번째 곡만 추출, (3) 작은 저해상도 이미지 → 자동 확대/정밀 재시도
const PORT = process.argv[2] || '9333'
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exception'); return r.result?.result?.value }
let fails = 0
const check = (ok, label, extra = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }
const tryExtract = (rels, opts = {}) => ev(`window.seraphim.extractScore(${JSON.stringify(rels)}, 'gemini', ${JSON.stringify(opts)}).then(r => ({ ok: true, r }), e => ({ ok: false, msg: String(e.message || e) }))`)
const brief = (r) => r.ok ? JSON.stringify({ meta: r.r.meta, songs: r.r.songs.map(s => ({ title: s.title, verses: s.verses.map(v => v.label + ':' + v.lines.join(' / ')) })) }, null, 1) : r.msg

// 한 장에 2곡: 위쪽 "주 하나님 지으신 모든 세계", 아래쪽 "나의 갈 길 다 가도록"
const drawTwo = `(() => {
  const c = document.createElement('canvas'); c.width = 1600; c.height = 1500
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'
  const staff = (y) => { g.strokeStyle = '#000'; g.lineWidth = 1.5; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(80, y + i * 14); g.lineTo(1520, y + i * 14); g.stroke() } g.font = '20px sans-serif'; g.fillText('G', 90, y - 12); g.fillText('D7', 700, y - 12) }
  g.font = 'bold 40px sans-serif'; g.fillText('79장  주 하나님 지으신 모든 세계', 80, 70)
  g.font = '20px sans-serif'; g.fillText('C. G. Boberg   4/4  G Key', 80, 105)
  g.font = '30px sans-serif'
  staff(170); g.fillText('1. 주 하 - 나 - 님  지 - 으 - 신  모 - 든  세 - 계', 80, 280); g.fillText('2. 숲 속 - 이 - 나  험 - 한  산 - 골 - 짝 - 에 - 서', 80, 322)
  staff(400); g.fillText('내 마 - 음 - 속 - 에  그 - 리 - 어  볼  때', 80, 510); g.fillText('지 - 저 - 귀 - 는  저  새 - 소 - 리 - 들 - 과', 80, 552)
  g.font = 'bold 40px sans-serif'; g.fillText('384장  나의 갈 길 다 가도록', 80, 720)
  g.font = '20px sans-serif'; g.fillText('F. J. Crosby   6/8  D Key', 80, 755)
  g.font = '30px sans-serif'
  staff(820); g.fillText('1. 나 - 의  갈  길  다  가 - 도 - 록  예 - 수  인 - 도 - 하 - 시 - 니', 80, 930); g.fillText('2. 나 - 의  갈  길  다  가 - 도 - 록  주 - 께 - 서  함 - 께  하 - 시 - 니', 80, 972)
  staff(1050); g.fillText('내  주 - 안 - 에  있 - 는  긍 - 휼  어 - 찌  의 - 심 - 하 - 리 - 요', 80, 1160); g.fillText('갈 - 한  땅 - 에  샘 - 물  솟 - 아  즐 - 겁 - 게  마 - 시 - 도 - 다', 80, 1202)
  g.font = '16px sans-serif'; g.fillText('© 한국찬송가공회  p.2', 80, 1480)
  return c.toDataURL('image/png').split(',')[1]
})()`
const two = await ev(`window.seraphim.saveScorePage(${JSON.stringify(await ev(drawTwo))}, 'zz-e2e-two.png')`)
check(two.width === 1600 && two.height === 1500, '저장 시 이미지 크기 반환', `${two.width}x${two.height}`)

let t0 = Date.now()
const r1 = await tryExtract([two.relPath])
console.log(`(1) 2곡 이미지 (${Date.now() - t0}ms):\n` + brief(r1))
if (r1.ok) {
  const s = r1.r.songs
  check(s.length === 2, '곡 2개로 분리', `songs=${s.length}`)
  check(/주 하나님/.test(s[0]?.title ?? '') && /나의 갈 길/.test(s[1]?.title ?? ''), '각 곡 제목', s.map(x => x.title).join(' | '))
  const a = s[0]?.verses.flatMap(v => v.lines).join(' ') ?? ''; const b = s[1]?.verses.flatMap(v => v.lines).join(' ') ?? ''
  check(/모든 세계/.test(a) && !/가도록/.test(a) && /가도록/.test(b) && !/모든 세계/.test(b), '곡 간 가사 섞이지 않음')
  check(r1.r.meta.retried === false, '정밀 재시도 없이 1차 성공')
} else check(false, '2곡 추출 실패', r1.msg)

// (2) 영역 선택: 아래쪽 곡(y 0.45~0.83)만
t0 = Date.now()
const r2 = await tryExtract([two.relPath], { regions: [{ relPath: two.relPath, x: 0, y: 0.45, w: 1, h: 0.38 }] })
console.log(`(2) 영역 추출 (${Date.now() - t0}ms):\n` + brief(r2))
if (r2.ok) {
  const s = r2.r.songs
  check(s.length === 1 && /나의 갈 길/.test(s[0].title), '영역 안 곡만 1개', s.map(x => x.title).join(' | '))
  check(!/모든 세계/.test(JSON.stringify(s)), '영역 밖 가사 없음')
} else check(false, '영역 추출 실패', r2.msg)

// (3) 저해상도(가로 520px, 글자 9px)의 작은 악보 → 자동 확대 + 빈약하면 정밀 재시도
const drawSmall = `(() => {
  const c = document.createElement('canvas'); c.width = 520; c.height = 300
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'
  const staff = (y) => { g.strokeStyle = '#000'; g.lineWidth = 0.6; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(20, y + i * 5); g.lineTo(500, y + i * 5); g.stroke() } }
  g.font = 'bold 13px sans-serif'; g.fillText('305장  나 같은 죄인 살리신', 20, 24)
  g.font = '9.5px sans-serif'
  staff(50); g.fillText('1. 나 같 - 은  죄 - 인  살 - 리 - 신  주  은 - 혜  놀 - 라 - 워', 20, 88); g.fillText('2. 큰  죄 - 악 - 에 - 서  건 - 지 - 신  주  은 - 혜  고 - 마 - 워', 20, 100)
  staff(130); g.fillText('잃 - 었 - 던  생 - 명  찾 - 았 - 고  광 - 명 - 을  얻 - 었 - 네', 20, 168); g.fillText('나  처 - 음  믿 - 은  그  시 - 간  귀 - 하 - 고  귀 - 하 - 다', 20, 180)
  g.font = '7px sans-serif'; g.fillText('© 한국찬송가공회', 20, 290)
  return c.toDataURL('image/png').split(',')[1]
})()`
const small = await ev(`window.seraphim.saveScorePage(${JSON.stringify(await ev(drawSmall))}, 'zz-e2e-small.png')`)
check(small.width === 520, '저해상도 이미지 저장(가로 520px)')
t0 = Date.now()
const r3 = await tryExtract([small.relPath])
console.log(`(3) 저해상도 (${Date.now() - t0}ms):\n` + brief(r3))
if (r3.ok) {
  const all = JSON.stringify(r3.r.songs)
  check(/나 같은 죄인/.test(r3.r.songs[0]?.title ?? '') , '작은 이미지 제목 인식')
  check(/은혜 놀라워/.test(all) && /광명을 얻었네/.test(all), '작은 이미지 가사 인식(자동 확대)')
  console.log('   meta:', JSON.stringify(r3.r.meta))
} else check(false, '저해상도 추출 실패', r3.msg)

// (4) 정밀 모드 강제
t0 = Date.now()
const r4 = await tryExtract([small.relPath], { precise: true })
console.log(`(4) 정밀 모드 강제 (${Date.now() - t0}ms): meta=${r4.ok ? JSON.stringify(r4.r.meta) : r4.msg}`)
check(r4.ok && r4.r.meta.precise === true && /3\.8/.test(r4.r.meta.model), '정밀 모드 → 정밀 모델 사용')

console.log(fails === 0 ? 'MULTI E2E PASS' : `${fails} FAILED`)
ws.close(); process.exit(fails ? 1 : 0)
