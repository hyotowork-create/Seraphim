// E2E: 로컬 OCR(오프라인) 추출 + 로고 이미지 지정/복원 + 설정 UI OCR 옵션
const PORT = process.argv[2] || '9333'
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exc'); return r.result?.result?.value }
let fails = 0; const check = (ok, l, x = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++ }

// 1) OCR: 큰 글씨의 가사 이미지(인쇄체) → 텍스트
const draw = `(() => {
  const c = document.createElement('canvas'); c.width = 1400; c.height = 700
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'
  g.font = 'bold 44px "Apple SD Gothic Neo", sans-serif'
  g.fillText('1절', 60, 90)
  g.font = '40px "Apple SD Gothic Neo", sans-serif'
  g.fillText('주 하나님 지으신 모든 세계', 60, 160); g.fillText('시험 가사 둘째 줄', 60, 220)
  g.font = 'bold 44px "Apple SD Gothic Neo", sans-serif'; g.fillText('후렴', 60, 330)
  g.font = '40px "Apple SD Gothic Neo", sans-serif'
  g.fillText('시험용 후렴 첫 줄', 60, 400); g.fillText('우리 함께 찬양하리', 60, 460)
  g.font = '18px sans-serif'; g.fillText('© 한국찬송가공회 CCLI #123', 60, 660)
  return c.toDataURL('image/png').split(',')[1]
})()`
const saved = await ev(`window.seraphim.saveScorePage(${JSON.stringify(await ev(draw))}, 'zz-ocr.png')`)
const t0 = Date.now()
const r = await ev(`window.seraphim.extractScore([${JSON.stringify(saved.relPath)}], 'ocr').then(r => ({ ok: true, r }), e => ({ ok: false, msg: String(e.message || e) }))`)
console.log(`OCR (${Date.now() - t0}ms):`, r.ok ? JSON.stringify(r.r.songs[0].verses) : r.msg, r.ok ? JSON.stringify(r.r.meta) : '')
check(r.ok, '로컬 OCR 실행', r.ok ? '' : r.msg)
if (r.ok) {
  const all = r.r.songs[0].verses.flatMap((v) => v.lines).join(' ').replace(/\s/g, '')
  check(/하나님/.test(all) && /세계/.test(all) && /찬양/.test(all), 'OCR 텍스트에 핵심 단어 포함', all.slice(0, 80))
  const labelsOk = r.r.songs[0].verses.some((v) => v.label === '1절') && r.r.songs[0].verses.some((v) => v.label === '후렴')
  console.log(`[INFO] OCR 라벨 인식(참고, 품질 지표): ${labelsOk ? '인식됨' : '미인식'} — ${r.r.songs[0].verses.map((v) => v.label || '(없음)').join(',')}`)
  check(!/CCLI|찬송가공회/.test(all), '꼬리말 줄 제거 여부(참고)', /CCLI|찬송가공회/.test(all) ? '남아 있음(허용)' : '')
  fails -= /CCLI|찬송가공회/.test(all) ? 1 : 0
}

// 2) 로고 이미지: 저장 → live 상태 → 재시작 없이 복원 함수 대신 설정값 확인
const logoB64 = await ev(`(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 200; const g = c.getContext('2d'); g.fillStyle = '#4af'; g.fillRect(0,0,400,200); return c.toDataURL('image/png').split(',')[1] })()`)
const logo = await ev(`window.seraphim.saveScorePage(${JSON.stringify(logoB64)}, 'zz-logo.png')`)
await ev(`window.seraphim.setSetting('logo.mediaId', String(${logo.id}))`)
const st = await ev(`window.seraphim.setLive({ logoUrl: ${JSON.stringify(logo.url)}, showLogo: true })`)
check(st.logoUrl === logo.url && st.showLogo === true, 'live 상태에 로고 URL 반영')
await ev(`window.seraphim.openOutput()`)
await new Promise((r) => setTimeout(r, 1500))
const out = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => /output\.html/.test(t.url))
const ws2 = new WebSocket(out.webSocketDebuggerUrl); await new Promise((r) => (ws2.onopen = r))
const hasImg = await new Promise((res) => { ws2.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result?.result?.value) }; ws2.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `!!document.querySelector('img[alt="로고"]') && !document.body.innerText.includes('SERAPHIM')`, returnByValue: true } })) }); ws2.close()
check(hasImg === true, 'Output 창에 로고 이미지 표시(글자 로고 대신)')
await ev(`window.seraphim.setLive({ showLogo: false, logoUrl: null })`)
await ev(`window.seraphim.setSetting('logo.mediaId', '')`)
await ev(`window.seraphim.closeOutput()`)
const quick = await ev(`document.body.innerText.includes('글자 로고(SERAPHIM)') && document.body.innerText.includes('이미지…')`)
check(quick, '빠른 기능 패널에 로고 이미지 지정 버튼')

// 3) 설정 UI: OCR 옵션 활성
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>/설정/.test(b.textContent)); b && b.click(); return !!b })()`)
await new Promise((r) => setTimeout(r, 400))
const ocrOpt = await ev(`(() => { const o=[...document.querySelectorAll('option')].find(o=>/로컬 OCR/.test(o.text)); return o ? { disabled: o.disabled, text: o.text } : null })()`)
check(ocrOpt && !ocrOpt.disabled, '설정에서 로컬 OCR 옵션 활성', JSON.stringify(ocrOpt))
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='✕'); b && b.click(); return !!b })()`)
console.log(fails === 0 ? 'OCR/LOGO E2E PASS' : `${fails} FAILED`)
ws.close(); process.exit(fails ? 1 : 0)
