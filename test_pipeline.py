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


def test_video_module_imports():
    """설교 영상 모듈이 무거운 의존성 없이도 import·기본동작 하는지 확인."""
    from seraphim import sermon_video, jobs, config  # noqa: F401
    assert sermon_video.resolve_stt("A") == ("local", "medium")
    assert sermon_video.resolve_stt("CLOUD") == ("openai", "whisper-1")
    # 18자 그리드 규칙
    assert sermon_video._two_lines("가나다라마바사아자차카타파") [0]
    status = sermon_video.video_feature_status()
    assert "python_packages_ok" in status and "ffmpeg_ok" in status
    print("✓ 설교 영상 모듈 import/기본동작 OK")


def test_job_manager():
    """백그라운드 작업 제출 → 상태/로그 수집이 동작하는지."""
    import time
    from seraphim.jobs import manager

    def work(job, x):
        job.log(f"입력 {x}")
        return {"doubled": x * 2}

    job = manager.submit("test", work, 21)
    for _ in range(50):
        if job.status in ("done", "error"):
            break
        time.sleep(0.05)
    assert job.status == "done", job.to_dict()
    assert job.result == {"doubled": 42}
    print("✓ JobManager OK")


def test_plans_gating():
    """무료/구독 모드에서 기능 게이팅이 올바른지."""
    import importlib
    import seraphim.plans as plans

    # free_launch: 전 기능 개방
    plans.BILLING_MODE = "free_launch"
    assert plans.is_allowed(plans.FEATURE_SHORTS)
    assert plans.is_allowed(plans.FEATURE_BULLETIN)
    st = plans.plan_state()
    assert st["features"]["shorts"]["allowed"] is True

    # subscription + 로그인 없음(free): 영상 잠금, 주보·PPT 개방
    plans.BILLING_MODE = "subscription"
    assert plans.is_allowed(plans.FEATURE_BULLETIN)
    assert not plans.is_allowed(plans.FEATURE_SHORTS)
    assert not plans.is_allowed(plans.FEATURE_SUMMARY)

    # subscription + pro 사용자: 전부 개방
    pro = {"plan": "pro"}
    assert plans.is_allowed(plans.FEATURE_SHORTS, pro)

    importlib.reload(plans)  # 모드 원복(기본 free_launch)
    print("✓ 요금제 게이팅 OK")


if __name__ == "__main__":
    Path("output").mkdir(exist_ok=True)
    test_split()
    test_ppt()
    test_bulletin()
    test_video_module_imports()
    test_job_manager()
    test_plans_gating()
    print("\n모든 테스트 통과 ✓")
