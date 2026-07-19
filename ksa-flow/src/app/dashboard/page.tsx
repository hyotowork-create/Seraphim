import { getActor } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Nav } from "@/components/Nav";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?callbackUrl=/dashboard");

  const me = await prisma.user.findUnique({ where: { id: actor.id } });
  const budgets = can(actor, "dashboard:view")
    ? await prisma.budgetCode.findMany({ where: { active: true }, orderBy: { code: "asc" } })
    : [];

  return (
    <>
      <Nav actor={actor} name={me?.name ?? actor.id} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-4 text-xl font-bold">대시보드</h1>
        {budgets.length === 0 ? (
          <p className="text-slate-500">표시할 예산코드가 없습니다.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {budgets.map((b) => (
              <div key={b.id} className="rounded-lg border bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-xs text-slate-400">{b.code}</span>
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  연간 한도 {b.annualLimit.toLocaleString("ko-KR")}원
                </div>
                <div className="mt-1 h-2 w-full rounded bg-slate-100">
                  <div className="h-2 w-0 rounded bg-indigo-500" />
                </div>
                <div className="mt-1 text-xs text-slate-400">집행 0% (M3 이후 집계)</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
