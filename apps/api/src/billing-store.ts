import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type SubscriptionStatus =
  | "none"
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "allowlisted";

export type BillingCustomer = {
  userId: string;
  email: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  status: SubscriptionStatus;
  trialEnd?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
};

export type PublicSubscription = {
  status: SubscriptionStatus;
  trialEnd?: string;
  currentPeriodEnd?: string;
  accessGranted: boolean;
};

export type StripeEventRecord = {
  id: string;
  type: string;
  processedAt: string;
};

export type CheckoutStartRecord = {
  token: string;
  userId: string;
  expiresAt: string;
};

type BillingStoreFile = {
  customers: BillingCustomer[];
  events: StripeEventRecord[];
  starts: CheckoutStartRecord[];
};

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(appRoot, "data");
const storePath = path.resolve(dataRoot, "billing.json");

const emptyStore = (): BillingStoreFile => ({ customers: [], events: [], starts: [] });

const readStore = async (): Promise<BillingStoreFile> => {
  try {
    const stored = JSON.parse(await readFile(storePath, "utf8")) as Partial<BillingStoreFile>;
    return {
      customers: stored.customers ?? [],
      events: stored.events ?? [],
      starts: stored.starts ?? []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
};

const writeStore = async (store: BillingStoreFile) => {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
};

const locks = new Map<string, Promise<unknown>>();

const withLock = async <T>(fn: () => Promise<T>) => {
  const previous = locks.get("billing") ?? Promise.resolve();
  let release = () => undefined as void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(
    "billing",
    previous.catch(() => undefined).then(() => current)
  );
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get("billing") === current) locks.delete("billing");
  }
};

export const hasAppAccess = (
  subscription: Pick<BillingCustomer, "status" | "currentPeriodEnd" | "trialEnd">,
  now = Date.now()
) => {
  if (subscription.status === "allowlisted" || subscription.status === "active") return true;
  if (subscription.status === "trialing") {
    if (subscription.trialEnd && Date.parse(subscription.trialEnd) <= now) return false;
    return true;
  }
  if (subscription.status === "canceled" && subscription.currentPeriodEnd) {
    return Date.parse(subscription.currentPeriodEnd) > now;
  }
  return false;
};

export const isAllowlistedEmail = (email: string) => {
  const list = (process.env.BILLING_ALLOWLIST_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
};

export const toPublicSubscription = (
  customer: Pick<BillingCustomer, "status" | "trialEnd" | "currentPeriodEnd"> | undefined
): PublicSubscription => {
  if (!customer) {
    return { status: "incomplete", accessGranted: false };
  }
  return {
    status: customer.status,
    trialEnd: customer.trialEnd,
    currentPeriodEnd: customer.currentPeriodEnd,
    accessGranted: hasAppAccess(customer)
  };
};

export const findCustomerByUserId = async (userId: string) =>
  (await readStore()).customers.find((item) => item.userId === userId);

export const findCustomerByStripeId = async (stripeCustomerId: string) =>
  (await readStore()).customers.find((item) => item.stripeCustomerId === stripeCustomerId);

export const upsertCustomer = async (input: Omit<BillingCustomer, "updatedAt"> & { updatedAt?: string }) =>
  withLock(async () => {
    const store = await readStore();
    const next: BillingCustomer = {
      ...input,
      updatedAt: input.updatedAt ?? new Date().toISOString()
    };
    const index = store.customers.findIndex((item) => item.userId === next.userId);
    if (index >= 0) store.customers[index] = { ...store.customers[index], ...next };
    else store.customers.push(next);
    await writeStore(store);
    return store.customers.find((item) => item.userId === next.userId) ?? next;
  });

export const deleteCustomerByUserId = async (userId: string) =>
  withLock(async () => {
    const store = await readStore();
    store.customers = store.customers.filter((item) => item.userId !== userId);
    await writeStore(store);
  });

export const hasProcessedStripeEvent = async (eventId: string) =>
  (await readStore()).events.some((item) => item.id === eventId);

export const markStripeEventProcessed = async (eventId: string, type: string) =>
  withLock(async () => {
    const store = await readStore();
    if (store.events.some((item) => item.id === eventId)) return;
    store.events.push({
      id: eventId,
      type,
      processedAt: new Date().toISOString()
    });
    if (store.events.length > 2000) {
      store.events = store.events.slice(-1500);
    }
    await writeStore(store);
  });

const pruneStarts = (starts: CheckoutStartRecord[], now = Date.now()) =>
  starts.filter((item) => Date.parse(item.expiresAt) > now);

export const createCheckoutStart = async (userId: string) =>
  withLock(async () => {
    const { randomBytes } = await import("node:crypto");
    const store = await readStore();
    const token = randomBytes(24).toString("hex");
    store.starts = pruneStarts(store.starts).filter((item) => item.userId !== userId);
    store.starts.push({
      token,
      userId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 20).toISOString()
    });
    await writeStore(store);
    return token;
  });

export const findCheckoutStart = async (token: string) => {
  if (!token) return undefined;
  return pruneStarts((await readStore()).starts).find((item) => item.token === token);
};
