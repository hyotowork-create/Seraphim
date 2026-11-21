// 로컬 웹서버: OBS 자막(/overlay) · 휴대폰 리모컨(/remote) · 프롬프터(/prompter) · 상태(/events, SSE) · 명령(/cmd/<next|prev|black|logo>)
// 새 의존성 없이 Node http. 설정에서 켤 때만 열고(기본 꺼짐), 같은 와이파이에서는 PIN이 있어야 보고 조작한다.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { networkInterfaces } from 'os'
import type { LiveState } from '../shared/ipc'
import {
  REMOTE_DEFAULT_PORT,
  canControl,
  canView,
  isRemoteCommand,
  newPin,
  remoteView,
  FailLimiter,
  type AuthInput,
  type RemoteCommand,
  type RemoteStatus
} from '../shared/remote'
import { OVERLAY_HTML, PROMPTER_HTML, REMOTE_HTML } from './remotePages'

const pin = newPin()
const limiter = new FailLimiter()
const clients = new Set<ServerResponse>()
let server: Server | null = null
let port: number | null = null
let lastError: string | undefined
let lastView = ''
let getState: () => LiveState = () => {
  throw new Error('initRemote 전')
}
let runCommand: (c: RemoteCommand) => void = () => {}

export function initRemote(get: () => LiveState, run: (c: RemoteCommand) => void): void {
  getState = get
  runCommand = run
}

function lanHosts(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && !n.internal && (n.family === 'IPv4' || (n.family as unknown) === 4))
    .map((n) => n!.address)
}

export function remoteStatus(): RemoteStatus {
  return { enabled: !!server, port, pin, lanHosts: server ? lanHosts() : [], error: lastError }
}

/** 상태가 바뀔 때마다 부름 — 자막·리모컨이 보는 부분이 같으면 보내지 않음 */
export function pushRemoteState(s: LiveState): void {
  if (!clients.size) return
  const v = JSON.stringify(remoteView(s))
  if (v === lastView) return
  lastView = v
  for (const c of clients) c.write(`data: ${v}\n\n`)
}

function send(res: ServerResponse, status: number, body = '', type = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(body)
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const addr = req.socket.remoteAddress ?? ''
  if (limiter.blocked(addr)) return send(res, 429, 'PIN을 여러 번 틀렸습니다. 1분 뒤 다시 시도하세요.')
  const a: AuthInput = {
    remoteAddress: addr,
    host: req.headers.host,
    fromBrowser: !!(req.headers.origin || req.headers['sec-fetch-site']),
    pin: url.searchParams.get('pin')
  }
  if (a.pin !== null) {
    if (a.pin === pin) limiter.ok(addr)
    else limiter.fail(addr)
  }
  const path = url.pathname
  const html = 'text/html; charset=utf-8'

  if (req.method === 'GET' && path === '/overlay') {
    return canView(a, pin) ? send(res, 200, OVERLAY_HTML, html) : send(res, 401, 'PIN이 필요합니다.')
  }
  if (req.method === 'GET' && path === '/prompter') {
    return canView(a, pin) ? send(res, 200, PROMPTER_HTML, html) : send(res, 401, 'PIN이 필요합니다. 세라핌 설정 화면의 QR로 들어오세요.')
  }
  if (req.method === 'GET' && path === '/remote') {
    return canControl(a, pin) ? send(res, 200, REMOTE_HTML, html) : send(res, 401, 'PIN이 맞지 않습니다. 세라핌 설정 화면의 QR로 다시 들어오세요.')
  }
  if (req.method === 'GET' && path === '/events') {
    if (!canView(a, pin)) return send(res, 401)
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    lastView = JSON.stringify(remoteView(getState()))
    res.write(`retry: 2000\ndata: ${lastView}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }
  const m = /^\/cmd\/([a-z]+)$/.exec(path)
  if (m && (req.method === 'POST' || req.method === 'GET')) {
    if (!canControl(a, pin)) return send(res, 401, 'PIN이 필요합니다.')
    if (!isRemoteCommand(m[1])) return send(res, 404, '명령: next, prev, black, logo')
    runCommand(m[1])
    return send(res, 204)
  }
  send(res, 404)
}

function listenOn(s: Server, p: number): Promise<void> {
  return new Promise((ok, fail) => {
    s.once('error', fail)
    s.listen(p, '0.0.0.0', () => {
      s.off('error', fail)
      ok()
    })
  })
}

export async function setRemoteEnabled(on: boolean): Promise<RemoteStatus> {
  lastError = undefined
  if (!on) {
    for (const c of clients) c.end()
    clients.clear()
    server?.close()
    server = null
    port = null
    return remoteStatus()
  }
  if (server) return remoteStatus()
  const s = createServer(handle)
  for (let p = REMOTE_DEFAULT_PORT; p < REMOTE_DEFAULT_PORT + 10; p++) {
    try {
      await listenOn(s, p)
      server = s
      port = p
      lastView = ''
      return remoteStatus()
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        lastError = e instanceof Error ? e.message : String(e)
        break
      }
    }
  }
  lastError ??= `포트 ${REMOTE_DEFAULT_PORT}~${REMOTE_DEFAULT_PORT + 9}가 모두 사용 중입니다.`
  return remoteStatus()
}
