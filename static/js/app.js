/* Seraphim 프론트엔드 로직 */

let songCount = 0;
let adCount = 0;

function el(id) { return document.getElementById(id); }

/* ---------- 동적 행: 찬양 ---------- */
function addSong(title = "", lyrics = "") {
  songCount++;
  const wrap = document.createElement("div");
  wrap.className = "repeat-row";
  wrap.dataset.kind = "song";
  wrap.innerHTML = `
    <div class="row-head">
      <span class="row-num">찬양 #${songCount}</span>
      <button class="btn-del" onclick="this.closest('.repeat-row').remove()">삭제</button>
    </div>
    <label>곡 제목<input class="song-title" placeholder="예) 주 은혜임을" value="${esc(title)}"></label>
    <label>가사<textarea class="song-lyrics" rows="5" placeholder="가사를 입력하세요.&#10;&#10;빈 줄로 절을 구분하면 슬라이드가 깔끔하게 나뉩니다.">${esc(lyrics)}</textarea></label>
  `;
  el("songs").appendChild(wrap);
}

/* ---------- 동적 행: 광고 ---------- */
function addAd(title = "", content = "") {
  adCount++;
  const wrap = document.createElement("div");
  wrap.className = "repeat-row";
  wrap.dataset.kind = "ad";
  wrap.innerHTML = `
    <div class="row-head">
      <span class="row-num">광고 #${adCount}</span>
      <button class="btn-del" onclick="this.closest('.repeat-row').remove()">삭제</button>
    </div>
    <label>제목<input class="ad-title" placeholder="예) 다음 주 야외예배 안내" value="${esc(title)}"></label>
    <label>내용<textarea class="ad-content" rows="3" placeholder="한 줄에 하나씩 입력하면 항목별로 정리됩니다.">${esc(content)}</textarea></label>
  `;
  el("ads").appendChild(wrap);
}

function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- 폼 → JSON ---------- */
function collectData() {
  const songs = [...document.querySelectorAll('[data-kind="song"]')].map(r => ({
    title: r.querySelector(".song-title").value,
    lyrics: r.querySelector(".song-lyrics").value,
  }));
  const ads = [...document.querySelectorAll('[data-kind="ad"]')].map(r => ({
    title: r.querySelector(".ad-title").value,
    content: r.querySelector(".ad-content").value,
  }));
  return {
    church: el("church").value,
    date: el("date").value,
    service_name: el("service_name").value,
    theme: el("theme").value,
    sermon_title: el("sermon_title").value,
    sermon_preacher: el("sermon_preacher").value,
    sermon_passage: el("sermon_passage").value,
    sermon_body: el("sermon_body").value,
    songs, ads,
  };
}

function setStatus(msg, isErr = false) {
  const s = el("status");
  s.textContent = msg;
  s.className = "status" + (isErr ? " err" : "");
}

/* ---------- 미리보기 ---------- */
async function refreshPreview() {
  try {
    setStatus("미리보기 생성 중…");
    const res = await fetch("/api/preview-bulletin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectData()),
    });
    const json = await res.json();
    el("preview").srcdoc = json.html;
    setStatus("미리보기가 업데이트되었습니다.");
  } catch (e) {
    setStatus("미리보기 실패: " + e.message, true);
  }
}

/* ---------- 파일 다운로드 공통 ---------- */
async function downloadFrom(url, label) {
  try {
    setStatus(label + " 생성 중…");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectData()),
    });
    if (!res.ok) throw new Error("서버 오류 " + res.status);
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
    const name = m ? decodeURIComponent(m[1]) : "seraphim_output";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus(label + " 다운로드 완료 ✓ (output 폴더에도 저장됨)");
  } catch (e) {
    setStatus(label + " 실패: " + e.message, true);
  }
}

function downloadPPT() { downloadFrom("/api/generate-ppt", "PPT"); }
function downloadBulletin() { downloadFrom("/api/generate-bulletin", "주보"); }

/* ---------- 초기화: 샘플 1개씩 ---------- */
window.addEventListener("DOMContentLoaded", () => {
  addSong();
  addAd();
  refreshPreview();
});
