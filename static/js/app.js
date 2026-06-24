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

/* ===================================================================
   설교 영상 탭
   =================================================================== */
let currentAspect = "9:16";
let currentStt = "A";
let pollTimer = null;

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === name));
  document.getElementById("tab-bulletin").classList.toggle("hidden", name !== "bulletin");
  document.getElementById("tab-video").classList.toggle("hidden", name !== "video");
  if (name === "video") loadVideoStatus();
}

function pickSeg(groupId, btn) {
  const group = document.getElementById(groupId);
  group.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  if (groupId === "aspect-seg") currentAspect = btn.dataset.v;
  else if (groupId === "stt-seg") currentStt = btn.dataset.v;
}

async function loadVideoStatus() {
  const banner = el("video-banner");
  try {
    const res = await fetch("/api/video/status");
    const s = await res.json();
    const issues = [];
    if (!s.python_packages_ok)
      issues.push("필수 패키지 미설치: <b>" + s.missing_packages.join(", ") + "</b> (pip install)");
    if (!s.ffmpeg_ok) issues.push("<b>ffmpeg</b> 미설치 (영상 처리 필수)");
    if (!s.llm_ok) issues.push("LLM 키 없음 — <b>.env</b> 에 GEMINI_API_KEY 또는 OPENAI_API_KEY 필요");

    if (issues.length === 0) {
      banner.className = "banner ok";
      banner.innerHTML = "✅ 영상 기능 준비 완료" +
        (s.slack_ok ? " · Slack 알림 연동됨" : " · (Slack 미설정: 화면 로그로 표시)") +
        " · LLM: <b>" + s.llm_provider + "</b>";
    } else {
      banner.className = "banner warn";
      banner.innerHTML = "⚠️ 영상 기능을 쓰려면 아래가 필요합니다:<br>· " + issues.join("<br>· ") +
        "<br><span style='opacity:.7'>설정 방법은 README의 '설교 영상 기능' 항목 참고. " +
        "이 설정 없이도 주보·PPT 기능은 정상 동작합니다.</span>";
    }
  } catch (e) {
    banner.className = "banner warn";
    banner.innerHTML = "상태 확인 실패: " + e.message;
  }
}

function setVStatus(msg, isErr = false) {
  const s = el("v_status");
  s.textContent = msg;
  s.className = "status" + (isErr ? " err" : "");
}

async function submitVideo(kind) {
  const videoPath = el("video_path").value.trim();
  if (!videoPath) { setVStatus("❌ 영상 파일 경로를 입력하세요.", true); return; }

  const body = {
    video_path: videoPath,
    church_name: el("v_church").value,
    sermon_title: el("v_sermon").value,
    aspect_ratio: currentAspect,
    stt_option: currentStt,
    slack_channel: el("v_slack").value,
  };
  const url = kind === "shorts" ? "/api/video/shorts" : "/api/video/summary";
  const label = kind === "shorts" ? "쇼츠 생성" : "요약 PDF 생성";

  try {
    setVStatus(label + " 작업 등록 중…");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setVStatus("❌ " + (data.error || "오류"), true); return; }
    setVStatus("✅ 작업이 등록되었습니다 (작업 ID: " + data.job_id + "). 아래에서 진행상황을 확인하세요.");
    startPolling(data.job_id);
  } catch (e) {
    setVStatus("❌ 요청 실패: " + e.message, true);
  }
}

function startPolling(jobId) {
  if (pollTimer) clearInterval(pollTimer);
  const logEl = el("job-log");
  logEl.textContent = "작업 시작 대기 중…";

  const tick = async () => {
    try {
      const res = await fetch("/api/jobs/" + jobId);
      const job = await res.json();
      if (job.error) { logEl.textContent = job.error; clearInterval(pollTimer); return; }
      const head = `작업 ${job.id} · ${job.kind} · 상태: ${job.status}\n` + "─".repeat(40) + "\n";
      logEl.textContent = head + job.logs.map(l => `[${l.t}] ${l.msg}`).join("\n");
      logEl.scrollTop = logEl.scrollHeight;
      if (job.status === "done" || job.status === "error") clearInterval(pollTimer);
    } catch (e) {
      logEl.textContent += "\n(폴링 오류: " + e.message + ")";
    }
  };
  tick();
  pollTimer = setInterval(tick, 2000);
}

/* ---------- 초기화: 샘플 1개씩 ---------- */
window.addEventListener("DOMContentLoaded", () => {
  addSong();
  addAd();
  refreshPreview();
});
