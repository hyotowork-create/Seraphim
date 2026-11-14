# Seraphim — 인수인계 문서 (Handoff)

> 이 문서 하나로 **다른 계정/세션에서 이어서 개발**할 수 있도록 정리한 문서입니다.
> 최종 업데이트: 2026-09-22 (0.2.0 로컬 작업, 미커밋) · 브랜치 `claude/awesome-lamport-y9xdl0` (main에 병합됨)

---

## 0. 한 줄 요약

**Seraphim** = PPT를 대체하는 **교회 예배용 데스크톱 앱**. 하나의 앱에서
(1) 실시간 자막/가사 송출, (2) 악보 이미지에서 가사 추출, (3) 온라인 주보 발행을 처리.
데이터는 데이터 폴더(+상대경로) / .zip 백업으로 여러 PC에서 공유·이동 가능.

- 저장소: `hyotowork-create/Seraphim`
- 앱 위치: **`desktop/`** 하위 (저장소 루트의 Eleventy 온라인 주보 사이트는 그대로 유지)
- 기술: **Electron + React + TypeScript + Tailwind + Zustand + SQLite(better-sqlite3)**, 빌드 `electron-vite` + `electron-builder`

---

## 1. 개발 환경 / 실행

```bash
cd desktop
npm install        # 처음 1회
npm run rebuild    # 처음 1회 — better-sqlite3를 Electron ABI로 리빌드 (electron-rebuild)
npm run dev        # 개발 실행 (Control 창 → '송출 열기'로 Output 창)

npm run typecheck  # 타입 검사
npm run build      # 프로덕션 번들(out/)
npm run build:mac  # macOS .dmg (macOS에서만)
npm run build:win  # Windows NSIS 설치본 + Portable (Windows/wine에서만)
```

- 비개발자용: `desktop/Seraphim 실행하기.command`(mac) / `.bat`(win) 더블클릭 → 자동 설치 후 실행. (`desktop/실행-안내.md` 참고)
- **주의**: `better-sqlite3`는 네이티브 모듈. 의존성 변경/재설치 후 `npm run rebuild` 필요. `postinstall`에 `electron-builder install-app-deps`가 있어 대부분 자동 처리됨.

---

## 2. 아키텍처 (2-Window)

- **main** (`src/main`): 앱/창 생명주기, **송출 상태(LiveState) 단일 진실원**, SQLite, IPC 핸들러, 파일/미디어/백업/Gemini.
- **preload** (`src/preload/index.ts`): `contextBridge`로 `window.seraphim` 타입 안전 API 노출 (contextIsolation on, nodeIntegration off).
- **renderer** (`src/renderer`):
  - `index.html` → **Control Window**(운영자, `src/renderer/src/control/`)
  - `output.html` → **Output Window**(송출, `src/renderer/src/output/`)
- **shared** (`src/shared`): main/renderer 공용 순수 모듈 (IPC 계약·타입, 가사/성경/주보 유틸).

데이터 흐름: Control 조작 → `window.seraphim.setLive(patch)` → main이 LiveState 병합 → **모든 창에 브로드캐스트**(`live:state`) → Output/프리뷰가 동일 렌더.

핵심 원칙:
- **IPC 계약은 `src/shared/ipc.ts` 한 곳**에 상수(`IPC`)+타입으로 모음. 채널 추가 시: ipc.ts → main 핸들러 → preload 노출 → renderer 사용 순.
- 미디어는 **커스텀 프로토콜 `seraphim-media://local/<상대경로>`** 로 서빙(경로 탈출 차단). 데이터 폴더 기준 상대경로만 DB에 저장 → PC 바뀌어도 안 깨짐.

---

## 3. 데이터 폴더 / 이동성

- 데이터 폴더 경로는 DB에 못 넣으므로 **부트스트랩 config**(`userData/seraphim-config.json`)에 저장. (`src/main/datadir.ts`)
- 폴더 구조: `<dataDir>/seraphim.db`, `<dataDir>/media/{backgrounds,videos,logos,audio,overlays,scores,thumbs}`, `<dataDir>/exports`.
- 기본 경로: `~/Documents/SeraphimData`. 설정에서 변경 가능(구글드라이브/드롭박스 폴더 지정 시 멀티 PC 공유).
- **동시 편집 주의**: 동기화 폴더의 SQLite는 두 PC 동시 쓰기 시 충돌 위험. WAL 사용, 종료 시 checkpoint. UI에 "집에서 편집→교회에서 송출" 권장 문구.
- **.zip 백업/복원**(`src/main/backup.ts`, adm-zip): DB+미디어 전체를 zip으로 내보내기/가져오기. 설정 화면에 버튼.

