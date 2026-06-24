"""요금제(플랜) · 기능 게이팅 레이어.

비즈니스 로드맵:
  - 출시 초기: 전 기능 **무료 공개**(BILLING_MODE=free_launch)
  - 이후: **월 구독제**로 전환(BILLING_MODE=subscription) — 주보·PPT 는 무료,
    설교 영상(쇼츠·요약)은 유료(Pro) 플랜에서만 허용

설계 의도:
  지금은 모든 기능을 열어두되(무료), 나중에 환경변수 BILLING_MODE 만 바꾸고
  사용자 플랜(인증/결제 연동)만 끼우면 유료 잠금이 켜지도록 **추상화**한다.
  → 출시 후 구독제 전환이 "코드 재작성"이 아니라 "플래그 전환"이 되게 함.
"""

from __future__ import annotations

import os

# ── 기능 키 ────────────────────────────────────────────────────────────
FEATURE_BULLETIN = "bulletin"   # 주보
FEATURE_PPT = "ppt"             # 찬양/설교/광고 PPT
FEATURE_SHORTS = "shorts"       # 설교 하이라이트 쇼츠
FEATURE_SUMMARY = "summary"     # 설교 요약 PDF

# 사용자에게 보여줄 메타
FEATURES = {
    FEATURE_BULLETIN: {"name": "주보 제작", "icon": "📄"},
    FEATURE_PPT: {"name": "찬양·설교·광고 PPT", "icon": "🎵"},
    FEATURE_SHORTS: {"name": "설교 하이라이트 쇼츠", "icon": "🔥"},
    FEATURE_SUMMARY: {"name": "설교 요약 PDF", "icon": "📝"},
}

# ── 플랜 정의 ──────────────────────────────────────────────────────────
PLANS = {
    "free": {
        "key": "free",
        "name": "무료",
        "price_krw": 0,
        "period": "month",
        "features": [FEATURE_BULLETIN, FEATURE_PPT],
        "blurb": "주보와 찬양·설교·광고 PPT를 무제한으로 제작",
    },
    "pro": {
        # 가격은 잠정값(placeholder). 출시 전 확정 필요.
        "key": "pro",
        "name": "프로",
        "price_krw": 9900,
        "period": "month",
        "features": [FEATURE_BULLETIN, FEATURE_PPT, FEATURE_SHORTS, FEATURE_SUMMARY],
        "blurb": "무료 기능 + 설교 영상 하이라이트 쇼츠·요약 PDF 자동 생성",
    },
}

# 각 기능이 요구하는 최소 플랜
FEATURE_MIN_PLAN = {
    FEATURE_BULLETIN: "free",
    FEATURE_PPT: "free",
    FEATURE_SHORTS: "pro",
    FEATURE_SUMMARY: "pro",
}

# ── 과금 모드 ──────────────────────────────────────────────────────────
# free_launch: 출시 초기. 모든 기능을 무료로 개방(잠금 없음).
# subscription: 구독제. 사용자 플랜에 따라 유료 기능 잠금.
BILLING_MODE = os.environ.get("BILLING_MODE", "free_launch")


def _resolve_user_plan(user: dict | None) -> str:
    """현재 사용자의 플랜 키를 결정.

    free_launch 모드: 항상 'pro' 권한으로 취급(전 기능 개방, 단 라벨은 '무료 공개').
    subscription 모드: 인증/결제에서 넘어온 user['plan'] 사용(없으면 free).
    (인증·결제 연동 전까지는 user 가 None → free.)
    """
    if BILLING_MODE == "free_launch":
        return "pro"
    if user and user.get("plan") in PLANS:
        return user["plan"]
    return "free"


def entitlements(user: dict | None = None) -> set[str]:
    """현재 사용자가 사용할 수 있는 기능 키 집합."""
    plan = _resolve_user_plan(user)
    return set(PLANS[plan]["features"])


def is_allowed(feature: str, user: dict | None = None) -> bool:
    return feature in entitlements(user)


def plan_state(user: dict | None = None) -> dict:
    """프런트엔드용 현재 플랜/권한 상태."""
    effective = _resolve_user_plan(user)
    allowed = entitlements(user)
    # free_launch 에서는 'pro 권한이지만 무료'임을 명확히 표시
    if BILLING_MODE == "free_launch":
        badge = "무료 공개 (베타)"
    else:
        badge = PLANS[effective]["name"]
    return {
        "billing_mode": BILLING_MODE,
        "plan": effective,
        "badge": badge,
        "entitlements": sorted(allowed),
        "features": {
            k: {**meta, "min_plan": FEATURE_MIN_PLAN[k], "allowed": k in allowed}
            for k, meta in FEATURES.items()
        },
        "plans": PLANS,
    }


def upgrade_message(feature: str) -> str:
    meta = FEATURES.get(feature, {})
    return (f"‘{meta.get('name', feature)}’ 기능은 프로(구독) 플랜 전용입니다. "
            "현재는 무료 공개 기간이며, 정식 구독 전환 후에는 업그레이드가 필요합니다.")
