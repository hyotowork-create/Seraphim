#!/bin/bash
# STAGE 3 실행 (Mac용). 이 파일을 더블클릭하세요.
# clips/ 폴더의 클립들을 정확히 60초 세로 영상으로 합칩니다.
cd "$(dirname "$0")" || exit 1

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "❌ ffmpeg 가 없습니다. 터미널에서 아래를 실행해 설치하세요:"
  echo "      brew install ffmpeg"
  echo ""
  read -n 1 -s -r -p "아무 키나 누르면 닫힙니다..."
  exit 1
fi

bash "scripts/combine_60s.sh"
echo ""
echo "결과 파일은 output/ 폴더에 있습니다."
read -n 1 -s -r -p "아무 키나 누르면 닫힙니다..."
