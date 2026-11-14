// E2E: 카메라 1·2·3 동시 사용·전환 — 가짜 카메라 2대(--use-fake-device-for-media-stream=device-count=2)
//  미리 켜 두기(전환 시 다시 열지 않음) · 숫자키 전환 · 카메라별 줌 · 방송(녹화) 중 전환해도 프레임 유지 · 고정 출처 · 설정 저장
// 사용: SERAPHIM_RECORDINGS_DIR=<dir> 로 앱을 띄운 뒤  node tests/e2e/camera-switch-e2e.mjs <port> <outDir>
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
const PORT = process.argv[2] || '9335'
const OUT = process.argv[3]
const FF = process.env.FFMPEG_LISTENER || '/opt/homebrew/bin/ffmpeg'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function target(re) {
  for (let i = 0; i < 60; i++) {
    const l = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => [])
    const t = l.find((x) => x.type === 'page' && re.test(x.url))
    if (t) return t
    await sleep(500)
  }
  throw new Error('target not found ' + re)
}
function connect(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  let id = 0; const pend = new Map()
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
  const ready = new Promise((r) => (ws.onopen = r))
  const send = async (method, params = {}) => { await ready; return new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) }) }
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exc')
    return r.result?.result?.value
  }
  const key = async (k) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, text: k })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k })
  }
  return { ev, key, close: () => ws.close() }
}
let fails = 0
const check = (ok, l, x = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++ }
const ctl = connect(await target(/index\.html/))
const ev = ctl.ev
const B = `window.__seraphimDebug.broadcast`
const waitFor = async (expr, ms = 8000, c = ctl) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await c.ev(expr); if (v) return v; await sleep(150) } return v }

const cams = await ev(`navigator.mediaDevices.getUserMedia({video:true}).then(s=>{s.getTracks().forEach(t=>t.stop()); return navigator.mediaDevices.enumerateDevices()}).then(d=>d.filter(x=>x.kind==='videoinput').map(x=>({id:x.deviceId,label:x.label})))`)
check(cams.length >= 2, '가짜 카메라 2대', JSON.stringify(cams.map((c) => c.label)))
await ev(`window.seraphim.setLive({ cameraSlot: { index: 0, deviceId: ${JSON.stringify(cams[0].id)}, label: '아이폰(가짜)' } })`)
await ev(`window.seraphim.setLive({ cameraSlot: { index: 1, deviceId: ${JSON.stringify(cams[1].id)}, label: '오즈모(가짜)' }, activeCamera: 0, text: '카메라 전환 확인', blackout: false, showLogo: false })`)
await ev(`window.seraphim.setLive({ cameraSlot: { index: 0, view: { zoom: 2, x: 0.3, y: 0.3 } } })`)

// 운영자 창: 카메라 칸
const tiles = await waitFor(`(() => { const t = [...document.querySelectorAll('[data-camera-tile]')]; const ok = t.length === 3 && [0,1].every(i => { const v = t[i].querySelector('video'); return v && v.readyState >= 2 }); return ok ? t.map(x => x.dataset.cameraOn).join('') : null })()`)
check(tiles === '100', '카메라 칸 3개, 1·2번 실시간 미리보기 재생 · 1번 켜짐', String(tiles))

// 프로젝터 배경 = 카메라(전환 따라가기) → 프리뷰에 두 카메라 겹쳐 두고 1번만 보임
await ev(`window.seraphim.setLive({ background: { kind: 'camera', cameraSource: 'program', dim: 0 } })`)
const pv = await waitFor(`(() => { const l = [...document.querySelectorAll('[data-camera-slot]')].filter(x => !x.closest('[data-camera-tile]') && !x.closest('[data-camera-setup]')); return l.length >= 2 ? l.map(x => x.dataset.cameraSlot + ':' + x.dataset.cameraVisible).join(',') : null })()`)
check(pv === '0:1,1:0', '프로젝터 프리뷰: 카메라 1·2를 미리 켜 두고 1번만 보임', String(pv))

