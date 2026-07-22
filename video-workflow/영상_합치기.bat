@echo off
chcp 65001 >nul
title 영상 합치기 (60초)
cd /d "%~dp0"

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo.
  echo  ❌ ffmpeg 가 없습니다. 아래 명령으로 설치한 뒤 다시 실행하세요:
  echo        winget install Gyan.FFmpeg
  echo.
  pause
  exit /b 1
)

REM Windows 에서는 Git Bash 가 있으면 bash 로, 없으면 안내
where bash >nul 2>nul
if errorlevel 1 (
  echo.
  echo  이 스크립트는 Git Bash 가 필요합니다. https://git-scm.com 에서 설치 후 다시 실행하세요.
  echo.
  pause
  exit /b 1
)

bash "scripts/combine_60s.sh"
echo.
echo  결과 파일은 output 폴더에 있습니다.
pause
