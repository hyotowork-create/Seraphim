// E2E: YouTube 라이브 방송·녹화 파이프라인 (가짜 카메라·마이크로 격리 실행한 패키징 앱에서)
//  1) 녹화만 → MP4 확인   2) 로컬 RTMP 서버로 방송(카메라+하단 자막, 줌 2×) → FLV 확인
//  3) 방송 중 녹화를 따로 시작 → 서버가 끊겨도 녹화는 한 파일로 계속, 방송은 자동 재연결 → 방송만 끝내도 녹화 계속
//  4) "방송할 때 녹화도" → 함께 시작·함께 끝   5) 잘못된 서버 → 오류 안내   6) 저장 공간 부족 → 시작 거부·자동 정지   7) 1440p 녹화
// 사용: SERAPHIM_RECORDINGS_DIR=<dir> SERAPHIM_FAKE_DISK_FREE_FILE=<file> 로 앱을 --use-fake-device-for-media-stream 과 함께 띄운 뒤
//       SERAPHIM_FAKE_DISK_FREE_FILE=<file> node tests/e2e/stream-e2e.mjs <port> <outDir>
//  주의: --use-fake-ui-for-media-stream 은 탭 캡처를 막으므로("Requested device not found") 넣지 않는다
import { spawn, execFileSync } from 'child_process'
import { existsSync, readdirSync, statSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
const PORT = process.argv[2] || '9335'
const OUT = process.argv[3]
const LISTENER = process.env.FFMPEG_LISTENER || '/opt/homebrew/bin/ffmpeg'
const FFPROBE = process.env.FFPROBE || '/opt/homebrew/bin/ffprobe'
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
  const ev = async (e) => {
    await ready
    const r = await new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: e, returnByValue: true, awaitPromise: true } })) })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'exc')
    return r.result?.result?.value
  }
  return { ev, close: () => ws.close() }
}
let fails = 0
const check = (ok, l, x = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++ }
const probe = (f) => JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels:format=duration', '-of', 'json', f]).toString())
/** 영상 스트림 평균 비트레이트(Mbps) — 첫 1초·마지막 1초 제외 */
const videoMbps = (f) => {
  const pk = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=size,pts_time', '-of', 'json', f]).toString()).packets
  const t = pk.map((p) => Number(p.pts_time)); const end = Math.max(...t)
  const mid = pk.filter((p) => Number(p.pts_time) >= 1 && Number(p.pts_time) < end - 1)
  const span = Math.max(...mid.map((p) => Number(p.pts_time))) - Math.min(...mid.map((p) => Number(p.pts_time)))
  return mid.reduce((a, p) => a + Number(p.size), 0) * 8 / span / 1e6
}
const frame = (f, at, png) => execFileSync(LISTENER, ['-v', 'error', '-y', '-ss', String(at), '-i', f, '-frames:v', '1', png])
function listen(file, port = 19350) {
  const p = spawn(LISTENER, ['-hide_banner', '-loglevel', 'error', '-y', '-listen', '1', '-timeout', '60', '-i', `rtmp://127.0.0.1:${port}/live/e2ekey`, '-c', 'copy', file], { stdio: 'ignore' })
  return p
}

