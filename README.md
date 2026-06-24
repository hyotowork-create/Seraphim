# Seraphim — 교회 방송실 업무 자동화

교회 방송실의 반복 업무를 한 화면에서 자동화하는 로컬 웹앱입니다.
**① 주보·PPT 제작**과 **② 설교 영상 쇼츠·요약**을 한 앱에 통합했고,
별도 서버 없이 PC에서 실행하며 **단일 EXE 파일**로 패키징할 수 있습니다.

> 이 프로젝트는 기존 *Seraphim*(주보·PPT)에 *ShortsForge*(영상 숏폼 자동화)를
> 교회용으로 재해석해 병합한 통합본입니다. 두 기능은 상단 탭으로 전환합니다.

---

## ✨ 기능 1 — 주보 · PPT 제작 (탭: 📄 주보·PPT)

| 기능 | 설명 |
|------|------|
| 🎵 찬양 PPT | 곡별 표지 + 가사 슬라이드 자동 생성. 빈 줄로 절(슬라이드)을 구분 |
| 📖 설교 슬라이드 | 설교 제목·본문·설교자 표지 슬라이드 |
| 📢 광고 슬라이드 | 입력한 광고 내용을 항목별 슬라이드로 생성 |
| 📄 HTML 주보 | 제목·본문·찬양·광고가 채워진 인쇄용 A4 주보 (PDF 저장 가능) |
| 🎨 디자인 테마 | 미드나잇 블루·그래파이트·로열 퍼플·딥 포레스트·아이보리 5종 |
| 👀 실시간 미리보기 | 입력하면서 주보를 바로 확인 |

PPT는 16:9 와이드, 큰 중앙 정렬 가사, 그라데이션 배경으로
무대 스크린에 바로 띄울 수 있는 깔끔한 디자인입니다.
**이 기능은 추가 설정 없이 EXE 더블클릭만으로 바로 동작합니다.**

---

## 🎬 기능 2 — 설교 영상 쇼츠 · 요약 (탭: 🎬 설교 영상)

방송실 PC에 저장된 설교/예배 영상 파일의 **로컬 경로**를 입력하면,
백그라운드에서 자동으로 처리합니다. (영상은 업로드하지 않고 경로만 참조)

| 기능 | 설명 |
|------|------|
| 🔥 설교 하이라이트 쇼츠 | STT(자막추출) → AI가 은혜로운 핵심 15~60초 구간 선별 → 9:16 세로영상 + 한글 자막 번인 + 하단밴드(교회명·설교제목)로 인코딩. 전도·SNS 용 |
| 📄 설교 요약 PDF | 설교 대본을 분석해 말씀 요지·핵심 성경구절·삶의 적용이 담긴 성도 배포용 핸드아웃 PDF 생성 |
| ♻️ 대본 캐시 | STT 결과를 캐시 → 쇼츠와 요약이 한 번의 STT 를 공유, 옵션 바꿔 재실행해도 STT 생략 |
| 🔔 진행 알림 | 화면 로그로 실시간 표시. Slack 토큰을 설정하면 Slack 스레드로도 전송(선택) |

### 설교 영상 기능을 쓰려면 (선택 설치)

이 기능은 무거운 의존성이 필요해 **별도 설치 시에만 활성화**됩니다.
설치하지 않아도 주보·PPT 기능에는 전혀 영향이 없습니다.

