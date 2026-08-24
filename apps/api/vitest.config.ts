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
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/load-env.ts",
        "src/secretary-ai.ts",
        "src/spend-coach-ai.ts",
        "src/secretary-transcribe.ts",
        "src/pdf-parse.d.ts",
        "src/**/*.test.ts",
        "src/test/**"
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        statements: 50
      }
    }
  }
});