// 방송(녹화) 시작: 카메라 + 하단 자막, 카메라 전환 따라가기
await ev(`${B}.getState().init()`)
await ev(`${B}.getState().updateConfig({ quality: '720p', layout: 'lowerThird', cameraSource: 'program', audioDeviceId: null, audioLabel: null })`)
await ev(`${B}.getState().startRecord()`)
const ph = await waitFor(`${B}.getState().rec.phase === 'live' ? 'live' : (${B}.getState().rec.phase === 'error' ? 'error:' + ${B}.getState().rec.error : null)`, 20000)
check(ph === 'live', '녹화 시작', String(ph))
const sw = connect(await target(/output\.html/))
const pre = await waitFor(`(() => { const l = [...document.querySelectorAll('[data-camera-slot]')]; const v = l.map(x => x.querySelector('video')); return l.length === 2 && v.every(x => x && x.readyState >= 2 && x.currentTime > 0.5) ? l.map((x, i) => ({ slot: x.dataset.cameraSlot, vis: x.dataset.cameraVisible, t: v[i].currentTime, tf: v[i].style.transform })) : null })()`, 10000, sw)
check(Array.isArray(pre) && pre[0].vis === '1' && pre[1].vis === '0', '방송 창: 두 카메라 모두 미리 재생, 1번 보임', JSON.stringify(pre))
check(Array.isArray(pre) && pre[0].tf === 'scale(2)' && pre[1].tf === 'scale(1)', '카메라별 줌: 1번 2×, 2번 1×', JSON.stringify(pre && pre.map((p) => p.tf)))
await sw.ev(`window.__cam2 = document.querySelector('[data-camera-slot="1"] video')`)
// 가사가 카메라 위에 보이는지 (카메라 칸이 자막을 덮지 않음)
const onTop = await sw.ev(`(() => { const t = [...document.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent.trim() === '카메라 전환 확인'); if (!t) return 'no-text'; const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el === t || t.contains(el) ? 'top' : (el ? el.tagName + ':' + (el.closest('[data-camera-slot]') ? 'camera' : 'other') : 'none') })()`)
check(onTop === 'top', '하단 자막이 카메라 위에 보임', String(onTop))
await sleep(2000)

