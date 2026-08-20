import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FinancePlan } from "@mylyfe/domain";
import type { PlanRepository } from "./repository.js";
import {
  createSessionRecord,
  deleteSessionRecord,
  findSessionRecord,
  findUserByEmail,
  findUserById,
  saveUser,
  type StoredUser
} from "./auth-store.js";

const scrypt = promisify(scryptCallback);
const sessionTtlMs = 1000 * 60 * 60 * 24 * 30;

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type PublicSession = {
  userId: string;
  planId: string;
  personalPlanId: string;
  name: string;
  email: string;
};

export type AuthResult = {
  token: string;
  session: PublicSession;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const planIdFromEmail = (email: string) => {
  const normalized = normalizeEmail(email).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `user-${normalized || "local"}`;
};

const isEmptyPlan = (plan: FinancePlan) =>
  !plan.onboardingCompleted &&
  (plan.incomeSources?.length ?? 0) === 0 &&
  (plan.assets?.length ?? 0) === 0 &&
  (plan.transactions?.length ?? 0) === 0 &&
  (plan.recurringTransactions?.length ?? 0) === 0;

const hashPassword = async (password: string, salt = randomBytes(16).toString("hex")) => {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return {
    salt,
    passwordHash: derived.toString("hex")
  };
};

const verifyPassword = async (password: string, salt: string, passwordHash: string) => {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(passwordHash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
};

const toPublicSession = (user: StoredUser): PublicSession => ({
  userId: user.id,
  planId: user.activePlanId || user.personalPlanId,
  personalPlanId: user.personalPlanId,
  name: user.name,
  email: user.email
});

const issueSession = async (user: StoredUser): Promise<AuthResult> => {
  const now = new Date();
  const record = await createSessionRecord({
    token: randomBytes(32).toString("hex"),
    userId: user.id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + sessionTtlMs).toISOString()
  });

  return {
    token: record.token,
    session: toPublicSession(user)
  };
};

const resolvePersonalPlanId = async (repository: PlanRepository, email: string) => {
  const preferredId = planIdFromEmail(email);
  const ids = await repository.listIds();
  if (ids.includes(preferredId)) return preferredId;

  for (const id of ids) {
    const plan = await repository.get(id);
    const matchesEmail = (plan.profile.people ?? []).some(
      (person) => normalizeEmail(person.email ?? "") === email
    );
    if (matchesEmail && !isEmptyPlan(plan)) return id;
  }

  return preferredId;
};

const attachOwnerContact = async (repository: PlanRepository, planId: string, email: string, name: string) => {
  const plan = await repository.get(planId);
  const primary = plan.profile.people.find((person) => person.role === "primary") ?? plan.profile.people[0];
  if (!primary) return plan;

  const nextName = primary.name.trim() || name;
  const nextEmail = primary.email?.trim() ? primary.email : email;
  if (primary.name === nextName && primary.email === nextEmail) return plan;

  return repository.save({
    ...plan,
    profile: {
      ...plan.profile,
      people: plan.profile.people.map((person) =>
        person.id === primary.id ? { ...person, name: nextName, email: nextEmail } : person
      )
    }
  });
};

const readToken = (header?: string) => {
  const value = header ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
};

export const registerUser = async (
  repository: PlanRepository,
  input: { name?: string; email?: string; password?: string }
) => {
  const email = normalizeEmail(input.email ?? "");
  const name = (input.name ?? "").trim();
  const password = input.password ?? "";

  if (name.length < 2) throw new AuthError("Informe seu nome para criar a conta.");
  if (!email.includes("@")) throw new AuthError("Informe um e-mail valido.");
  if (password.length < 6) throw new AuthError("A senha precisa ter pelo menos 6 caracteres.");

  if (await findUserByEmail(email)) {
    throw new AuthError("Ja existe uma conta com este e-mail. Entre com a senha.", 409);
  }

  const personalPlanId = await resolvePersonalPlanId(repository, email);
  await attachOwnerContact(repository, personalPlanId, email, name);
  const now = new Date().toISOString();
  const secret = await hashPassword(password);
  const user = await saveUser({
    id: personalPlanId,
    email,
    name,
    passwordSalt: secret.salt,
    passwordHash: secret.passwordHash,
    personalPlanId,
    activePlanId: personalPlanId,
    createdAt: now,
    updatedAt: now
  });

  return issueSession(user);
};

export const loginUser = async (input: { email?: string; password?: string }) => {
  const email = normalizeEmail(input.email ?? "");
  const password = input.password ?? "";

  if (!email.includes("@") || password.length < 6) {
    throw new AuthError("Informe e-mail valido e senha com pelo menos 6 caracteres.");
  }

  const user = await findUserByEmail(email);
  if (!user) {
    throw new AuthError(
      "Nao encontramos esta conta. Se voce ja usava o MyLyfe, cadastre de novo com o mesmo e-mail para recuperar seus dados.",
      401
    );
  }

  const valid = await verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!valid) throw new AuthError("Senha incorreta para este e-mail.", 401);

  return issueSession(user);
};

export const sessionFromToken = async (header?: string) => {
  const token = readToken(header);
  const record = await findSessionRecord(token);
  if (!record) throw new AuthError("Sessao expirada. Entre novamente.", 401);

  const user = await findUserById(record.userId);
  if (!user) throw new AuthError("Sessao expirada. Entre novamente.", 401);

  return {
    token,
    user,
    session: toPublicSession(user)
  };
};

export const logoutUser = async (header?: string) => {
  const token = readToken(header);
  if (token) await deleteSessionRecord(token);
};

export const updateAuthSession = async (
  header: string | undefined,
  input: { planId?: string; name?: string }
) => {
  const current = await sessionFromToken(header);
  const nextName = input.name?.trim();
  const nextPlanId = input.planId?.trim();
  const user = await saveUser({
    ...current.user,
    name: nextName || current.user.name,
    activePlanId: nextPlanId || current.user.activePlanId
  });

  return {
    token: current.token,
    session: toPublicSession(user)
  };
};