const ctl = connect(await target(/index\.html/))
const ev = ctl.ev
const B = `window.__seraphimDebug.broadcast`
const DISK = process.env.SERAPHIM_FAKE_DISK_FREE_FILE
const GB = 1024 ** 3
const setDisk = (bytes) => DISK && writeFileSync(DISK, String(bytes))
setDisk(500 * GB)
/** 방송(live)·녹화(rec) 중 하나의 단계를 기다린다 */
const waitPhase = async (ch, want, ms = 20000) => {
  const t0 = Date.now()
  let ph
  while (Date.now() - t0 < ms) { ph = await ev(`${B}.getState().${ch}.phase`); if (want.includes(ph)) return ph; await sleep(300) }
  return ph
}
const err = (ch) => ev(`${B}.getState().${ch}.error`)
const ffmpegCount = () => execFileSync('ps', ['-A', '-o', 'command=']).toString().split('\n').filter((l) => /Resources\/ffmpeg\/ffmpeg /.test(l)).length
const fakeMic = await ev(`navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{s.getTracks().forEach(t=>t.stop()); return navigator.mediaDevices.enumerateDevices()}).then(d=>d.filter(x=>x.kind==='audioinput'&&x.deviceId!=='default').map(x=>({id:x.deviceId,label:x.label}))[0])`)
const fakeCam = await ev(`navigator.mediaDevices.enumerateDevices().then(d=>d.filter(x=>x.kind==='videoinput').map(x=>({id:x.deviceId,label:x.label}))[0])`)
console.log('fake devices:', JSON.stringify({ fakeMic, fakeCam }))
const probeRes = await ev(`window.seraphim.streamProbe()`)
check(probeRes.ok && probeRes.encoder === 'h264_videotoolbox' && probeRes.rtmps, 'ffmpeg 확인: VideoToolbox H.264, RTMPS 지원', JSON.stringify(probeRes))
await ev(`window.seraphim.setLive({ text: '주 하나님 지으신 모든 세계\\n시험 가사 둘째 줄', blackout: false, showLogo: false, background: { kind: 'color', color: '#1e3a8a', dim: 0 }, camera: { zoom: 1, x: 0.5, y: 0.5 } })`)
// 예전 설정(방송만)은 "방송할 때 녹화 안 함"으로 옮겨진다
await ev(`window.seraphim.setSetting('stream.config', JSON.stringify({ target: 'live', quality: '720p', serverUrl: 'rtmps://a.rtmps.youtube.com/live2', layout: 'lowerThird', cameraSource: 'program', audioDeviceId: null, audioLabel: null, audioGain: 1, lowerThirdScale: 0.6 }))`)
const migrated = await ev(`window.seraphim.getStreamConfig()`)
check(migrated.recordWithLive === false && migrated.target === undefined, '예전 설정(방송만) → 방송할 때 녹화 안 함', JSON.stringify(migrated))
await ev(`${B}.getState().init()`)

// 1) 녹화만 · 송출 화면 그대로
await ev(`${B}.getState().updateConfig({ recordWithLive: false, quality: '720p', layout: 'mirror', audioDeviceId: ${JSON.stringify(fakeMic.id)}, audioLabel: ${JSON.stringify(fakeMic.label)}, audioGain: 1 })`)
await ev(`${B}.getState().startRecord()`)
const ph1 = await waitPhase('rec', ['live', 'error'])
check(ph1 === 'live', '녹화 시작 → 녹화 중', ph1 + ' ' + (await err('rec')))
check((await ev(`${B}.getState().live.phase`)) === 'idle', '녹화만 해도 방송은 시작되지 않음')
const track = await ev(`(() => { const p = ${B}.getState().preview; const s = p && p.getVideoTracks()[0].getSettings(); return s ? { w: s.width, h: s.height, fps: s.frameRate } : null })()`)
check(track && track.w === 1280 && track.h === 720, '방송 창 캡처 크기 1280×720', JSON.stringify(track))
await sleep(6000)
const st1 = await ev(`${B}.getState().rec.status`)
check(st1 && st1.kind === 'record' && st1.fps >= 25, '정지 화면에서도 약 30fps 유지 (캡처가 끊기지 않음)', JSON.stringify(st1 && { kind: st1.kind, fps: st1.fps, kbps: st1.kbps, speed: st1.speed }))
check(st1 && st1.freeBytes === 500 * GB, '녹화 상태에 남은 공간 (5초마다)', String(st1 && st1.freeBytes))
const pill1 = await ev(`document.querySelector('[data-rec-pill]')?.textContent || ''`)
check(/REC \d\d:\d\d:\d\d/.test(pill1), '상단 바: 빨간 REC + 경과 시간', pill1)
// 가짜 마이크는 짧은 삐 소리를 반복하므로 3초 동안의 최대값을 앱 안에서(왕복 지연 없이) 50ms 간격으로 본다
const level = await ev(`(async () => { let m = 0; for (let i = 0; i < 60; i++) { m = Math.max(m, ${B}.getState().audioLevel); await new Promise(r => setTimeout(r, 50)) } return m })()`)
check(level > 0.05, '소리 입력 레벨 표시 (가짜 마이크 신호)', String(level))
await ev(`window.seraphim.setLive({ text: '둘째 슬라이드 가사입니다' })`)
await sleep(2500)
await ev(`${B}.getState().stopRecord()`)
const ph1b = await waitPhase('rec', ['idle'])
const recPath = await ev(`${B}.getState().lastRecordPath`)
check(ph1b === 'idle' && recPath && existsSync(recPath), '녹화 끝 → 파일 생성', recPath)
check(!(await ev(`${B}.getState().preview`)) && (await ev(`!!document.querySelector('[data-rec-button]')`)), '녹화가 끝나면 캡처를 풀고 상단 바는 ● 녹화 버튼으로')
if (recPath && existsSync(recPath)) {
  const p = probe(recPath)
  const v = p.streams.find((s) => s.codec_type === 'video'); const a = p.streams.find((s) => s.codec_type === 'audio')
  const dur = Number(p.format.duration)
  check(v?.codec_name === 'h264' && v.width === 1280 && v.height === 720 && v.r_frame_rate === '30/1', 'MP4 영상: H.264 1280×720 30fps', JSON.stringify(v))
  check(a?.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2, 'MP4 소리: AAC 48kHz 스테레오', JSON.stringify(a))
  check(dur > 7 && dur < 20, `녹화 길이 (시작~끝 약 10~15초)`, String(dur))
  const mbps = videoMbps(recPath)
  check(mbps > 3.5 * 0.8 && mbps < 3.5 * 1.25, '720p 실제 영상 비트레이트 ≈ 3.5 Mbps (인코더 보정)', mbps.toFixed(2))
  frame(recPath, 3, join(OUT, 'record-mirror.png'))
  frame(recPath, Math.max(0, dur - 1), join(OUT, 'record-mirror-2.png'))
}

