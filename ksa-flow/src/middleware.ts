import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { evaluateRouteAccess, type Actor } from "@/lib/roles";
import type { Role } from "@/lib/enums";

const { auth } = NextAuth(authConfig);

/**
 * 라우트 접근 제어 (SPEC §9: 미들웨어 + handler 이중 검사).
 * 결정 로직은 evaluateRouteAccess(순수함수)에 위임 → 테스트로 증명.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const sessionUser = req.auth?.user;

  const actor: Actor | null = sessionUser
    ? { id: sessionUser.id, role: sessionUser.role as Role, active: sessionUser.active }
    : null;

  const decision = evaluateRouteAccess(pathname, actor);

  if (decision === "LOGIN_REQUIRED") {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (decision === "FORBIDDEN") {
    return new NextResponse("403 Forbidden — 접근 권한이 없습니다", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.next();
});

export const config = {
  // 정적 파일 / NextAuth API / login 은 통과
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
