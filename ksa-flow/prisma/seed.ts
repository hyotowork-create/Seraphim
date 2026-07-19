import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// .env 로드 (tsx는 자동 로드하지 않음). Node 22+ 내장 기능 사용.
try {
  process.loadEnvFile();
} catch {
  // .env 없으면 환경변수를 직접 사용
}

/**
 * 초기 SYSADMIN 계정 시드 (멱등).
 * SPEC §2: SYSADMIN은 사용자·설정만 관리, 업무 트랜잭션 전면 금지.
 */
const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_SYSADMIN_EMAIL ?? "admin@ksa.local";
  const password = process.env.SEED_SYSADMIN_PASSWORD ?? "admin1234!";
  const name = process.env.SEED_SYSADMIN_NAME ?? "시스템관리자";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role: "SYSADMIN", passwordHash, active: true },
  });

  // 전결한도 기본 설정값(§3 Setting) — 없으면 생성
  await prisma.setting.upsert({
    where: { key: "final_approval_threshold" },
    update: {},
    create: { key: "final_approval_threshold", value: "1000000" },
  });

  console.log(`[seed] SYSADMIN 준비 완료: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
