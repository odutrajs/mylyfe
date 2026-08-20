import { extractVerificationCode, isValidWhatsappPhone, normalizePhone, phonesMatch, type FinancePlan, type Person } from "@mylyfe/domain";
import { randomInt } from "node:crypto";
import type { PlanRepository } from "./repository.js";
import { findPhoneVerification, removePhoneVerification, upsertPhoneVerification } from "./phone-verify-store.js";

export class PhoneVerifyError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export const personByEmailOrPrimary = (plan: FinancePlan, email?: string) => {
  const byEmail = email
    ? plan.profile.people.find((person) => (person.email ?? "").trim().toLowerCase() === email.trim().toLowerCase())
    : undefined;
  return byEmail ?? plan.profile.people.find((person) => person.role === "primary") ?? plan.profile.people[0];
};

export const findPlanPersonByPhone = async (repository: PlanRepository, phone: string) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  let unverified: { plan: FinancePlan; person: Person } | null = null;
  for (const planId of await repository.listIds()) {
    const plan = await repository.get(planId);
    const person = plan.profile.people.find((item) => phonesMatch(item.phone, normalized));
    if (!person) continue;
    if (person.whatsappVerifiedAt) return { plan, person };
    unverified ??= { plan, person };
  }
  return unverified;
};

export const sanitizePlanWhatsappIdentity = async (repository: PlanRepository, planId: string, incoming: FinancePlan) => {
  const existing = await repository.get(planId);
  const existingById = new Map(existing.profile.people.map((person) => [person.id, person]));
  const people = [];
  for (const person of incoming.profile.people ?? []) {
    const previous = existingById.get(person.id);
    const nextPhone = person.phone?.trim() ? normalizePhone(person.phone) : "";
    const previousPhone = normalizePhone(previous?.phone);
    const phoneChanged = nextPhone !== previousPhone;
    if (nextPhone && phoneChanged) {
      const taken = await findPlanPersonByPhone(repository, nextPhone);
      if (taken && !(taken.plan.id === planId && taken.person.id === person.id)) {
        people.push({
          ...person,
          phone: previous?.phone,
          whatsappVerifiedAt: previous?.whatsappVerifiedAt
        });
        continue;
      }
    }
    people.push({
      ...person,
      phone: nextPhone || undefined,
      whatsappVerifiedAt: phoneChanged ? undefined : previous?.whatsappVerifiedAt
    });
  }
  return {
    ...incoming,
    profile: {
      ...incoming.profile,
      people
    }
  };
};

const sendWhatsApp = async (to: string, text: string) => {
  const secretaryUrl = process.env.SECRETARY_URL ?? "http://localhost:3334";
  const token = process.env.SECRETARY_TOKEN ?? "dev-secretary-token";
  const response = await fetch(`${secretaryUrl}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ to, text })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new PhoneVerifyError(payload.error || "Nao consegui enviar o codigo no WhatsApp. Confira se a secretaria esta conectada.", 503);
  }
};

const savePersonPhone = async (
  repository: PlanRepository,
  planId: string,
  personId: string,
  patch: Partial<Pick<Person, "phone" | "whatsappVerifiedAt">>
) => {
  const plan = await repository.get(planId);
  return repository.save({
    ...plan,
    profile: {
      ...plan.profile,
      people: plan.profile.people.map((person) => (person.id === personId ? { ...person, ...patch } : person))
    }
  });
};

export const startPhoneVerification = async (
  repository: PlanRepository,
  input: { planId: string; personId?: string; email?: string; phone?: string }
) => {
  const phone = normalizePhone(input.phone);
  if (!isValidWhatsappPhone(phone)) {
    throw new PhoneVerifyError("Informe um WhatsApp valido com DDD. Ex: 41 99999-0000.");
  }

  const plan = await repository.get(input.planId);
  const person = input.personId
    ? plan.profile.people.find((item) => item.id === input.personId)
    : personByEmailOrPrimary(plan, input.email);
  if (!person) throw new PhoneVerifyError("Nao achei a pessoa deste plano.", 404);

  const taken = await findPlanPersonByPhone(repository, phone);
  if (taken && !(taken.plan.id === plan.id && taken.person.id === person.id)) {
    throw new PhoneVerifyError("Este WhatsApp ja esta ligado a outra conta MyLyfe.");
  }

  const code = String(randomInt(100000, 1000000));
  await upsertPhoneVerification({
    planId: plan.id,
    personId: person.id,
    phone,
    code,
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    attempts: 0
  });
  await savePersonPhone(repository, plan.id, person.id, { phone, whatsappVerifiedAt: undefined });
  await sendWhatsApp(
    phone,
    `Seu codigo MyLyfe e *${code}*. Vale por 10 minutos. Se nao foi voce, ignora esta mensagem.`
  );

  return { phone, expiresInMinutes: 10 };
};

export const confirmPhoneVerification = async (
  repository: PlanRepository,
  input: { phone?: string; code?: string; planId?: string }
) => {
  const phone = normalizePhone(input.phone);
  const code = extractVerificationCode(input.code ?? "");
  if (!phone || !code) throw new PhoneVerifyError("Informe o WhatsApp e o codigo de 6 digitos.");

  const pending = await findPhoneVerification(phone);
  if (pending && input.planId && pending.planId !== input.planId) {
    throw new PhoneVerifyError("Este codigo nao e desta conta.");
  }
  if (!pending || pending.code !== code) {
    if (pending) {
      const attempts = pending.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await removePhoneVerification(phone);
        throw new PhoneVerifyError("Codigo errado vezes demais. Pede um codigo novo.");
      }
      await upsertPhoneVerification({ ...pending, attempts });
    }
    throw new PhoneVerifyError("Codigo invalido ou vencido.");
  }

  const plan = await savePersonPhone(repository, pending.planId, pending.personId, {
    phone,
    whatsappVerifiedAt: new Date().toISOString()
  });
  await removePhoneVerification(phone);
  const person = plan.profile.people.find((item) => item.id === pending.personId);
  return { plan, person, phone };
};
