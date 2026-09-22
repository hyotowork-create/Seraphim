# Seraphim — 인수인계 문서 (Handoff)

> 이 문서 하나로 **다른 계정/세션에서 이어서 개발**할 수 있도록 정리한 문서입니다.
> 최종 업데이트: 2026-09-22 · 브랜치 `claude/awesome-lamport-y9xdl0` (main에 병합됨)

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
  - 매트릭스: macos-14(arm64) + macos-13(x64), 서명 없음(`CSC_IDENTITY_AUTO_DISCOVERY=false`), 결과 dmg를 Artifact로 업로드.
  - main에 워크플로우가 있어야 "Run workflow" 버튼/`run_workflow` API가 동작함.
- `electron-builder.yml` — win(nsis+portable) / mac(dmg arm64,x64), `publish: github`(‑‑publish never라 업로드 X, updateInfo 크래시 방지용), `asarUnpack`으로 better-sqlite3 언팩.
- **Windows exe/mac dmg는 각 OS(또는 wine)에서만 빌드 가능** — 리눅스 CI에선 win 불가.

---

## 8. 다음 작업(TODO) / 논리적 우선순위

1. **M6b — 로컬 OCR(오프라인)**: Tesseract.js + 한국어(kor) traineddata. 현재 `설정 → 추출 방식`에 "로컬 OCR(준비 중)" 자리만 있음. `src/main/index.ts`의 `SCORE_EXTRACT` 핸들러에서 `method==='ocr'` 분기 구현 필요. (오프라인 교회 PC용) + **PDF 업로드→페이지별 이미지 변환**(pdf.js).
2. **CI 정리**: Intel(x64) 잡 제거로 맥 러너 시간 절반(대부분 Apple Silicon). 앱 **아이콘** 추가(`desktop/resources/icon.icns|ico`, electron-builder가 자동 사용).
3. **주보 QR/호스팅**: 현재 공개 URL 입력 시 QR 생성. (선택) Netlify 등 자동 업로드 연동.
4. **자동전환(오디오 기준)** [8] 옵션(스펙에 있으나 미구현).
5. **온라인 주보 디자인 고도화**: 저장소 루트 Eleventy 템플릿/CSS 재사용 검토.
6. **곡 삭제 UI**, 템플릿, 로고 이미지 지정(현재 로고 화면은 텍스트 "SERAPHIM").

---

## 9. 이어서 개발할 때 규칙/팁

- **IPC 추가**: `src/shared/ipc.ts`(채널+타입) → `src/main/index.ts` `registerIpc()` 핸들러 → `src/preload/index.ts` 노출 → 렌더러 사용.
- **DB 변경**: `src/main/db/schema.ts`에 **새 마이그레이션 version 추가**(기존 수정 금지). DAO 함수 추가.
- **입력창은 항상 `SyncTextarea`/`SyncInput` 사용** (한글 조합 깨짐 방지).
- **미디어 경로**: 절대경로 저장 금지. 데이터 폴더로 복사 후 상대경로만 저장, `seraphim-media://local/<rel>`로 참조.
- **검증**: 헤드리스에서 `xvfb-run -a ./node_modules/electron/dist/electron . --no-sandbox` 로 실제 구동 캡처 가능(개발 참고).
- **Gemini 키/네트워크**: 실제 Vision 호출은 사용자 API 키 필요(무료 티어). 모델 `gemini-2.0-flash`, `responseMimeType: application/json`.
- 커밋/PR 후 main 병합 → `build-mac.yml` Run workflow(또는 `v*` 태그)로 .dmg 산출.

---

## 10. 알려진 이슈 / 검증 못 한 것

- **Gemini 실제 추출**: UI/흐름만 검증, 실제 API 호출은 미검증(키 필요).
- **서명/공증 없음**: mac 첫 실행 시 우클릭→열기 또는 `xattr -dr com.apple.quarantine /Applications/Seraphim.app`.
- **동기화 폴더 동시편집**: 소프트 가드 문구만 있음, 락 미구현.
- 로컬 OCR/PDF 미구현(위 TODO 1).

---

## 11. 빠른 시작(다른 세션의 첫 명령 예시)

> "Seraphim 저장소 `desktop/`의 Electron 앱을 이어서 개발한다. HANDOFF.md를 읽고 M6b(로컬 OCR/PDF)부터 진행. 규칙: IPC는 shared/ipc.ts 경유, DB는 append-only 마이그레이션, 입력창은 SyncField 사용, 미디어는 상대경로+seraphim-media://."
