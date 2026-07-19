import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./prisma";

/**
 * 감사로그(SPEC §3 AuditLog, Gate G6).
 * - append-only: 이 모듈은 create만 노출한다. update/delete 함수는 존재하지 않는다.
 * - 모든 쓰기 작업은 withAudit로 감싸 "업무변경 + 감사기록"을 하나의 트랜잭션으로 처리한다.
 *   → 감사기록이 실패하면 업무변경도 롤백된다(G6).
 */

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DEACTIVATE"
  | "ACTIVATE"
  | "STATUS_CHANGE"
  | "APPROVE"
  | "REJECT"
  | "SETTING_CHANGE"
  | "PAYMENT_BATCH"
  | "RECONCILE";

export type TxClient = Prisma.TransactionClient;

export interface AuditContext {
  actorId: string;
  entity: string;
  action: AuditAction;
  ip?: string | null;
}

export interface AuditPayload<T> {
  /** 감사 대상 엔터티의 식별자 */
  entityId: string;
  /** 변경 전 스냅샷 (CREATE는 null) */
  before?: unknown;
  /** 변경 후 스냅샷 */
  after?: unknown;
  /** 호출자에게 반환할 실제 업무 결과 */
  result: T;
}

function serialize(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v);
}

/**
 * 트랜잭션 내부에서 직접 감사기록을 남기고 싶을 때 사용하는 저수준 헬퍼.
 * (append-only: create만 수행)
 */
export async function recordAudit(
  tx: TxClient,
  ctx: AuditContext,
  entityId: string,
  before?: unknown,
  after?: unknown,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: ctx.actorId,
      entity: ctx.entity,
      entityId,
      action: ctx.action,
      before: serialize(before),
      after: serialize(after),
      ip: ctx.ip ?? null,
    },
  });
}

/**
 * 업무변경 + 감사기록을 하나의 원자적 트랜잭션으로 실행한다.
 *
 * @example
 * const user = await withAudit(prisma, { actorId, entity: "User", action: "CREATE" },
 *   async (tx) => {
 *     const created = await tx.user.create({ data });
 *     return { entityId: created.id, after: redact(created), result: created };
 *   });
 */
export async function withAudit<T>(
  client: PrismaClient,
  ctx: AuditContext,
  work: (tx: TxClient) => Promise<AuditPayload<T>>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    const payload = await work(tx);
    // 감사기록 실패 시 이 create가 throw → 전체 트랜잭션 롤백 (G6)
    await recordAudit(tx, ctx, payload.entityId, payload.before, payload.after);
    return payload.result;
  });
}

// 기본 export: 애플리케이션 코드가 사용하는 표준 진입점
export const auditedTransaction = <T>(
  ctx: AuditContext,
  work: (tx: TxClient) => Promise<AuditPayload<T>>,
) => withAudit(defaultPrisma, ctx, work);
