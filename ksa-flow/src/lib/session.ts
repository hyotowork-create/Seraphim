import { auth } from "@/auth";
import type { Actor } from "./roles";
import type { Role } from "./enums";

/** 현재 세션을 Actor로 변환 (없으면 null) */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    role: session.user.role as Role,
    active: session.user.active,
  };
}
