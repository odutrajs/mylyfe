import {
  applySecretaryInboxToPlan,
  applyShoppingInboxToPlan,
  completeAlertOccurrence,
  createLifeAlert,
  relatedSecretaryAlertIds,
  extractVerificationCode,
  findShoppingListByGroupJid,
  normalizeHomeModuleState,
  normalizePhone,
  normalizeSecretaryModuleState,
  normalizeWhatsappGroupJid,
  phonesMatch,
  setShoppingItemSector,
  tickAlert,
  type LifeAlert,
  type SecretaryJob,
  type SecretaryModuleState,
  type SecretarySettings
} from "@mylyfe/domain";
import type { PlanRepository } from "./repository.js";
import { classifyShoppingSectorWithAi, interpretSecretaryMessageWithAi } from "./secretary-ai.js";
import { enqueueJobs, getOutbox, readLegacySecretaryState, saveOutbox } from "./secretary-store.js";
import { confirmPhoneVerification, findPlanPersonByPhone } from "./phone-verify-service.js";

const locks = new Map<string, Promise<unknown>>();

const withLock = async <T>(key: string, fn: () => Promise<T>) => {
  const previous = locks.get(key) ?? Promise.resolve();
  let release = () => undefined as void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(
    key,
    previous.catch(() => undefined).then(() => current)
  );
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
};

