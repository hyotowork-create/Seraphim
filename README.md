# Seraphim — 교회 방송실 업무 자동화

찬양 가사·설교 본문·광고 내용을 입력하면 **세련된 찬양/설교/광고 PPT**와
**HTML 기반 주보**를 자동으로 만들어 주는 로컬 웹앱입니다.
별도 서버 없이 PC에서 실행하며, **단일 EXE 파일**로 패키징할 수 있습니다.

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 🎬 찬양 PPT | 곡별 표지 + 가사 슬라이드 자동 생성. 빈 줄로 절(슬라이드)을 구분 |
| 📖 설교 슬라이드 | 설교 제목·본문·설교자 표지 슬라이드 |
| 📢 광고 슬라이드 | 입력한 광고 내용을 항목별 슬라이드로 생성 |
| 📄 HTML 주보 | 제목·본문·찬양·광고가 채워진 인쇄용 A4 주보 (PDF 저장 가능) |
| 🎨 디자인 테마 | 미드나잇 블루·그래파이트·로열 퍼플·딥 포레스트·아이보리 5종 |
| 👀 실시간 미리보기 | 입력하면서 주보를 바로 확인 |

PPT는 16:9 와이드, 큰 중앙 정렬 가사, 그라데이션 배경으로
무대 스크린에 바로 띄울 수 있는 깔끔한 디자인입니다.

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
├── build_exe.py            # PyInstaller EXE 빌드 스크립트
├── requirements.txt
├── test_pipeline.py        # 생성 파이프라인 스모크 테스트
├── seraphim/
│   ├── themes.py           # 디자인 테마 정의
│   ├── ppt_generator.py    # 찬양/설교/광고 PPT 생성 (python-pptx)
│   └── bulletin.py         # HTML 주보 생성 (Jinja2)
├── templates/
│   ├── index.html          # 입력 UI
│   └── bulletin_template.html
├── static/
│   ├── css/style.css
│   └── js/app.js
└── output/                 # 생성된 PPT·주보 저장 폴더
```

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