// 2) 로컬 RTMP 서버로 방송 · 카메라 + 하단 자막 · 줌 2×
const flv = join(OUT, 'live-lowerthird.flv'); rmSync(flv, { force: true })
let lp = listen(flv); await sleep(800)
await ev(`window.seraphim.setStreamKey('e2ekey')`)
await ev(`window.seraphim.setLive({ cameraSlot: { index: 0, deviceId: ${JSON.stringify(fakeCam.id)}, label: ${JSON.stringify(fakeCam.label)} }, activeCamera: 0 })`)
await ev(`${B}.getState().updateConfig({ serverUrl: 'rtmp://127.0.0.1:19350/live', layout: 'lowerThird', cameraSource: 'program', lowerThirdScale: 0.6 })`)
await ev(`window.seraphim.setLive({ camera: { zoom: 2, x: 0.3, y: 0.4 }, text: '하단 자막 테스트\\n카메라 위에 나옵니다' })`)
await ev(`${B}.getState().startLive()`)
const ph2 = await waitPhase('live', ['live', 'error'])
check(ph2 === 'live', '로컬 RTMP 서버로 방송 시작 → 방송 중', ph2 + ' ' + (await err('live')))
check((await ev(`${B}.getState().rec.phase`)) === 'idle', '"방송할 때 녹화도"를 끄면 방송만 시작')
const sw = connect(await target(/output\.html/))
await sleep(2500)
const swInfo = await sw.ev(`(() => { const v = document.querySelector('[data-camera-visible="1"] video'); return { role: window.seraphim.role, zoom: v && v.dataset.cameraZoom, transform: v && v.style.transform, origin: v && v.style.transformOrigin, playing: v ? v.readyState >= 2 && !v.paused : false, band: !!document.querySelector('[style*="linear-gradient"]'), w: innerWidth, h: innerHeight, dpr: devicePixelRatio } })()`)
const [ox, oy] = String(swInfo.origin).split(' ').map(parseFloat)
check(swInfo.role === 'stream' && swInfo.zoom === '2' && swInfo.transform === 'scale(2)' && ox === 30 && oy === 40, '방송 창 카메라에 줌 2× · 위치 적용', JSON.stringify(swInfo))
await ev(`window.seraphim.setLive({ camera: { zoom: 1.5 } })`)
await sleep(400)
check((await sw.ev(`document.querySelector('[data-camera-visible="1"] video').style.transform`)) === 'scale(1.5)', '방송 중 줌 변경 즉시 반영 (1.5×)')
await ev(`window.seraphim.setLive({ camera: { zoom: 2 } })`)
check(swInfo.playing && swInfo.band, '방송 창: 카메라 재생 + 하단 자막 띠', JSON.stringify(swInfo))
// 검정 화면(B)이어도 방송 카메라는 유지, 자막만 숨김
await ev(`window.seraphim.setLive({ blackout: true })`)
await sleep(600)
const bInfo = await sw.ev(`({ video: !!document.querySelector('[data-camera-visible="1"] video'), band: !!document.querySelector('[style*="linear-gradient"]') })`)
check(bInfo.video && !bInfo.band, '검정 화면(B): 방송은 카메라 유지 · 자막 숨김', JSON.stringify(bInfo))
await ev(`window.seraphim.setLive({ blackout: false })`)
await sleep(2000)

