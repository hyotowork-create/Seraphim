import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe 설정 (미들웨어에서 사용).
 * bcrypt / Prisma 같은 Node 전용 의존성을 여기 두지 않는다.
 * Credentials provider의 authorize(실제 DB 조회)는 auth.ts(Node 런타임)에만 있다.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // auth.ts에서 Credentials 주입
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // authorize()가 반환한 도메인 필드를 토큰에 심는다
        token.uid = (user as { id: string }).id;
        token.role = (user as { role?: string }).role;
        token.active = (user as { active?: boolean }).active ?? true;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as string;
        session.user.active = token.active as boolean;
      }
      return session;
    },
  },
};

export default authConfig;
