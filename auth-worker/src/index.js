/**
 * Sveltia CMS / Decap CMS 용 GitHub OAuth 중계 워커 (Cloudflare Workers).
 *
 * 왜 필요한가:
 *  - GitHub 로그인(OAuth)은 브라우저에 노출하면 안 되는 client_secret 이 필요합니다.
 *  - 이 워커가 그 비밀을 대신 들고 있다가, 로그인 결과(access token)만 CMS 팝업으로
 *    안전하게 전달합니다. 목회자는 /admin 에서 "GitHub 로그인" 한 번만 누르면 됩니다.
 *
 * 엔드포인트:
 *  - GET /auth     : GitHub 인증 페이지로 보냄
 *  - GET /callback : GitHub 가 돌아오는 곳. 코드를 토큰으로 바꿔 CMS 로 전달
 *
 * 필요한 환경변수(시크릿):
 *  - GITHUB_CLIENT_ID
 *  - GITHUB_CLIENT_SECRET
 *  - ALLOWED_DOMAINS (선택, 콤마로 구분. 비우면 모든 도메인 허용)
 */

const PROVIDER = "github";

function htmlHeaders(extra = {}) {
  return { "Content-Type": "text/html; charset=utf-8", ...extra };
}

function randomState() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

// CMS 가 기대하는 postMessage 형식으로 결과를 돌려주는 HTML 을 만듭니다.
function renderDone(status, payload) {
  const data = JSON.stringify(payload).replace(/</g, "\\u003c");
  const message = `authorization:${PROVIDER}:${status}:${data}`;
  return `<!doctype html>
<html lang="ko">
  <head><meta charset="utf-8" /><title>로그인 처리 중…</title></head>
  <body>
    <p style="font-family:sans-serif">로그인 처리 중입니다. 잠시만 기다려 주세요…</p>
    <script>
      (function () {
        var done = false;
        function send(origin) {
          if (window.opener) window.opener.postMessage(${JSON.stringify(
            message
          )}, origin);
        }
        function receive(e) {
          if (done) return;
          done = true;
          send(e.origin);
          window.removeEventListener("message", receive, false);
          setTimeout(function () { window.close(); }, 300);
        }
        window.addEventListener("message", receive, false);
        // CMS 에 "인증 시작" 신호 → CMS 가 자기 주소로 응답 → 위 receive 가 토큰 전달
        if (window.opener) window.opener.postMessage("authorizing:${PROVIDER}", "*");
      })();
    </script>
  </body>
</html>`;
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;
    const clientId = env.GITHUB_CLIENT_ID;
    const clientSecret = env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return new Response(
        "설정 오류: GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET 시크릿이 등록되지 않았습니다.",
        { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    // ── 1) 로그인 시작 ──
    if (pathname === "/auth") {
      // (선택) 허용 도메인 검사: 다른 사이트가 이 워커를 빌려쓰지 못하게 막습니다.
      const allowed = (env.ALLOWED_DOMAINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const siteId = searchParams.get("site_id") || "";
      if (
        allowed.length &&
        !allowed.some((d) => siteId === d || siteId.endsWith("." + d))
      ) {
        return new Response("이 도메인에서는 로그인할 수 없습니다.", {
          status: 403,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      const scope = searchParams.get("scope") || "repo";
      const state = randomState();
      const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
      authorizeUrl.searchParams.set("client_id", clientId);
      authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/callback`);
      authorizeUrl.searchParams.set("scope", scope);
      authorizeUrl.searchParams.set("state", state);

      return new Response(null, {
        status: 302,
        headers: {
          Location: authorizeUrl.toString(),
          // CSRF 방지용 state 를 쿠키에 잠시 저장
          "Set-Cookie": `csrf=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
        },
      });
    }

    // ── 2) GitHub 콜백: 코드 → 토큰 ──
    if (pathname === "/callback") {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const csrf = getCookie(request, "csrf");

      if (!code) {
        return new Response(
          renderDone("error", { message: "인증 코드가 없습니다." }),
          { headers: htmlHeaders() }
        );
      }
      if (!state || !csrf || state !== csrf) {
        return new Response(
          renderDone("error", { message: "보안 검증(state)에 실패했습니다. 다시 시도해 주세요." }),
          { headers: htmlHeaders() }
        );
      }

      let data;
      try {
        const tokenRes = await fetch(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "User-Agent": "sveltia-cms-auth",
            },
            body: JSON.stringify({
              client_id: clientId,
              client_secret: clientSecret,
              code,
              redirect_uri: `${url.origin}/callback`,
            }),
          }
        );
        data = await tokenRes.json();
      } catch (e) {
        return new Response(
          renderDone("error", { message: "GitHub 토큰 요청 중 오류가 발생했습니다." }),
          { headers: htmlHeaders() }
        );
      }

      if (data.error || !data.access_token) {
        return new Response(
          renderDone("error", {
            message: data.error_description || data.error || "토큰 교환에 실패했습니다.",
          }),
          { headers: htmlHeaders() }
        );
      }

      return new Response(
        renderDone("success", { token: data.access_token, provider: PROVIDER }),
        {
          headers: htmlHeaders({
            "Set-Cookie": "csrf=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
          }),
        }
      );
    }

    // ── 상태 확인용 기본 페이지 ──
    if (pathname === "/") {
      return new Response("Sveltia CMS Auth worker 가 정상 동작 중입니다.", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
