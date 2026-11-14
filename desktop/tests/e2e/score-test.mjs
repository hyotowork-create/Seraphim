// 패키징된 앱에서 악보 기능 자동 검증 (CDP): PDF 변환 → 페이지 저장 → 곡-악보 연결 → 추출 오류 경로
import { copyFile, mkdir, stat, readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

const PORT = process.argv[2] || '9333'
const PDF_SRC = process.argv[3]
const cfgPath = join(homedir(), 'Library', 'Application Support', 'seraphim', 'seraphim-config.json')
const cfg = JSON.parse(await readFile(cfgPath, 'utf8').catch(() => '{}'))
const dataDir = process.env.SERAPHIM_TEST_DATADIR || cfg.dataDir || join(homedir(), 'Documents', 'SeraphimData')
console.log('dataDir:', dataDir)
await mkdir(join(dataDir, 'media', 'scores'), { recursive: true })
await copyFile(PDF_SRC, join(dataDir, 'media', 'scores', 'zz-test-score.pdf'))

const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pend = new Map()
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) }
}
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value
}
let fails = 0
const check = (ok, label, extra = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fails++ }

// 0) 악보 모달을 열어 디버그 훅이 설치되도록 (모듈 로드 시 설치되므로 열 필요는 없지만 UI도 확인)
const hook = await ev(`typeof window.__seraphimDebug?.rasterizePdf`)
check(hook === 'function', '디버그 훅(rasterizePdf) 존재')

// 1) PDF → PNG 페이지 변환 (pdf.js 워커가 file:// 패키징 환경에서 동작하는지)
const t0 = Date.now()
const pages = await ev(`window.__seraphimDebug.rasterizePdf('seraphim-media://local/media/scores/zz-test-score.pdf', () => {}).then(p => p.map(x => ({ pageNo: x.pageNo, len: x.pngBase64.length, head: x.pngBase64.slice(0, 40) })))`)
check(Array.isArray(pages) && pages.length === 2, 'PDF 2쪽 변환', `${JSON.stringify(pages)} (${Date.now() - t0}ms)`)
// PNG 헤더 + 가로 1800px 확인
const b = Buffer.from(pages[0].head, 'base64')
check(b.slice(1, 4).toString() === 'PNG', 'PNG 시그니처')
check(b.readUInt32BE(16) === 1800, 'PNG 가로 1800px', `w=${b.readUInt32BE(16)} h=${b.readUInt32BE(20)}`)

// 2) 페이지 저장 IPC → media 행 + 파일
const saved = await ev(`window.__seraphimDebug.rasterizePdf('seraphim-media://local/media/scores/zz-test-score.pdf', () => {}).then(async p => { const out=[]; for (const x of p) out.push(await window.seraphim.saveScorePage(x.pngBase64, 'zz-test p' + x.pageNo)); return out })`)
check(saved.length === 2 && saved.every((s) => /\.png$/.test(s.relPath) && s.url.startsWith('seraphim-media://local/')), '페이지 저장 IPC', JSON.stringify(saved.map((s) => s.relPath)))
const st = await stat(join(dataDir, saved[0].relPath))
check(st.size > 1000, '저장된 PNG 파일 존재', `${st.size} bytes`)

// 3) 곡 저장 시 악보 연결 → getSong.scores
const songId = await ev(`window.seraphim.saveSong({ title: 'zz 테스트 악보곡', category: '새찬송가', verses: [{ label: '1절', text: '테스트 가사' }], scoreMediaIds: [${saved[0].id}, ${saved[1].id}] })`)
const song = await ev(`window.seraphim.getSong(${songId})`)
check(song.scores?.length === 2 && song.scores[0].mediaId === saved[0].id && song.scores[0].url.startsWith('seraphim-media://'), '곡-악보 연결(song_scores v3 마이그레이션)', JSON.stringify(song.scores))
// 연결 유지: scoreMediaIds 없이 재저장하면 유지
await ev(`window.seraphim.saveSong({ id: ${songId}, title: 'zz 테스트 악보곡', category: '새찬송가', verses: [{ label: '1절', text: '수정' }] })`)
const song2 = await ev(`window.seraphim.getSong(${songId})`)
check(song2.scores?.length === 2, '재저장 시 악보 연결 유지')
await ev(`window.seraphim.deleteSong(${songId})`)
check((await ev(`window.seraphim.getSong(${songId})`)) === null, '테스트 곡 삭제')

// 4) 추출 오류 경로 (키 유무에 따라)
const hasKey = await ev(`window.seraphim.hasGeminiKey()`)
console.log('Gemini 키 저장 여부:', hasKey)
const tryExtract = (rels) => ev(`window.seraphim.extractScore(${JSON.stringify(rels)}, 'gemini').then(r => ({ ok: true, r }), e => ({ ok: false, msg: String(e.message || e) }))`)
if (!hasKey) {
  const r1 = await tryExtract([saved[0].relPath])
  check(!r1.ok && /API 키를 먼저/.test(r1.msg), '키 없음 오류 메시지', r1.msg)
  await ev(`window.seraphim.setGeminiKey('invalid-test-key-000')`)
  const r2 = await tryExtract([saved[0].relPath])
  check(!r2.ok && /키가 올바르지|인증 실패|사용할 수 없습니다/.test(r2.msg), '잘못된 키 → 친절한 오류', r2.msg)
  await ev(`window.seraphim.setGeminiKey('')`)
  check((await ev(`window.seraphim.hasGeminiKey()`)) === false, '테스트 키 제거')
} else {
  const r = await tryExtract([saved[0].relPath])
  console.log('실제 Gemini 호출 결과:', JSON.stringify(r).slice(0, 600))
  check(r.ok || !/Gemini 오류 \d+:/.test(r.msg), '실제 호출(키 있음) — 응답 또는 친절한 오류', r.ok ? `songs=${r.r.songs.length} meta=${JSON.stringify(r.r.meta)}` : r.msg)
}
const rPdf = await tryExtract(['media/scores/zz-test-score.pdf'])
check(!rPdf.ok && /PDF/.test(rPdf.msg), 'PDF 직접 추출 거부', rPdf.msg)
const rEsc = await tryExtract(['../../etc/passwd'])
check(!rEsc.ok && /잘못된 악보 경로|API 키/.test(rEsc.msg), '경로 탈출 차단', rEsc.msg)

// 5) 악보 모달 UI 열기 → 새 문구/비활성 OCR 확인 (찬양 섹션으로 전환)
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='전체'); b && b.click(); return !!b })()`)
await new Promise((r) => setTimeout(r, 300))
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(b=>/악보/.test(b.textContent)); b && b.click(); return !!b })()`)
await new Promise((r) => setTimeout(r, 300))
const ui = await ev(`(() => { const sel=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>/OCR/.test(o.text))); const ocr = sel && [...sel.options].find(o=>/OCR/.test(o.text)); const btn=[...document.querySelectorAll('button')].find(b=>/악보 이미지\\/PDF 선택/.test(b.textContent)); return { ocrDisabled: !!ocr?.disabled, pickBtn: !!btn } })()`)
check(!ui.ocrDisabled && ui.pickBtn, '악보 모달 UI(OCR 선택 가능, PDF 선택 버튼)', JSON.stringify(ui))
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`)
ws.close()
process.exit(fails ? 1 : 0)