---

## 4. SQLite 스키마 (`src/main/db/schema.ts`, append-only 마이그레이션)

- **v1**: `songs`, `verses`, `bible_slides`, `playlists`, `playlist_items`, `media`, `settings`, `bulletins`
- **v2**: `songs.bg_media_id` 추가 (곡별 배경)
- **v3**: `song_scores(song_id, media_id, order_index)` — 곡에 연결된 원본 악보 페이지(재검수용)
- **v4**: `songs.hymn_no` — 찬송가 장 번호(검색·중복 판별). 목록은 장 번호 순 → 제목 순
- **v5**: `bible_text(translation, book, chapter, verse, text)` + `bible_translations(code, name, bundled)` — 구절 입력으로 본문 불러오기. 앱 시작·데이터 폴더 변경 시 내장 개역한글(KRV, 31,102절)을 자동 설치
- `schema_migrations` 로 버전 관리. **기존 마이그레이션 수정 금지, 새 version 추가**.

주요 테이블 요점:
- `songs(id,title,category,favorite,subtitle,author,copyright,last_used_at,created_at,updated_at,bg_media_id)`
- `verses(id,song_id,label,order_index,text)` — 절. 송출 시 4줄(설정값) 기준 페이지 분할.
- `playlist_items(id,playlist_id,item_type,ref_id,order_index,bg_media_id,note)` — item_type: song|bible|media|blank|logo (현재 song/bible 사용)
- `bible_slides` = 한 행이 **하나의 본문(passage)**. `text`에 본문, 송출 시 절 단위 분할.
- `media(id,type,rel_path,name,thumb_rel_path,duration_ms,created_at)` — **rel_path = 데이터 폴더 기준 상대경로**
- `settings(key,value)` — 예: `render.maxLines`, `render.aspect`, `extract.method`, `seeded.playlists`, `gemini.key.enc`(safeStorage 암호화)/`gemini.key`
- `bulletins(id,service_date,church_name,service_type,data_json,playlist_id,published_url,created_at)` — data_json에 BulletinData

DAO: `db/dao.ts`(settings/media/stats), `db/songs.ts`, `db/bible.ts`, `db/playlists.ts`, `db/bulletins.ts`, 연결/마이그레이션 `db/index.ts`.

---

## 5. 구현 완료 기능 (커밋 순)

