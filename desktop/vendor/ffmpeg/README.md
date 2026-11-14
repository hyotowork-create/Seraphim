# ffmpeg (YouTube 라이브 송출·녹화용)

바이너리는 git에 넣지 않는다. 빌드 전에 한 번 준비한다.

| 폴더 | 만드는 법 | 라이선스 |
| --- | --- | --- |
| `darwin-arm64/ffmpeg` | `scripts/build-ffmpeg-mac.sh` (FFmpeg 7.1.1 소스 → 최소 구성 빌드, 약 7 MB) | LGPL 2.1+ — 외부 라이브러리 없음. H.264는 macOS VideoToolbox, TLS는 SecureTransport |
| `win32-x64/ffmpeg.exe` | `node scripts/fetch-ffmpeg.mjs` (ffmpeg-static 릴리스 b6.1.1) | GPL (libx264 포함). 앱을 외부에 배포할 때는 FFmpeg 라이선스 고지와 소스 입수 경로(https://ffmpeg.org/download.html)를 함께 안내 |

빌드 시 electron-builder가 해당 플랫폼 폴더를 `Resources/ffmpeg/` 로 복사한다(`electron-builder.yml`의 mac/win `extraResources`).
ffmpeg-static의 macOS 빌드는 `--enable-nonfree`라 "재배포 불가"로 표시되므로 쓰지 않는다.