const jobId = () => `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const primaryPerson = (plan: Awaited<ReturnType<PlanRepository["get"]>>) =>
  plan.profile.people.find((person) => person.role === "primary") ?? plan.profile.people[0];

const toJobs = (
  planId: string,
  destination: string,
  items: Array<{ alertId?: string; text: string; kind: SecretaryJob["kind"] }>,
  claimed = false
) =>
  items
    .filter((item) => item.text.trim())
    .map((item) => ({
      id: jobId(),
      planId,
      alertId: item.alertId,
      to: destination.includes("@g.us") ? destination : normalizePhone(destination),
      text: item.text,
      kind: item.kind,
      createdAt: new Date().toISOString(),
      claimedAt: claimed ? new Date().toISOString() : undefined
    }));

const readState = async (repository: PlanRepository, planId: string) => {
  const plan = await repository.get(planId);
  const current = normalizeSecretaryModuleState(plan.secretary);
  if (current.alerts.length > 0 || Date.parse(current.updatedAt) > 0) return current;

  const legacy = await readLegacySecretaryState(planId);
  if (!legacy) return current;

  return saveState(repository, planId, legacy);
};

const saveState = async (repository: PlanRepository, planId: string, state: SecretaryModuleState) => {
  const plan = await repository.get(planId);
  const next = normalizeSecretaryModuleState({
    ...state,
    updatedAt: new Date().toISOString()
  });
  await repository.save({
    ...plan,
    secretary: next
  });
  return next;
};

export const getPlanSecretary = async (repository: PlanRepository, planId: string) => readState(repository, planId);

export const savePlanSecretarySettings = async (
  repository: PlanRepository,
  planId: string,
  settings: Partial<SecretarySettings>
) =>
  withLock(planId, async () => {
    const current = await readState(repository, planId);
    return saveState(repository, planId, {
      ...current,
      settings: { ...current.settings, ...settings }
    });
  });

export const upsertPlanAlert = async (repository: PlanRepository, planId: string, input: Partial<LifeAlert> & { title?: string }) =>
  withLock(planId, async () => {
    const current = await readState(repository, planId);
    const existing = input.id ? current.alerts.find((alert) => alert.id === input.id) : undefined;
    const base = existing
      ? {
          ...existing,
          ...input,
          title: (input.title ?? existing.title).trim(),
          updatedAt: new Date().toISOString()
        }
      : createLifeAlert(
          {
            ...input,
            title: input.title ?? "Novo alerta"
          },
          new Date(),
          current.settings.timezone
        );

    const nextAlert: LifeAlert = existing
      ? createLifeAlert(
          {
            ...base,
            id: existing.id
          },
          new Date(),
          current.settings.timezone
        )
      : base;

    const cycleChanged =
      input.dueDay !== existing?.dueDay || input.dueDate !== existing?.dueDate || input.frequency !== existing?.frequency;
    const nextFrequency = input.frequency ?? existing?.frequency ?? nextAlert.frequency;
    const preserved = existing
      ? {
          ...nextAlert,
          id: existing.id,
          createdAt: existing.createdAt,
          cycle: cycleChanged ? nextAlert.cycle : existing.cycle,
          history: existing.history,
          status:
            input.status ??
            (cycleChanged && existing.status === "completed" && nextFrequency !== "once" ? "active" : existing.status)
        }
      : nextAlert;

    const alerts = existing
      ? current.alerts.map((alert) => (alert.id === preserved.id ? preserved : alert))
      : [...current.alerts, preserved];

    const saved = await saveState(repository, planId, { ...current, alerts });
    return { state: saved, alert: preserved };
  });

export const deletePlanAlert = async (repository: PlanRepository, planId: string, alertId: string) =>
  withLock(planId, async () => {
    const current = await readState(repository, planId);
    return saveState(repository, planId, {
      ...current,
      alerts: current.alerts.filter((alert) => alert.id !== alertId)
    });
  });

export const setAlertStatus = async (repository: PlanRepository, planId: string, alertId: string, status: LifeAlert["status"]) =>
  withLock(planId, async () => {
    const current = await readState(repository, planId);
    return saveState(repository, planId, {
      ...current,
      alerts: current.alerts.map((alert) =>
        alert.id === alertId ? { ...alert, status, updatedAt: new Date().toISOString() } : alert
      )
    });
  });

export const completePlanAlert = async (repository: PlanRepository, planId: string, alertId: string) =>
  withLock(planId, async () => {
    const plan = await repository.get(planId);
    const current = await readState(repository, planId);
    const timeZone = current.settings.timezone || plan.routine?.settings.timezone || "America/Sao_Paulo";
    const related = new Set(relatedSecretaryAlertIds(current.alerts, alertId));
    return saveState(repository, planId, {
      ...current,
      alerts: current.alerts.map((alert) =>
        related.has(alert.id) ? completeAlertOccurrence(alert, new Date(), timeZone) : alert
      )
    });
  });

const tickPlan = async (repository: PlanRepository, planId: string, now: Date) => {
  const plan = await repository.get(planId);
  const person = primaryPerson(plan);
  const phone = normalizePhone(person?.phone);
  const current = await readState(repository, planId);
  if (!phone || !current.settings.enabled) {
    return { state: current, jobs: [] as SecretaryJob[] };
  }

  const nextAlerts: LifeAlert[] = [];
  const pendingJobs: SecretaryJob[] = [];

  for (const alert of current.alerts) {
    const result = tickAlert(alert, now, current.settings, person?.name);
    nextAlerts.push(result.alert);
    pendingJobs.push(...toJobs(planId, phone, result.jobs));
  }

  const state = await saveState(repository, planId, { ...current, alerts: nextAlerts });
  if (pendingJobs.length) await enqueueJobs(pendingJobs);
  return { state, jobs: pendingJobs };
};

export const tickSecretary = async (repository: PlanRepository, now = new Date()) => {
  const planIds = await repository.listIds();
  const jobs: SecretaryJob[] = [];
  for (const planId of planIds) {
    const result = await withLock(planId, () => tickPlan(repository, planId, now));
    jobs.push(...result.jobs);
  }
  const pending = (await getOutbox()).filter((job) => !job.sentAt);
  return { created: jobs, pending };
};

const CLAIM_STALE_MS = 2 * 60 * 1000;

export const pendingSecretaryJobs = async () => {
  const jobs = await getOutbox();
  const now = Date.now();
  const claimable = jobs.filter((job) => {
    if (job.sentAt || !job.text?.trim()) return false;
    if (!job.claimedAt) return true;
    return now - Date.parse(job.claimedAt) > CLAIM_STALE_MS;
  });
  if (!claimable.length) return [];
  const claimedAt = new Date().toISOString();
  const claimedIds = new Set(claimable.map((job) => job.id));
  await saveOutbox(jobs.map((job) => (claimedIds.has(job.id) ? { ...job, claimedAt } : job)));
  return claimable;
};

export const markJobSent = async (jobIdValue: string) => {
  const jobs = await getOutbox();
  const next = jobs.map((job) => (job.id === jobIdValue ? { ...job, sentAt: new Date().toISOString() } : job));
  await saveOutbox(next);
  return next.find((job) => job.id === jobIdValue);
};

const heardReply = (text: string, reply: string, via?: string) =>
  via === "audio" && reply ? `Ouvi: *${text}*\n\n${reply}` : reply;

const unknownPhoneReply =
  "Nao te reconheci neste WhatsApp. Entra no MyLyfe, cadastra este numero em Secretaria > Preferencias e confirma o codigo que eu mandar.";

export const handleSecretaryInbox = async (
  repository: PlanRepository,
  from: string,
  text: string,
  now = new Date(),
  via?: string
) => {
  const phone = normalizePhone(from);
  const code = extractVerificationCode(text);
  if (code) {
    try {
      const confirmed = await confirmPhoneVerification(repository, { phone, code });
      const reply = `Pronto, ${confirmed.person?.name || "tudo certo"}. Este WhatsApp ficou ligado a sua conta. Pode mandar gastos, reunioes e consultas por aqui.`;
      const jobs = toJobs(confirmed.plan.id, phone, [{ text: reply, kind: "ack" }], true);
      await enqueueJobs(jobs);
      return { planId: confirmed.plan.id, state: confirmed.plan.secretary, reply, jobs, matchedAlertId: undefined };
    } catch {
      // fall through to normal inbox or unknown-number help
    }
  }

  const matched = await findPlanPersonByPhone(repository, phone);
  if (!matched) {
    const reply = unknownPhoneReply;
    const jobs = toJobs("", phone, [{ text: reply, kind: "ack" }], true);
    await enqueueJobs(jobs);
    return { planId: null, state: null as SecretaryModuleState | null, reply, jobs, matchedAlertId: undefined };
  }

  const { plan, person } = matched;
  if (!person.whatsappVerifiedAt) {
    const reply =
      "Recebi sua mensagem, mas este WhatsApp ainda nao foi confirmado. Entra no MyLyfe, pede o codigo em Secretaria > Preferencias e me manda os 6 digitos.";
    const jobs = toJobs(plan.id, phone, [{ text: reply, kind: "ack" }], true);
    await enqueueJobs(jobs);
    return { planId: plan.id, state: plan.secretary, reply, jobs, matchedAlertId: undefined };
  }

  return withLock(plan.id, async () => {
    const current = await readState(repository, plan.id);
    const latest = await repository.get(plan.id);
    const intents = await interpretSecretaryMessageWithAi(text, now, current.settings.timezone).catch(() => null);
    const inbox = applySecretaryInboxToPlan(
      { ...latest, secretary: current },
      text,
      now,
      person.name,
      intents ?? undefined,
      person.id
    );
    await repository.save(inbox.plan);
    const reply = heardReply(text, inbox.reply, via);
    const jobs = toJobs(plan.id, phone, [{ alertId: inbox.matchedAlertId, text: reply, kind: "ack" }], true);
    await enqueueJobs(jobs);
    return { planId: plan.id, state: inbox.plan.secretary, reply, jobs, matchedAlertId: inbox.matchedAlertId };
  });
};

export const handleShoppingGroupInbox = async (
  repository: PlanRepository,
  groupJid: string,
  from: string,
  text: string,
  now = new Date(),
  via?: string
) => {
  const jid = normalizeWhatsappGroupJid(groupJid);
  const phone = normalizePhone(from);
  if (!jid || !text.trim()) {
    return { planId: null, reply: "", jobs: [] as SecretaryJob[], ignored: true };
  }

  const planIds = await repository.listIds();
  for (const planId of planIds) {
    const plan = await repository.get(planId);
    const home = normalizeHomeModuleState(plan.home);
    const list = findShoppingListByGroupJid(home, jid);
    if (!list) continue;

    return withLock(planId, async () => {
      const current = await repository.get(planId);
      const person = current.profile.people.find((item) => phonesMatch(item.phone, phone));
      const inbox = applyShoppingInboxToPlan(current, list.id, text.trim(), {
        personId: person?.id,
        phone: phone || undefined,
        name: person?.name
      }, now);

      if (inbox.ignored) {
        return { planId, reply: "", jobs: [] as SecretaryJob[], ignored: true };
      }

      let plan = inbox.plan;
      if (inbox.addedItemId) {
        const added = normalizeHomeModuleState(plan.home)
          .lists.find((entry) => entry.id === list.id)
          ?.items.find((item) => item.id === inbox.addedItemId);
        if (added?.sector === "outros") {
          const sector = await classifyShoppingSectorWithAi(added.name);
          if (sector) plan = setShoppingItemSector(plan, list.id, added.id, sector, now);
        }
      }

      await repository.save(plan);
      const reply = heardReply(text.trim(), inbox.reply, via);
      const jobs = toJobs(planId, jid, [{ text: reply, kind: "ack" }], true);
      await enqueueJobs(jobs);
      return { planId, reply, jobs, ignored: false };
    });
  }

  return { planId: null, reply: "", jobs: [] as SecretaryJob[], ignored: true };
};

export const secretarySnapshot = async (repository: PlanRepository, planId: string) => {
  const plan = await repository.get(planId);
  const person = primaryPerson(plan);
  const state = await readState(repository, planId);
  return {
    phone: person?.phone ?? "",
    personName: person?.name ?? "",
    settings: state.settings,
    alerts: state.alerts,
    updatedAt: state.updatedAt,
    pendingJobs: (await getOutbox()).filter((job) => job.planId === planId && !job.sentAt).length
  };
};
