"""Seraphim - 교회 방송실 업무 자동화 웹앱.

찬양 가사·설교 본문·광고 내용을 입력하면
  1) 세련된 찬양/설교/광고 PPT (.pptx)
  2) HTML 기반 주보 (인쇄·PDF 저장 가능)
를 한 번에 생성한다.

또한 설교/예배 영상 파일을 입력하면 (선택 기능, 추가 의존성 필요)
  3) 설교 하이라이트 쇼츠(9:16 자막 번인) — 전도·SNS 용
  4) 성도 배포용 설교 요약 PDF
를 백그라운드로 생성한다.

로컬 웹 서버로 동작하며 PyInstaller 로 단일 EXE 패키징이 가능하다.
EXE 로 실행하면 기본 브라우저가 자동으로 열린다.
"""

from __future__ import annotations

import io
import sys
import threading
import webbrowser
from datetime import datetime
from pathlib import Path

from flask import (Flask, jsonify, render_template, request,
                   send_file, send_from_directory)

from seraphim import __version__
from seraphim import plans
from seraphim import sermon_video
from seraphim.bulletin import render_bulletin
from seraphim.jobs import manager as job_manager
from seraphim.ppt_generator import build_presentation
from seraphim.themes import theme_choices


def _base_dir() -> Path:
    """소스 실행/EXE 실행 모두에서 리소스 기준 경로를 반환한다."""
    if getattr(sys, "frozen", False):           # PyInstaller 번들
        return Path(sys._MEIPASS)               # type: ignore[attr-defined]
    return Path(__file__).resolve().parent


BASE = _base_dir()
# 출력물은 EXE/스크립트가 위치한 실제 폴더에 저장 (번들 임시폴더 X)
OUTPUT_DIR = (Path(sys.executable).parent if getattr(sys, "frozen", False)
              else BASE) / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(
    __name__,
    template_folder=str(BASE / "templates"),
    static_folder=str(BASE / "static"),
)


def _safe_name(text: str) -> str:
    keep = "".join(c for c in text if c.isalnum() or c in " _-가-힣").strip()
    return (keep or "seraphim").replace(" ", "_")


def _parse_payload() -> dict:
    """프론트엔드 JSON 을 내부 표준 구조로 정규화."""
    raw = request.get_json(force=True, silent=True) or {}
    return {
        "service": {
            "church": (raw.get("church") or "").strip(),
            "date": (raw.get("date") or "").strip(),
            "service_name": (raw.get("service_name") or "").strip(),
        },
        "sermon": {
            "title": (raw.get("sermon_title") or "").strip(),
            "preacher": (raw.get("sermon_preacher") or "").strip(),
            "passage": (raw.get("sermon_passage") or "").strip(),
            "body": raw.get("sermon_body") or "",
        },
        "songs": [s for s in (raw.get("songs") or [])
                  if (s.get("title") or s.get("lyrics"))],
        "ads": [a for a in (raw.get("ads") or [])
                if (a.get("title") or a.get("content"))],
        "_theme": raw.get("theme"),
    }


@app.route("/")
def index():
    return render_template(
        "index.html",
        version=__version__,
        themes=theme_choices(),
        today=datetime.now().strftime("%Y-%m-%d"),
    )


@app.route("/api/preview-bulletin", methods=["POST"])
def preview_bulletin():
    data = _parse_payload()
    html = render_bulletin(data, data["_theme"])
    return jsonify({"html": html})


@app.route("/api/generate-bulletin", methods=["POST"])
def generate_bulletin():
    data = _parse_payload()
    html = render_bulletin(data, data["_theme"])
    name = _safe_name(data["service"]["church"] or "주보")
    fname = f"{name}_주보_{datetime.now():%Y%m%d}.html"
    (OUTPUT_DIR / fname).write_text(html, encoding="utf-8")
    return send_file(
        io.BytesIO(html.encode("utf-8")),
        mimetype="text/html",
        as_attachment=True,
        download_name=fname,
    )


