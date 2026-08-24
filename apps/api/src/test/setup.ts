import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach } from "vitest";

export const testDataDir = path.resolve(process.cwd(), ".tmp-test-data");

mkdirSync(testDataDir, { recursive: true });

afterEach(() => {
  rmSync(testDataDir, { recursive: true, force: true });
  mkdirSync(testDataDir, { recursive: true });
});