// 숫자키 2 → 카메라 2로 전환
await ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`)
const t0 = Date.now()
await ctl.key('2')
const switched = await waitFor(`document.querySelector('[data-camera-slot="1"]').dataset.cameraVisible === '1' && document.querySelector('[data-camera-slot="0"]').dataset.cameraVisible === '0'`, 3000, sw)
const switchMs = Date.now() - t0
check(!!switched && switchMs < 1500, '숫자키 2 → 방송 창 카메라 2로 전환', `${switchMs}ms`)
const same = await sw.ev(`(() => { const v = document.querySelector('[data-camera-slot="1"] video'); return { same: v === window.__cam2, t: v.currentTime, ready: v.readyState } })()`)
check(same.same && same.ready >= 2, '전환할 때 카메라를 다시 열지 않음 (미리 켜 둔 영상 그대로 → 검은 화면 없음)', JSON.stringify(same))
check((await ev(`window.seraphim.getLive().then(s => s.activeCamera)`)) === 1, '송출 상태 activeCamera = 2번')
const tile2 = await waitFor(`document.querySelector('[data-camera-tile="1"]').dataset.cameraOn === '1' ? 'on' : null`, 2000)
check(tile2 === 'on', '운영자 카메라 칸: 2번에 빨간 표시')
const pv2 = await ev(`[...document.querySelectorAll('[data-camera-slot]')].filter(x => !x.closest('[data-camera-tile]') && !x.closest('[data-camera-setup]')).map(x => x.dataset.cameraSlot + ':' + x.dataset.cameraVisible).join(',')`)
check(pv2 === '0:0,1:1', '프로젝터 프리뷰도 함께 2번으로', pv2)
await sleep(3000)
const st = await ev(`${B}.getState().rec.status`)
check(st && st.fps >= 25 && ['live'].includes(await ev(`${B}.getState().rec.phase`)), '전환 후에도 녹화 30fps 유지', JSON.stringify(st && { fps: st.fps, speed: st.speed }))

// 줌 단축키는 화면에 나가는 카메라(2번)에만
await ctl.key('+')
await sleep(400)
const z = await ev(`window.seraphim.getLive().then(s => s.cameras.map(c => c.view.zoom))`)
check(z[0] === 2 && z[1] === 1.25, '+ 키: 보이는 카메라(2번)만 1.25×, 1번은 2× 그대로', JSON.stringify(z))
// 카메라 칸의 줌 버튼 (운영 화면에서 바로) — 칸 전환과 겹치지 않음
await ev(`document.querySelector('[data-tile-zoom="1"] button[aria-label$="줌 인"]').click()`)
const zt = await waitFor(`document.querySelector('[data-camera-slot="1"] video').style.transform === 'scale(1.5)' ? 'ok' : null`, 2000, sw)
check(zt === 'ok', '칸의 + 버튼: 카메라 2 → 1.5×, 방송 창에 바로 반영', String(await sw.ev(`document.querySelector('[data-camera-slot="1"] video').style.transform`)))
const zv = await ev(`document.querySelector('[data-tile-zoom="1"] [data-tile-zoom-value]').textContent`)
check(zv === '1.5×', '칸에 배율 표시', String(zv))
await ev(`document.querySelector('[data-tile-zoom="0"] button[aria-label$="줌 인"]').click()`)
await sleep(300)
const z2 = await ev(`window.seraphim.getLive().then(s => ({ zoom: s.cameras.map(c => c.view.zoom), active: s.activeCamera }))`)
check(z2.zoom[0] === 2.25 && z2.active === 1, '안 나가는 카메라 1도 칸에서 미리 줌 (전환은 안 됨)', JSON.stringify(z2))
await ev(`document.querySelector('[data-tile-zoom="0"] button[aria-label$="줌 아웃"]').click()`)
await ev(`document.querySelector('[data-tile-zoom="1"] button[aria-label$="줌 아웃"]').click()`)
await sleep(300)
const z3 = await ev(`window.seraphim.getLive().then(s => s.cameras.map(c => c.view.zoom))`)
check(z3[0] === 2 && z3[1] === 1.25, '칸의 − 버튼으로 되돌림', JSON.stringify(z3))
// 연결 안 된 3번은 무시
await ctl.key('3')
await sleep(300)
check((await ev(`window.seraphim.getLive().then(s => s.activeCamera)`)) === 1, '연결 안 된 카메라 3은 전환되지 않음')
// 다시 1번으로 (클릭)
await ev(`document.querySelector('[data-camera-tile="0"]').click()`)
const back = await waitFor(`document.querySelector('[data-camera-slot="0"]').dataset.cameraVisible === '1'`, 2000, sw)
check(!!back, '카메라 칸 클릭으로 1번 복귀')
await sleep(1500)

// 방송 카메라를 '카메라 2 고정'으로 → 전환해도 방송은 2번 유지
await ev(`${B}.getState().updateConfig({ cameraSource: 1 })`)
const fixed = await waitFor(`(() => { const l = [...document.querySelectorAll('[data-camera-slot]')]; return l.length === 1 && l[0].dataset.cameraSlot === '1' ? 'fixed' : null })()`, 4000, sw)
check(fixed === 'fixed', '방송 카메라 2번 고정: 방송 창에는 2번만', String(fixed))
await ctl.key('1')
await sleep(500)
const stillFixed = await sw.ev(`[...document.querySelectorAll('[data-camera-slot]')].map(x => x.dataset.cameraSlot + ':' + x.dataset.cameraVisible).join(',')`)
check(stillFixed === '1:1', '카메라 1로 전환해도 고정된 방송은 2번 그대로 (프로젝터만 바뀜)', stillFixed)
await ev(`${B}.getState().updateConfig({ cameraSource: 'program' })`)

await ev(`${B}.getState().stopRecord()`)
await waitFor(`${B}.getState().rec.phase === 'idle'`, 15000)
const rec = await ev(`${B}.getState().lastRecordPath`)
check(rec && existsSync(rec), '녹화 파일', String(rec))
if (rec && existsSync(rec) && OUT) {
  // 1번(2× 줌) → 2번 → 1번 구간의 화면
  for (const [t, n] of [[1.5, 'cam1'], [5.5, 'cam2'], [9.5, 'cam1-back']]) {
    try { execFileSync(FF, ['-v', 'error', '-y', '-ss', String(t), '-i', rec, '-frames:v', '1', join(OUT, `switch-${n}.png`)]) } catch { /* 참고 */ }
  }
}
// 설정 저장 (앱을 다시 켜도 카메라 1·2·줌 유지)
await sleep(700)
const saved = JSON.parse((await ev(`window.seraphim.getSetting('camera.slots')`)) || '[]')
check(saved[0]?.deviceId === cams[0].id && saved[1]?.deviceId === cams[1].id && saved[0]?.view?.zoom === 2 && saved[1]?.view?.zoom === 1.25, '카메라 1·2와 카메라별 줌이 설정에 저장됨', JSON.stringify(saved.map((c) => c.deviceId && c.view.zoom)))
// 정리
await ev(`window.seraphim.setLive({ cameraSlot: { index: 0, deviceId: null } })`)
await ev(`window.seraphim.setLive({ cameraSlot: { index: 1, deviceId: null }, activeCamera: 0, background: { kind: 'color', color: '#000000' } })`)
sw.close(); ctl.close()
console.log(fails === 0 ? 'CAMERA SWITCH E2E PASS' : `${fails} FAILED`)
process.exit(fails ? 1 : 0)
