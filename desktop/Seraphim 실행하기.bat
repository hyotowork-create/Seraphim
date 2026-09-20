@echo off
chcp 65001 >nul
title Seraphim 실행
cd /d "%~dp0"

echo ============================================
echo   Seraphim - 예배 송출 프로그램 실행
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [필요] Node.js가 설치되어 있지 않습니다.
  echo    https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [처음 1회] 필요한 파일을 설치합니다. 인터넷이 필요하며 몇 분 걸립니다...
  call npm install
  if errorlevel 1 ( echo 설치 실패. 인터넷 연결을 확인하세요. & pause & exit /b 1 )
  echo [처음 1회] 데이터베이스 모듈을 준비합니다...
  call npm run rebuild
)

echo.
echo Seraphim 을 시작합니다. (이 검은 창은 닫지 마세요)
echo 운영자 창이 뜨면 사용하시면 됩니다.
echo.
call npm run dev

pause
