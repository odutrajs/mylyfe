import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    fileParallelism: false,
    env: {
      DATA_DIR: path.resolve(process.cwd(), ".tmp-test-data")
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/auth-service.ts",
        "src/auth-store.ts",
        "src/installments.ts",
        "src/parser.ts",
        "src/phone-verify-service.ts",
        "src/phone-verify-store.ts",
        "src/secretary-service.ts"
      ],
      thresholds: {
        lines: 55,
        functions: 65,
        statements: 55
      }
    }
  }
});
