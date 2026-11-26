// OBS 자막·휴대폰 리모컨·HTTP 명령: 인증 규칙 + 실제 로컬 서버(main/remote.ts, Electron 없이) 점검
import { request } from 'http'
import { canControl, canView, FailLimiter, isRemoteCommand, newPin, remoteView, type AuthInput } from '../src/shared/remote.ts'
import { initRemote, pushRemoteState, remoteStatus, setRemoteEnabled } from '../src/main/remote.ts'
import { DEFAULT_LIVE_STATE, type LiveState } from '../src/shared/ipc.ts'
let fail = 0
const check = (ok: boolean, label: string, extra = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fail++ }

// 규칙
const lan: AuthInput = { remoteAddress: '192.168.0.7', host: '192.168.0.3:47200', fromBrowser: true, pin: null }
const local: AuthInput = { remoteAddress: '127.0.0.1', host: '127.0.0.1:47200', fromBrowser: false, pin: null }
check(!canView(lan, '1234') && canView({ ...lan, pin: '1234' }, '1234'), '같은 와이파이: PIN 있어야 자막·상태 보기')
check(!canControl(lan, '1234') && !canControl({ ...lan, pin: '0000' }, '1234') && canControl({ ...lan, pin: '1234' }, '1234'), '같은 와이파이: 맞는 PIN만 조작')
check(canView({ ...local, fromBrowser: true }, '1234'), '이 PC의 OBS: PIN 없이 자막 보기')
check(canControl(local, '1234'), '이 PC의 Companion·스트림덱(브라우저 아님): PIN 없이 조작')
check(!canControl({ ...local, fromBrowser: true }, '1234'), '이 PC의 웹페이지가 보낸 명령은 PIN 필요(남의 사이트가 화면을 넘기지 못하게)')
check(!canControl({ ...local, host: 'evil.example:47200' }, '1234') && !canView({ ...local, host: 'evil.example' }, '1234'), 'Host가 루프백 이름이 아니면 거절(DNS 리바인딩)')
check(/^\d{6}$/.test(newPin()) && newPin(() => 0) === '000000' && newPin(() => 0.9999999) === '999999', 'PIN 6자리')
check(isRemoteCommand('next') && isRemoteCommand('logo') && !isRemoteCommand('shutdown'), '명령 목록: next prev black logo만')
const lim = new FailLimiter(5, 60_000)
for (let i = 0; i < 4; i++) lim.fail('a', 0)
check(!lim.blocked('a', 1), '4번 틀려도 아직 열림')
lim.fail('a', 0)
check(lim.blocked('a', 1) && !lim.blocked('b', 1), '5번 틀리면 그 주소만 막힘')
check(!lim.blocked('a', 60_001), '1분 뒤 풀림')
lim.fail('c', 0); lim.ok('c'); check(!lim.blocked('c', 1), '맞게 넣으면 틀린 횟수 지움')
const v = remoteView({ ...DEFAULT_LIVE_STATE, text: '시험 문구 한 줄' })
check(!v.hidden && v.text === '시험 문구 한 줄', '자막 보임')
check(remoteView({ ...DEFAULT_LIVE_STATE, text: 'x', blackout: true }).hidden && remoteView({ ...DEFAULT_LIVE_STATE, text: 'x', showLogo: true }).hidden && remoteView({ ...DEFAULT_LIVE_STATE, text: 'x', paused: true }).hidden, '검정·로고·일시정지면 OBS 자막 숨김')

// 실제 서버
let state: LiveState = { ...DEFAULT_LIVE_STATE, text: '첫째 줄' }
const cmds: string[] = []
initRemote(() => state, (c) => cmds.push(c))
const st = await setRemoteEnabled(true)
check(st.enabled && !!st.port, '서버 켜짐', `포트 ${st.port}`)
const port = st.port!
const pin = st.pin
type Res = { status: number; body: string }
const call = (method: string, path: string, headers: Record<string, string> = {}): Promise<Res> =>
  new Promise((ok, no) => {
    const r = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let body = ''
      res.on('data', (d) => (body += d))
      res.on('end', () => ok({ status: res.statusCode ?? 0, body }))
    })
    r.on('error', no)
    r.end()
  })
