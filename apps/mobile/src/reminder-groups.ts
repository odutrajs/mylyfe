import type { LifeAlert } from "@mylyfe/domain";
import { isAgendaLinkedAlert, isRecurringAlert, zonedDayKey } from "@mylyfe/domain";

export type ReminderGroup = {
  id: string;
  representative: LifeAlert;
  alerts: LifeAlert[];
  weekdays: number[];
};

const weekdayFromKey = (dayKey: string) => {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
};

const normalizeTitle = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export const isAppointmentAlert = (alert: LifeAlert) =>
  alert.category === "health" || isAgendaLinkedAlert(alert);

export const cleanReminderNotes = (notes?: string) =>
  (notes ?? "").replace(/^slot:(vespera|3h|1h|15m|checkin)(?: · )*/i, "").trim();

const groupKey = (alert: LifeAlert) => {
  if (isAppointmentAlert(alert)) return `appt:${normalizeTitle(alert.title)}`;
  return [
    "item",
    normalizeTitle(alert.title),
    alert.kind,
    alert.frequency,
    alert.cycle.dueAt,
    alert.amount ?? ""
  ].join("|");
};

export const groupReminderAlerts = (items: LifeAlert[], timeZone: string, today: string): ReminderGroup[] => {
  const buckets = new Map<string, LifeAlert[]>();
  for (const alert of items) {
    const list = buckets.get(groupKey(alert)) ?? [];
    list.push(alert);
    buckets.set(groupKey(alert), list);
  }

  return [...buckets.values()]
    .map((alerts) => {
      const sorted = [...alerts].sort((left, right) => left.cycle.dueAt.localeCompare(right.cycle.dueAt));
      const dayKeys = [...new Set(sorted.map((alert) => zonedDayKey(new Date(alert.cycle.dueAt), timeZone)))];
      const representative =
        sorted.find((alert) => zonedDayKey(new Date(alert.cycle.dueAt), timeZone) >= today) ??
        sorted.at(-1);
      if (!representative) return null;
      return {
        id: representative.id,
        representative,
        alerts: sorted,
        weekdays: [...new Set(dayKeys.map(weekdayFromKey))].sort((left, right) => left - right)
      };
    })
    .filter((group): group is ReminderGroup => group !== null)
    .sort((left, right) => left.representative.cycle.dueAt.localeCompare(right.representative.cycle.dueAt));
};

export const homeReminderGroups = (items: LifeAlert[], timeZone: string, today: string, limit = 2) => {
  const groups = groupReminderAlerts(
    items.filter((alert) => alert.status === "active"),
    timeZone,
    today
  );
  const dueToday = groups.filter((group) =>
    group.alerts.some((alert) => zonedDayKey(new Date(alert.cycle.dueAt), timeZone) === today)
  );
  const upcoming = groups.filter((group) => !dueToday.includes(group));
  return [...dueToday, ...upcoming].slice(0, limit);
};

export const isRecurringReminderGroup = (group: ReminderGroup) =>
  isRecurringAlert(group.representative) || group.alerts.length > 1;
