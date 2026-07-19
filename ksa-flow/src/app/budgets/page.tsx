import { getActor } from "@/lib/session";
import { redirect } from "next/navigation";
import { can } from "@/lib/roles";
import { listBudgetCodes } from "@/lib/services/budgetCodes";
import { prisma } from "@/lib/prisma";
import { Nav } from "@/components/Nav";
import { BudgetManager } from "@/components/BudgetManager";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?callbackUrl=/budgets");

  if (!can(actor, "budget:manage")) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-2xl font-bold text-red-600">403</p>
        <p className="mt-2 text-slate-600">예산관리는 사무국장(ADMIN)만 접근할 수 있습니다.</p>
      </main>
    );
  }

  const budgets = await listBudgetCodes(prisma, actor);
  const me = await prisma.user.findUnique({ where: { id: actor.id } });

  return (
    <>
      <Nav actor={actor} name={me?.name ?? actor.id} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-4 text-xl font-bold">예산관리</h1>
        <BudgetManager initial={budgets} />
      </main>
    </>
  );
}
