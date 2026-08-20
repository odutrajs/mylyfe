import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { RoutineCalendarEvent } from "@mylyfe/domain";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routineRoot = process.env.ROUTINE_DATA_DIR
  ? path.resolve(process.env.ROUTINE_DATA_DIR)
  : path.resolve(appRoot, "data", "routine");
const connectionsPath = path.resolve(routineRoot, "connections.json");
const oauthStatesPath = path.resolve(routineRoot, "oauth-states.json");
const eventsRoot = path.resolve(routineRoot, "events");

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9-_]/g, "_");

export type CalendarProvider = "google" | "microsoft";

export type GoogleCalendarSummary = {
  externalId: string;
  name: string;
  color: string;
  primary?: boolean;
};

export type RoutineCalendarConnection = {
  id: string;
  planId: string;
  provider: CalendarProvider;
  accountEmail: string;
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  calendars: GoogleCalendarSummary[];
  lastSyncAt?: string;
  lastSyncError?: string;
  createdAt: string;
  updatedAt: string;
};

const normalizeConnection = (connection: RoutineCalendarConnection): RoutineCalendarConnection => ({
  ...connection,
  provider: connection.provider === "microsoft" ? "microsoft" : "google"
});

export type RoutineCalendarConnectionPublic = Omit<RoutineCalendarConnection, "refreshToken" | "accessToken">;

export type RoutineOAuthState = {
  id: string;
  planId: string;
  createdAt: string;
};

type EventCache = {
  planId: string;
  events: RoutineCalendarEvent[];
  syncedAt?: string;
};

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

const tokenKey = () => scryptSync(process.env.ROUTINE_TOKEN_KEY ?? "mylyfe-dev-routine-token-key", "mylyfe-routine", 32);

export const encryptSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${encrypted.toString("hex")}`;
};

export const decryptSecret = (value: string) => {
  const [ivHex, tagHex, dataHex] = value.split(".");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Token cifrado invalido.");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
};

export const publicConnection = (connection: RoutineCalendarConnection): RoutineCalendarConnectionPublic => {
  const { refreshToken: _refreshToken, accessToken: _accessToken, ...rest } = connection;
  return rest;
};

export const listConnections = async (planId?: string) => {
  const stored = await readJson<{ connections?: RoutineCalendarConnection[] }>(connectionsPath, { connections: [] });
  const connections = (stored.connections ?? []).map(normalizeConnection);
  return planId ? connections.filter((connection) => connection.planId === planId) : connections;
};

const saveConnections = async (connections: RoutineCalendarConnection[]) => {
  await writeJson(connectionsPath, { connections });
  return connections;
};

export const getConnection = async (id: string) => (await listConnections()).find((connection) => connection.id === id);

export const upsertConnection = async (connection: RoutineCalendarConnection) => {
  const current = await listConnections();
  const next = current.filter(
    (item) =>
      item.id !== connection.id &&
      !(item.planId === connection.planId && item.provider === connection.provider && item.accountEmail === connection.accountEmail)
  );
  next.push(connection);
  await saveConnections(next);
  return connection;
};

export const deleteConnection = async (id: string) => {
  const current = await listConnections();
  const existing = current.find((item) => item.id === id);
  if (!existing) return null;
  await saveConnections(current.filter((item) => item.id !== id));
  const cache = await readEventCache(existing.planId);
  await writeEventCache(existing.planId, cache.events.filter((event) => event.connectionId !== id), cache.syncedAt);
  return existing;
};

export const saveOAuthState = async (state: RoutineOAuthState) => {
  const stored = await readJson<{ states?: RoutineOAuthState[] }>(oauthStatesPath, { states: [] });
  const cutoff = Date.now() - 15 * 60 * 1000;
  const states = [...(stored.states ?? []).filter((item) => Date.parse(item.createdAt) >= cutoff), state];
  await writeJson(oauthStatesPath, { states });
  return state;
};

export const consumeOAuthState = async (id: string) => {
  const stored = await readJson<{ states?: RoutineOAuthState[] }>(oauthStatesPath, { states: [] });
  const state = (stored.states ?? []).find((item) => item.id === id);
  await writeJson(oauthStatesPath, { states: (stored.states ?? []).filter((item) => item.id !== id) });
  if (!state) return null;
  if (Date.parse(state.createdAt) < Date.now() - 15 * 60 * 1000) return null;
  return state;
};

export const readEventCache = async (planId: string): Promise<EventCache> =>
  readJson<EventCache>(path.resolve(eventsRoot, `${safeId(planId)}.json`), { planId, events: [] });

export const writeEventCache = async (planId: string, events: RoutineCalendarEvent[], syncedAt = new Date().toISOString()) => {
  const cache: EventCache = { planId, events, syncedAt };
  await writeJson(path.resolve(eventsRoot, `${safeId(planId)}.json`), cache);
  return cache;
};
