# Seraphim (desktop)

예배 송출·자막·주보 통합 데스크톱 앱. Electron + React + TypeScript + Tailwind + Zustand.

> 온라인 주보 정적 사이트(저장소 루트의 Eleventy 프로젝트)는 3순위 "온라인 주보 발행" 기능의
> 발행 템플릿으로 재사용합니다. 이 폴더는 새 데스크톱 앱 본체입니다.

## 개발

```bash
cd desktop
npm install          # 처음 1회 (Electron 바이너리 포함 다운로드)
npm run dev          # 개발 실행 (Control 창 표시 → '송출 열기'로 Output 창)
npm run typecheck    # 타입 검사
npm run build        # 프로덕션 번들 (out/)
```

## 빌드/배포

```bash
npm run build:win            # Windows NSIS 설치본 + Portable
npm run build:win:portable   # Portable(.exe)만
npm run build:mac            # macOS dmg (후순위)
```

산출물: `release/`

## 아키텍처 (2-Window)

- **main** (`src/main`): 앱/창 생명주기, 송출 상태 단일 진실원, IPC 핸들러.
- **preload** (`src/preload`): `contextBridge`로 `window.seraphim` 안전 API 노출.
- **renderer** (`src/renderer`):
  - `index.html` → Control Window (운영자용, `src/renderer/src/control`)
  - `output.html` → Output Window (송출용, `src/renderer/src/output`)
- **shared** (`src/shared/ipc.ts`): IPC 채널 상수 + 공유 타입 (송출 상태 계약).

Control에서 상태를 바꾸면 → main이 병합·브로드캐스트 → Output/프리뷰가 즉시 반영.

## 진행 상황

- [x] **M0** 스캐폴드: 2-Window + IPC, 자막 텍스트/스타일/검정(B)/로고(L)/일시정지(P) 송출
- [ ] M1 SQLite + 데이터 폴더/상대경로
- [ ] M2 곡/가사 · 라이브러리 · 슬라이드 목록
- [ ] M3 순차 송출 · 배경 이미지 오버레이 (MVP 완성)
- [ ] M4 플레이리스트 · 성경 슬라이드
- [ ] M5 전환효과 · 영상 · 오디오 · .zip 백업/복원
- [ ] M6 악보 이미지 → 가사 추출 (Google Gemini Vision + Tesseract)
- [ ] M7 온라인 주보 발행 (기존 Eleventy 템플릿 재사용 + QR)