| 커밋 | 내용 |
|---|---|
| M0 `a4ec371` | 스캐폴드: 2-Window + IPC, 단축키 Space/⌫/B/L/P |
| `c1a1be5` | 배경: 이미지 + 라이브 카메라(getUserMedia) + dim |
| M1 `bfbaa75` | SQLite + 마이그레이션, 데이터 폴더 지정, 미디어 상대경로(seraphim-media://) |
| M2 `a67ca49` | 곡/가사 저장(빈 줄 절 자동분할), 라이브러리(카테고리·검색·즐겨찾기·최근), 슬라이드 목록(클릭 송출·드래그) |
| M3 `efc64fb` | 가사 4줄 페이지 자동분할, 곡별 배경 저장·자동적용 |
| M4a `1876c13` | 플레이리스트(예배별) 5종 시드, 곡 추가·순서변경 |
| M4b `5ebbd48` | 성경 슬라이드(책·장·절+본문→절 자동 슬라이드화) |
| M5 `dc4eb79` | 전환효과(Fade), 배경영상(mp4), 오디오(MP3), .zip 백업/복원 |
| `a7f74c4` | 자막 세로위치·미세위치, 한 화면 줄 수(1~8) 조절 |
| `5071e48` | 출력 비율 16:9 / 4:3 / 화면 채우기(레터박스) |
| M6a `40a168c` | 악보 이미지→가사 추출(Gemini Vision), 설정에 API키(safeStorage) |
| M7 `acf0f2e` | 온라인 주보 발행(찬양 플레이리스트 자동연동, 모바일 HTML+미리보기+QR) |
| `6269503` | 더블클릭 실행 스크립트 + 실행 안내 |
| `0abdaf8`/`649d547` | GitHub Actions 맥 .dmg 빌드 CI (+publish/repository 수정) |
| `632d535` | **한글 IME 자음/모음 분리 수정**(SyncTextarea/SyncInput) |
| 0.2.0 (2026-09-22) | IME 수정 보강(조합 중 동기화·keydown 차단, 남은 입력창 전환), **악보 추출 개편**: 모델 설정화(`gemini.model`, 기본 gemini-3.6-flash — 2.0-flash는 2026-06-01 종료), 다중 페이지·PDF(pdf.js)·HEIC(sips) 지원, 리사이즈 후 전송, 찬송가 구조 프롬프트, 라벨/하이픈 정규화(`shared/scoreText.ts`), 오류 원인 표시·타임아웃, 곡↔악보 연결(v3 `song_scores`) + 곡 편집기에서 원본 열람. **한 이미지 여러 곡** 자동 분리(`ExtractResult.songs` + 곡 탭 UI, 모두 저장), **저해상도 대응**: 긴 변 1200px 미만 경고 + 전송 시 자동 확대, **정밀 모드**(설정 `gemini.model.precise`, 기본 gemini-3.8-flash)와 1차 결과 빈약 시 자동 재시도, **영역 선택**(원본 위 드래그 → `ExtractOptions.regions`, main에서 nativeImage.crop). **곡 가져오기**(설정 화면): 텍스트/JSON/PPTX 파일·폴더 → 곡/절, 장 번호 인식, 중복(장 번호·정규화 제목) 건너뛰기/덮어쓰기. 검색은 제목·작사자·장 번호("478")·가사 본문. **성경 구절 입력 → 본문 불러오기**: 라이브러리 성경 섹션 빠른 입력(Enter로 저장·로드), 성경 편집기 상단 구절 입력, 설정 → 성경 본문(번역본 목록·가져오기·삭제). 내장 개역한글(저작권 만료, `desktop/data/bible/krv.tsv.gz`, extraResources로 `Resources/bible/`), 개역개정 등은 교회 보유 본문 파일(txt/tsv/csv/json)을 가져와 추가. **순서지 → 플레이리스트 자동 구성**: 플레이리스트 패널 "순서로 만들기" → 줄마다 성경 참조/찬송가 장 번호/곡 제목 해석(`shared/orderSheet.ts`) → 미리보기(후보 선택) → 말씀 저장 + 플레이리스트 생성(`main/orderSheet.ts`, `ORDER_RESOLVE`/`ORDER_APPLY`). 중복 판별은 장 번호가 있으면 장 번호로만(제목 같은 찬송 여러 장 보존). |

각 단계는 헤드리스(Xvfb)로 Electron 실제 구동 + 스크린샷/자체 테스트로 검증함.

---

## 6. 파일 지도 (renderer)

- `control/ControlApp.tsx` — 상단바(주보/설정) + [1]~[8] 레이아웃 배치
- `control/LibraryPanel.tsx` — [1] 찬양/성경 섹션·검색·목록 + 하단 플레이리스트(뷰 전환)
- `control/SlideListPanel.tsx` — [2] 절 목록(쪽수 표시·클릭 송출·곡은 드래그 순서변경·배경 저장)
- `control/PreviewPanel.tsx` + `components/Stage.tsx` — [3] 프리뷰(출력 비율 레터박스)
- `control/QuickPanel.tsx` — [4] 다음/이전/검정/로고/일시정지
- `control/EditorPanel.tsx` — [5] 자막/가사 + 폰트·색·외곽선·정렬·세로위치·위치조정·줄수
- `control/MediaPanel.tsx` — [6] 배경(단색/이미지/영상/카메라)+dim
- `control/AudioPanel.tsx` — [7] MP3 재생
- `control/TransitionPanel.tsx` — [8] 전환효과(Fade·지속시간)
- 모달: `SongEditorModal`, `SongPickerModal`, `BibleEditorModal`, `ScoreImportModal`, `BulletinModal`, `SettingsModal`
- 렌더: `components/SlideView.tsx`(배경 레이어+dim+가사 오버레이+페이드), `components/Stage.tsx`(비율 박스)
- **입력**: `components/SyncField.tsx`(SyncTextarea/SyncInput) — **한글 IME 안전 입력. 새 입력창은 반드시 이걸 사용**
- 스토어(zustand): `store/live.ts`(송출상태), `deck.ts`(현재 곡/성경·페이지·maxLines), `library.ts`, `bible.ts`, `playlist.ts`, `ui.ts`(모달 상태)

---

## 7. 배포 / CI

- `.github/workflows/build-mac.yml` — **수동 실행(Run workflow) 또는 `v*` 태그**로 맥 러너에서 .dmg 빌드.
  - 매트릭스: macos-14에서 arm64·x64(교차 빌드), 결과 dmg를 Artifact로 업로드.
- **맥 배포 기준**(`desktop/scripts/mac-verify.cjs`가 빌드 중 점검, 못 맞추면 빌드 실패)
  - 1단계(지금): 앱 전체 ad-hoc 서명이 유효 → 「손상된 앱」이 나오지 않음. 첫 실행은 시스템 설정 > 개인정보 보호 및 보안 > 「그래도 열기」.
  - 2단계(Steno 같은 상용 앱 수준, 경고 없이 열림): Developer ID 서명 + Apple 공증 + 공증 표 부착. 저장소 Secrets 5개를 넣으면 다음 빌드부터 자동 적용(코드 수정 없음):
    `MAC_CERT_P12_BASE64`(Developer ID Application 인증서 .p12를 base64로), `MAC_CERT_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`(appleid.apple.com 앱 암호), `APPLE_TEAM_ID`.
    필요한 것: Apple Developer Program 가입(연 129,000원 / US$99, 운영자 본인 또는 단체 명의).
    - 운영자 결정(2026-10-29): 개발자 계정·인증서 발급 계획 없음 → 1단계로 배포.
  - main에 워크플로우가 있어야 "Run workflow" 버튼/`run_workflow` API가 동작함.
- `electron-builder.yml` — win(nsis+portable) / mac(dmg arm64,x64), `publish: github`(‑‑publish never라 업로드 X, updateInfo 크래시 방지용), `asarUnpack`으로 better-sqlite3 언팩.
- **Windows exe/mac dmg는 각 OS(또는 wine)에서만 빌드 가능** — 리눅스 CI에선 win 불가.

---

## 8. 다음 작업(TODO) / 논리적 우선순위

1. ~~M6b 로컬 OCR~~ 완료: `main/ocr.ts` — tesseract.js 7(Node 워커, asarUnpack) + `data/tessdata/{kor,eng}.traineddata`(tessdata_fast, extraResources). 정확도는 Gemini보다 훨씬 낮고 곡 분리 없음. 개선 여지: 이미지 이진화 전처리, 오선/코드 영역 제거.
2. **CI 정리**: Intel(x64) 잡 제거로 맥 러너 시간 절반(대부분 Apple Silicon). 앱 **아이콘** 추가(`desktop/resources/icon.icns|ico`, electron-builder가 자동 사용).
3. **주보 QR/호스팅**: 현재 공개 URL 입력 시 QR 생성. (선택) Netlify 등 자동 업로드 연동.
4. **자동전환(오디오 기준)** [8] 옵션(스펙에 있으나 미구현).
5. **온라인 주보 디자인 고도화**: 저장소 루트 Eleventy 템플릿/CSS 재사용 검토.
6. ~~곡 삭제 UI~~ 완료(편집기 "곡 삭제" — 플레이리스트 항목·악보 연결 정리). ~~로고 이미지~~ 완료(빠른 기능 패널 "이미지…", 설정 `logo.mediaId`, `LiveState.logoUrl`, 시작 시 `restoreLogo()`). 템플릿은 미구현.
7. **CCLI SongSelect 연동**(가입 교회용 가사 가져오기). ~~PPT 제목 슬라이드 글꼴 크기 판별~~ 완료(`slideXmlInfo.maxSz`, 가사 슬라이드 중앙값의 1.3배 이상이면 제목). ~~절 병합/분할 도구~~ 편집기 "N줄마다 절 나누기"로 완료.
8. **개역개정 누락 25절**: 사용자 파일에 없던 절(신 6:18-19, 15:4-5, 30:9-10, 대상 16:12-13, 시 92:1-3, 105:5-6, 아 6:14, 렘 32:3-5, 33:10-11, 겔 24:4-5, 행 15:25-26, 롬 9:1-2). 보완 파일을 코드 NKRV로 다시 가져오면 교체됨.
9. **순서지 절 범위**는 완료(플레이리스트 `note` → `deck.load(id, selection)`); 절 범위를 곡 편집 없이 플레이리스트 항목에서 직접 바꾸는 UI는 없음(메모 편집 UI 추가 가능).

---

## 9. 이어서 개발할 때 규칙/팁

- **IPC 추가**: `src/shared/ipc.ts`(채널+타입) → `src/main/index.ts` `registerIpc()` 핸들러 → `src/preload/index.ts` 노출 → 렌더러 사용.
- **DB 변경**: `src/main/db/schema.ts`에 **새 마이그레이션 version 추가**(기존 수정 금지). DAO 함수 추가.
- **입력창은 항상 `SyncTextarea`/`SyncInput` 사용** (한글 조합 깨짐 방지).
- **미디어 경로**: 절대경로 저장 금지. 데이터 폴더로 복사 후 상대경로만 저장, `seraphim-media://local/<rel>`로 참조.
- **검증**: 헤드리스에서 `xvfb-run -a ./node_modules/electron/dist/electron . --no-sandbox` 로 실제 구동 캡처 가능(개발 참고).
- **Gemini 키/네트워크**: 실제 Vision 호출은 사용자 API 키 필요(무료 티어). 모델은 설정 `gemini.model`(기본 `DEFAULT_GEMINI_MODEL`=gemini-3.6-flash, `shared/ipc.ts`). Google 모델 종료 시 설정 화면에서 모델명만 교체. 키는 `x-goog-api-key` 헤더로 전송, 90초 타임아웃.
- **악보 추출 파이프라인**: `SCORE_PICK`(다중 선택, HEIC→JPG는 macOS `sips`) → PDF는 렌더러 pdf.js로 페이지 PNG 변환 후 `SCORE_SAVE_PAGE` → `SCORE_EXTRACT(relPaths[])`가 `main/score.ts`로 긴 변 2000px JPEG 축소 → `main/gemini.ts`(응답은 `{songs:[...]}`) → `shared/scoreText.ts`로 라벨/하이픈 정규화·곡 목록화(`normalizeSongs`, `isWeakResult`). `SCORE_EXTRACT(relPaths, method, {precise, regions})`: 영역이 있으면 영역만 잘라 전송, 작은 이미지는 2배(정밀 3배) 확대, 결과가 빈약하면 정밀 모델로 자동 재시도(`meta.retried`). Windows에서는 HEIC 자동 변환 불가(안내 메시지).
- **성경 본문**: `shared/bibleRef.ts`(66권 표·약칭·참조 파서 `parseBibleRef`: "요3:16", "요한복음 3장 16-18절", "시 23편", "창1:1-2:3", "John 3:16") → `main/db/bibleText.ts`(`lookupPassage`, 번역본 CRUD) → `BIBLE_TEXT_*` IPC. 본문 파일 파서는 `shared/bibleTextParse.ts`(탭/"창1:1 …"/"창세기 1:1 …"/CSV/JSON). 편집기 본문 형식은 "절번호 본문" 한 줄 = 한 절, 장 넘김 범위는 "장:절 본문". 선호 번역본은 설정 `bible.translation`.
- **유사 제목 정리**: 설정 → "유사 곡 찾기"(`main/dedup.ts`): 정규화 제목 + 끝 조사(은/는/이/가/을/를/요/여/에/의) 무시로 묶고, 찬송가는 같은 장 번호끼리만. `mergeSongs(keepId, removeIds)`가 플레이리스트 항목·악보 연결을 유지 곡으로 옮긴 뒤 삭제. 2026-09-23 실제 DB에서 27묶음/55곡 검출.
- **순서지 해석**: 번호(1., ①), 조표((D), (key: G)), 메모("1-3절", "후렴 2번 반복", "2번 연결")를 걸러내고 남은 텍스트를 성경 참조 → 장 번호 → 곡 제목 순으로 해석. 곡 매칭은 정규화 정확 일치 → 앞부분 → 포함 → 단어 단위. 절 범위 메모는 플레이리스트에 반영하지 않음(표시만) — 절 선택 송출은 TODO.
- **YouTube 라이브 송출 / 녹화**(2026-09-30): 상단 "📡 유튜브 방송" → `BroadcastModal` + `store/broadcast.ts`. 구조: 숨은 방송 창(`windows.ts openStreamWindow`, output.html role=stream, DIP = 픽셀÷배율로 정확히 1280×720/1920×1080) → 운영자 창에서 `webContents.getMediaSourceId` 탭 캡처(getUserMedia chromeMediaSource 'tab') + 소리(믹서 입력 → GainNode → MediaStreamDestination, 없으면 무음 트랙) → MediaRecorder(H.264/Opus Matroska, 0.25초 조각) → IPC `STREAM_CHUNK` → `main/stream.ts`의 ffmpeg stdin → 고정 30fps·CBR·키프레임 2초 H.264 + AAC 48k → RTMP(S) FLV / 조각 MP4 / tee(방송+녹화). 인자는 `shared/stream.ts buildFfmpegArgs`(순수, 단위 테스트). 방송 화면 구성 `streamViewState`: mirror(송출 그대로) / lowerThird(카메라 + 하단 자막 띠, B·L이면 자막만 숨김). 정지 화면에서도 프레임이 끊기지 않게 방송 창에 2px 깜빡임(`data-stream-heartbeat`). 재연결: ffmpeg 비정상 종료 → 캡처는 유지한 채 2·4·…·15초 뒤 새 세션, 10초 안에 3번 연속 실패하면 오류로 멈춤. 스트림 키는 safeStorage 암호화(`stream.key.enc`), 오류 문구에서 가림. 녹화 폴더 = 동영상/Seraphim (테스트는 `SERAPHIM_RECORDINGS_DIR`). 방송 중 운영자 창 닫기 확인, 방송 중 절전 방지.
  - 화질(2026-09-30): 720p 3.5M · 1080p 6M · **1440p(2K) 12M**(YouTube H.264 1440p30 최소 7, 권장 21 Mbps). 방송 창 카메라는 화질보다 한 단계 크게 요청(720p→1080p, 1080p→1440p, 1440p→2160p; 카메라가 못 주면 최대치 — 아이폰 연속성 카메라는 1080p까지). **VideoToolbox 비트레이트 보정**: `-maxrate/-bufsize`를 주면 목표의 약 70%로 낮게 나와(1440p 12M → 8.4M) 제거하고, macOS 13+는 `-constant_bit_rate 1`(측정 720p 3.52 / 1080p 6.04 / 1440p 12.08 Mbps), 그 이하는 `-b:v`만. libx264(Windows)는 기존대로 CBR+maxrate. M4에서 1440p 녹화 중 ffmpeg 약 17%, 앱 약 36%(코어 1개 기준).
  - ffmpeg: macOS는 `scripts/build-ffmpeg-mac.sh`로 직접 빌드한 **LGPL 최소 빌드**(FFmpeg 7.1.1, 6.6MB, h264_videotoolbox + SecureTransport TLS, 외부 라이브러리 없음) — ffmpeg-static의 mac 빌드는 `--enable-nonfree`라 "재배포 불가"여서 쓰지 않음. Windows는 `node scripts/fetch-ffmpeg.mjs`(ffmpeg-static b6.1.1, GPL v3, libx264, GnuTLS). 바이너리는 git 제외(`vendor/ffmpeg/*/`), electron-builder mac/win `extraResources`로 `Resources/ffmpeg/`. RTMPS 인증서 검증(`-tls_verify 1`)은 macOS에서만 켬(Windows GnuTLS는 CA 설정 없이 켜면 막힐 수 있어 미검증).
  - 검증: 가짜 카메라·마이크(`--use-fake-device-for-media-stream`)로 녹화 MP4(H.264 1280×720 30fps, AAC 48k 스테레오, 소리 신호 확인), 1080p, 로컬 RTMP 서버(homebrew ffmpeg `-listen 1`) 수신, 서버 끊김 → 자동 재연결, 잘못된 서버 → 오류 안내, 방송 창 줌·하단 자막 확인(`tests/e2e/stream-e2e.mjs`). `--use-fake-ui-for-media-stream`은 탭 캡처를 막으므로 쓰지 말 것. 720p 방송 중 CPU: ffmpeg 약 9%, 앱 전체 약 35~40%(코어 1개 기준, M 시리즈). **실제 YouTube 송출과 Windows 실행은 아직 미검증**(스트림 키 필요 / Windows PC 필요).
  - 방송·녹화 분리(2026-10-07): 캡처(방송 창 + 소리)는 하나로 함께 쓰고 MediaRecorder·ffmpeg를 방송·녹화가 각자 돌린다(`StreamKind` = live | record, main `stream.ts`의 `channels`, `store/broadcast.ts`의 `live`·`rec`, IPC `STREAM_START/STOP(kind)`). 상단 `RecordHeaderButton`(● 녹화 → ● REC 경과·남은 시간)으로 방송과 따로 켜고 끄며, 방송이 끊겨도 녹화는 한 파일로 계속된다. 방송은 재연결, 녹화는 실패 시 새 파일로 이어 감. 저장 공간: 녹화 중 5초마다 `statfs`, 512MB 아래면 stdin을 닫아 마무리 후 정지(`fatal`), 시작 시 남은 녹화 시간 3분 미만이면 거부, 모달·REC 표시에 녹화 가능 시간(30분/10분 경고). 설정 `recordWithLive`(방송 시작 시 녹화도, 기본 켬) — 예전 `target`(방송만이면 끔)은 읽을 때 옮김. 방송 끝내기는 녹화 중이면 "방송만 / 모두" 선택. 카메라 칸에 줌 − 배율 + (`TileZoom`). 테스트: `SERAPHIM_FAKE_DISK_FREE_FILE`로 남은 공간 흉내, `stream-e2e`에 방송 중 녹화·끊김 중 녹화 유지·공간 부족 추가. M4 720p 방송+녹화 동시 ffmpeg 2개 약 20%, 앱 약 25%.
- **카메라 1·2·3**(2026-09-30): `LiveState.cameras: CameraSlot[3]`(장치·카메라별 줌) + `activeCamera` + `cameraCapture`(모든 창의 카메라 요청 해상도 = 방송 화질 프리셋의 camera). 패치는 `LivePatch.camera`(보이는 카메라 줌) / `cameraSlot {index, deviceId, label, view}` / `activeCamera` → main `applyPatch`가 `shared/stream.ts applyCameraPatch`(순수)로 적용, 설정 `camera.slots`·`camera.active`에 0.5초 모아 저장, 시작 시 `restoreCameras`(예전 방송 설정의 단일 카메라는 카메라 1로 이전). 출처 `CameraSource = 'program' | 번호`: 프로젝터 배경 `Background.cameraSource`, 방송 `StreamConfig.cameraSource`('none' = 송출 배경 그대로). `resolveCameraLayers`: 'program'이면 연결된 카메라를 모두 겹쳐 재생해 두고 전환된 것만 보이게(`CameraStack`, 페이드 설정이면 전환 효과 시간만큼 크로스페이드) → 전환 시 카메라를 다시 열지 않아 검은 화면 없음(E2E: 방송 창 전환 7ms, 같은 video 요소 유지). `CameraStack`은 `isolate`로 쌓임 맥락을 닫아야 가사·띠를 덮지 않음. UI: 프리뷰 아래 `CameraSwitcher`(실시간 미리보기 칸, 클릭 전환, ON AIR, ⚙), `CameraSetupDialog`(장치·줌), `CameraSourceSelect`([6] 미디어·방송 창), 단축키 1·2·3(연결된 칸만) + − 0(보이는 카메라). 같은 장치를 여러 창이 쓰면 Chromium은 먼저 연 창의 해상도로 공유하므로 `cameraCapture`로 요청 해상도를 통일(이후 1440p 방송 창 카메라가 3840×2160으로 받아짐). 디지털 줌은 CSS `scale`+`transform-origin`. 아이폰은 macOS 연속성 카메라 — Info.plist `NSCameraUseContinuityCameraDeviceType` 필요. 오즈모 포켓 3는 UVC 웹캠 모드(펌웨어 v01.04.08.02+ 4K). 검증 `tests/e2e/camera-switch-e2e.mjs`(가짜 카메라 2대: `--use-fake-device-for-media-stream=device-count=2`).
- **PPTX 내보내기**(2026-09-24): 플레이리스트 패널 "PPTX" / 곡 편집기 "PPTX" → `PptxExportModal` → `EXPORT_PPTX(PptxExportRequest)` → `main/pptxExport.ts`(플레이리스트 항목·곡·말씀을 송출과 같은 `paginate(render.maxLines)`로 페이지 → 슬라이드, 현재 `liveState`의 overlay/background/aspect/logo 반영, 곡별 배경 이미지, 순서지 메모의 절 선택 반영) → `shared/pptx.ts`(의존성 없는 OOXML 생성: 배경색·이미지 cover·어둡게 사각형·텍스트 상자(줄=문단, 외곽선 절반 두께·그림자·글꼴)·제목/라벨/로고/검정 슬라이드) → adm-zip. 동영상·카메라 배경, 라이브러리 밖 이미지, 동영상 항목은 warnings로 안내하고 배경색 대체. `outPath`를 주면 저장 대화상자 생략(테스트). 글자 크기 환산: 1080p px ÷ 2 = pt.
- **곡 가져오기**: `SONG_IMPORT_PICK`(파일/폴더 대화상자) → `SONG_IMPORT(paths, {category, onDuplicate})` → `main/importSongs.ts`(파일 수집, PPTX unzip=adm-zip) → `shared/songImportParse.ts`(순수 파서: 제목줄 장번호, txt, json, 슬라이드 XML→문단, 제목 슬라이드 기준 곡 분리). 수집 형식 대응(2026-09-24): JSON의 `artist/team/channelName`→작사자, `cleanImportTitle`로 "(Official)" "(Live)" "(Acoustic Ver.)" "(인도 : 이름)" " - 팀명 Live Clip" "_인도자 인도" 꼬리·수학 굵은 글꼴·이모지 이후 제거("(시편 119편)" "(찬송가 413장)"은 유지), "12. 제목" 트랙 번호는 카테고리가 찬송가일 때만 장 번호, txt에 "### [팀] 제목 (날짜)" 헤더가 여럿이면 한 파일=여러 곡(URL 줄 제거), 같은 이름의 .json과 .txt가 함께 있으면 .json만. 한계: 한 줄짜리 짧은 가사 슬라이드가 연속되면 제목 슬라이드와 구분 못 함. 웹 수집 기능은 저작권상 넣지 않음 — 교회 보유 자료 가져오기가 원칙.
- **테스트**: `desktop/tests/README.md` — 단위(tsx)·E2E(CDP) 실행법. E2E 스크립트는 `desktop/tests/e2e/`.
- **악보 검증 스크립트**: 패키징 앱을 `--user-data-dir=<임시> --remote-debugging-port=9333`으로 띄우고(임시 userData의 `seraphim-config.json`으로 DB 사본 폴더 지정 → 사용자 데이터 격리) CDP로 `window.seraphim.*`를 직접 호출해 PDF 변환·곡 연결·실제 Gemini 추출(1곡/2곡/영역/저해상도)을 자동 검증했음. 키는 safeStorage라 같은 앱 번들이면 사본 DB에서도 복호화됨.
- 커밋/PR 후 main 병합 → `build-mac.yml` Run workflow(또는 `v*` 태그)로 .dmg 산출.

---

## 10. 알려진 이슈 / 검증 못 한 것

- **Gemini 실제 추출**: 오류 경로(키 없음/잘못된 키/PDF 직접/경로 탈출)와 PDF 변환·곡 연결은 자동 검증됨. 실제 API 호출은 사용자 키로 실제 찬송가 사진을 넣어 품질 확인 필요.
- **맥 공증 없음(배포 기준 1단계)**: 첫 실행 시 「그래도 열기」 필요. 2단계는 위 7장 「맥 배포 기준」.
- **동기화 폴더 동시편집**: 소프트 가드 문구만 있음, 락 미구현.
- 로컬 OCR/PDF 미구현(위 TODO 1).

---

## 11. 빠른 시작(다른 세션의 첫 명령 예시)

> "Seraphim 저장소 `desktop/`의 Electron 앱을 이어서 개발한다. HANDOFF.md를 읽고 M6b(로컬 OCR/PDF)부터 진행. 규칙: IPC는 shared/ipc.ts 경유, DB는 append-only 마이그레이션, 입력창은 SyncField 사용, 미디어는 상대경로+seraphim-media://."

### Windows 빌드 (2026-09-26, macOS Apple Silicon에서 교차 빌드)
- `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win zip --x64 --publish never -c.win.signAndEditExecutable=false` → `release/Seraphim-0.2.0-win.zip` (win-unpacked 압축, 압축 풀고 `Seraphim.exe` 실행).
- Rosetta 2 설치 후(2026-09-26) `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win --x64 --publish never` 로 `Seraphim Setup 0.2.0.exe`(NSIS 설치형)와 `Seraphim-0.2.0-portable.exe` 생성 확인. Rosetta가 없으면 wine/makensis(x86_64)가 "bad CPU type"으로 실패하므로 zip 타깃만 가능. `signAndEditExecutable=false`는 exe 버전 정보·아이콘 편집(rcedit, wine 필요)을 생략하는 것.
- 교차 빌드가 `node_modules/better-sqlite3`를 win32 DLL로 바꿔 놓으므로, 끝나면 반드시 `npm_config_python=/usr/bin/python3 npx electron-rebuild -f -w better-sqlite3`로 mac용을 다시 만들 것.
- Windows에서 안 되는 것: HEIC 악보 변환(sips, macOS 전용 — 안내 오류). 나머지(OCR utilityProcess, 내장 성경, PPTX 내보내기)는 플랫폼 독립이지만 실제 Windows PC에서는 아직 실행 검증 안 됨.
