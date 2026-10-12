# 제3자 구성요소 고지 (Third-Party Notices)

Seraphim 자체 코드는 MIT 라이선스입니다(`LICENSE`). 설치 파일에는 아래 구성요소가 함께 들어 있으며, 각자의 라이선스를 따릅니다.

## FFmpeg — YouTube 라이브 송출·녹화용 (별도 실행 파일)
앱은 FFmpeg를 별도 프로그램(`Resources/ffmpeg/`)으로 실행할 뿐, 코드에 연결(link)하지 않습니다.

| 설치 파일 | 들어 있는 FFmpeg | 라이선스 | 소스 |
|---|---|---|---|
| macOS (`.dmg`) | FFmpeg 7.1.1(수정 없음), 외부 라이브러리 없는 최소 구성(VideoToolbox·SecureTransport) | LGPL 2.1 이상 | 소스: https://ffmpeg.org/releases/ffmpeg-7.1.1.tar.xz · 빌드 설정은 아래 |
| Windows (`.exe`) | FFmpeg 6.1.1 정적 빌드(ffmpeg-static 릴리스 b6.1.1, gyan.dev 빌드 기반, libx264·libx265 등 포함) | **GPL 3.0** (`--enable-gpl --enable-version3`) | FFmpeg 소스: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz · 빌드 출처와 포함 라이브러리 목록: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1, https://www.gyan.dev/ffmpeg/builds/ · x264: https://code.videolan.org/videolan/x264 · x265: https://bitbucket.org/multicoreware/x265_git |

- macOS용 빌드 설정(소스 그대로, 이 옵션으로 `./configure && make`):
  ```
  --arch=arm64 --cc=clang --disable-everything --disable-autodetect --disable-doc --disable-ffplay --disable-ffprobe --disable-debug
  --enable-pthreads --enable-videotoolbox --enable-audiotoolbox --enable-securetransport --enable-network
  --enable-avfilter --enable-swscale --enable-swresample
  --enable-demuxer=matroska,mov,flv --enable-muxer=flv,mp4,mov,tee,matroska,null
  --enable-decoder=h264,hevc,vp8,vp9,opus,aac,pcm_s16le,pcm_f32le --enable-encoder=h264_videotoolbox,aac,pcm_s16le
  --enable-parser=h264,vp8,vp9,opus,aac --enable-bsf=h264_mp4toannexb,extract_extradata,aac_adtstoasc,dump_extradata
  --enable-protocol=pipe,file,tcp,tls,rtmp,rtmps
  --enable-filter=fps,scale,pad,format,aformat,aresample,setsar,null,anull,copy,acopy,asetpts,setpts
  --extra-cflags=-mmacosx-version-min=11.0 --extra-ldflags=-mmacosx-version-min=11.0
  ```
- FFmpeg는 FFmpeg 개발자들의 저작물입니다. https://ffmpeg.org/legal.html
- 라이선스 전문: LGPL 2.1 https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html · GPL 3.0 https://www.gnu.org/licenses/gpl-3.0.html
- 위 주소에서 소스를 받을 수 없으면 저장소 이슈(https://github.com/hyotowork-create/Seraphim/issues)로 요청해 주세요. 배포한 바이너리에 대응하는 소스를 제공합니다.

## Electron / Chromium
MIT(Electron) 및 Chromium 구성요소 라이선스. 설치된 앱 폴더의 `LICENSE.electron.txt`, `LICENSES.chromium.html`에 전문이 있습니다.

## Tesseract OCR 언어 데이터 (`kor`, `eng` — tessdata_fast)
Apache License 2.0. https://github.com/tesseract-ocr/tessdata_fast

## 성경 본문 — 개역한글판(1961, 대한성서공회)
저작재산권 보호기간 만료(2011년 말). 본문은 고치지 않고 그대로 싣습니다. 정리본 출처: https://github.com/Wonseong620/bible-krv

## 그 밖의 npm 패키지
각 패키지의 라이선스를 따릅니다(대부분 MIT·ISC·BSD·Apache 2.0).
