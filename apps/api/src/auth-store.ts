import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  passwordSalt: string;
  passwordHash: string;
  personalPlanId: string;
  activePlanId: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthSessionRecord = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type AuthStoreFile = {
  users: StoredUser[];
  sessions: AuthSessionRecord[];
};

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(appRoot, "data");
const storePath = path.resolve(dataRoot, "auth.json");

const emptyStore = (): AuthStoreFile => ({ users: [], sessions: [] });

const readStore = async (): Promise<AuthStoreFile> => {
  try {
    const stored = JSON.parse(await readFile(storePath, "utf8")) as Partial<AuthStoreFile>;
    return {
      users: stored.users ?? [],
      sessions: stored.sessions ?? []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
};

const writeStore = async (store: AuthStoreFile) => {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
};

const locks = new Map<string, Promise<unknown>>();

const withLock = async <T>(fn: () => Promise<T>) => {
  const previous = locks.get("auth") ?? Promise.resolve();
  let release = () => undefined as void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(
    "auth",
    previous.catch(() => undefined).then(() => current)
  );
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get("auth") === current) locks.delete("auth");
  }
};

const pruneSessions = (sessions: AuthSessionRecord[], now = Date.now()) =>
  sessions.filter((session) => Date.parse(session.expiresAt) > now);

export const listUsers = async () => (await readStore()).users;

export const findUserByEmail = async (email: string) => {
  const normalized = email.trim().toLowerCase();
  return (await readStore()).users.find((user) => user.email === normalized);
};

export const findUserById = async (id: string) => (await readStore()).users.find((user) => user.id === id);

export const saveUser = async (user: StoredUser) =>
  withLock(async () => {
    const store = await readStore();
    const index = store.users.findIndex((item) => item.id === user.id);
    const next = { ...user, updatedAt: new Date().toISOString() };
    if (index >= 0) store.users[index] = next;
    else store.users.push(next);
    await writeStore(store);
    return next;
  });

export const createSessionRecord = async (record: AuthSessionRecord) =>
  withLock(async () => {
    const store = await readStore();
    store.sessions = pruneSessions(store.sessions);
    store.sessions.push(record);
    await writeStore(store);
    return record;
  });

export const findSessionRecord = async (token: string) => {
  if (!token) return undefined;
  const store = await readStore();
  const session = pruneSessions(store.sessions).find((item) => item.token === token);
  return session;
};

export const deleteSessionRecord = async (token: string) =>
  withLock(async () => {
    const store = await readStore();
    store.sessions = pruneSessions(store.sessions).filter((item) => item.token !== token);
    await writeStore(store);
  });

export const deleteSessionsForUser = async (userId: string) =>
  withLock(async () => {
    const store = await readStore();
    store.sessions = pruneSessions(store.sessions).filter((item) => item.userId !== userId);
    await writeStore(store);
  });

export const deleteUser = async (userId: string) =>
  withLock(async () => {
    const store = await readStore();
    store.users = store.users.filter((user) => user.id !== userId);
    store.sessions = pruneSessions(store.sessions).filter((session) => session.userId !== userId);
    await writeStore(store);
  });
