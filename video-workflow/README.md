# 🎬 영상 생성 워크플로우 (병렬 이미지 → HappyHorse 클립 → 60초 합본)

스크린샷 결과를 **재현 가능한 형태**로 정리한 3단계 파이프라인입니다.
독립적으로 동작하며, 소재만 바꾸면 어떤 영상에도 재사용할 수 있습니다.

```
[STAGE 1]  이미지 19장 (9단계 × 시작·끝 프레임 + 예비 1)   ← 병렬 생성
     │
     ▼
[STAGE 2]  HappyHorse 1.1 클립 9개 (720P·9:16·5초·무음)   ← First/Last frame 모드
     │      검수에서 중복·불량 클립 제외
     ▼
[STAGE 3]  ffmpeg 합본 → 정확히 60.000초 MP4            ← 이 저장소에서 자동 실행 ✅
```

## 폴더 구성
| 파일/폴더 | 설명 |
|---|---|
| `01_이미지_프롬프트.md` | STAGE 1 — 19장 이미지 프롬프트(공통 스타일 + 9단계) |
| `02_해피호스_프롬프트.md` | STAGE 2 — HappyHorse 클립 9개 설정·프롬프트·검수 |
| `scripts/combine_60s.sh` | STAGE 3 — 클립을 정확히 60초로 합치는 ffmpeg 스크립트 |
| `영상_합치기.command` | STAGE 3 실행기 (Mac 더블클릭) |
| `영상_합치기.bat` | STAGE 3 실행기 (Windows 더블클릭) |
| `clips/` | HappyHorse에서 뽑은 클립을 여기 넣기 (`clip01.mp4` …) |
| `output/` | 완성된 60초 영상이 여기 생성됨 |
| `ALT_Remotion.md` | 이미지·영상 도구 없이 **코드로** 영상을 만드는 대안 경로 |

## 빠른 실행 (STAGE 3만)
1. HappyHorse로 만든 클립을 `clips/` 폴더에 `clip01.mp4, clip02.mp4 …` 로 저장
2. 아래 중 하나 실행
   - **Mac**: `영상_합치기.command` 더블클릭
   - **Windows**: `영상_합치기.bat` 더블클릭 (Git Bash 필요)
   - **터미널**: `bash scripts/combine_60s.sh`
3. `output/final_60s.mp4` 완성 (정확히 60.000초, 1080×1920, 30fps, 무음)

### 클립 개수·길이가 달라도 됩니다
스크립트가 이어붙인 뒤 자동으로 배속을 조정해 **항상 정확히 60초**로 맞춥니다.
> 검증됨: 총 45초(9클립·해상도 제각각) 입력 → 출력 60.000000초 / 1800프레임.

## 설정 바꾸기 (선택)
환경변수로 조절합니다.
```bash
TARGET_SEC=30 W=1080 H=1920 FPS=30 bash scripts/combine_60s.sh
```
| 변수 | 기본값 | 뜻 |
|---|---|---|
| `TARGET_SEC` | 60 | 목표 길이(초) |
| `W` × `H` | 1080×1920 | 해상도(9:16 세로) |
| `FPS` | 30 | 프레임레이트 |

## 필요 도구
- **ffmpeg / ffprobe** (STAGE 3)
  - Mac: `brew install ffmpeg`
  - Windows: `winget install Gyan.FFmpeg`
- STAGE 1·2는 각각 이미지 생성 도구 / HappyHorse(크롬 플러그인)에서 진행합니다.
