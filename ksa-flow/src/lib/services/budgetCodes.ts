import type { BudgetCode, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { fundSourceSchema } from "../enums";
import { assertCan, type Actor } from "../roles";
import { withAudit } from "../audit";
import { ConflictError, NotFoundError, ValidationError } from "../errors";

/**
 * 예산코드 CRUD (SPEC §5-6, ADMIN). 모든 쓰기는 audit + capability 검사.
 * 금액은 정수(원). 음수/실수 금지.
 */

export const createBudgetCodeSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  fiscalYear: z.number().int().gte(2000).lte(2100),
  fundSource: fundSourceSchema,
  annualLimit: z.number().int().nonnegative(),
  active: z.boolean().optional().default(true),
});
export type CreateBudgetCodeInput = z.infer<typeof createBudgetCodeSchema>;

export const updateBudgetCodeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  fiscalYear: z.number().int().gte(2000).lte(2100).optional(),
  fundSource: fundSourceSchema.optional(),
  annualLimit: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});
export type UpdateBudgetCodeInput = z.infer<typeof updateBudgetCodeSchema>;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const res = schema.safeParse(input);
  if (!res.success) {
    throw new ValidationError(res.error.issues.map((i) => i.message).join(", "));
  }
  return res.data;
}

export async function createBudgetCode(
  client: PrismaClient,
  actor: Actor,
  input: unknown,
): Promise<BudgetCode> {
  assertCan(actor, "budget:manage");
  const data = parse(createBudgetCodeSchema, input);

  const dup = await client.budgetCode.findUnique({ where: { code: data.code } });
  if (dup) throw new ConflictError("이미 존재하는 예산코드입니다");

  return withAudit(
    client,
    { actorId: actor.id, entity: "BudgetCode", action: "CREATE" },
    async (tx) => {
      const created = await tx.budgetCode.create({
        data: { ...data, createdById: actor.id },
      });
      return { entityId: created.id, after: created, result: created };
    },
  );
}

export async function listBudgetCodes(
  client: PrismaClient,
  actor: Actor,
): Promise<BudgetCode[]> {
  // 목록 조회는 대시보드/예산관리 화면 공통 — dashboard:view 이상이면 허용
  // (SYSADMIN은 dashboard:view 없음 → 자동 차단)
  assertCan(actor, "dashboard:view");
  return client.budgetCode.findMany({ orderBy: { code: "asc" } });
}

export async function updateBudgetCode(
  client: PrismaClient,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<BudgetCode> {
  assertCan(actor, "budget:manage");
  const patch = parse(updateBudgetCodeSchema, input);

  const before = await client.budgetCode.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("예산코드를 찾을 수 없습니다");

  return withAudit(
    client,
    { actorId: actor.id, entity: "BudgetCode", action: "UPDATE" },
    async (tx) => {
      const updated = await tx.budgetCode.update({ where: { id }, data: patch });
      return { entityId: id, before, after: updated, result: updated };
    },
  );
}
