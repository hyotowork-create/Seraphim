"""Seraphim 을 단일 실행 파일(EXE)로 빌드하는 스크립트.

사용법 (Windows):
    pip install -r requirements.txt
    python build_exe.py

빌드가 끝나면 dist/Seraphim.exe 가 생성된다.
templates/ 와 static/ 폴더, jinja2 등 필요한 리소스가 모두 번들된다.

[참고] 빌드 모드
  - 기본(코어): 주보·PPT 기능만 EXE 에 포함. 가볍고 더블클릭 실행에 적합.
    설교 영상 기능(STT/쇼츠/요약)은 faster-whisper 모델이 수 GB 라 EXE 에
    번들하지 않는다 → 영상 기능은 `python app.py` 로 실행하거나, 환경변수
    SERAPHIM_BUNDLE_VIDEO=1 로 풀빌드(대용량) 한다.
  - 풀빌드: 영상 의존성까지 포함(EXE 매우 커짐). 모델 가중치는 첫 실행 시 다운로드.

macOS/Linux 에서 실행하면 해당 OS용 실행 파일이 만들어진다.
(Windows EXE 가 필요하면 Windows 에서 빌드해야 한다.)
"""

import os

import PyInstaller.__main__

SEP = ";" if os.name == "nt" else ":"
BUNDLE_VIDEO = os.environ.get("SERAPHIM_BUNDLE_VIDEO") == "1"

args = [
    "app.py",
    "--name=Seraphim",
    "--onefile",
    "--noconfirm",
    "--clean",
    f"--add-data=templates{SEP}templates",
    f"--add-data=static{SEP}static",
    "--collect-data=pptx",
    "--console",   # 서버 로그 확인용. 숨기려면 --noconsole
]

if BUNDLE_VIDEO:
    # 영상 기능까지 포함(대용량). 동적 import 를 PyInstaller 가 찾도록 명시.
    for mod in ("faster_whisper", "ffmpeg", "fpdf", "openai", "google.genai",
                "slack_sdk", "dotenv"):
        args.append(f"--hidden-import={mod}")
    args.append("--collect-data=faster_whisper")
else:
    # 코어 빌드: 영상 전용 무거운 패키지는 제외해 빌드를 가볍고 깔끔하게.
    for mod in ("faster_whisper", "torch", "ffmpeg", "openai", "google",
                "slack_sdk"):
        args.append(f"--exclude-module={mod}")

PyInstaller.__main__.run(args)
