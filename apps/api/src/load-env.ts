import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const loadEnvFile = (filePath: string) => {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
};

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.resolve(here, "../../../.env"));
loadEnvFile(path.resolve(here, "../../.env"));
loadEnvFile(path.resolve(process.cwd(), ".env"));
