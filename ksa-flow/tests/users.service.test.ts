import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createUser, updateUser, listUsers } from "@/lib/services/users";
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

describe("사용자 관리 서비스 (SYSADMIN 전용)", () => {
  it("SYSADMIN이 사용자를 생성하고 audit CREATE가 남는다", async () => {
    const admin = toActor(await makeUser(prisma, "SYSADMIN"));

    const created = await createUser(prisma, admin, {
      email: "staff1@ksa.local",
      name: "담당자1",
      password: "password123",
      role: "STAFF",
    });

    expect(created.email).toBe("staff1@ksa.local");
    expect(created.role).toBe("STAFF");
    // 비밀번호 해시는 응답에 노출되지 않는다
    expect((created as Record<string, unknown>).passwordHash).toBeUndefined();

    // DB에는 해시로 저장, 평문 아님
    const inDb = await prisma.user.findUnique({ where: { email: "staff1@ksa.local" } });
    expect(inDb!.passwordHash).not.toBe("password123");
    expect(await bcrypt.compare("password123", inDb!.passwordHash)).toBe(true);

    const logs = await prisma.auditLog.findMany({ where: { entity: "User", action: "CREATE" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(admin.id);
    expect(logs[0].entityId).toBe(created.id);
    // 감사로그에도 passwordHash가 절대 들어가지 않는다
    expect(logs[0].after).not.toContain("passwordHash");
    expect(logs[0].after).not.toContain("password123");
  });

  it("SYSADMIN이 아니면 사용자 생성 403", async () => {
    const staff = toActor(await makeUser(prisma, "STAFF"));
    await expect(
      createUser(prisma, staff, {
        email: "x@ksa.local",
        name: "x",
        password: "password123",
        role: "STAFF",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // 실패 시 감사로그·사용자 모두 안 남음
    expect(await prisma.user.count({ where: { email: "x@ksa.local" } })).toBe(0);
  });

  it("이메일 중복은 409 Conflict", async () => {
    const admin = toActor(await makeUser(prisma, "SYSADMIN"));
    const payload = { email: "dup@ksa.local", name: "a", password: "password123", role: "STAFF" };
    await createUser(prisma, admin, payload);
    await expect(createUser(prisma, admin, payload)).rejects.toBeInstanceOf(ConflictError);
  });

  it("잘못된 입력(짧은 비밀번호)은 422 Validation", async () => {
    const admin = toActor(await makeUser(prisma, "SYSADMIN"));
    await expect(
      createUser(prisma, admin, { email: "y@ksa.local", name: "y", password: "short", role: "STAFF" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("역할 변경(update)은 UPDATE 감사, 비활성화는 DEACTIVATE 감사", async () => {
    const admin = toActor(await makeUser(prisma, "SYSADMIN"));
    const target = await makeUser(prisma, "STAFF");

    await updateUser(prisma, admin, target.id, { role: "ADMIN" });
    await updateUser(prisma, admin, target.id, { active: false });

    const actions = (
      await prisma.auditLog.findMany({ where: { entity: "User", entityId: target.id }, orderBy: { createdAt: "asc" } })
    ).map((l) => l.action);
    expect(actions).toEqual(["UPDATE", "DEACTIVATE"]);

    const updated = await prisma.user.findUnique({ where: { id: target.id } });
    expect(updated!.role).toBe("ADMIN");
    expect(updated!.active).toBe(false);
  });

  it("listUsers는 passwordHash 없이 반환", async () => {
    const admin = toActor(await makeUser(prisma, "SYSADMIN"));
    const list = await listUsers(prisma, admin);
    expect(list.length).toBeGreaterThan(0);
    for (const u of list) expect((u as Record<string, unknown>).passwordHash).toBeUndefined();
  });
});
