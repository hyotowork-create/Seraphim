# Sveltia CMS Auth 워커 (GitHub 로그인 중계)

`/admin`(Sveltia CMS)에서 **GitHub 로그인**이 되도록 OAuth 를 중계하는
Cloudflare Workers 입니다. 무료 요금제 안에서 동작하며, 한 번만 배포하면 됩니다.

> 비밀번호(client secret)는 이 워커 안에만 보관되고 브라우저에는 노출되지 않습니다.

---

## 배포 절차 (처음 한 번, 약 10분)

### 1단계. GitHub OAuth App 만들기

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
   (조직 저장소라면 조직 Settings 의 Developer settings)
2. 입력값:
   - **Application name**: 아무 이름 (예: `교회주보 CMS`)
   - **Homepage URL**: 공개 사이트 주소 (예: `https://깃허브아이디.github.io/저장소이름/`)
   - **Authorization callback URL**: `https://<워커주소>/callback`
     → 워커 주소는 2단계에서 정해집니다. 임시로 `https://sveltia-cms-auth.<당신>.workers.dev/callback`
       로 적고, 2단계 후 실제 주소로 다시 맞추면 됩니다.
3. **Register application** → **Client ID** 확인, **Generate a new client secret** 로
   **Client secret** 발급 (이 두 값을 3단계에서 사용).

### 2단계. 워커 배포

이 폴더(`auth-worker/`)에서:

```bash
npm install              # 처음 한 번 (wrangler 설치)
npx wrangler login       # 브라우저로 Cloudflare 로그인 (처음 한 번)
npm run deploy           # 배포 → https://sveltia-cms-auth.<당신>.workers.dev 주소가 출력됩니다
```

출력된 주소를 1단계의 **Authorization callback URL** 끝에 `/callback` 을 붙여
정확히 맞춰 주세요. (예: `https://sveltia-cms-auth.your-name.workers.dev/callback`)

### 3단계. 시크릿(비밀값) 등록

```bash
npx wrangler secret put GITHUB_CLIENT_ID       # 1단계의 Client ID 붙여넣기
npx wrangler secret put GITHUB_CLIENT_SECRET   # 1단계의 Client secret 붙여넣기

# (선택) 이 워커로 로그인 가능한 도메인 제한 — 권장
npx wrangler secret put ALLOWED_DOMAINS        # 예: 깃허브아이디.github.io
```

시크릿을 등록한 뒤에는 한 번 더 `npm run deploy` 로 재배포하세요.

### 4단계. CMS 와 연결

`../src/admin/config.yml` 의 `backend.base_url` 을 배포된 **워커 주소**로 바꿉니다
(끝에 `/auth`, `/callback` 은 붙이지 않습니다):

```yaml
backend:
  name: github
  repo: 깃허브아이디/저장소이름
  branch: main
  base_url: https://sveltia-cms-auth.your-name.workers.dev
```

커밋·푸시하면 끝입니다.

---

## 동작 확인

- 워커 주소(`https://.../`)에 접속하면 `정상 동작 중입니다` 가 보입니다.
- `https://<사이트>/admin/` 에서 **GitHub 로그인** → 권한 승인 → 주보 폼이 열리면 성공.

## 문제 해결

| 증상 | 점검 |
|------|------|
| 로그인 창이 바로 닫히고 안 됨 | OAuth App 의 callback URL 이 `https://<워커>/callback` 와 정확히 같은지 |
| `설정 오류: ... 시크릿이 등록되지 않았습니다` | 3단계 시크릿 등록 후 재배포했는지 |
| `이 도메인에서는 로그인할 수 없습니다` | `ALLOWED_DOMAINS` 에 사이트 도메인이 포함됐는지 |
| 저장은 되는데 사이트 미반영 | GitHub **Actions** 탭에서 배포 워크플로 성공 여부 |
