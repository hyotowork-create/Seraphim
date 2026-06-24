"""환경변수 기반 설정 (설교 영상 파이프라인용).

비밀값(API 키·토큰)을 소스에 하드코딩하지 않기 위해 분리한다.
프로젝트 루트의 `.env` 파일에서 값을 읽으며, 값이 없어도 앱은 정상 기동한다.
(주보·PPT 기능은 키 없이 동작하고, 영상 기능만 키가 필요하다.)
"""

from __future__ import annotations

import os
from pathlib import Path


def _load_dotenv() -> None:
    """의존성 없이 간단히 .env 를 환경변수로 로드 (python-dotenv 있으면 우선 사용)."""
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()
        return
    except Exception:
        pass
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip())


_load_dotenv()


def _get(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


class Settings:
    """런타임 설정. 환경변수가 비어 있어도 안전한 기본값을 갖는다."""

    # ── 외부 연동 (선택) ────────────────────────────────────────────
    slack_bot_token: str = _get("SLACK_BOT_TOKEN")
    openai_api_key: str = _get("OPENAI_API_KEY")
    gemini_api_key: str = _get("GEMINI_API_KEY")

    # ── STT (faster-whisper) ───────────────────────────────────────
    whisper_model: str = _get("WHISPER_MODEL", "medium")
    whisper_device: str = _get("WHISPER_DEVICE", "cpu")
    whisper_compute_type: str = _get("WHISPER_COMPUTE_TYPE", "int8")

    # ── 하이라이트/요약 LLM ─────────────────────────────────────────
    # gemini | openai. 키가 있는 쪽으로 자동 선택(아래 effective_llm_provider).
    llm_provider: str = _get("LLM_PROVIDER", "gemini")
    gemini_model: str = _get("GEMINI_MODEL", "gemini-2.5-flash")
    openai_map_model: str = _get("OPENAI_MAP_MODEL", "gpt-4o-mini")
    openai_model: str = _get("OPENAI_MODEL", "gpt-4o")

    @property
    def effective_llm_provider(self) -> str:
        """설정된 키를 기준으로 실제 사용할 제공자를 결정."""
        if self.llm_provider == "gemini" and self.gemini_api_key:
            return "gemini"
        if self.openai_api_key:
            return "openai"
        if self.gemini_api_key:
            return "gemini"
        return self.llm_provider

    @property
    def has_llm(self) -> bool:
        return bool(self.gemini_api_key or self.openai_api_key)

    @property
    def has_slack(self) -> bool:
        return bool(self.slack_bot_token)


settings = Settings()
