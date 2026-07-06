#!/bin/bash
# 주보 만들기 화면(/admin) 열기 (맥용). 이 파일을 더블클릭하세요.
cd "$(dirname "$0")" || exit 1

if curl -s -o /dev/null --max-time 2 http://localhost:8080/ 2>/dev/null; then
  echo "주보 만들기 화면을 엽니다..."
  open "http://localhost:8080/admin/"
  exit 0
fi

echo ""
echo "============================================================"
echo "  홈페이지가 아직 꺼져 있습니다."
echo "  먼저 '주보 시작하기' 파일을 더블클릭해 켠 다음,"
echo "  이 '주보 만들기' 파일을 다시 더블클릭하세요."
echo "============================================================"
echo ""
read -n 1 -s -r -p "아무 키나 누르면 닫힙니다..."
