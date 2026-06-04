"""핵심 생성 파이프라인 스모크 테스트.

    python test_pipeline.py

PPT/주보가 정상 생성되고 슬라이드 수·HTML 내용이 기대대로인지 확인한다.
"""

from pathlib import Path

from seraphim.bulletin import render_bulletin
from seraphim.ppt_generator import build_presentation, split_lyrics

SAMPLE = {
    "service": {"church": "세라핌교회", "date": "2026-06-07", "service_name": "주일 낮 예배"},
    "songs": [
        {"title": "주 은혜임을",
         "lyrics": "내가 사는 것은\n주의 은혜라\n\n내가 서있는 것도\n주의 은혜라"},
        {"title": "은혜",
         "lyrics": "한량없는 은혜\n내가 늘 잠잠히\n주를 신뢰함이"},
    ],
    "sermon": {"title": "그리스도의 사랑", "preacher": "홍길동 목사",
               "passage": "요한복음 3:16", "body": "하나님이 세상을 이처럼 사랑하사.\n독생자를 주셨으니."},
    "ads": [
        {"title": "야외예배 안내", "content": "일시: 6/14(주일)\n장소: 중앙공원\n준비물: 도시락"},
        {"title": "새가족 환영", "content": "교육관 2층에서 환영회가 있습니다."},
    ],
}


def test_split():
    blocks = split_lyrics("a\nb\n\nc\nd")
    assert blocks == ["a\nb", "c\nd"], blocks
    long = split_lyrics("1\n2\n3\n4\n5\n6")  # 빈 줄 없음 → 4줄씩
    assert len(long) == 2, long
    print("✓ split_lyrics OK")


def test_ppt():
    prs = build_presentation(SAMPLE, "midnight")
    n = len(prs.slides._sldIdLst)
    # 예배표지1 + (곡표지+가사) + 설교표지 + 광고표지 + 광고2  → 충분히 생성됐는지
    assert n >= 8, f"슬라이드 수 부족: {n}"
    out = Path("output/test_sample.pptx")
    prs.save(out)
    assert out.stat().st_size > 5000
    print(f"✓ PPT OK — {n} slides, {out.stat().st_size} bytes")


def test_bulletin():
    html = render_bulletin(SAMPLE, "midnight")
    for needle in ["세라핌교회", "그리스도의 사랑", "주 은혜임을", "야외예배 안내", "window.print"]:
        assert needle in html, f"주보에 '{needle}' 누락"
    Path("output/test_sample.html").write_text(html, encoding="utf-8")
    print(f"✓ 주보 OK — {len(html)} chars")


if __name__ == "__main__":
    Path("output").mkdir(exist_ok=True)
    test_split()
    test_ppt()
    test_bulletin()
    print("\n모든 테스트 통과 ✓")