// 3) 방송 중에 녹화를 따로 시작 → 같은 캡처를 쓰는 두 번째 인코딩
await ev(`${B}.getState().startRecord()`)
const ph3r = await waitPhase('rec', ['live', 'error'])
check(ph3r === 'live', '방송 중에 녹화만 따로 시작', ph3r + ' ' + (await err('rec')))
const recStartedAt = Date.now()
await sleep(4000)
check(ffmpegCount() === 2, '방송·녹화가 각자 인코딩 (ffmpeg 2개)', String(ffmpegCount()))
const stL = await ev(`${B}.getState().live.status`); const stR = await ev(`${B}.getState().rec.status`)
check(stL?.fps >= 25 && stR?.fps >= 25, '둘 다 약 30fps', JSON.stringify({ live: stL?.fps, rec: stR?.fps }))
try {
  const ps = execFileSync('ps', ['-A', '-o', '%cpu=,command=']).toString().split('\n').filter((l) => /Seraphim\.app|Resources\/ffmpeg\/ffmpeg/.test(l))
  const sum = (re) => ps.filter((l) => re.test(l)).reduce((a, l) => a + parseFloat(l), 0)
  console.log(`[INFO] CPU 사용량(720p 방송+녹화 동시): ffmpeg 2개 ${sum(/ffmpeg\/ffmpeg/).toFixed(0)}% · 앱 전체 ${sum(/Seraphim\.app\/Contents\/(MacOS|Frameworks)/).toFixed(0)}% (코어 1개 = 100%)`)
} catch { /* 참고용 */ }
// 서버가 끊기면 방송은 재연결을 기다리고, 녹화는 그대로 계속
lp.kill('SIGKILL'); await sleep(300)
const flv2 = join(OUT, 'live-reconnect.flv'); rmSync(flv2, { force: true })
const ph3 = await waitPhase('live', ['reconnecting', 'error'], 15000)
check(ph3 === 'reconnecting', '서버 끊김 → 방송은 재연결 대기', `${ph3} · ${await ev(`${B}.getState().live.notice`)}`)
await sleep(3000)
const recDuring = await ev(`(() => { const r = ${B}.getState().rec; return { phase: r.phase, fps: r.status && r.status.fps, path: r.status && r.status.recordPath } })()`)
check(recDuring.phase === 'live' && recDuring.fps >= 25, '인터넷(서버)이 끊겨도 녹화는 계속', JSON.stringify(recDuring))
lp = listen(flv2)
const ph3b = await waitPhase('live', ['live', 'error'], 30000)
check(ph3b === 'live', '서버가 돌아오면 방송 다시 시작 (경과 시간 유지)', ph3b + ' ' + (await ev(`${B}.getState().live.startedAt`)))
await sleep(3000)
// 방송만 끝내기 → 녹화 계속
await ev(`${B}.getState().stopLive(false)`)
check((await waitPhase('live', ['idle'])) === 'idle', '방송만 끝내기')
await sleep(2500)
const recAfter = await ev(`(() => { const r = ${B}.getState().rec; return { phase: r.phase, fps: r.status && r.status.fps, path: r.status && r.status.recordPath } })()`)
check(recAfter.phase === 'live' && recAfter.fps >= 25 && recAfter.path === recDuring.path && !!(await ev(`${B}.getState().preview`)), '방송을 끝내도 녹화는 같은 파일로 계속 (캡처 유지)', JSON.stringify(recAfter))
await ev(`${B}.getState().stopRecord()`)
await waitPhase('rec', ['idle'])
const recSpan = (Date.now() - recStartedAt) / 1000
const rec3 = await ev(`${B}.getState().lastRecordPath`)
if (rec3 && existsSync(rec3)) {
  const d3 = Number(probe(rec3).format.duration)
  check(rec3 === recDuring.path && d3 > recSpan - 4, `녹화 한 파일에 끊김 구간까지 모두 (${d3.toFixed(1)}초 / 경과 ${recSpan.toFixed(1)}초)`, rec3)
  frame(rec3, 2, join(OUT, 'record-during-live.png'))
} else check(false, '방송 중 녹화 파일', String(rec3))
await sleep(1500)
for (const f of [flv, flv2]) {
  if (!existsSync(f) || statSync(f).size < 1000) { check(false, `수신 파일 ${f}`); continue }
  const p = probe(f)
  const v = p.streams.find((s) => s.codec_type === 'video'); const a = p.streams.find((s) => s.codec_type === 'audio')
  check(v?.codec_name === 'h264' && v.width === 1280 && v.height === 720 && a?.codec_name === 'aac', `RTMP 수신: H.264 1280×720 + AAC (${f.split('/').pop()})`, `${JSON.stringify(v)} dur=${p.format.duration}`)
}
if (existsSync(flv)) frame(flv, 3, join(OUT, 'live-lowerthird.png'))
lp.kill()

