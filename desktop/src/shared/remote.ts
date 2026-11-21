// OBS 자막 주소·휴대폰 리모컨·HTTP 명령 — main의 로컬 웹서버가 쓰는 순수 규칙 (단위 테스트: tests/remote-test.mts)
import type { LiveState } from './ipc'

export const REMOTE_DEFAULT_PORT = 47200
export const REMOTE_COMMANDS = ['next', 'prev', 'black', 'logo'] as const
export type RemoteCommand = (typeof REMOTE_COMMANDS)[number]

export interface RemoteStatus {
  enabled: boolean
  /** 실제로 연 포트 (꺼져 있으면 null) */
  port: number | null
  /** 앱을 켤 때마다 새로 만드는 4자리 */
  pin: string
  /** 같은 와이파이에서 여는 주소들 (IPv4) */
  lanHosts: string[]
  error?: string
}

export function isRemoteCommand(s: string): s is RemoteCommand {
  return (REMOTE_COMMANDS as readonly string[]).includes(s)
}

export function newPin(rand: () => number = Math.random): string {
  return String(Math.floor(rand() * 10000)).padStart(4, '0')
}

/** 자막·리모컨 화면에 보내는 것만 (상태가 바뀌어도 이것이 같으면 다시 보내지 않음) */
export interface RemoteView {
  text: string
  /** 프롬프터의 다음 슬라이드 */
  nextText: string
  /** OBS 자막을 숨길지 — 검정·로고·일시정지 때 */
  hidden: boolean
  blackout: boolean
  showLogo: boolean
  fontFamily: string
}

export function remoteView(s: LiveState): RemoteView {
  return {
    text: s.text,
    nextText: s.nextText,
    hidden: s.blackout || s.showLogo || s.paused || !s.text.trim(),
    blackout: s.blackout,
    showLogo: s.showLogo,
    fontFamily: s.overlay.fontFamily
  }
}

export function isLoopback(addr: string | undefined): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

export interface AuthInput {
  remoteAddress: string | undefined
  /** Host 헤더 — 루프백 이름이 아니면 DNS 리바인딩일 수 있음 */
  host: string | undefined
  /** 브라우저가 붙이는 헤더가 있으면 웹페이지가 보낸 요청 */
  fromBrowser: boolean
  pin: string | null
}

/** 보기(OBS 자막·상태): 이 PC 안은 그대로, 같은 와이파이는 PIN */
export function canView(a: AuthInput, pin: string): boolean {
  return (isLoopback(a.remoteAddress) && isLocalHost(a.host)) || a.pin === pin
}

/** 조작(다음·이전·검정·로고): PIN, 또는 이 PC 안의 비브라우저 도구(Companion·스트림덱) */
export function canControl(a: AuthInput, pin: string): boolean {
  if (a.pin === pin) return true
  return isLoopback(a.remoteAddress) && isLocalHost(a.host) && !a.fromBrowser
}

function isLocalHost(host: string | undefined): boolean {
  const name = (host ?? '').replace(/:\d+$/, '').toLowerCase()
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]'
}

/** PIN 무작위 대입 막기: 주소별로 5번 틀리면 1분 동안 거절 */
export class FailLimiter {
  private fails = new Map<string, { n: number; until: number }>()
  constructor(private max = 5, private lockMs = 60_000) {}
  blocked(addr: string, now = Date.now()): boolean {
    const f = this.fails.get(addr)
    return !!f && f.n >= this.max && now < f.until
  }
  fail(addr: string, now = Date.now()): void {
    const f = this.fails.get(addr)
    const n = f && now < f.until ? f.n + 1 : 1
    this.fails.set(addr, { n, until: now + this.lockMs })
  }
  ok(addr: string): void {
    this.fails.delete(addr)
  }
}
