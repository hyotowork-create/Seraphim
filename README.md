# 교회 주보 홈페이지 (소형 교회용)

목회자가 그 주 내용을 폼에 채우면 **그 주 교회 홈페이지가 자동으로 만들어지고**,
링크를 카톡으로 공유할 수 있는 **무료** 정적 웹사이트입니다.

> 🔰 **컴퓨터가 익숙하지 않으세요?** 먼저 [**📖 시작하기 (쉬운 사용 설명서)**](시작하기.md) 를 보세요.
> 이 README 는 설치·기술 설명 위주입니다.

- 📱 **폰에서 보기 좋게** — 단일 컬럼, 큰 글씨(19px+), 고대비, 큰 버튼 (고령 교인 배려)
- 💬 **카톡 공유 최적화** — 링크를 붙이면 제목·설명·썸네일이 뜹니다 (OG 태그)
- 🖨️ **인쇄 지원** — 종이 주보도 깔끔하게 출력
- 💰 **운영비 0원** — GitHub Pages 무료 호스팅, 서버·DB 관리 없음

> **두 가지 방법으로 주보를 올릴 수 있습니다.**
> - 개발자/익숙한 분: `src/bulletins/` 에 `.md` 파일 추가 (→ 3장)
> - 목회자(코드 없이): `/admin` 에서 GitHub 로그인 후 폼 작성·발행 (→ 7장, Cloudflare 워커 1회 배포 필요)

---

## 1. 폴더 구조

```
├─ .github/workflows/deploy.yml   # GitHub Pages 자동 배포
├─ src/
│  ├─ _data/church.json           # 교회 고정정보(이름·주소·예배시간·계좌·비밀번호)
│  ├─ _includes/
│  │  ├─ layout.njk               # 공통 레이아웃 + OG 태그
│  │  ├─ bulletin.njk             # 주보 상세 페이지 레이아웃
│  │  └─ partials/bulletin-body.njk  # 주보 본문(홈·상세 공용)
│  ├─ bulletins/                  # 주보 1부 = 파일 1개 (YYYY-MM-DD.md)
│  ├─ index.njk                   # 홈(최신 주보 자동 노출)
│  ├─ archive.njk                 # 지난 주보 목록 + 검색
│  ├─ assets/                     # CSS·JS·기본 이미지
│  └─ admin/                      # Sveltia CMS 입력 화면(config.yml = 폼 정의)
├─ auth-worker/                   # /admin GitHub 로그인 중계 워커(Cloudflare, 1회 배포)
├─ .eleventy.js                   # Eleventy 설정
└─ package.json
```

---

## 2. 로컬에서 미리보기 (선택 — 개발자용)

> 목회자는 이 단계를 몰라도 됩니다. 사이트를 고치려는 분만 참고하세요.

```bash
# 1) Node.js 18 이상 설치 후
npm install      # 처음 한 번만

# 2) 미리보기 서버 실행 → 브라우저에서 http://localhost:8080
npm start

# 3) 정적 파일로 빌드만 하려면
npm run build    # 결과물은 _site/ 폴더
```

수정 후 저장하면 브라우저가 자동으로 새로고침됩니다.

---

## 3. 새 주보 올리기 (지금 당장 쓰는 방법)

`src/bulletins/` 폴더에 **날짜 이름의 파일**을 하나 추가하면 됩니다.
예) `src/bulletins/2026-06-14.md`

```yaml
---
date: 2026-06-14            # 필수 — 이 날짜로 주소가 만들어집니다
season: 맥추절              # 선택 (절기)
serviceType: 주일예배       # 선택
sermon:
  title: 설교 제목          # 필수
  scripture: 요한복음 3:16  # 필수 (본문)
  preacher: 홍길동 목사     # 필수
  summary: |               # 선택 (설교 요약/전문)
    여러 줄로 길게 쓸 수 있습니다.
  videoUrl: https://youtu.be/...   # 선택 (영상)
worshipOrder: |            # 선택 (예배 순서)
  묵도 · 찬송 · 기도 · 설교 · 축도
announcements:            # 선택 (공지 여러 개)
  - title: 공지 제목
    body: 공지 내용
schedule:                # 선택 (주간 일정)
  - day: 수요일
    content: 저녁 7시 30분 수요예배
greeting: |              # 선택 (인사말)
  이번 주도 평안하시길 바랍니다.
offering:                # 선택 (헌금 계좌)
  accountInfo: "○○은행 000-00-000000 (예금주: 교회명)"
  visibility: members    # public(전체공개) / members(비밀번호) / hidden(숨김)
---
```

> ⚠️ 계좌처럼 콜론(`:`)이나 괄호가 들어간 값은 **큰따옴표로 감싸세요.**
> main 브랜치에 올리면(push) 1~2분 뒤 사이트에 자동 반영됩니다.

### 매주 같은 값은 한 번만 — `src/_data/church.json`

교회명·주소·예배시간·기본 계좌·교인 비밀번호 등 **매주 바뀌지 않는 정보**는
`src/_data/church.json` 에 한 번 적어두면 모든 페이지에서 재사용됩니다.

```jsonc
{
  "name": "교회 이름",
  "url": "https://깃허브아이디.github.io",   // ← 사이트 주소(도메인만, 경로 X)
  "address": "교회 주소",
  "memberPassword": "1234"                   // 교인용 헌금정보 가림막 비밀번호
}
```

---

## 4. GitHub Pages 켜기 (처음 한 번)

1. 이 저장소를 GitHub 에 올립니다.
2. 저장소 **Settings → Pages** 로 이동합니다.
3. **Build and deployment → Source** 를 **GitHub Actions** 로 선택합니다.
4. `main` 브랜치에 변경사항을 push 하면 자동으로 빌드·배포됩니다.
   (진행 상황은 저장소 **Actions** 탭에서 볼 수 있습니다.)
