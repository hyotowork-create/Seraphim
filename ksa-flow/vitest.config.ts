import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // 각 테스트 파일이 고유 SQLite 파일을 쓰므로 병렬 격리를 위해 단일 스레드는 불필요.
    globals: false,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
