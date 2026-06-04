"""HTML 주보(週報) 생성 모듈.

Jinja2 템플릿(`templates/bulletin_template.html`)에 예배·찬양·설교·광고
정보를 채워 인쇄 가능한 단일 HTML 파일을 만든다.
브라우저의 인쇄(Ctrl+P) → PDF 저장으로 바로 출력할 수 있다.
"""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .themes import get_theme

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"


def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(_TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )


def _nl2list(text: str | None) -> list[str]:
    if not text:
        return []
    return [ln.strip() for ln in text.replace("\r\n", "\n").split("\n") if ln.strip()]


def render_bulletin(data: dict, theme_key: str | None = None) -> str:
    """주보 HTML 문자열을 반환한다."""
    theme = get_theme(theme_key)
    env = _env()
    template = env.get_template("bulletin_template.html")

    service = data.get("service", {})
    sermon = data.get("sermon", {})

    songs = [
        {"title": (s.get("title") or "").strip(),
         "lyrics_lines": _nl2list(s.get("lyrics"))}
        for s in data.get("songs", [])
        if (s.get("title") or s.get("lyrics"))
    ]
    ads = [
        {"title": (a.get("title") or "안내").strip(),
         "content_lines": _nl2list(a.get("content"))}
        for a in data.get("ads", [])
        if (a.get("title") or a.get("content"))
    ]

    return template.render(
        theme=theme,
        church=service.get("church") or "교회",
        date=service.get("date") or "",
        service_name=service.get("service_name") or "주일예배",
        sermon_title=sermon.get("title") or "",
        sermon_preacher=sermon.get("preacher") or "",
        sermon_passage=sermon.get("passage") or "",
        sermon_body_lines=_nl2list(sermon.get("body")),
        songs=songs,
        ads=ads,
    )


def save_bulletin(data: dict, out_path: str | Path, theme_key: str | None = None) -> Path:
    html = render_bulletin(data, theme_key)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    return out_path
