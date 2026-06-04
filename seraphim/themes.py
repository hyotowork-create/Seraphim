"""PPT / 주보에 공통으로 사용되는 디자인 테마 정의.

각 테마는 배경색, 강조색, 글자색, 폰트를 담은 단순한 데이터 묶음이다.
세련되고 가독성 높은 조합만 선별했다.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Theme:
    key: str
    name: str               # 사용자에게 보여줄 한글 이름
    bg: str                 # 슬라이드 배경 (hex, '#' 없이)
    bg_gradient: str        # 그라데이션 끝색
    accent: str             # 강조색 (제목 바, 포인트)
    text: str               # 본문 글자색
    subtext: str            # 보조 글자색
    title_font: str = "Noto Sans KR"
    body_font: str = "Noto Sans KR"

    @property
    def css_gradient(self) -> str:
        return f"linear-gradient(135deg, #{self.bg} 0%, #{self.bg_gradient} 100%)"


# 선별된 테마 모음 — 어두운 계열 위주로 무대 영상에 적합하게 구성
THEMES: dict[str, Theme] = {
    "midnight": Theme(
        key="midnight", name="미드나잇 블루",
        bg="0B1B3F", bg_gradient="1E3A6E",
        accent="6FA8FF", text="FFFFFF", subtext="B9C7E0",
    ),
    "graphite": Theme(
        key="graphite", name="그래파이트",
        bg="1A1A1D", bg_gradient="2E2E33",
        accent="E0A458", text="FFFFFF", subtext="C8C8CE",
    ),
    "royal": Theme(
        key="royal", name="로열 퍼플",
        bg="2A1A47", bg_gradient="4B2E83",
        accent="C9A7FF", text="FFFFFF", subtext="DAC9F2",
    ),
    "forest": Theme(
        key="forest", name="딥 포레스트",
        bg="0E2A1E", bg_gradient="1B5E3F",
        accent="9EE6B4", text="FFFFFF", subtext="C5E8D2",
    ),
    "ivory": Theme(
        key="ivory", name="아이보리 (밝은 톤)",
        bg="F7F3EC", bg_gradient="ECE3D4",
        accent="B08439", text="2B2B2B", subtext="6B6256",
    ),
}

DEFAULT_THEME = "midnight"


def get_theme(key: str | None) -> Theme:
    return THEMES.get(key or "", THEMES[DEFAULT_THEME])


def theme_choices() -> list[dict]:
    """프론트엔드 셀렉트 박스용 목록."""
    return [
        {"key": t.key, "name": t.name, "bg": t.bg,
         "gradient": t.bg_gradient, "accent": t.accent}
        for t in THEMES.values()
    ]
