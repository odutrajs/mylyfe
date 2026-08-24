import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.tsx",
        "src/**/*.test.ts",
        "src/components/**",
        "src/auth-context.tsx",
        "src/plan-context.tsx",
        "src/ui-context.tsx"
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80
      }
    }
  }
});
