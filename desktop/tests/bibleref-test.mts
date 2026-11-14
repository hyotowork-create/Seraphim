import { parseBibleRef, formatBibleRef, verseRangeString, findBook } from '../src/shared/bibleRef.ts'
import { parseBibleLines, parseBibleJson } from '../src/shared/bibleTextParse.ts'
let fail = 0
const check = (ok: boolean, label: string, extra = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fail++ }
const p = (s: string) => { const r = parseBibleRef(s); return r ? `${r.book.no}|${r.chapter}|${r.verseStart}|${r.verseEnd}|${r.endChapter}|${formatBibleRef(r)}|${verseRangeString(r)}` : 'null' }
const cases: [string, string][] = [
  ['요3:16', '43|3|16|null|null|요한복음 3:16|16'],
  ['요 3:16', '43|3|16|null|null|요한복음 3:16|16'],
  ['요 3:16-18', '43|3|16|18|null|요한복음 3:16-18|16-18'],
  ['요3:16~18', '43|3|16|18|null|요한복음 3:16-18|16-18'],
  ['요한복음 3장 16절', '43|3|16|null|null|요한복음 3:16|16'],
  ['요한복음 3장 16-18절', '43|3|16|18|null|요한복음 3:16-18|16-18'],
  ['요한복음3:16', '43|3|16|null|null|요한복음 3:16|16'],
  ['시 23편', '19|23|null|null|null|시편 23|'],
  ['시23', '19|23|null|null|null|시편 23|'],
  ['시편 23', '19|23|null|null|null|시편 23|'],
  ['창1:1-2:3', '1|1|1|3|2|창세기 1:1-2:3|1-2:3'],
  ['요일 1:9', '62|1|9|null|null|요한일서 1:9|9'],
  ['요한일서 1:9', '62|1|9|null|null|요한일서 1:9|9'],
  ['삼상 17:45', '9|17|45|null|null|사무엘상 17:45|45'],
  ['John 3:16', '43|3|16|null|null|요한복음 3:16|16'],
  ['1John 1:9', '62|1|9|null|null|요한일서 1:9|9'],
  ['롬8:28', '45|8|28|null|null|로마서 8:28|28'],
  ['로마 8:28', '45|8|28|null|null|로마서 8:28|28'],
  ['고전 13:4-7', '46|13|4|7|null|고린도전서 13:4-7|4-7'],
  ['시 23-24', '19|23|null|null|24|시편 23-24|'],
  ['요 3,16', '43|3|16|null|null|요한복음 3:16|16'],
  ['요 99:1', 'null'],
  ['없는책 1:1', 'null'],
  ['', 'null'],
  ['요 3:18-16', 'null'],
]
for (const [i, o] of cases) { const r = p(i); check(r === o, `parse "${i}"`, r !== o ? `got ${r}` : '') }
check(findBook('갈라디아')?.no === 48 && findBook('고린도후')?.no === 47 && findBook('아')?.no === 22 && findBook('요')?.no === 43, '책 이름 축약/앞부분 일치')
const lines = parseBibleLines(`# comment
book_no\tbook\tabbr\tchapter\tverse\ttext
1\t창세기\t창\t1\t1\t태초에 하나님이 천지를 창조하시니라
1\t1\t2\t땅이 혼돈하고
창1:3 하나님이 이르시되 빛이 있으라
창세기 1:4 그 빛이 하나님이 보시기에 좋았더라
요한복음 3장 16절 하나님이 세상을 이처럼 사랑하사
Gen 1:5 God called the light Day
창세기,1,6,하나님이 이르시되 물 가운데에
이건 못 읽는 줄
`)
check(lines.verses.length === 7 && lines.unparsed === 1, '본문 파서: 6가지 형식 + 헤더/주석 무시', `n=${lines.verses.length} unparsed=${lines.unparsed}`)
check(lines.verses[4].book === 43 && lines.verses[4].chapter === 3 && lines.verses[4].verse === 16, '본문 파서: "요한복음 3장 16절" 형식')
const j = parseBibleJson(JSON.stringify([{ book: '창세기', chapter: 1, verse: 1, text: 'a' }, { book_no: 43, chapter: 3, verse: 16, text: 'b' }, { book: 'x', chapter: 1, verse: 1, text: 'c' }]))
check(j.verses.length === 2 && j.unparsed === 1 && j.verses[1].book === 43, 'JSON 파서(평면)')
const j2 = parseBibleJson(JSON.stringify({ books: [{ book: 19, chapters: [{ chapter: 23, verses: [{ verse: 1, text: '여호와는 나의 목자시니' }] }] }] }))
check(j2.verses.length === 1 && j2.verses[0].book === 19 && j2.verses[0].chapter === 23, 'JSON 파서(중첩)')
const tsv5 = parseBibleLines('약어\t책이름\t장\t절\t본문\n창\t창세기\t1\t1\t태초에\n요\t요한복음\t3\t16\t하나님이')
check(tsv5.verses.length === 2 && tsv5.unparsed === 0 && tsv5.verses[1].book === 43, 'TSV 5열(약어·책이름·장·절·본문)', JSON.stringify(tsv5))
const sect = parseBibleLines('== 창세기 (창) ==\n\n[1장]\n1 태초에 하나님이\n2 땅이 혼돈하고\n[2장]\n1 천지와 만물이\n== 요한복음 (요) ==\n[3장]\n16 하나님이 세상을')
check(sect.verses.length === 4 && sect.unparsed === 0 && sect.verses[2].chapter === 2 && sect.verses[3].book === 43 && sect.verses[3].verse === 16, '구획형 txt(== 책 == / [장] / 절 본문)', JSON.stringify(sect))
console.log(fail === 0 ? 'BIBLE UNIT PASS' : `${fail} FAILED`)
