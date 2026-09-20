#!/bin/bash
# macOS: 더블클릭으로 Seraphim 실행
cd "$(dirname "$0")" || exit 1

echo "============================================"
echo "  Seraphim - 예배 송출 프로그램 실행"
echo "============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[필요] Node.js가 설치되어 있지 않습니다."
  echo "   https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요."
  echo
  read -r -p "엔터를 누르면 종료합니다..." _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[처음 1회] 필요한 파일을 설치합니다. 인터넷이 필요하며 몇 분 걸립니다..."
  npm install || { echo "설치 실패. 인터넷 연결을 확인하세요."; read -r _; exit 1; }
  echo "[처음 1회] 데이터베이스 모듈을 준비합니다..."
  npm run rebuild
fi

echo
echo "Seraphim 을 시작합니다. (이 터미널 창은 닫지 마세요)"
echo
npm run dev