// 4) "방송할 때 녹화도" → 함께 시작, "모두 끝내기" → 함께 끝
const flv4 = join(OUT, 'live-with-record.flv'); rmSync(flv4, { force: true })
lp = listen(flv4); await sleep(800)
await ev(`${B}.getState().updateConfig({ recordWithLive: true })`)
await ev(`${B}.getState().startLive()`)
const [ph4l, ph4r] = [await waitPhase('live', ['live', 'error']), await waitPhase('rec', ['live', 'error'])]
check(ph4l === 'live' && ph4r === 'live', '방송 시작 → 녹화도 함께 시작', `${ph4l}/${ph4r}`)
await sleep(3000)
await ev(`${B}.getState().stopLive(true)`)
const [ph4l2, ph4r2] = [await waitPhase('live', ['idle']), await waitPhase('rec', ['idle'])]
check(ph4l2 === 'idle' && ph4r2 === 'idle' && !(await ev(`${B}.getState().preview`)), '모두 끝내기 → 방송·녹화 함께 끝, 캡처 해제', `${ph4l2}/${ph4r2}`)
lp.kill()

// 5) 잘못된 서버 → 몇 번 재시도 후 오류 안내 (녹화는 따로 시작하지 않음)
await ev(`${B}.getState().updateConfig({ recordWithLive: false, serverUrl: 'rtmp://127.0.0.1:1/live', layout: 'mirror' })`)
await ev(`${B}.getState().startLive()`)
const ph5 = await waitPhase('live', ['error'], 40000)
const err5 = await err('live')
check(ph5 === 'error' && /연결하지 못했습니다|끊겼습니다/.test(err5 || ''), '잘못된 서버 → 오류 안내', `${ph5} · ${err5}`)
check(!(err5 || '').includes('e2ekey'), '오류 문구에 스트림 키가 드러나지 않음')
check((await ev(`document.querySelector('[data-live-pill], button[title^="방송이 멈췄습니다"]')?.textContent || ''`)).includes('방송 멈춤'), '상단 바: ⚠ 방송 멈춤')

// 6) 저장 공간 부족
if (DISK) {
  setDisk(1 * GB) // 720p 약 19분
  await ev(`${B}.getState().refreshDisk()`)
  const info = await ev(`document.querySelector('[data-disk-info]') ? 'modal' : 'closed'`)
  await ev(`${B}.getState().startRecord()`)
  check((await waitPhase('rec', ['live', 'error'])) === 'live', '남은 공간 1GB(약 19분) → 녹화 시작은 됨')
  await sleep(1200)
  const pill6 = await ev(`document.querySelector('[data-rec-pill]')?.textContent || ''`)
  check(/남은 약 1\d분/.test(pill6), '상단 REC 표시에 남은 녹화 시간 경고', pill6 + ' ' + info)
  setDisk(300 * 1024 ** 2) // 300MB → 5초 안에 자동 정지
  const ph6 = await waitPhase('rec', ['error'], 12000)
  const err6 = await err('rec')
  const path6 = await ev(`${B}.getState().lastRecordPath`)
  check(ph6 === 'error' && /저장 공간이 부족해 녹화를 멈췄습니다/.test(err6 || ''), '공간이 바닥나면 녹화 자동 정지 + 안내', `${ph6} · ${err6}`)
  check(path6 && existsSync(path6) && Number(probe(path6).format.duration) > 2, '그때까지 녹화한 파일은 저장됨', String(path6))
  check((await ev(`document.querySelector('[data-rec-button]')?.textContent || ''`)).includes('녹화 멈춤'), '상단 바: ⚠ 녹화 멈춤')
  await ev(`${B}.getState().startRecord()`)
  const ph6b = await waitPhase('rec', ['error', 'live'])
  check(ph6b === 'error' && /시작할 수 없습니다/.test((await err('rec')) || ''), '공간이 없으면 녹화를 시작하지 않음', `${ph6b} · ${await err('rec')}`)
  setDisk(500 * GB)
  await ev(`${B}.getState().refreshDisk()`)
}

