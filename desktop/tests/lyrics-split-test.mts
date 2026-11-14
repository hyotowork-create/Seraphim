import { splitLongVerses, splitVerses } from '../src/shared/lyrics.ts'
import { parseVerseSelection } from '../src/shared/orderSheet.ts'
let fail = 0
const check = (ok: boolean, label: string, extra = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fail++ }
const long = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'].join('\n')
const out = splitLongVerses(long, 4)
const v = splitVerses(out)
check(v.length === 3 && v[0].label === '1절' && v[0].text === 'a1\na2\na3\na4' && v[2].label === '3절' && v[2].text === 'a9', '9줄 → 4줄씩 3절', JSON.stringify(v))
const withChorus = '1절\nb1\nb2\nb3\nb4\nb5\n\n후렴\nc1\nc2\nc3\nc4\nc5\nc6'
const v2 = splitVerses(splitLongVerses(withChorus, 4))
check(v2.map((x) => x.label).join(',') === '1절,2절,후렴,후렴2' && v2[2].text === 'c1\nc2\nc3\nc4' && v2[3].text === 'c5\nc6', '번호 절은 재번호, 후렴은 후렴/후렴2', v2.map((x) => x.label + ':' + x.text.replace(/\n/g, '/')).join(' | '))
check(splitLongVerses('x\ny', 4) === 'x\ny', '짧은 절은 그대로')
const sel = (s: string | null) => { const r = parseVerseSelection(s); return r ? [...r].sort((a, b) => a - b).join(',') : 'null' }
check(sel('1-3절') === '1,2,3' && sel('1,2절') === '1,2' && sel('2절만') === '2' && sel('1-3절, 후렴 2번 반복') === '1,2,3' && sel('후렴 2번 반복') === 'null' && sel(null) === 'null' && sel('3~5절') === '3,4,5', '절 범위 파싱')
console.log(fail === 0 ? 'SPLIT/SELECTION PASS' : `${fail} FAILED`)
