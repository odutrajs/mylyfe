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

const normalizeEmail = (value?: string) => (value ?? "").trim().toLowerCase();

const emailsMatch = (left?: string, right?: string) => {
  const a = normalizeEmail(left);
  const b = normalizeEmail(right);
  return Boolean(a && b && a === b);
};

export const personByEmailOrPrimary = (plan: FinancePlan, email?: string) => {
  const byEmail = email
    ? plan.profile.people.find((person) => emailsMatch(person.email, email))
    : undefined;
  return byEmail ?? plan.profile.people.find((person) => person.role === "primary") ?? plan.profile.people[0];
};

export type PhoneHolder = {
  plan: FinancePlan;
  person: Person;
};

export type PhoneClaim = {
  planId: string;
  personId: string;
  email?: string;
  personalPlanId?: string;
};

export const findPlanPeopleByPhone = async (repository: PlanRepository, phone: string) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return [] as PhoneHolder[];

  const matches: PhoneHolder[] = [];
  for (const planId of await repository.listIds()) {
    const plan = await repository.get(planId);
    for (const person of plan.profile.people ?? []) {
      if (phonesMatch(person.phone, normalized)) matches.push({ plan, person });
    }
  }
  return matches;
};

export const findPlanPersonByPhone = async (repository: PlanRepository, phone: string) => {
  const matches = await findPlanPeopleByPhone(repository, phone);
  return (
    matches.find((item) => item.person.whatsappVerifiedAt) ??
    matches.find((item) => item.person.role === "partner" || item.person.accountStatus === "linked") ??
    matches[0] ??
    null
  );
};

export const isSameWhatsappOwner = (holder: PhoneHolder, claim: PhoneClaim) => {
  if (holder.plan.id === claim.planId && holder.person.id === claim.personId) return true;
  if (emailsMatch(holder.person.email, claim.email)) return true;
  if (claim.personalPlanId && holder.plan.id === claim.personalPlanId) return true;
  return false;
};

const clearPersonPhone = async (repository: PlanRepository, planId: string, personId: string) => {
  const plan = await repository.get(planId);
  return repository.save({
    ...plan,
    profile: {
      ...plan.profile,
      people: plan.profile.people.map((person) => {
        if (person.id !== personId) return person;
        const { phone: _phone, whatsappVerifiedAt: _verified, ...rest } = person;
        return rest;
      })
    }
  });
};

const isForeignVerifiedHolder = (holder: PhoneHolder, claim: PhoneClaim) =>
  Boolean(holder.person.whatsappVerifiedAt) && !isSameWhatsappOwner(holder, claim);

const releasePhoneFromOtherOwners = async (repository: PlanRepository, phone: string, claim: PhoneClaim) => {
  const matches = await findPlanPeopleByPhone(repository, phone);
  if (matches.some((item) => isForeignVerifiedHolder(item, claim))) {
    throw new PhoneVerifyError("Este WhatsApp ja esta ligado a outra conta Zelo.");
  }

  for (const match of matches) {
    if (match.plan.id === claim.planId && match.person.id === claim.personId) continue;
    await clearPersonPhone(repository, match.plan.id, match.person.id);
  }
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
      const matches = await findPlanPeopleByPhone(repository, nextPhone);
      const claim: PhoneClaim = {
        planId,
        personId: person.id,
        email: person.email || previous?.email
      };
      if (matches.some((item) => isForeignVerifiedHolder(item, claim))) {
        people.push({
          ...person,
          phone: previous?.phone,
          whatsappVerifiedAt: previous?.whatsappVerifiedAt
        });
        continue;
      }
      await releasePhoneFromOtherOwners(repository, nextPhone, claim);
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
  input: { planId: string; personId?: string; email?: string; phone?: string; personalPlanId?: string }
) => {
  const phone = normalizePhone(input.phone);
  if (!isValidWhatsappPhone(phone)) {
    throw new PhoneVerifyError("Informe um WhatsApp valido com DDD. Ex: 41 99999-0000.");
  }

  const plan = await repository.get(input.planId);
  const person =
    (input.personId ? plan.profile.people.find((item) => item.id === input.personId) : undefined) ??
    (input.email ? plan.profile.people.find((item) => emailsMatch(item.email, input.email)) : undefined);
  if (!person) throw new PhoneVerifyError("Nao achei a pessoa deste plano.", 404);

  const claim: PhoneClaim = {
    planId: plan.id,
    personId: person.id,
    email: person.email || input.email,
    personalPlanId: input.personalPlanId
  };
  await releasePhoneFromOtherOwners(repository, phone, claim);

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
    `Seu codigo Zelo e *${code}*. Vale por 10 minutos. Se nao foi voce, ignora esta mensagem.`
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

  const current = await repository.get(pending.planId);
  const pendingPerson = current.profile.people.find((item) => item.id === pending.personId);
  await releasePhoneFromOtherOwners(repository, phone, {
    planId: pending.planId,
    personId: pending.personId,
    email: pendingPerson?.email
  });

  const plan = await savePersonPhone(repository, pending.planId, pending.personId, {
    phone,
    whatsappVerifiedAt: new Date().toISOString()
  });
  await removePhoneVerification(phone);
  const person = plan.profile.people.find((item) => item.id === pending.personId);
  return { plan, person, phone };
};
