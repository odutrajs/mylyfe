import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/lib.ts", "src/app-logic.ts", "src/MoneyField.tsx", "src/WhatsAppPhoneField.tsx", "src/Mascot.tsx"],
      thresholds: {
        lines: 80,
        functions: 70,
        statements: 80
      }
    }
  }
});
