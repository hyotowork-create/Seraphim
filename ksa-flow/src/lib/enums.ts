import { z } from "zod";

/**
 * SQLite에는 native enum이 없으므로 enum 성격의 값을 여기서 union + zod로 관리한다.
 * (Postgres 전환 시 이 값들을 그대로 DB enum으로 승격 가능)
 */

export const ROLES = ["STAFF", "ADMIN", "DIRECTOR", "AUDITOR", "SYSADMIN"] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

export const FUND_SOURCES = ["GENERAL", "SUBSIDY", "DESIGNATED"] as const;
export type FundSource = (typeof FUND_SOURCES)[number];
export const fundSourceSchema = z.enum(FUND_SOURCES);

export const EVIDENCE_TYPES = [
  "TAX_INVOICE",
  "RECEIPT",
  "CONTRACT",
  "CARD_SLIP",
  "ETC",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const evidenceTypeSchema = z.enum(EVIDENCE_TYPES);

export const REQ_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "ADMIN_APPROVED",
  "FINAL_APPROVED",
  "REJECTED",
  "PAYMENT_READY",
  "PAID",
  "RECONCILED",
  "CANCELED",
] as const;
export type ReqStatus = (typeof REQ_STATUSES)[number];
export const reqStatusSchema = z.enum(REQ_STATUSES);

export const ROLE_LABELS: Record<Role, string> = {
  STAFF: "담당자",
  ADMIN: "사무국장",
  DIRECTOR: "상임이사",
  AUDITOR: "감사",
  SYSADMIN: "시스템관리자",
};