@app.route("/api/generate-ppt", methods=["POST"])
def generate_ppt():
    data = _parse_payload()
    prs = build_presentation(data, data["_theme"])
    buf = io.BytesIO()
    prs.save(buf)
    buf.seek(0)

    name = _safe_name(data["service"]["church"] or "예배")
    fname = f"{name}_PPT_{datetime.now():%Y%m%d}.pptx"
    # 출력 폴더에도 사본 저장
    with open(OUTPUT_DIR / fname, "wb") as f:
        f.write(buf.getvalue())
    buf.seek(0)
    return send_file(
        buf,
        mimetype="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        as_attachment=True,
        download_name=fname,
    )


@app.route("/output/<path:filename>")
def output_files(filename):
    return send_from_directory(OUTPUT_DIR, filename)


# ── 요금제 / 기능 게이팅 ──────────────────────────────────────────────
def _current_user() -> dict | None:
    """현재 로그인 사용자. 인증·결제 연동 전까지는 None(=free_launch 개방).

    SaaS 전환 시 여기서 세션/JWT 를 읽어 {'plan': 'pro'|'free'} 를 돌려주면
    유료 잠금이 자동으로 동작한다.
    """
    return None


@app.route("/api/plan")
def api_plan():
    return jsonify(plans.plan_state(_current_user()))


# ── 설교 영상 파이프라인 (선택 기능) ──────────────────────────────────
@app.route("/api/video/status")
def video_status():
    """영상 기능 사용 가능 여부(의존성·키 설치 상태)를 반환."""
    return jsonify(sermon_video.video_feature_status())


def _video_common(raw: dict) -> tuple[str, str]:
    """공통 검증: 영상 경로 확인. (실경로, 에러메시지) 반환."""
    path = sermon_video.resolve_path(raw.get("video_path") or "")
    if not path:
        return "", "영상 파일 경로를 찾을 수 없습니다. 경로 양끝의 따옴표·공백을 확인하세요."
    return path, ""


@app.route("/api/video/shorts", methods=["POST"])
def video_shorts():
    if not plans.is_allowed(plans.FEATURE_SHORTS, _current_user()):
        return jsonify({"error": plans.upgrade_message(plans.FEATURE_SHORTS),
                        "upgrade_required": True}), 402
    raw = request.get_json(force=True, silent=True) or {}
    path, err = _video_common(raw)
    if err:
        return jsonify({"error": err}), 404
    job = job_manager.submit(
        "shorts", sermon_video.run_shorts_pipeline,
        path,
        (raw.get("church_name") or "").strip(),
        (raw.get("sermon_title") or "").strip(),
        raw.get("aspect_ratio") or "9:16",
        raw.get("stt_option") or "A",
        (raw.get("slack_channel") or "").strip(),
    )
    return jsonify({"job_id": job.id, "status": job.status})


@app.route("/api/video/summary", methods=["POST"])
def video_summary():
    if not plans.is_allowed(plans.FEATURE_SUMMARY, _current_user()):
        return jsonify({"error": plans.upgrade_message(plans.FEATURE_SUMMARY),
                        "upgrade_required": True}), 402
    raw = request.get_json(force=True, silent=True) or {}
    path, err = _video_common(raw)
    if err:
        return jsonify({"error": err}), 404
    job = job_manager.submit(
        "summary", sermon_video.run_summary_pdf,
        path,
        (raw.get("sermon_title") or "").strip(),
        raw.get("stt_option") or "A",
        (raw.get("slack_channel") or "").strip(),
    )
    return jsonify({"job_id": job.id, "status": job.status})


@app.route("/api/jobs/<job_id>")
def job_status(job_id):
    job = job_manager.get(job_id)
    if not job:
        return jsonify({"error": "작업을 찾을 수 없습니다."}), 404
    return jsonify(job.to_dict())


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "version": __version__})


def _open_browser(port: int) -> None:
    webbrowser.open(f"http://127.0.0.1:{port}/")


def main():
    port = 5000
    # EXE/직접 실행 시 브라우저 자동 오픈 (reloader 자식 프로세스 제외)
    import os
    if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        threading.Timer(1.0, _open_browser, args=(port,)).start()
    print(f"\n  Seraphim v{__version__} 실행 중  →  http://127.0.0.1:{port}/")
    print("  종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요.\n")
    app.run(host="127.0.0.1", port=port, debug=False)


if __name__ == "__main__":
    main()
