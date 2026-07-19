import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const ROOT = path.resolve(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tests", ".tmp");

/**
 * 테스트 파일마다 고유한 SQLite 파일을 만들고 스키마를 push한 뒤
 * 격리된 PrismaClient를 돌려준다.
 */
export function createTestDb(): {
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
} {
  mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, `test-${randomUUID()}.db`);
  const url = `file:${file}`;

  // 매 테스트 파일마다 새 파일이므로 --force-reset 불필요(비파괴적 push).
  execSync("npx prisma db push --skip-generate", {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });

  const prisma = new PrismaClient({ datasourceUrl: url });

  return {
    prisma,
    cleanup: async () => {
      await prisma.$disconnect();
      rmSync(file, { force: true });
      rmSync(`${file}-journal`, { force: true });
    },
  };
}

/** 모든 테이블 비우기 (테스트 간 격리) */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.paymentBatch.deleteMany();
  await prisma.bankTxn.deleteMany();
  await prisma.expenseRequest.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.monthlyPlan.deleteMany();
  await prisma.budgetCode.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();
}

/** 테스트용 사용자 생성 (Actor로 바로 쓰기 편하게) */
export async function makeUser(
  prisma: PrismaClient,
  role: string,
  overrides: Partial<{ email: string; name: string; active: boolean }> = {},
) {
  const suffix = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${role.toLowerCase()}-${suffix}@ksa.local`,
      name: overrides.name ?? `${role}-${suffix}`,
      role,
      active: overrides.active ?? true,
      passwordHash: "x", // 서비스 계층 테스트는 로그인 안 함
    },
  });
}