1. **Python 패키지**: `pip install -r requirements-video.txt`
2. **ffmpeg/ffprobe** 실행파일 설치 후 PATH 등록
   - Windows: `winget install Gyan.FFmpeg` 또는 [gyan.dev](https://www.gyan.dev/ffmpeg/builds/)
3. **API 키**: `.env.example` 을 `.env` 로 복사 후 키 입력
   - `GEMINI_API_KEY`(권장, 무료 티어 가능) 또는 `OPENAI_API_KEY` 중 하나 이상
   - (선택) `SLACK_BOT_TOKEN` — 진행 알림을 Slack 으로도 받을 때

설교 영상 탭 상단의 상태 배너가 무엇이 설치/미설치인지 알려줍니다.
STT는 **로컬(A/B/C, 무료)** 과 **클라우드(OpenAI, 유료·빠름)** 중 선택할 수 있어,
인터넷·비용 없이 로컬에서만 자막을 뽑을 수도 있습니다.

> EXE 기본 빌드에는 영상 의존성이 포함되지 않습니다(모델 가중치가 수 GB).
> 영상 기능은 `python app.py` 로 실행하거나, `SERAPHIM_BUNDLE_VIDEO=1` 풀빌드를 사용하세요.

---

## 🖥 실행 방법

### 방법 A. EXE로 실행 (방송실 PC 권장)

1. 아래 "EXE 빌드"로 만든 `Seraphim.exe`를 더블클릭
2. 잠시 후 기본 브라우저가 자동으로 열립니다
3. 정보를 입력하고 **PPT / 주보 다운로드** 버튼 클릭
4. 종료할 때는 까만 콘솔 창을 닫으면 됩니다

> 생성된 파일은 다운로드 폴더와 EXE 옆 `output/` 폴더 양쪽에 저장됩니다.

### 방법 B. Python으로 실행 (개발/테스트)

```bash
pip install -r requirements.txt
python app.py
```

→ 자동으로 `http://127.0.0.1:5000/` 이 열립니다.

---

## 📦 EXE 빌드 (Windows)

Windows PC에서 다음을 실행하면 `dist/Seraphim.exe`가 생성됩니다.

```bash
pip install -r requirements.txt
python build_exe.py
```

- `--onefile` 옵션으로 단일 실행 파일이 만들어집니다.
- `templates/`, `static/` 리소스와 `python-pptx` 데이터가 모두 번들됩니다.
- 콘솔 창을 숨기려면 `build_exe.py`의 `--console`을 `--noconsole`로 바꾸세요.

> EXE는 빌드한 OS에서만 동작합니다. Windows용 EXE는 Windows에서 빌드해야 합니다.

---

## 🗂 프로젝트 구조

```
Seraphim/
├── app.py                  # Flask 서버 + EXE 진입점(브라우저 자동 실행)
├── build_exe.py            # PyInstaller EXE 빌드 스크립트(코어/풀빌드)
├── requirements.txt        # 코어 + 영상(선택) 의존성
├── requirements-video.txt  # 설교 영상 기능 전용 의존성
├── .env.example            # 영상 기능용 API 키 템플릿
├── test_pipeline.py        # 전체 스모크 테스트
├── seraphim/
│   ├── themes.py           # 디자인 테마 정의
│   ├── ppt_generator.py    # 찬양/설교/광고 PPT 생성 (python-pptx)
│   ├── bulletin.py         # HTML 주보 생성 (Jinja2)
│   ├── config.py           # .env 기반 설정 (영상 기능)
│   ├── jobs.py             # 백그라운드 작업 큐 + 진행상황 폴링
│   └── sermon_video.py     # 설교 영상 → 쇼츠·요약 파이프라인
├── templates/
│   ├── index.html          # 탭형 입력 UI (주보·PPT / 설교 영상)
│   └── bulletin_template.html
├── static/
│   ├── css/style.css
│   └── js/app.js
├── samples/                # 앱으로 생성한 결과물 샘플
└── output/                 # 생성된 PPT·주보 저장 폴더
```

설교 영상의 결과물(쇼츠·요약 PDF)은 **입력한 영상 파일과 같은 폴더**의
`shorts_output/`, `summary_output/` 하위에 저장됩니다.

---

## 🧪 테스트

```bash
python test_pipeline.py
```

가사 분할, PPT 슬라이드 생성, 주보 HTML 렌더링을 한 번에 검증합니다.

---

## 💡 사용 팁

- **가사 입력**: 절과 절 사이를 **빈 줄**로 띄우면 슬라이드가 깔끔하게 나뉩니다.
  빈 줄이 없으면 4줄 단위로 자동 분할됩니다.
- **광고 내용**: 한 줄에 한 항목씩 입력하면 PPT·주보 모두 항목별로 정리됩니다.
- **주보 PDF**: 미리보기/다운로드한 주보를 브라우저에서 인쇄(Ctrl+P) →
  "PDF로 저장"을 선택하면 됩니다.
- **설교 영상 경로**: 탐색기에서 영상 파일을 `Shift+우클릭 → 경로로 복사` 한 값을
  그대로 붙여넣으면 됩니다(양끝 따옴표·역슬래시 자동 처리).
- **긴 설교 영상**: STT는 로컬 `A(medium)` 가 균형이 좋습니다. 처음 1회만 자막을
  추출하면 캐시되어, 쇼츠·요약을 이어서 만들 때는 STT가 생략됩니다.
