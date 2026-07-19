import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      active: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    active?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: string;
    active?: boolean;
  }
}