check((await call('GET', '/overlay')).body.includes('EventSource'), '/overlay: 이 PC에서 열림')
check((await call('GET', '/prompter')).body.includes('nextText'), '/prompter: 이 PC에서 열림(읽기 전용)')
check((await call('GET', '/prompter', { 'sec-fetch-site': 'none' })).status === 200, '/prompter: 보기라서 이 PC 브라우저는 PIN 없이')
check((await call('GET', '/remote')).status === 200, '/remote: 이 PC의 비브라우저 요청은 열림')
check((await call('GET', '/remote', { 'sec-fetch-site': 'none' })).status === 401, '/remote: 브라우저는 PIN 필요')
check((await call('GET', `/remote?pin=${pin}`, { 'sec-fetch-site': 'none' })).status === 200, '/remote?pin=맞음: 열림')
check((await call('POST', '/cmd/next', { origin: 'http://evil.example' })).status === 401 && cmds.length === 0, '/cmd: 다른 사이트가 보낸 명령 거절')
check((await call('POST', '/cmd/next')).status === 204 && cmds.join() === 'next', '/cmd/next: Companion 같은 이 PC 도구')
check((await call('GET', `/cmd/black?pin=${pin}`, { origin: 'http://x' })).status === 204 && cmds.join() === 'next,black', '/cmd/black?pin=맞음')
check((await call('POST', '/cmd/reboot')).status === 404, '모르는 명령 404')

// SSE: 연결하면 현재 상태 1번, 바뀔 때마다 1번, 자막·리모컨이 보는 부분이 같으면 안 보냄
const events: string[] = []
const sse = request({ host: '127.0.0.1', port, path: '/events' })
await new Promise<void>((ok) => {
  sse.on('response', (res) => {
    res.setEncoding('utf8')
    res.on('data', (d: string) => { for (const m of d.matchAll(/data: (.*)\n\n/g)) events.push(m[1]) })
    ok()
  })
  sse.end()
})
const wait = () => new Promise((r) => setTimeout(r, 80))
await wait()
check(events.length === 1 && JSON.parse(events[0]).text === '첫째 줄', 'SSE: 연결하면 현재 자막')
state = { ...state, text: '둘째 줄' }; pushRemoteState(state); await wait()
check(events.length === 2 && JSON.parse(events[1]).text === '둘째 줄', 'SSE: 바뀌면 1번')
state = { ...state, nextText: '셋째 줄' }; pushRemoteState(state); await wait()
check(events.length === 3 && JSON.parse(events[2]).nextText === '셋째 줄', 'SSE: 프롬프터의 다음 슬라이드도 보냄')
state = { ...state, activeCamera: 1 }; pushRemoteState(state); await wait()
check(events.length === 3, 'SSE: 카메라 전환처럼 자막과 상관없는 변경은 안 보냄')
state = { ...state, blackout: true }; pushRemoteState(state); await wait()
check(events.length === 4 && JSON.parse(events[3]).hidden === true, 'SSE: 검정 → 숨김')

// PIN 무작위 대입은 5번 뒤 429 (127.0.0.1로 시험하므로 다른 시험 뒤에)
for (let i = 0; i < 5; i++) await call('GET', '/cmd/next?pin=xxxxxx')
check((await call('POST', `/cmd/next?pin=${pin}`)).status === 429, 'PIN 5번 틀리면 1분 동안 맞는 PIN도 거절')

sse.destroy()
const off = await setRemoteEnabled(false)
check(!off.enabled && off.port === null && !remoteStatus().enabled, '서버 꺼짐')
if (fail) { console.log(`\n${fail}개 실패`); process.exit(1) }
console.log('\n모두 통과')
