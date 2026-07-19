import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createBudgetCode, updateBudgetCode, listBudgetCodes } from "@/lib/services/budgetCodes";
import { ForbiddenError, ConflictError, ValidationError } from "@/lib/errors";
import { type Actor } from "@/lib/roles";
import { createTestDb, truncateAll, makeUser } from "./helpers/db";

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

describe("예산코드 CRUD (ADMIN 전용)", () => {
  const sample = {
    code: "2026-사업-01",
    name: "이웃 도시락 프로그램",
    fiscalYear: 2026,
    fundSource: "SUBSIDY",
    annualLimit: 5000000,
  };

  it("ADMIN이 예산코드를 생성하고 audit CREATE가 남는다", async () => {
    const admin = toActor(await makeUser(prisma, "ADMIN"));
    const created = await createBudgetCode(prisma, admin, sample);

    expect(created.code).toBe(sample.code);
    expect(created.annualLimit).toBe(5000000);
    expect(created.createdById).toBe(admin.id);

    const logs = await prisma.auditLog.findMany({ where: { entity: "BudgetCode", action: "CREATE" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe(created.id);
    expect(logs[0].actorId).toBe(admin.id);
  });

  it("STAFF·DIRECTOR·SYSADMIN은 예산코드 생성 403", async () => {
    for (const role of ["STAFF", "DIRECTOR", "SYSADMIN"]) {
      const a = toActor(await makeUser(prisma, role));
      await expect(createBudgetCode(prisma, a, sample)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await prisma.budgetCode.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("코드 중복은 409", async () => {
    const admin = toActor(await makeUser(prisma, "ADMIN"));
    await createBudgetCode(prisma, admin, sample);
    await expect(createBudgetCode(prisma, admin, sample)).rejects.toBeInstanceOf(ConflictError);
  });

  it("음수 한도는 422 (금액은 0 이상 정수)", async () => {
    const admin = toActor(await makeUser(prisma, "ADMIN"));
    await expect(
      createBudgetCode(prisma, admin, { ...sample, annualLimit: -1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("실수(소수) 한도는 422 (부동소수점 금지)", async () => {
    const admin = toActor(await makeUser(prisma, "ADMIN"));
    await expect(
      createBudgetCode(prisma, admin, { ...sample, annualLimit: 1000.5 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("update는 before/after 스냅샷과 함께 UPDATE 감사", async () => {
    const admin = toActor(await makeUser(prisma, "ADMIN"));
    const created = await createBudgetCode(prisma, admin, sample);

    await updateBudgetCode(prisma, admin, created.id, { annualLimit: 7000000 });

    const log = await prisma.auditLog.findFirst({
      where: { entity: "BudgetCode", entityId: created.id, action: "UPDATE" },
    });
    expect(log).not.toBeNull();
    expect(JSON.parse(log!.before!).annualLimit).toBe(5000000);
    expect(JSON.parse(log!.after!).annualLimit).toBe(7000000);
  });

  it("listBudgetCodes는 조회권한(dashboard:view) 있는 역할에 허용, SYSADMIN 차단", async () => {
    const admin = toActor(await makeUser(prisma, "ADMIN"));
    await createBudgetCode(prisma, admin, sample);

    const staff = toActor(await makeUser(prisma, "STAFF"));
    expect((await listBudgetCodes(prisma, staff)).length).toBe(1);

    const sys = toActor(await makeUser(prisma, "SYSADMIN"));
    await expect(listBudgetCodes(prisma, sys)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
