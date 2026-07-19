import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { withAudit } from "@/lib/audit";
import { createTestDb, truncateAll, makeUser } from "./helpers/db";

let prisma: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(() => {
  const db = createTestDb();
  prisma = db.prisma;
  cleanup = db.cleanup;
});
afterAll(() => cleanup());
beforeEach(() => truncateAll(prisma));

describe("withAudit (G6: 업무변경 + 감사기록 = 원자적 트랜잭션)", () => {
  it("성공 시 업무 row와 audit row가 함께 남는다", async () => {
    const actor = await makeUser(prisma, "ADMIN");

    const created = await withAudit(
      prisma,
      { actorId: actor.id, entity: "BudgetCode", action: "CREATE" },
      async (tx) => {
        const b = await tx.budgetCode.create({
          data: { code: "T-1", name: "테스트", fiscalYear: 2026, fundSource: "GENERAL", annualLimit: 1000 },
        });
        return { entityId: b.id, after: b, result: b };
      },
    );

    const budget = await prisma.budgetCode.findUnique({ where: { id: created.id } });
    expect(budget).not.toBeNull();

    const logs = await prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].entity).toBe("BudgetCode");
    expect(logs[0].entityId).toBe(created.id);
    expect(logs[0].action).toBe("CREATE");
    expect(logs[0].actorId).toBe(actor.id);
    expect(JSON.parse(logs[0].after!).code).toBe("T-1");
  });

  it("work가 실패하면 업무변경·감사기록 모두 롤백된다 (원자성)", async () => {
    const actor = await makeUser(prisma, "ADMIN");

    await expect(
      withAudit(
        prisma,
        { actorId: actor.id, entity: "BudgetCode", action: "CREATE" },
        async (tx) => {
          await tx.budgetCode.create({
            data: { code: "T-2", name: "실패", fiscalYear: 2026, fundSource: "GENERAL", annualLimit: 1 },
          });
          throw new Error("의도적 실패");
        },
      ),
    ).rejects.toThrow("의도적 실패");

    // 롤백되어 아무것도 남지 않아야 한다
    expect(await prisma.budgetCode.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("감사기록(create)이 실패하면 업무변경도 롤백된다 (G6 핵심)", async () => {
    const actor = await makeUser(prisma, "ADMIN");

    // recordAudit가 사용할 tx.auditLog.create를 실패시켜,
    // 같은 트랜잭션의 업무변경(budgetCode.create)이 롤백되는지 검증
    await expect(
      withAudit(
        prisma,
        { actorId: actor.id, entity: "BudgetCode", action: "CREATE" },
        async (tx) => {
          const b = await tx.budgetCode.create({
            data: { code: "T-3", name: "감사실패", fiscalYear: 2026, fundSource: "GENERAL", annualLimit: 1 },
          });
          // recordAudit가 사용할 tx.auditLog.create를 실패하도록 오염
          (tx as unknown as { auditLog: { create: () => Promise<never> } }).auditLog = {
            create: () => Promise.reject(new Error("audit write failed")),
          };
          return { entityId: b.id, after: b, result: b };
        },
      ),
    ).rejects.toThrow("audit write failed");

    expect(await prisma.budgetCode.count()).toBe(0);
  });
});
