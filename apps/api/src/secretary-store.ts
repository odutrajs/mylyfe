import {
  normalizeSecretaryModuleState,
  type SecretaryJob,
  type SecretaryModuleState
} from "@mylyfe/domain";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type SecretaryPlanState = SecretaryModuleState;

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secretaryRoot = process.env.SECRETARY_DATA_DIR
  ? path.resolve(process.env.SECRETARY_DATA_DIR)
  : path.resolve(appRoot, "data", "secretary");
const plansRoot = path.resolve(secretaryRoot, "plans");
const outboxPath = path.resolve(secretaryRoot, "outbox.json");

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9-_]/g, "_");

const readJson = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
};

const writeJson = async (filePath: string, value: unknown) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
};

export const readLegacySecretaryState = async (planId: string) => {
  const stored = await readJson<Partial<SecretaryPlanState>>(path.resolve(plansRoot, `${safeId(planId)}.json`), {});
  if (!stored.alerts?.length && !stored.settings && !stored.updatedAt) return null;
  return normalizeSecretaryModuleState(stored);
};

export const getOutbox = async () => {
  const stored = await readJson<{ jobs?: SecretaryJob[] }>(outboxPath, { jobs: [] });
  return stored.jobs ?? [];
};

export const saveOutbox = async (jobs: SecretaryJob[]) => {
  await writeJson(outboxPath, { jobs });
  return jobs;
};

export const enqueueJobs = async (jobs: SecretaryJob[]) => {
  if (!jobs.length) return getOutbox();
  const current = await getOutbox();
  return saveOutbox([...current, ...jobs]);
};
