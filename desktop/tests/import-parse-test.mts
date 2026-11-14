import { parseTitleLine, parseTxt, parseJson, slideXmlToParagraphs, slidesToSongs, slideXmlInfo, cleanImportTitle } from '../src/shared/songImportParse.ts'
let fail = 0
const check = (ok: boolean, label: string, extra = '') => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fail++ }
const t = parseTitleLine
const eq = (a: { title: string; hymnNo: number | null }, title: string, no: number | null) => a.title === title && a.hymnNo === no
check(eq(t('478장 참 아름다워라'), '참 아름다워라', 478), '제목줄: 478장 …')
check(eq(t('305. 나 같은 죄인'), '나 같은 죄인', 305), '제목줄: 305. …')
check(eq(t('[12] 제목'), '제목', 12), '제목줄: [12] …')
check(eq(t('물 위를 걷는 자'), '물 위를 걷는 자', null), '제목줄: 번호 없음')
check(eq(t('1004 천사'), '1004 천사', null), '제목줄: 4자리 숫자는 번호 아님')
check(t('2026-09-20 1부 찬양').hymnNo === null, '날짜로 시작하는 파일명은 장 번호로 오인하지 않음(4자리 초과)', JSON.stringify(t('2026-09-20 1부 찬양')))
const a = parseTxt('478장 참 아름다워라\n\n1절\n가나다\n라마바\n\n2절\n사아자\n', 'x.txt')
check(a.length === 1 && a[0].hymnNo === 478 && a[0].verses.length === 2 && a[0].verses[0].label === '1절' && a[0].verses[0].text === '가나다\n라마바', 'txt: 장번호+라벨 절', JSON.stringify(a))
const b = parseTxt('1절\n주 안에\n\n후렴\n평안', '/x/주 안에 있는 나에게.txt')
check(b[0].title === '주 안에 있는 나에게' && b[0].verses.length === 2 && b[0].verses[1].label === '후렴', 'txt: 첫 줄 라벨 → 파일명 제목', JSON.stringify(b))
check(parseTxt('\n\n', 'e.txt').length === 0, 'txt: 빈 파일')
const j = parseJson(JSON.stringify({ songs: [{ title: '305장 나 같은', lyrics: 'a\n\nb' }, { title: 'X', verses: [{ label: '후렴', lines: ['l1', 'l2'] }, 'plain'] }, { title: '' }, { title: 'no verses' }] }))
check(j.length === 2 && j[0].hymnNo === 305 && j[0].title === '나 같은' && j[0].verses.length === 2 && j[1].verses[0].text === 'l1\nl2' && j[1].verses[1].text === 'plain', 'json: 두 형식', JSON.stringify(j))
const xml = '<p:sld><a:p><a:r><a:t>주 &amp; 나</a:t></a:r><a:br/><a:r><a:t>둘째</a:t></a:r></a:p><a:p></a:p><a:p><a:r><a:t>  </a:t></a:r></a:p><a:p><a:t>셋째 &#44032;</a:t></a:p></p:sld>'
const paras = slideXmlToParagraphs(xml)
check(JSON.stringify(paras) === JSON.stringify(['주 & 나\n둘째', '셋째 가']), 'slide xml → 문단(br, 엔티티, 빈 문단 제거)', JSON.stringify(paras))
const songs = slidesToSongs(['황무지가 장미꽃같이', '시험 가사 1절 첫 줄\n시험 가사 1절 둘째 줄', '시험 가사 2절 첫 줄 거룩한 길', '', '주 하나님 지으신 모든 세계', '주 하나님 지으신 모든 세계\n시험 가사 둘째 줄', '시험 가사 셋째 줄 시험 가사 마지막 줄'], '/a/2026-09-20 1부 찬양.pptx')
check(songs.length === 2 && songs[0].title === '황무지가 장미꽃같이' && songs[0].verses.length === 2 && songs[1].title === '주 하나님 지으신 모든 세계' && songs[1].verses.length === 2 && songs[1].hymnNo === null, 'pptx: 제목 슬라이드로 곡 분리', JSON.stringify(songs.map(s => [s.title, s.verses.length])))
const one = slidesToSongs(['가사1\n가사2', '가사3', '짧은 마지막 줄'], '/a/주의 손에.pptx')
check(one.length === 1 && one[0].title === '주의 손에' && one[0].verses.length === 3, 'pptx: 제목 슬라이드 없음 → 파일명 제목, 마지막 짧은 슬라이드는 절로', JSON.stringify(one.map(s => [s.title, s.verses.length])))
const info = slideXmlInfo('<p:sld><a:p><a:pPr/><a:r><a:rPr lang="ko" sz="4400"/><a:t>제목</a:t></a:r></a:p><a:p><a:r><a:rPr sz="2800"/><a:t>x</a:t></a:r></a:p></p:sld>')
check(info.maxSz === 4400 && info.paragraphs.length === 2, 'slideXmlInfo: 최대 글자 크기', JSON.stringify(info))
// 글자 크기로 제목 판별: 한 줄짜리 짧은 가사 슬라이드가 연속돼도 큰 글자 슬라이드만 제목
const bySz = slidesToSongs([{ text: '첫 곡 제목', maxSz: 4400 }, { text: '가사 한 줄', maxSz: 2800 }, { text: '가사 두 줄\n둘째', maxSz: 2800 }, { text: '짧은 가사', maxSz: 2800 }, { text: '둘째 곡 제목', maxSz: 4400 }, { text: '가사 a', maxSz: 2800 }, { text: '가사 b\nc', maxSz: 2800 }], '/x/2026-09-20 찬양.pptx')
check(bySz.length === 2 && bySz[0].title === '첫 곡 제목' && bySz[0].verses.length === 3 && bySz[1].title === '둘째 곡 제목' && bySz[1].verses.length === 2, 'pptx: 글자 크기로 제목 슬라이드 판별', JSON.stringify(bySz.map(s => [s.title, s.verses.length])))
const art = parseJson(JSON.stringify({ songs: [{ title: '전쟁은 주의 것', artist: '제이어스(J-Us)', team: '제이어스', lyrics: 'a\n\nb' }, { title: 'X', team: '마커스워십', lyrics: 'c' }] }))
check(art[0].author === '제이어스(J-Us)' && art[1].author === '마커스워십', 'json: artist/team → 작사자 칸', JSON.stringify(art.map((s) => s.author)))
// 사이트 수집 제목 정리
const ct = cleanImportTitle
check(ct('임재 Come Holy Spirit - 마커스워십 𝑳𝒊𝒗𝒆 𝑪𝒍𝒊𝒑', ['마커스워십']) === '임재 Come Holy Spirit', '제목 정리: 굵은 글꼴 Live Clip + 팀 꼬리', ct('임재 Come Holy Spirit - 마커스워십 𝑳𝒊𝒗𝒆 𝑪𝒍𝒊𝒑', ['마커스워십']))
check(ct('주 말씀대로 날 붙드소서 (시편 119편) Hold Me Fast (Official)') === '주 말씀대로 날 붙드소서 (시편 119편) Hold Me Fast', '제목 정리: (Official) 제거, (시편 119편) 유지')
check(ct('주가 찾으시는 종이되어 🤲 마커스 목요예배') === '주가 찾으시는 종이되어', '제목 정리: 이모지 이후 버림', ct('주가 찾으시는 종이되어 🤲 마커스 목요예배'))
check(ct('예수, 우리의 노래 Jesus, the Song We Sing _심종호 인도') === '예수, 우리의 노래 Jesus, the Song We Sing', '제목 정리: _인도자 꼬리')
check(ct('영원히 Forever (Live)') === '영원히 Forever', '제목 정리: (Live) 제거하되 Forever는 유지', ct('영원히 Forever (Live)'))
check(ct('사랑한다 말하시네 - 마커스워십', ['마커스워십']) === '사랑한다 말하시네', '제목 정리: " - 팀명"')
check(ct('모든 민족과 방언들 가운데 Hallelujah to the Lamb (인도 : 심종호)') === '모든 민족과 방언들 가운데 Hallelujah to the Lamb', '제목 정리: (인도 : 이름) 제거')
check(ct('내 평생에 가는 길 (찬송가 413장)') === '내 평생에 가는 길 (찬송가 413장)', '제목 정리: (찬송가 413장)은 유지')
check(ct('7. 한결같은 주의 사랑이 (축복송') === '7. 한결같은 주의 사랑이', '제목 정리: 닫히지 않은 괄호', ct('7. 한결같은 주의 사랑이 (축복송'))
// JSON: 트랙 번호 "12. 제목"은 장 번호가 아님(카테고리가 찬송가일 때만 장 번호), 유튜브 채널명 → 작사자
const yt = parseJson(JSON.stringify({ songs: [
  { title: '12. 물 위를 걷는 자 (Official)', team: '피아워십', channelName: 'F.I.A', lyrics: 'a' },
  { title: '12. 제목', category: '새찬송가', lyrics: 'b' },
  { title: '', team: '예람워십', lyrics: 'c' },
  { title: '거룩 영원히 Holy Forever', channelName: 'MARKERS WORSHIP', lyrics: 'd' }
] }))
check(yt.length === 3 && yt[0].title === '물 위를 걷는 자' && yt[0].hymnNo === null && yt[0].author === '피아워십', 'json: 트랙 번호는 장 번호 아님 + 태그 제거', JSON.stringify(yt[0]))
check(yt[1].title === '제목' && yt[1].hymnNo === 12, 'json: 찬송가 카테고리면 "12." 을 장 번호로', JSON.stringify(yt[1]))
check(yt[2].author === 'MARKERS WORSHIP', 'json: channelName → 작사자', JSON.stringify(yt[2]))
// txt: "### [팀] 제목 (날짜, 앨범)" 헤더 여러 개 → 여러 곡, URL 줄 제거
const multi = parseTxt('### [제이어스] 전쟁은 주의 것 (2026-09-21, undefined)\nhttps://music.bugs.co.kr/track/1\n\n가사1\n가사2\n\n가사3\n\n### [마커스워십] 예수, 우리의 노래 _심종호 인도 (2025-07-31, undefined)\nhttps://music.bugs.co.kr/track/2\n\n가사4\n', '/x/최신워십.txt')
check(multi.length === 2 && multi[0].title === '전쟁은 주의 것' && multi[0].author === '제이어스' && multi[0].verses.length === 2 && multi[0].verses[0].text === '가사1\n가사2' && multi[1].title === '예수, 우리의 노래' && multi[1].verses.length === 1, 'txt: ### 헤더 다중 곡', JSON.stringify(multi.map(s => [s.title, s.author, s.verses.length])))
check(!JSON.stringify(multi).includes('http'), 'txt: URL 줄 제거')
console.log(fail === 0 ? 'PARSE TESTS PASS' : `${fail} FAILED`)
