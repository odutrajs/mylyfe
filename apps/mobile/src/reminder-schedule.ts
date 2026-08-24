import type { LifeAlert } from "@mylyfe/domain";
import { isAgendaLinkedAlert, secretaryAlertFamilyId } from "@mylyfe/domain";

const isSlotAlert = (alert: LifeAlert) => isAgendaLinkedAlert(alert);

export const fireAtFor = (alert: LifeAlert, now: number) => {
  const remind = new Date(alert.cycle.remindAt).getTime();
  const due = new Date(alert.cycle.dueAt).getTime();
  if (remind > now) return new Date(remind);
  if (isSlotAlert(alert)) return null;
  if (due > now) return new Date(due);
  return null;
};

const triggerKey = (alert: LifeAlert, date: Date) =>
  `${alert.title.trim().toLowerCase()}|${Math.floor(date.getTime() / 60_000)}`;

const familyKey = (alert: LifeAlert) =>
  secretaryAlertFamilyId(alert.id) || `title:${alert.title.trim().toLowerCase()}`;

export const upcomingNotificationTriggers = (alerts: LifeAlert[], now = Date.now()) => {
  const seen = new Set<string>();
  const triggers: Array<{ alert: LifeAlert; date: Date }> = [];
  const active = alerts.filter((item) => item.status === "active");
  const regular = active.filter((item) => !isAgendaLinkedAlert(item));
  const agendaLinked = active.filter((item) => isAgendaLinkedAlert(item));

  const pushTrigger = (alert: LifeAlert, date: Date) => {
    const key = triggerKey(alert, date);
    if (seen.has(key)) return;
    seen.add(key);
    triggers.push({ alert, date });
  };

  for (const alert of regular) {
    const date = fireAtFor(alert, now);
    if (date) pushTrigger(alert, date);
    if (triggers.length >= 40) return triggers;
  }

  const families = new Map<string, LifeAlert[]>();
  for (const alert of agendaLinked) {
    const list = families.get(familyKey(alert)) ?? [];
    list.push(alert);
    families.set(familyKey(alert), list);
  }

  for (const siblings of families.values()) {
    const next = siblings
      .map((alert) => ({ alert, date: fireAtFor(alert, now) }))
      .filter((item): item is { alert: LifeAlert; date: Date } => item.date !== null)
      .sort((left, right) => left.date.getTime() - right.date.getTime())[0];
    if (next) pushTrigger(next.alert, next.date);
    if (triggers.length >= 40) break;
  }

  return triggers;
};
