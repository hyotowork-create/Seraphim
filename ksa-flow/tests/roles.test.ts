import { describe, it, expect } from "vitest";
import {
  can,
  assertCan,
  assertNotSelfApproval,
  assertBatchMakerNotCreator,
  evaluateRouteAccess,
  requiredCapabilityForPath,
  type Actor,
} from "@/lib/roles";
import { ForbiddenError } from "@/lib/errors";

const actor = (role: Actor["role"], active = true): Actor => ({ id: `u-${role}`, role, active });

describe("capability matrix (SPEC §2)", () => {
  it("STAFF는 증빙등록·결의작성만, 승인·관리 불가", () => {
    const a = actor("STAFF");
    expect(can(a, "evidence:create")).toBe(true);
    expect(can(a, "request:create")).toBe(true);
    expect(can(a, "approve:step1")).toBe(false);
    expect(can(a, "users:manage")).toBe(false);
    expect(can(a, "budget:manage")).toBe(false);
  });

  it("ADMIN은 예산관리·1차승인·지급배치, 최종승인·결의작성 불가", () => {
    const a = actor("ADMIN");
    expect(can(a, "budget:manage")).toBe(true);
    expect(can(a, "approve:step1")).toBe(true);
    expect(can(a, "payment:create")).toBe(true);
    expect(can(a, "approve:step2")).toBe(false);
    expect(can(a, "request:create")).toBe(false);
  });

  it("DIRECTOR는 최종승인·조회, 결의작성·지급 불가", () => {
    const a = actor("DIRECTOR");
    expect(can(a, "approve:step2")).toBe(true);
    expect(can(a, "audit:read")).toBe(true);
    expect(can(a, "request:create")).toBe(false);
    expect(can(a, "payment:create")).toBe(false);
    expect(can(a, "approve:step1")).toBe(false);
  });

  it("AUDITOR는 읽기전용(감사로그 포함), 모든 쓰기 불가", () => {
    const a = actor("AUDITOR");
    expect(can(a, "audit:read")).toBe(true);
    expect(can(a, "dashboard:view")).toBe(true);
    expect(can(a, "budget:manage")).toBe(false);
    expect(can(a, "evidence:create")).toBe(false);
    expect(can(a, "approve:step1")).toBe(false);
  });

  it("SYSADMIN은 사용자·설정만, 업무 트랜잭션 전면 금지 (하드룰 §2-3)", () => {
    const a = actor("SYSADMIN");
    expect(can(a, "users:manage")).toBe(true);
    expect(can(a, "settings:manage")).toBe(true);
    // 업무 트랜잭션 전부 금지
    expect(can(a, "evidence:create")).toBe(false);
    expect(can(a, "request:create")).toBe(false);
    expect(can(a, "approve:step1")).toBe(false);
    expect(can(a, "approve:step2")).toBe(false);
    expect(can(a, "payment:create")).toBe(false);
    expect(can(a, "reconcile:manage")).toBe(false);
    expect(can(a, "dashboard:view")).toBe(false);
  });

  it("비활성 사용자는 어떤 권한도 없다", () => {
    expect(can(actor("SYSADMIN", false), "users:manage")).toBe(false);
    expect(can(actor("ADMIN", false), "budget:manage")).toBe(false);
  });

  it("assertCan은 권한 없으면 ForbiddenError(403)", () => {
    expect(() => assertCan(actor("STAFF"), "users:manage")).toThrow(ForbiddenError);
    try {
      assertCan(actor("STAFF"), "users:manage");
    } catch (e) {
      expect((e as ForbiddenError).status).toBe(403);
    }
  });
});

describe("Maker ≠ Checker 하드룰 (§2-1, §2-2)", () => {
  it("본인이 작성한 결의는 승인 불가", () => {
    const admin = actor("ADMIN");
    expect(() => assertNotSelfApproval(admin, admin.id)).toThrow(ForbiddenError);
    expect(() => assertNotSelfApproval(admin, "other-user")).not.toThrow();
  });

  it("배치 생성자는 배치 내 결의 작성자가 될 수 없다", () => {
    expect(() => assertBatchMakerNotCreator("m1", ["a", "m1", "b"])).toThrow(ForbiddenError);
    expect(() => assertBatchMakerNotCreator("m1", ["a", "b"])).not.toThrow();
  });
});

describe("라우트 접근 결정 evaluateRouteAccess", () => {
  it("미인증은 로그인 필요", () => {
    expect(evaluateRouteAccess("/settings", null)).toBe("LOGIN_REQUIRED");
  });

  it("STAFF가 /settings 접근 → FORBIDDEN (M1 ✅ '/settings 403')", () => {
    expect(evaluateRouteAccess("/settings", actor("STAFF"))).toBe("FORBIDDEN");
  });

  it("SYSADMIN이 /settings 접근 → ALLOW", () => {
    expect(evaluateRouteAccess("/settings", actor("SYSADMIN"))).toBe("ALLOW");
  });

  it("STAFF가 /budgets 접근 → FORBIDDEN, ADMIN → ALLOW", () => {
    expect(evaluateRouteAccess("/budgets", actor("STAFF"))).toBe("FORBIDDEN");
    expect(evaluateRouteAccess("/budgets", actor("ADMIN"))).toBe("ALLOW");
  });

  it("SYSADMIN이 업무화면(/evidences) 접근 → FORBIDDEN", () => {
    expect(evaluateRouteAccess("/evidences", actor("SYSADMIN"))).toBe("FORBIDDEN");
  });

  it("일반 화면(/dashboard)은 로그인만 되면 ALLOW", () => {
    expect(requiredCapabilityForPath("/dashboard")).toBeNull();
    expect(evaluateRouteAccess("/dashboard", actor("STAFF"))).toBe("ALLOW");
  });
});
