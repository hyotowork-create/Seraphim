#!/bin/bash
# 교회 주보 홈페이지 실행 (맥용). 이 파일을 더블클릭하세요.
cd "$(dirname "$0")" || exit 1

# ── 이미 켜져 있으면 브라우저만 열고 끝 ──
if curl -s -o /dev/null --max-time 2 http://localhost:8080/ 2>/dev/null; then
  echo "이미 실행 중입니다. 브라우저를 엽니다..."
  open "http://localhost:8080/"
  exit 0
fi

# ── Node.js 설치 여부 확인 ──
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "============================================================"
  echo "  [처음 한 번만 하면 됩니다]"
  echo "  이 홈페이지를 실행하려면 'Node.js' 무료 프로그램이 필요합니다."
  echo ""
  echo "   1) 잠시 후 열리는 페이지에서 'LTS' 버전을 내려받으세요."
  echo "   2) 내려받은 파일을 열어 안내대로 설치하세요."
  echo "   3) 설치 후 이 '주보 시작하기' 파일을 다시 더블클릭하세요."
  echo "============================================================"
  echo ""
  read -n 1 -s -r -p "아무 키나 누르면 다운로드 페이지가 열립니다..."
  open "https://nodejs.org/ko"
  exit 0
fi

# ── 처음이면 필요한 파일 자동 준비 ──
if [ ! -d node_modules ]; then
  echo ""
  echo "[처음 준비] 필요한 파일을 내려받는 중입니다. 1~3분 걸릴 수 있어요..."
  echo "           이 창을 닫지 말고 잠시 기다려 주세요."
  echo ""
  if ! npm install; then
    echo ""
    echo "[문제 발생] 준비 중 오류가 났습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요."
    read -n 1 -s -r -p "아무 키나 누르면 닫힙니다..."
    exit 1
  fi
fi

echo ""
echo "============================================================"
echo "   교회 주보 홈페이지가 실행 중입니다."
echo ""
echo "   * 주보 보기   : http://localhost:8080"
echo "   * 주보 만들기 : '주보 만들기' 파일을 더블클릭하세요"
echo ""
echo "   [중요] 이 창을 닫으면 홈페이지가 꺼집니다. 다 쓴 뒤 닫으세요."
echo "============================================================"
echo ""

# 5초 뒤 브라우저 자동 열기 (서버가 뜨는 시간 확보)
( sleep 5; open "http://localhost:8080/" ) &

npm start
