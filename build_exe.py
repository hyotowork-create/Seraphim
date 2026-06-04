"""Seraphim 을 단일 실행 파일(EXE)로 빌드하는 스크립트.

사용법 (Windows):
    pip install -r requirements.txt
    python build_exe.py

빌드가 끝나면 dist/Seraphim.exe 가 생성된다.
templates/ 와 static/ 폴더, jinja2 등 필요한 리소스가 모두 번들된다.

macOS/Linux 에서 실행하면 해당 OS용 실행 파일이 만들어진다.
(EXE 가 필요하면 Windows 에서 빌드해야 한다.)
"""

import PyInstaller.__main__

SEP = ";"  # Windows. macOS/Linux 는 ':' — 아래에서 자동 처리

import os
if os.name != "nt":
    SEP = ":"


PyInstaller.__main__.run([
    "app.py",
    "--name=Seraphim",
    "--onefile",
    "--noconfirm",
    "--clean",
    # 리소스 폴더 번들
    f"--add-data=templates{SEP}templates",
    f"--add-data=static{SEP}static",
    # python-pptx 가 내부적으로 쓰는 기본 템플릿 포함
    "--collect-data=pptx",
    # 콘솔 창 유지 (서버 로그 확인용). 숨기려면 --noconsole 로 변경
    "--console",
])
