// 온라인 주보 데이터 + 모바일 반응형 HTML 생성 (main/renderer 공용, 의존성 없음)

export interface BulletinOrderItem {
  name: string
  person?: string
}

export interface BulletinData {
  churchName: string
  serviceType: string
  /** YYYY-MM-DD */
  date: string
  order: BulletinOrderItem[]
  songs: string[]
  sermon: { title: string; passage: string; preacher: string }
  announcements: string[]
  /** 헌금 계좌 (여러 줄) */
  offering: string
  /** 기도제목 (선택) */
  prayer: string[]
}

export const EMPTY_BULLETIN: BulletinData = {
  churchName: '',
  serviceType: '주일예배',
  date: new Date().toISOString().slice(0, 10),
  order: [],
  songs: [],
  sermon: { title: '', passage: '', preacher: '' },
  announcements: [],
  offering: '',
  prayer: []
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, '<br>')
}

function section(title: string, body: string): string {
  if (!body.trim()) return ''
  return `<section><h2>${esc(title)}</h2>${body}</section>`
}

/** 예배 데이터 → 자립형(single-file) 모바일 주보 HTML */
export function buildBulletinHtml(d: BulletinData): string {
  const title = `${d.churchName || '교회'} ${d.serviceType} 주보`
  const dateLabel = d.date

  const orderHtml = d.order.length
    ? `<ol class="order">${d.order
        .map(
          (o) =>
            `<li><span>${esc(o.name)}</span>${o.person ? `<em>${esc(o.person)}</em>` : ''}</li>`
        )
        .join('')}</ol>`
    : ''

  const songsHtml = d.songs.length
    ? `<ul class="songs">${d.songs.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
    : ''

  const sermonHtml =
    d.sermon.title || d.sermon.passage || d.sermon.preacher
      ? `<div class="sermon">
          ${d.sermon.title ? `<div class="sermon-title">${esc(d.sermon.title)}</div>` : ''}
          ${d.sermon.passage ? `<div class="sermon-passage">${esc(d.sermon.passage)}</div>` : ''}
          ${d.sermon.preacher ? `<div class="sermon-preacher">${esc(d.sermon.preacher)}</div>` : ''}
        </div>`
      : ''

  const annHtml = d.announcements.length
    ? `<ul class="ann">${d.announcements.map((a) => `<li>${nl2br(a)}</li>`).join('')}</ul>`
    : ''

  const offeringHtml = d.offering.trim() ? `<div class="offering">${nl2br(d.offering)}</div>` : ''

  const prayerHtml = d.prayer.length
    ? `<ul class="prayer">${d.prayer.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
    : ''

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(dateLabel)} · ${esc(d.serviceType)}">
<title>${esc(title)}</title>
<style>
  :root{
    --bg:#f6f5f2; --card:#ffffff; --ink:#1c1d22; --muted:#6b7280; --line:#e6e4df; --accent:#3f5db0;
  }
  @media (prefers-color-scheme: dark){
    :root{ --bg:#14161c; --card:#1c1f27; --ink:#f2f3f5; --muted:#9aa1ad; --line:#2a2e38; --accent:#8fa6f0; }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;
    font-size:19px;line-height:1.7;padding:env(safe-area-inset-top,0) 0 48px}
  .wrap{max-width:560px;margin:0 auto;padding:0 18px}
  header{text-align:center;padding:28px 0 8px}
  header .church{font-size:15px;color:var(--muted);letter-spacing:.02em}
  header h1{font-size:26px;margin:6px 0 2px}
  header .date{font-size:15px;color:var(--muted)}
  section{background:var(--card);border:1px solid var(--line);border-radius:16px;
    padding:18px 18px 16px;margin:14px 0}
  h2{font-size:15px;color:var(--accent);margin:0 0 10px;letter-spacing:.03em}
  ol.order{list-style:none;margin:0;padding:0}
  ol.order li{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px dashed var(--line)}
  ol.order li:last-child{border-bottom:0}
  ol.order em{color:var(--muted);font-style:normal;font-size:16px;white-space:nowrap}
  ul{margin:0;padding-left:20px}
  ul.songs li,ul.ann li,ul.prayer li{padding:4px 0}
  .sermon-title{font-size:22px;font-weight:700}
  .sermon-passage{color:var(--accent);margin-top:4px}
  .sermon-preacher{color:var(--muted);margin-top:2px}
  .offering{white-space:pre-line;background:rgba(127,127,127,.06);border-radius:10px;padding:10px 12px}
  footer{text-align:center;color:var(--muted);font-size:13px;margin-top:22px}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="church">${esc(d.churchName)}</div>
      <h1>${esc(d.serviceType)}</h1>
      <div class="date">${esc(dateLabel)}</div>
    </header>
    ${section('예배 순서', orderHtml)}
    ${section('찬양', songsHtml)}
    ${section('말씀', sermonHtml)}
    ${section('광고', annHtml)}
    ${section('헌금 계좌', offeringHtml)}
    ${section('기도 제목', prayerHtml)}
    <footer>${esc(d.churchName)} · ${esc(dateLabel)}</footer>
  </div>
</body>
</html>`
}
