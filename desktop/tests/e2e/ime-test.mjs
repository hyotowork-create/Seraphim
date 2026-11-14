// CDP로 한글 IME 조합 이벤트를 실제와 동일하게 발생시켜 자모 분리 여부를 검증
const PORT = process.argv[2] || '9333'
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url)) || list.find((t) => t.type === 'page')
if (!page) throw new Error('no page target: ' + JSON.stringify(list))
console.log('target:', page.url)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pend = new Map()
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.id && pend.has(d.id)) {
    pend.get(d.id)(d)
    pend.delete(d.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id
    pend.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 실제 macOS 2벌식 IME가 "한글 찬양" 을 칠 때 발생시키는 조합 시퀀스
const seq = [
  ['comp', 'ㅎ'], ['comp', '하'], ['comp', '한'],
  ['commit', '한'], ['comp', 'ㄱ'], ['comp', '그'], ['comp', '글'],
  ['commit', '글'], ['insert', ' '],
  ['comp', 'ㅊ'], ['comp', '차'], ['comp', '찬'],
  ['commit', '찬'], ['comp', 'ㅇ'], ['comp', '야'], ['comp', '양'],
  ['commit', '양']
]
async function typeKorean() {
  for (const [kind, t] of seq) {
    if (kind === 'comp') await send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length })
    else await send('Input.insertText', { text: t })
    await sleep(35) // 재렌더 사이클이 끼어들 시간을 줌
  }
}

async function testField(selectorExpr, label) {
  const ok = await evalJs(`(() => { const el = ${selectorExpr}; if (!el) return false; el.focus(); el.value=''; el.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
  if (!ok) { console.log(`[SKIP] ${label}: element not found`); return null }
  await sleep(100)
  await typeKorean()
  await sleep(200)
  const v = await evalJs(`document.activeElement && document.activeElement.value`)
  const pass = v === '한글 찬양'
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}: value=${JSON.stringify(v)}`)
  return pass
}

await send('Runtime.enable')
await send('Input.enable').catch(() => {})
await sleep(300)
const results = []
// 1) 라이브러리 검색창 (입력마다 목록 필터링 → 재렌더 스트레스)
results.push(await testField(`document.querySelector('input[placeholder*="검색"]')`, '라이브러리 검색창'))
// 2) 텍스트에어리어(자막 편집기 [5])
results.push(await testField(`document.querySelector('textarea')`, '자막 textarea'))
// 3) 조합 중 Enter — 플레이리스트 이름 입력(있으면)
const btn = await evalJs(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='＋'); if(!b) return false; b.click(); return true })()`)
if (btn) {
  await sleep(200)
  const found = await evalJs(`(() => { const el=document.querySelector('input[placeholder*="플레이리스트 이름"]'); if(!el) return false; el.focus(); return true })()`)
  if (found) {
    await typeKorean()
    // 마지막 글자 조합 중 Enter를 누르는 상황 재현: 조합 열어두고 Enter
    await send('Input.imeSetComposition', { text: 'ㄴ', selectionStart: 1, selectionEnd: 1 })
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 13 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await sleep(100)
    const stillOpen = await evalJs(`!!document.querySelector('input[placeholder*="플레이리스트 이름"]')`)
    console.log(`[${stillOpen ? 'PASS' : 'FAIL'}] 조합 중 Enter 무시 (입력창 유지=${stillOpen})`)
    results.push(stillOpen)
    await send('Input.insertText', { text: 'ㄴ' })
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  }
}
const allPass = results.filter((r) => r !== null).every(Boolean)
console.log(allPass ? 'ALL PASS' : 'SOME FAIL')
ws.close()
process.exit(allPass ? 0 : 1)
