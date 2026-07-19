import { getActor } from "@/lib/session";
import { redirect } from "next/navigation";
import { can } from "@/lib/roles";
import { listUsers } from "@/lib/services/users";
import { prisma } from "@/lib/prisma";
import { Nav } from "@/components/Nav";
import { UserManager } from "@/components/UserManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?callbackUrl=/settings");

  // handler 이중 검사: SYSADMIN 외에는 여기서도 차단 (미들웨어가 1차)
  if (!can(actor, "users:manage")) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-2xl font-bold text-red-600">403</p>
        <p className="mt-2 text-slate-600">설정·사용자 관리는 시스템관리자만 접근할 수 있습니다.</p>
      </main>
    );
  }

  const users = await listUsers(prisma, actor);
  const me = await prisma.user.findUnique({ where: { id: actor.id } });

  return (
    <>
      <Nav actor={actor} name={me?.name ?? actor.id} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-4 text-xl font-bold">설정 · 사용자 관리</h1>
        <UserManager initial={users} />
      </main>
    </>
  );
}