// 7) 1440p(2K) 녹화 · 카메라 + 하단 자막
await ev(`${B}.getState().updateConfig({ quality: '1440p', layout: 'lowerThird', cameraSource: 'program', audioDeviceId: ${JSON.stringify(fakeMic.id)}, audioLabel: ${JSON.stringify(fakeMic.label)} })`)
await ev(`window.seraphim.setLive({ camera: { zoom: 1.5, x: 0.5, y: 0.5 }, text: '2K 방송 확인\\n하단 자막' })`)
await ev(`${B}.getState().startRecord()`)
const ph7 = await waitPhase('rec', ['live', 'error'])
check(ph7 === 'live', '1440p 녹화 시작', ph7 + ' ' + (await err('rec')))
const tr7 = await ev(`(() => { const s = ${B}.getState().preview.getVideoTracks()[0].getSettings(); return [s.width, s.height, s.frameRate] })()`)
check(tr7[0] === 2560 && tr7[1] === 1440, '방송 창 캡처 2560×1440', JSON.stringify(tr7))
const sw7 = connect(await target(/output\.html/))
await sleep(1500)
const cam7 = await sw7.ev(`(() => { const v = document.querySelector('[data-camera-visible="1"] video'); return v ? [v.videoWidth, v.videoHeight] : null })()`)
console.log(`[INFO] 1440p 방송 창 카메라 입력 해상도(가짜 카메라): ${JSON.stringify(cam7)} — 요청 3840×2160, 카메라가 줄 수 있는 최대로 받음`)
check(Array.isArray(cam7) && cam7[0] >= 1280, '1440p 방송 창 카메라 재생', JSON.stringify(cam7))
sw7.close()
await sleep(8000)
const st7 = await ev(`${B}.getState().rec.status`)
check(st7 && st7.fps >= 25 && (st7.speed ?? 1) >= 0.95, '1440p 실시간 인코딩 유지 (fps·속도)', JSON.stringify(st7 && { fps: st7.fps, speed: st7.speed }))
try {
  const ps = execFileSync('ps', ['-A', '-o', '%cpu=,command=']).toString().split('\n').filter((l) => /Seraphim\.app|Resources\/ffmpeg\/ffmpeg/.test(l))
  const sum = (re) => ps.filter((l) => re.test(l)).reduce((a, l) => a + parseFloat(l), 0)
  console.log(`[INFO] CPU 사용량(1440p 녹화 중): ffmpeg ${sum(/ffmpeg\/ffmpeg/).toFixed(0)}% · 앱 전체 ${sum(/Seraphim\.app\/Contents\/(MacOS|Frameworks)/).toFixed(0)}% (코어 1개 = 100%)`)
} catch { /* 참고용 */ }
await ev(`${B}.getState().stopRecord()`)
await waitPhase('rec', ['idle'])
const rec7 = await ev(`${B}.getState().lastRecordPath`)
if (rec7 && existsSync(rec7)) {
  const p = probe(rec7)
  const v = p.streams.find((x) => x.codec_type === 'video')
  check(v?.codec_name === 'h264' && v.width === 2560 && v.height === 1440 && v.r_frame_rate === '30/1', '1440p MP4: H.264 2560×1440 30fps', JSON.stringify(v))
  const m7 = videoMbps(rec7)
  check(m7 > 12 * 0.8 && m7 < 12 * 1.25, '1440p 실제 영상 비트레이트 ≈ 12 Mbps (인코더 보정)', m7.toFixed(2))
  frame(rec7, 4, join(OUT, 'record-1440p.png'))
} else check(false, '1440p 녹화 파일', String(rec7))
await ev(`${B}.getState().updateConfig({ quality: '720p' })`)

// 정리
await ev(`window.seraphim.setStreamKey('')`)
await ev(`window.seraphim.setLive({ camera: { zoom: 1, x: 0.5, y: 0.5 }, cameraSlot: { index: 0, deviceId: null }, text: '' })`)
sw.close(); ctl.close()
console.log(fails === 0 ? 'STREAM E2E PASS' : `${fails} FAILED`)
process.exit(fails ? 1 : 0)
