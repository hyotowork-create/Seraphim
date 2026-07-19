import type { Role } from "./enums";
import { ForbiddenError } from "./errors";

/**
 * 책임분리(SPEC §2)를 코드 레벨로 강제하는 권한 모델.
 * 순수함수 — DB 접근 없음, 단위테스트 대상.
 */

export interface Actor {
  id: string;
  role: Role;
  active: boolean;
}

/** 시스템이 정의하는 능력(capability) 목록 */
export type Capability =
  // 조회
  | "dashboard:view"
  | "audit:read"
  // 관리 (SYSADMIN)
  | "users:manage"
  | "settings:manage"
  // 마스터 데이터 (ADMIN)
  | "budget:manage"
  | "vendor:manage"
  | "monthlyplan:manage"
  // 업무 트랜잭션
  | "evidence:create"
  | "request:create"
  | "approve:step1"
  | "approve:step2"
  | "payment:create"
  | "reconcile:manage";

/**
 * 역할 → 허용 능력. 표에 없는 능력은 거부(default deny).
 * SPEC §2 표를 그대로 옮긴 것.
 */
const MATRIX: Record<Role, ReadonlySet<Capability>> = {
  STAFF: new Set<Capability>(["dashboard:view", "evidence:create", "request:create"]),
  ADMIN: new Set<Capability>([
    "dashboard:view",
    "budget:manage",
    "vendor:manage",
    "monthlyplan:manage",
    "approve:step1",
    "payment:create",
    "reconcile:manage",
  ]),
  DIRECTOR: new Set<Capability>(["dashboard:view", "audit:read", "approve:step2"]),
  AUDITOR: new Set<Capability>(["dashboard:view", "audit:read"]),
  SYSADMIN: new Set<Capability>(["users:manage", "settings:manage"]),
};

/**
 * 업무 트랜잭션 능력 — SYSADMIN 하드룰(§2-3) 및 감사용.
 * SYSADMIN은 이 능력들을 절대 가질 수 없어야 한다(불변식).
 */
export const BUSINESS_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "evidence:create",
  "request:create",
  "approve:step1",
  "approve:step2",
  "payment:create",
  "reconcile:manage",
]);

export function can(actor: Pick<Actor, "role" | "active">, capability: Capability): boolean {
  if (!actor.active) return false;
  // 하드룰 §2-3: SYSADMIN은 업무 트랜잭션 전면 금지 (matrix로도 막지만 이중 방어)
  if (actor.role === "SYSADMIN" && BUSINESS_CAPABILITIES.has(capability)) return false;
  return MATRIX[actor.role]?.has(capability) ?? false;
}

export function assertCan(actor: Actor, capability: Capability): void {
  if (!can(actor, capability)) {
    throw new ForbiddenError(`역할 ${actor.role}은(는) '${capability}' 권한이 없습니다`);
  }
}

/**
 * 하드룰 §2-1 (Maker ≠ Checker): 결의 작성자는 그 결의를 승인할 수 없다.
 */
export function assertNotSelfApproval(actor: Actor, requestCreatedById: string): void {
  if (actor.id === requestCreatedById) {
    throw new ForbiddenError("본인이 작성한 결의는 승인할 수 없습니다 (Maker ≠ Checker)");
  }
}

/**
 * 하드룰 §2-2: 지급배치 생성자(Checker)는 배치 내 결의의 작성자가 아니어야 한다.
 */
export function assertBatchMakerNotCreator(makerId: string, requestCreatorIds: string[]): void {
  if (requestCreatorIds.includes(makerId)) {
    throw new ForbiddenError("배치 생성자는 배치 내 결의의 작성자가 될 수 없습니다");
  }
}

/**
 * 라우트 접근 제어(미들웨어용). 경로 prefix → 필요 능력.
 * 매칭되지 않는 경로는 로그인만 필요(캡처는 미들웨어에서).
 */
export const ROUTE_CAPABILITY: { prefix: string; capability: Capability }[] = [
  { prefix: "/settings", capability: "settings:manage" },
  { prefix: "/budgets", capability: "budget:manage" },
  { prefix: "/vendors", capability: "vendor:manage" },
  { prefix: "/audit", capability: "audit:read" },
  { prefix: "/payments", capability: "payment:create" },
  { prefix: "/reconcile", capability: "reconcile:manage" },
  { prefix: "/evidences", capability: "evidence:create" },
];

export function requiredCapabilityForPath(pathname: string): Capability | null {
  const hit = ROUTE_CAPABILITY.find((r) => pathname.startsWith(r.prefix));
  return hit ? hit.capability : null;
}

export type AccessDecision = "ALLOW" | "LOGIN_REQUIRED" | "FORBIDDEN";

/**
 * 미들웨어의 라우트 접근 결정을 순수함수로 분리(테스트 대상).
 * - 미인증: LOGIN_REQUIRED
 * - 인증됐지만 필요 능력 없음: FORBIDDEN (예: STAFF → /settings)
 * - 그 외: ALLOW
 */
export function evaluateRouteAccess(
  pathname: string,
  actor: Actor | null,
): AccessDecision {
  if (!actor) return "LOGIN_REQUIRED";
  if (!actor.active) return "FORBIDDEN";
  const cap = requiredCapabilityForPath(pathname);
  if (cap === null) return "ALLOW"; // 로그인만 필요한 일반 화면
  return can(actor, cap) ? "ALLOW" : "FORBIDDEN";
}
