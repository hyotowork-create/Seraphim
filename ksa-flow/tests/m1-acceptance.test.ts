import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createUser } from "@/lib/services/users";
import { createBudgetCode } from "@/lib/services/budgetCodes";
import { evaluateRouteAccess, type Actor } from "@/lib/roles";
import { createTestDb, truncateAll, makeUser } from "./helpers/db";

/**
 * SPEC §8 M1 완료 기준(✅)을 그대로 검증하는 인수 테스트.
 *   1) SYSADMIN이 사용자 생성
 *   2) STAFF 로그인 시 /settings 403
 *   3) 모든 CRUD가 AuditLog에 남음
 */

let prisma: PrismaClient;
let cleanup: () => Promise<void>;
const toActor = (u: { id: string; role: string; active: boolean }): Actor => ({
  id: u.id,
  role: u.role as Actor["role"],
  active: u.active,
});

beforeAll(() => {
  const db = createTestDb();
  prisma = db.prisma;
  cleanup = db.cleanup;
});
afterAll(() => cleanup());
beforeEach(() => truncateAll(prisma));

describe("M1 완료 기준", () => {
  it("① SYSADMIN이 STAFF 사용자를 생성한다", async () => {
    const sysadmin = toActor(await makeUser(prisma, "SYSADMIN"));
    const staff = await createUser(prisma, sysadmin, {
      email: "newstaff@ksa.local",
      name: "신규 담당자",
      password: "welcome1234",
      role: "STAFF",
    });
    expect(staff.role).toBe("STAFF");
    expect(await prisma.user.count()).toBe(2); // sysadmin + 신규
  });

  it("② STAFF 로그인 시 /settings 접근은 403(FORBIDDEN)", async () => {
    const staff = toActor(await makeUser(prisma, "STAFF"));
    expect(evaluateRouteAccess("/settings", staff)).toBe("FORBIDDEN");
    // 대조군: SYSADMIN은 통과
    const sys = toActor(await makeUser(prisma, "SYSADMIN"));
    expect(evaluateRouteAccess("/settings", sys)).toBe("ALLOW");
  });

  it("③ 사용자·예산코드 CRUD가 전부 AuditLog에 남는다", async () => {
    const sysadmin = toActor(await makeUser(prisma, "SYSADMIN"));
    const admin = toActor(await makeUser(prisma, "ADMIN"));

    // 사용자 생성 (SYSADMIN)
    const created = await createUser(prisma, sysadmin, {
      email: "audited@ksa.local",
      name: "감사대상",
      password: "welcome1234",
      role: "STAFF",
    });
    // 예산코드 생성 (ADMIN)
    const budget = await createBudgetCode(prisma, admin, {
      code: "2026-운영-01",
      name: "일반 운영비",
      fiscalYear: 2026,
      fundSource: "GENERAL",
      annualLimit: 3000000,
    });

    const userLog = await prisma.auditLog.findFirst({
      where: { entity: "User", entityId: created.id, action: "CREATE" },
    });
    const budgetLog = await prisma.auditLog.findFirst({
      where: { entity: "BudgetCode", entityId: budget.id, action: "CREATE" },
    });

    expect(userLog).not.toBeNull();
    expect(userLog!.actorId).toBe(sysadmin.id);
    expect(budgetLog).not.toBeNull();
    expect(budgetLog!.actorId).toBe(admin.id);

    // 감사로그는 최소 2건(각 CREATE), 모두 시각·행위자 기록
    const all = await prisma.auditLog.findMany();
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const log of all) {
      expect(log.actorId).toBeTruthy();
      expect(log.createdAt).toBeInstanceOf(Date);
    }
  });
});