5. 배포가 끝나면 `https://깃허브아이디.github.io/저장소이름/` 으로 공개됩니다.

> 📌 **카톡 썸네일을 위해** `src/_data/church.json` 의 `url` 을 본인 도메인
> (`https://깃허브아이디.github.io`)으로 꼭 바꿔주세요. 하위 경로(`/저장소이름/`)는
> 배포 시 자동으로 붙습니다.
>
> 기본 공유 썸네일은 `src/assets/og-default.svg` 입니다. 카카오톡은 SVG 썸네일을
> 잘 못 띄울 수 있으니, 가능하면 **1200×630 PNG/JPG** 로 교체하고 `church.json` 의
> `defaultImage` 경로를 바꾸길 권장합니다. (개별 주보에 사진을 넣으면 그 사진이 썸네일이 됩니다.)

---

## 5. 페이지 안내

| 주소 | 내용 |
|------|------|
| `/` | 가장 최근 주보 자동 노출 |
| `/bulletin/YYYY-MM-DD/` | 날짜별 상세 (카톡 공유용 고유 URL, OG 태그 포함) |
| `/archive/` | 지난 주보 목록 + 제목·설교자·구절 검색 |
| `/admin/` | 주보 입력 화면 (Sveltia CMS — 로그인 연결은 Phase 2) |

---

## 6. 민감정보 공개범위

헌금 계좌 등 민감정보는 `offering.visibility` 로 조절합니다.

- `public` — 전체 공개
- `members` — **간단 비밀번호**(`church.json` 의 `memberPassword`) 입력 후 표시
  - ⚠️ 강력한 보안이 아니라 **가벼운 가림막**입니다. 매우 민감한 정보는 올리지 마세요.
- `hidden` — 표시하지 않음

기본값은 보수적으로 `members` 를 권장합니다.

---

## 7. 폰에서 폼으로 발행하기 (Phase 2 — Sveltia CMS 로그인)

목회자가 코드를 몰라도 **폰에서 `/admin` → GitHub 로그인 1회 → 폼 작성 → 발행**으로
사이트를 갱신할 수 있게 하는 단계입니다.

준비물은 이미 저장소에 들어 있습니다:
- `src/admin/config.yml` — 데이터 모델대로 된 입력 폼(쉬운 한국어 라벨, 필수 우선, 선택 접기)
- `auth-worker/` — GitHub 로그인 중계용 Cloudflare 워커(무료)

연결 순서 (처음 한 번, 약 10분):

1. **인증 워커 배포** — [`auth-worker/README.md`](auth-worker/README.md) 의
   1~3단계를 따라 GitHub OAuth App 을 만들고 Cloudflare 에 워커를 배포합니다.
2. **CMS 연결** — `src/admin/config.yml` 의 아래 3곳을 본인 값으로 수정 후 push:
   - `backend.repo` : `깃허브아이디/저장소이름`
   - `backend.base_url` : 배포한 워커 주소 (예: `https://sveltia-cms-auth.your-name.workers.dev`)
   - `site_url` : 공개 사이트 주소
3. **사용** — 폰 브라우저에서 `https://<사이트>/admin/` 접속 → **GitHub 로그인** →
   주보 폼 작성 → **발행**. 발행을 누르면 main 에 반영되어 1~2분 뒤 사이트가 자동 갱신됩니다.

> 💡 **미리보기 → 발행**: Sveltia CMS 는 폼 옆에 실시간 미리보기를 보여줍니다.
> 발행 화면에서 **개인정보(계좌·연락처)가 공개로 들어가지 않았는지** 다시 확인하세요.
>
> 📷 **사진 첨부**: "주보 원본 사진" 항목은 폰 사진첩에서 바로 올릴 수 있습니다.
> 사진을 넣으면 그 사진이 카톡 공유 썸네일로도 쓰입니다.

---

## 8. 오프라인(인터넷 없이)에서 실행하기

인터넷이 약하거나 끊긴 환경에서도 쓸 수 있도록, 외부 CDN 의존성을 없앴습니다.
`/admin` 의 CMS 스크립트도 저장소 안(`src/admin/vendor/sveltia-cms.js`)에 함께 넣어
두었습니다.

**① 공개 사이트 미리보기(오프라인)**

```bash
npm ci          # 인터넷 되는 곳에서 처음 한 번만 (의존성 캐시)
npm run build   # 정적 파일 생성 → _site/
npm start       # http://localhost:8080  (이후로는 인터넷 없이 동작)
```

- 홈·주보 상세·아카이브·검색·인쇄까지 **외부 요청 0개**로 완전히 동작합니다.
  (실제로 브라우저 네트워크를 차단하고 검증 완료)

**② 오프라인으로 주보 편집·저장 — "Work with Local Repository"**

1. 크로미움 계열 브라우저(Chrome/Edge)에서 `http://localhost:8080/admin/` 접속
2. **"Work with Local Repository"** 버튼 클릭 → 이 저장소 폴더 선택
3. 폼으로 주보를 작성/수정하면 `src/bulletins/` 파일에 **바로 저장**됩니다.
   (GitHub 로그인도, 인터넷도 필요 없음)
4. 나중에 인터넷이 되면 `git push` 로 올리면 사이트에 반영됩니다.

> 참고: `/admin` 편집 화면의 아이콘·글꼴은 Google Fonts 를 쓰므로 오프라인에서는
> 시스템 기본 글꼴로 대체되어 보일 수 있습니다. **기능에는 영향이 없습니다.**

---

## 기술 스택

Eleventy(11ty) · Nunjucks · GitHub Pages · Sveltia CMS(오프라인 번들 포함) — 모두 무료.
