@echo off
chcp 65001 >nul
title 교회 주보 홈페이지
cd /d "%~dp0"

REM ── 이미 켜져 있으면 브라우저만 열고 끝 ──
curl -s -o nul --max-time 2 http://localhost:8080/ 2>nul
if not errorlevel 1 (
  echo 이미 실행 중입니다. 브라우저를 엽니다...
  start "" http://localhost:8080/
  timeout /t 2 >nul
  exit /b
)

REM ── Node.js 설치 여부 확인 ──
where node >nul 2>nul
if errorlevel 1 goto NONODE

REM ── 처음이면 필요한 파일 자동 준비 ──
if not exist "node_modules" (
  echo.
  echo [처음 준비] 필요한 파일을 내려받는 중입니다. 1~3분 걸릴 수 있어요.
  echo            이 검은 창을 닫지 말고 잠시 기다려 주세요...
  echo.
  call npm install
  if errorlevel 1 goto NPMERR
)

echo.
echo ============================================================
echo    교회 주보 홈페이지가 실행 중입니다.
echo.
echo    * 주보 보기   : http://localhost:8080
echo    * 주보 만들기 : '주보 만들기' 파일을 더블클릭하세요
echo.
echo    [중요] 이 검은 창을 닫으면 홈페이지가 꺼집니다.
echo           다 쓰신 뒤에 창을 닫으세요.
echo ============================================================
echo.

REM ── 5초 뒤 브라우저 자동 열기 (서버가 뜨는 시간 확보) ──
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 5; Start-Process 'http://localhost:8080/'"

call npm start
goto END

:NONODE
echo.
echo ============================================================
echo   [처음 한 번만 하면 됩니다]
echo   이 홈페이지를 실행하려면 'Node.js' 라는 무료 프로그램이 필요합니다.
echo.
echo    1) 잠시 후 열리는 페이지에서 초록색 'LTS' 버튼을 눌러 내려받으세요.
echo    2) 내려받은 파일을 더블클릭해 '다음-다음-완료' 로 설치하세요.
echo    3) 설치가 끝나면 이 '주보 시작하기' 파일을 다시 더블클릭하세요.
echo ============================================================
echo.
pause
start "" https://nodejs.org/ko
goto END

:NPMERR
echo.
echo [문제 발생] 준비 중 오류가 났습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.
echo.
pause

:END
