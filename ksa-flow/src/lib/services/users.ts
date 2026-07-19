import type { PrismaClient, User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { roleSchema } from "../enums";
import { assertCan, type Actor } from "../roles";
import { withAudit } from "../audit";
import { ConflictError, NotFoundError, ValidationError } from "../errors";

/** 감사로그·응답에서 passwordHash를 절대 노출하지 않는다. */
export type SafeUser = Omit<User, "passwordHash">;
export function redactUser(u: User): SafeUser {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}

const BCRYPT_ROUNDS = 10;

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
  role: roleSchema,
  active: z.boolean().optional().default(true),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const res = schema.safeParse(input);
  if (!res.success) {
    throw new ValidationError(res.error.issues.map((i) => i.message).join(", "));
  }
  return res.data;
}

/** SYSADMIN이 사용자 생성 (SPEC §2, M1 ✅ 기준) */
export async function createUser(
  client: PrismaClient,
  actor: Actor,
  input: unknown,
): Promise<SafeUser> {
  assertCan(actor, "users:manage");
  const data = parse(createUserSchema, input);

  const existing = await client.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ConflictError("이미 등록된 이메일입니다");

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  return withAudit(
    client,
    { actorId: actor.id, entity: "User", action: "CREATE" },
    async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          role: data.role,
          active: data.active,
          passwordHash,
        },
      });
      const safe = redactUser(created);
      return { entityId: created.id, after: safe, result: safe };
    },
  );
}

export async function listUsers(client: PrismaClient, actor: Actor): Promise<SafeUser[]> {
  assertCan(actor, "users:manage");
  const users = await client.user.findMany({ orderBy: { createdAt: "asc" } });
  return users.map(redactUser);
}

export async function updateUser(
  client: PrismaClient,
  actor: Actor,
  userId: string,
  input: unknown,
): Promise<SafeUser> {
  assertCan(actor, "users:manage");
  const patch = parse(updateUserSchema, input);

  const before = await client.user.findUnique({ where: { id: userId } });
  if (!before) throw new NotFoundError("사용자를 찾을 수 없습니다");

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.role !== undefined) data.role = patch.role;
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.password !== undefined) {
    data.passwordHash = await bcrypt.hash(patch.password, BCRYPT_ROUNDS);
  }

  // active 토글은 별도 감사 action으로 구분
  const action =
    patch.active !== undefined && patch.active !== before.active
      ? patch.active
        ? "ACTIVATE"
        : "DEACTIVATE"
      : "UPDATE";

  return withAudit(
    client,
    { actorId: actor.id, entity: "User", action },
    async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data });
      return {
        entityId: userId,
        before: redactUser(before),
        after: redactUser(updated),
        result: redactUser(updated),
      };
    },
  );
}
