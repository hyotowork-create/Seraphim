// 실제 Gemini 호출 E2E: 앱 캔버스에 찬송가 형식(겹친 절 + 하이픈 멜리스마)의 가짜 악보를 그려 추출 품질 확인
const PORT = process.argv[2] || '9333'
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exception'); return r.result?.result?.value }

// 찬송가처럼 한 보표 아래 1절/2절 가사가 세로로 겹치고, 음절이 하이픈으로 쪼개진 이미지
const draw = `(() => {
  const c = document.createElement('canvas'); c.width = 1600; c.height = 1100
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#000'; g.font = 'bold 44px sans-serif'; g.fillText('79장  주 하나님 지으신 모든 세계', 80, 90)
  g.font = '22px sans-serif'; g.fillText('작사 C. G. Boberg / 작곡 스웨덴 민요   ♩=72   G Key', 80, 130)
  const staff = (y) => { g.strokeStyle = '#000'; g.lineWidth = 1.5; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(80, y + i * 14); g.lineTo(1520, y + i * 14); g.stroke() } g.font = '20px sans-serif'; g.fillText('G', 90, y - 12); g.fillText('D7', 700, y - 12); g.fillText('C', 1200, y - 12) }
  g.font = '30px sans-serif'
  staff(220); g.fillText('1. 주 하 - 나 - 님  지 - 으 - 신  모 - 든  세 - 계', 80, 330); g.fillText('2. 숲 속 - 이 - 나  험 - 한  산 - 골 - 짝 - 에 - 서', 80, 372)
  staff(470); g.fillText('내 마 - 음 - 속 - 에  그 - 리 - 어  볼  때', 80, 580); g.fillText('지 - 저 - 귀 - 는  저  새 - 소 - 리 - 들 - 과', 80, 622)
  g.font = 'bold 26px sans-serif'; g.fillText('후렴', 80, 700)
  g.font = '30px sans-serif'
  staff(740); g.fillText('주 - 님 - 의  높 - 고  위 - 대 - 하 - 심 - 을  내 영 - 혼 - 이  찬 - 양 - 하 - 네', 80, 850)
  staff(920); g.fillText('주 - 님 - 의  높 - 고  위 - 대 - 하 - 심 - 을  내 영 - 혼 - 이  찬 - 양 - 하 - 네', 80, 1030)
  g.font = '16px sans-serif'; g.fillText('© 한국찬송가공회  CCLI #123456   p.1', 80, 1085)
  return c.toDataURL('image/png').split(',')[1]
})()`
const b64 = await ev(draw)
const saved = await ev(`window.seraphim.saveScorePage(${JSON.stringify(b64)}, 'zz-e2e-hymn.png')`)
console.log('saved:', saved.relPath)
const t0 = Date.now()
const r = await ev(`window.seraphim.extractScore([${JSON.stringify(saved.relPath)}], 'gemini').then(r => ({ ok: true, r }), e => ({ ok: false, msg: String(e.message || e) }))`)
console.log(`Gemini 응답 (${Date.now() - t0}ms):`)
console.log(JSON.stringify(r, null, 1))
let fails = 0
const check = (ok, label) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) fails++ }
if (r.ok) {
  check(r.r.songs.length === 1, '곡 1개로 인식 (meta=' + JSON.stringify(r.r.meta) + ')')
  const song = r.r.songs[0]; const v = song.verses; const all = v.flatMap((x) => x.lines).join(' ')
  check(/주 하나님/.test(song.title) && !/79장/.test(song.title), '제목 추출(곡 번호 제외)')
  check(v.some((x) => x.label === '1절') && v.some((x) => x.label === '2절') && v.some((x) => x.label === '후렴'), '라벨 1절/2절/후렴 정규화')
  check(!/[가-힣]\s*-\s*[가-힣]/.test(all), '하이픈 멜리스마 제거')
  const v1 = v.find((x) => x.label === '1절')?.lines.join(' ') ?? ''
  const v2 = v.find((x) => x.label === '2절')?.lines.join(' ') ?? ''
  check(/지으신 모든 세계/.test(v1) && /(그리어|그려) 볼 때/.test(v1) && !/산골짝/.test(v1), '1절: 겹친 줄에서 1절만 이어붙임 (' + v1 + ')')
  check(/그리어 볼 때/.test(v1), '악보 표기 그대로(맞춤법 미수정)')
  const v2n = v2.replace(/\s+/g, '')
  check(/험한산골짝에서/.test(v2n) && /새소리들과/.test(v2n) && !/모든세계/.test(v2n), '2절: 겹친 줄에서 2절만 이어붙임 (' + v2 + ')')
  check(!/D7|CCLI|Boberg|♩/.test(all), '코드·저작권·작곡자 제외')
  check(v.filter((x) => x.label === '후렴').length === 1, '후렴 1회')
}
console.log(fails === 0 && r.ok ? 'E2E PASS' : 'E2E FAIL')
ws.close(); process.exit(fails || !r.ok ? 1 : 0)
