import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PhoneVerification = {
  planId: string;
  personId: string;
  phone: string;
  code: string;
  expiresAt: string;
  attempts: number;
};

type StoreFile = { items: PhoneVerification[] };

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(appRoot, "data");
const storePath = path.resolve(dataRoot, "secretary", "phone-verify.json");

const readStore = async (): Promise<StoreFile> => {
  try {
    const stored = JSON.parse(await readFile(storePath, "utf8")) as Partial<StoreFile>;
    return { items: stored.items ?? [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { items: [] };
    throw error;
  }
};

const writeStore = async (store: StoreFile) => {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
};

const prune = (items: PhoneVerification[], now = Date.now()) =>
  items.filter((item) => Date.parse(item.expiresAt) > now);

export const upsertPhoneVerification = async (item: PhoneVerification) => {
  const store = await readStore();
  const items = prune(store.items).filter((current) => current.phone !== item.phone && !(current.planId === item.planId && current.personId === item.personId));
  items.push(item);
  await writeStore({ items });
  return item;
};

export const findPhoneVerification = async (phone: string) => {
  const store = await readStore();
  return prune(store.items).find((item) => item.phone === phone) ?? null;
};

export const removePhoneVerification = async (phone: string) => {
  const store = await readStore();
  await writeStore({ items: prune(store.items).filter((item) => item.phone !== phone) });
};
