@echo off
chcp 65001 >nul
title 주보 만들기
cd /d "%~dp0"

REM ── 홈페이지가 켜져 있는지 확인 ──
curl -s -o nul --max-time 2 http://localhost:8080/ 2>nul
if not errorlevel 1 (
  echo 주보 만들기 화면을 엽니다...
  start "" http://localhost:8080/admin/
  timeout /t 2 >nul
  exit /b
)

echo.
echo ============================================================
echo   홈페이지가 아직 꺼져 있습니다.
echo   먼저 '주보 시작하기' 파일을 더블클릭해 켠 다음,
echo   이 '주보 만들기' 파일을 다시 더블클릭하세요.
echo ============================================================
echo.
pause
