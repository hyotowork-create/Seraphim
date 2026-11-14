import { normalizeLabel, cleanLine, normalizeExtracted } from '../src/shared/scoreText.ts'
const cases: [unknown, string][] = [
  ['1절', '1절'], ['Verse 2', '2절'], ['3', '3절'], ['1절 (반복)', '1절'], ['V1', '1절'], ['2절 후렴', '2절'],
  ['후렴', '후렴'], ['Chorus', '후렴'], ['Refrain', '후렴'], ['코러스 2', '후렴2'],
  ['Pre-Chorus', '프리코러스'], ['Bridge', '브릿지'], ['Intro', '전주'], ['Outro', '후주'], ['간주', '간주'],
  ['이상한 라벨', ''], ['', ''], [null, '']
]
let fail = 0
for (const [i, o] of cases) { const r = normalizeLabel(i); if (r !== o) { fail++; console.log('FAIL label', JSON.stringify(i), '=>', JSON.stringify(r), 'expected', JSON.stringify(o)) } }
const lines: [string, string][] = [
  ['하 - 나 - 님', '하나님'], ['사랑 - 하 - 는  주', '사랑하는 주'], ['주 하나님 지으신 모든 세계', '주 하나님 지으신 모든 세계'],
  ['A - ma - zing grace', 'Amazing grace'], ['하나님 — 나의', '하나님 나의'], ['well-known', 'well-known'], ['A- ma -zing', 'Amazing'], ['  공백   정리 ', '공백 정리']
]
for (const [i, o] of lines) { const r = cleanLine(i); if (r !== o) { fail++; console.log('FAIL line', JSON.stringify(i), '=>', JSON.stringify(r), 'expected', JSON.stringify(o)) } }
const ex = normalizeExtracted({ title: ' 나 - 의 노래 ', verses: [{ label: 'Verse 1', lines: ['하 - 나 - 님', ''] }, { label: 'Chorus', lines: 'single' }, { label: 'x', lines: [] }, 'garbage'] })
const expect = JSON.stringify({ title: '나의 노래', verses: [{ label: '1절', lines: ['하나님'] }, { label: '후렴', lines: ['single'] }] })
if (JSON.stringify(ex) !== expect) { fail++; console.log('FAIL extracted', JSON.stringify(ex)) }
console.log(fail === 0 ? `ALL PASS (${cases.length + lines.length + 1} checks)` : `${fail} FAILED`)
