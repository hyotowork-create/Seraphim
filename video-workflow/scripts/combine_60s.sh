#!/usr/bin/env bash
# =============================================================================
# STAGE 3 — 클립들을 이어붙여 "정확히 60.000초" 세로 영상으로 만드는 스크립트
# =============================================================================
# HappyHorse(또는 다른 도구)로 뽑은 클립들을 clips/ 폴더에 넣고 이 스크립트를
# 실행하면, 클립 개수·길이가 제각각이어도 항상 정확히 60.000초짜리 MP4 한 개로
# 합쳐집니다.
#
# 사용법:
#   ./combine_60s.sh                      # ../clips 안의 클립을 ../output/final_60s.mp4 로
#   ./combine_60s.sh /경로/클립폴더        # 클립 폴더 직접 지정
#   ./combine_60s.sh /경로/클립폴더 out.mp4 # 결과 파일명까지 지정
#
# 환경변수로 조절 가능(선택):
#   TARGET_SEC(기본 60)  W(기본 1080)  H(기본 1920)  FPS(기본 30)
# =============================================================================
set -euo pipefail

# ── 프로젝트 루트로 이동 (이 스크립트는 scripts/ 안에 있음) ───────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# ── 설정값 ───────────────────────────────────────────────────────────────────
TARGET_SEC="${TARGET_SEC:-60}"        # 목표 길이(초)
W="${W:-1080}"                        # 가로 (9:16 세로영상 기준 1080x1920)
H="${H:-1920}"                        # 세로
FPS="${FPS:-30}"                      # 프레임레이트
CLIPS_DIR="${1:-$ROOT_DIR/clips}"     # 클립 폴더
OUT="${2:-$ROOT_DIR/output/final_60s.mp4}"
WORK="$ROOT_DIR/output/_normalized.mp4"

# ── 준비 확인 ────────────────────────────────────────────────────────────────
command -v ffmpeg  >/dev/null || { echo "❌ ffmpeg 가 설치되어 있지 않습니다. (Mac: brew install ffmpeg / Win: winget install ffmpeg)"; exit 1; }
command -v ffprobe >/dev/null || { echo "❌ ffprobe 가 설치되어 있지 않습니다."; exit 1; }
[ -d "$CLIPS_DIR" ] || { echo "❌ 클립 폴더가 없습니다: $CLIPS_DIR"; exit 1; }

# ── 클립 목록 수집 (자연순 정렬: clip1, clip2, ... clip10) ────────────────────
mapfile -t CLIPS < <(find "$CLIPS_DIR" -maxdepth 1 -type f \
  \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.m4v' -o -iname '*.webm' -o -iname '*.mkv' \) \
  | sort -V)
N="${#CLIPS[@]}"
[ "$N" -gt 0 ] || { echo "❌ 클립 폴더에 영상 파일이 없습니다: $CLIPS_DIR"; exit 1; }

echo "🎬 클립 ${N}개를 찾았습니다:"
for c in "${CLIPS[@]}"; do echo "   - $(basename "$c")"; done
mkdir -p "$(dirname "$OUT")"

# ── 1단계: 모든 클립을 동일 규격으로 정규화하며 이어붙이기 ────────────────────
#   (해상도·프레임레이트·화면비가 서로 달라도 안전하게 합쳐지도록 맞춤)
inputs=(); filter=""
for i in "${!CLIPS[@]}"; do
  inputs+=(-i "${CLIPS[$i]}")
  filter+="[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,"
  filter+="pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FPS}[v${i}];"
done
for i in "${!CLIPS[@]}"; do filter+="[v${i}]"; done
filter+="concat=n=${N}:v=1:a=0[outv]"

echo "🧩 클립을 이어붙이는 중..."
ffmpeg -y -loglevel error "${inputs[@]}" \
  -filter_complex "$filter" -map "[outv]" \
  -c:v libx264 -pix_fmt yuv420p -an "$WORK"

# ── 2단계: 이어붙인 길이를 재서, 정확히 TARGET_SEC 초로 리타이밍 ──────────────
RAW="$(ffprobe -v error -select_streams v:0 -show_entries format=duration \
       -of default=noprint_wrappers=1:nokey=1 "$WORK")"
FACTOR="$(awk -v t="$RAW" -v g="$TARGET_SEC" 'BEGIN{printf "%.9f", g/t}')"
echo "⏱  이어붙인 길이 ${RAW}s → ${TARGET_SEC}s 로 배속 조정 (배율 ${FACTOR})"

ffmpeg -y -loglevel error -i "$WORK" \
  -filter:v "setpts=${FACTOR}*PTS,fps=${FPS}" \
  -t "$TARGET_SEC" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an "$OUT"

rm -f "$WORK"

# ── 결과 확인 ────────────────────────────────────────────────────────────────
FINAL="$(ffprobe -v error -show_entries format=duration \
         -of default=noprint_wrappers=1:nokey=1 "$OUT")"
echo ""
echo "✅ 완성: $OUT"
printf "   최종 길이: %.3f초 (목표 %s초)\n" "$FINAL" "$TARGET_SEC"
echo "   규격: ${W}x${H}, ${FPS}fps, 무음(H.264/MP4)"
