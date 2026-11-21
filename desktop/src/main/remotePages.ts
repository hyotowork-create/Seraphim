// 로컬 웹서버가 내주는 두 화면 — 인터넷 없이 동작하도록 앱 안에 글자로 둠. 상태는 /events(SSE) 하나로 받는다.

/** OBS 브라우저 소스용: 투명 배경 + 아래 자막 띠 (중계 화면용 스타일, TV 송출 스타일과 따로) */
export const OVERLAY_HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seraphim 자막</title>
<style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden}
#bar{position:fixed;left:6%;right:6%;bottom:6%;padding:1.4vh 2.4vw;background:rgba(0,0,0,.55);border-radius:1vh;
color:#fff;text-align:center;font-size:4.6vh;line-height:1.35;font-weight:700;white-space:pre-line;
text-shadow:0 .2vh .4vh rgba(0,0,0,.6);transition:opacity .25s}
#bar.off{opacity:0}
</style></head><body><div id="bar" class="off"></div>
<script>
var bar=document.getElementById('bar');
new EventSource('/events'+location.search).onmessage=function(e){
  var v=JSON.parse(e.data);
  if(!v.hidden) bar.textContent=v.text;
  bar.style.fontFamily=v.fontFamily;
  bar.classList.toggle('off',v.hidden);
};
</script></body></html>`

/** 휴대폰 리모컨: 이전·다음·검정·로고 + 지금 화면 글자 */
export const REMOTE_HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Seraphim 리모컨</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;gap:12px;padding:14px;background:#0f1220;color:#e2e8f0;
font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;-webkit-user-select:none;user-select:none}
#now{flex:1;min-height:120px;border:1px solid #2a3150;border-radius:12px;padding:14px;font-size:20px;line-height:1.45;
white-space:pre-line;overflow:auto;background:#151a2e}
#now.dim{color:#64748b}
#conn{font-size:12px;color:#94a3b8}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
button{font:inherit;font-size:22px;font-weight:700;border:0;border-radius:14px;padding:22px 0;color:#fff;background:#2a3150;touch-action:manipulation}
button:active{filter:brightness(1.4)}
#next{background:#6d28d9}
button.on{outline:3px solid #fbbf24}
</style></head><body>
<div id="conn">연결 중…</div>
<div id="now" class="dim">—</div>
<div class="grid">
<button id="prev">◀ 이전</button><button id="next">다음 ▶</button>
<button id="black">검정</button><button id="logo">로고</button>
</div>
<script>
var q=location.search, now=document.getElementById('now'), conn=document.getElementById('conn');
['prev','next','black','logo'].forEach(function(c){
  document.getElementById(c).onclick=function(){
    if(navigator.vibrate) navigator.vibrate(15);
    fetch('/cmd/'+c+q,{method:'POST'}).then(function(r){ if(!r.ok) conn.textContent='명령 거절됨 ('+r.status+') — PIN을 확인하세요'; });
  };
});
var es=new EventSource('/events'+q);
es.onopen=function(){conn.textContent='연결됨'};
es.onerror=function(){conn.textContent='연결 끊김 — 다시 잇는 중…'};
es.onmessage=function(e){
  var v=JSON.parse(e.data);
  now.textContent=v.blackout?'(검정 화면)':v.showLogo?'(로고 화면)':(v.text||'(글자 없음)');
  now.classList.toggle('dim',v.blackout||v.showLogo||!v.text);
  document.getElementById('black').classList.toggle('on',v.blackout);
  document.getElementById('logo').classList.toggle('on',v.showLogo);
};
</script></body></html>`
