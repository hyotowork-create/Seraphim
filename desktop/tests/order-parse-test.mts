import { parseOrderLine, normalizeSongQuery } from '../src/shared/orderSheet.ts'
let fail = 0
const check = (ok: boolean, label: string, extra = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fail++ }
const p = (s: string) => { const l = parseOrderLine(s); return `${l.kind}|${l.query}|${l.hymnNo}|${l.refText}|${l.note}` }
const cases: [string, string][] = [
  ['요 3:16-18', 'bible||null|요한복음 3:16-18|null'],
  ['478장', 'hymn||478|null|null'],
  ['새찬송가 478장 참 아름다워라', 'hymn|참 아름다워라|478|null|null'],
  ['주 하나님 지으신 모든 세계', 'song|주 하나님 지으신 모든 세계|null|null|null'],
  ['1. 참 아름다워라(D) – 1-3절 – 2번 연결~', 'song|참 아름다워라|null|null|1-3절, 2번 연결'],
  ['2. 황무지가 장미꽃(D) – 1-4절, 후렴 한 번 더 반복!', 'song|황무지가 장미꽃|null|null|1-4절, 후렴 한 번 더 반복'],
  ['3. 물 위를 걷는 자(A) - 후렴 2번 반복', 'song|물 위를 걷는 자|null|null|후렴 2번 반복'],
  ['시 23편', 'bible||null|시편 23|null'],
  ['① 은혜 아니면', 'song|은혜 아니면|null|null|null'],
  ['2026. 9. 20 주일1부 찬양(key는 변경될 수 있음)', 'blank||null|null|null'],
  ['', 'blank||null|null|null'],
  ['찬송 305', 'hymn||305|null|null'],
  ['롬8:28', 'bible||null|로마서 8:28|null'],
  ['나의 갈 길 다 가도록 (G)', 'song|나의 갈 길 다 가도록|null|null|null'],
]
for (const [i, o] of cases) { const r = p(i); check(r === o, `"${i}"`, r !== o ? `got ${r}` : '') }
check(normalizeSongQuery('참 아름다워라!') === '참아름다워라' && normalizeSongQuery('478장 참 아름다워라') === '참아름다워라', 'normalizeSongQuery')
console.log(fail === 0 ? 'ORDER PARSE PASS' : `${fail} FAILED`)
