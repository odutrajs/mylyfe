import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/format.ts", "src/api.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80
      }
    }
  }
});
