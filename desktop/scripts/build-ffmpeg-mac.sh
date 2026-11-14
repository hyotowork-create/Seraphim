#!/bin/zsh
# macOS용 최소 FFmpeg 빌드 (LGPL, 외부 라이브러리 없음 — VideoToolbox H.264 인코더 + SecureTransport TLS)
# 재배포 가능한 라이선스로 앱에 넣기 위해 직접 빌드한다 (ffmpeg-static의 mac 빌드는 --enable-nonfree라 재배포 불가).
# 인텔(x64)은 nasm 필요(brew install nasm).
# 사용: scripts/build-ffmpeg-mac.sh [arm64|x64]  → vendor/ffmpeg/darwin-<arch>/ffmpeg (생략하면 이 맥의 아키텍처, x64는 Apple Silicon에서 교차 빌드)
set -euo pipefail
VER=7.1.1
ROOT=${0:A:h:h}
WORK=$(mktemp -d)
OUTARCH=${1:-$(uname -m | sed s/x86_64/x64/)}   # electron-builder ${arch} 이름: arm64 | x64
ARCH=${OUTARCH/x64/x86_64}                        # clang·configure 이름: arm64 | x86_64
cd $WORK
curl -sSLf -o ffmpeg.tar.xz https://ffmpeg.org/releases/ffmpeg-$VER.tar.xz
tar xf ffmpeg.tar.xz && cd ffmpeg-$VER
# hevc 디코더는 h264 디코더가 참조하는 aom_film_grain 객체를 끌어오기 위해 포함 (7.1 --disable-everything 링크 오류 회피)
./configure --arch=$ARCH --cc="clang -arch $ARCH" --enable-cross-compile --target-os=darwin \
  --disable-everything --disable-autodetect --disable-doc --disable-ffplay --disable-ffprobe --disable-debug \
  --enable-pthreads --enable-videotoolbox --enable-audiotoolbox --enable-securetransport --enable-network \
  --enable-avfilter --enable-swscale --enable-swresample \
  --enable-demuxer=matroska,mov,flv --enable-muxer=flv,mp4,mov,tee,matroska,null \
  --enable-decoder=h264,hevc,vp8,vp9,opus,aac,pcm_s16le,pcm_f32le \
  --enable-encoder=h264_videotoolbox,aac,pcm_s16le \
  --enable-parser=h264,vp8,vp9,opus,aac \
  --enable-bsf=h264_mp4toannexb,extract_extradata,aac_adtstoasc,dump_extradata \
  --enable-protocol=pipe,file,tcp,tls,rtmp,rtmps \
  --enable-filter=fps,scale,pad,format,aformat,aresample,setsar,null,anull,copy,acopy,asetpts,setpts \
  --extra-cflags="-mmacosx-version-min=11.0" --extra-ldflags="-mmacosx-version-min=11.0"
make -j$(sysctl -n hw.ncpu)
OUT=$ROOT/vendor/ffmpeg/darwin-$OUTARCH
mkdir -p $OUT && cp ffmpeg $OUT/ffmpeg && chmod 755 $OUT/ffmpeg
lipo -archs ffmpeg
echo "saved: $OUT/ffmpeg"
rm -rf $WORK
