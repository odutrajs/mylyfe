import type {
  AlertEvent,
  AlertFrequency,
  AlertKind,
  AlertReplyIntent,
  FinancePlan,
  LifeAlert,
  SecretaryModuleState,
  SecretaryOutboundKind,
  SecretarySettings
} from "./types.js";

export interface SecretaryJob {
  id: string;
  planId: string;
  alertId?: string;
  to: string;
  text: string;
  kind: SecretaryOutboundKind;
  createdAt: string;
  sentAt?: string;
  claimedAt?: string;
}

export interface ParsedReply {
  intent: AlertReplyIntent;
  amount?: number;
  snoozeHours?: number;
}

export interface SecretaryTickResult {
  alert: LifeAlert;
  jobs: Omit<SecretaryJob, "id" | "planId" | "to" | "createdAt">[];
}

export interface InboxResult {
  alerts: LifeAlert[];
  reply: string;
  matchedAlertId?: string;
}

export const defaultSecretarySettings = (): SecretarySettings => ({
  enabled: true,
  timezone: "America/Sao_Paulo",
  quietHoursStart: 22,
  quietHoursEnd: 8
});

export const defaultSecretaryModuleState = (): SecretaryModuleState => ({
  settings: defaultSecretarySettings(),
  alerts: [],
  updatedAt: "1970-01-01T00:00:00.000Z"
});

export const normalizeSecretaryModuleState = (
  state?: Partial<SecretaryModuleState> | null
): SecretaryModuleState => ({
  settings: { ...defaultSecretarySettings(), ...state?.settings },
  alerts: state?.alerts ?? [],
  updatedAt: state?.updatedAt ?? defaultSecretaryModuleState().updatedAt
});

export const pickSecretaryModuleState = (
  incoming?: Partial<SecretaryModuleState> | null,
  existing?: Partial<SecretaryModuleState> | null
) => {
  if (!incoming) return normalizeSecretaryModuleState(existing);
  if (!existing) return normalizeSecretaryModuleState(incoming);

  const incomingTime = Date.parse(incoming.updatedAt ?? "") || 0;
  const existingTime = Date.parse(existing.updatedAt ?? "") || 0;
  return normalizeSecretaryModuleState(incomingTime >= existingTime ? incoming : existing);
};

export const alertKindLabels: Record<AlertKind, string> = {
  bill: "Conta a pagar",
  tax: "Imposto",
  subscription: "Assinatura",
  income: "Recebimento",
  document: "Documento / prazo",
  habit: "Check-in",
  one_off: "Lembrete avulso"
};

export const createAlertId = (now = new Date()) => `alert-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const isAgendaLinkedAlert = (alert: Pick<LifeAlert, "id" | "notes">) =>
  Boolean(alert.notes?.includes("slot:")) ||
  alert.id.startsWith("alert-event-") ||
  alert.id.startsWith("alert-appt-");

export const secretaryAlertFamilyId = (alertId: string) => {
  if (alertId.startsWith("alert-appt-")) return alertId.replace(/-(3h|1h|15m|checkin)$/, "");
  if (/^alert-event-.+-15m$/.test(alertId)) return alertId.replace(/-15m$/, "");
  return "";
};

const eventId = (now: Date) => `evt-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const pad = (value: number) => String(value).padStart(2, "0");

const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
  Number(parts.find((part) => part.type === type)?.value ?? 0);

const zonedPartsFormatters = new Map<string, Intl.DateTimeFormat>();

const zonedPartsFormatter = (timeZone: string) => {
  const cached = zonedPartsFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  });
  zonedPartsFormatters.set(timeZone, formatter);
  return formatter;
};

export const zonedParts = (date: Date, timeZone: string) => {
  const parts = zonedPartsFormatter(timeZone).formatToParts(date);

  return {
    year: getPart(parts, "year"),
    month: getPart(parts, "month"),
    day: getPart(parts, "day"),
    hour: getPart(parts, "hour"),
    minute: getPart(parts, "minute"),
    second: getPart(parts, "second")
  };
};

const tzOffsetMs = (date: Date, timeZone: string) => {
  const wall = zonedParts(date, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - date.getTime();
};

export const zonedDate = (timeZone: string, year: number, month: number, day: number, hour = 0, minute = 0) => {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = new Date(utcGuess - tzOffsetMs(new Date(utcGuess), timeZone));
  return new Date(utcGuess - tzOffsetMs(first, timeZone));
};

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

export const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 60 * 60 * 1000);

const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const weekdayIndex = (date: Date, timeZone: string) => {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
};

const clampDueDay = (year: number, month: number, dueDay: number) => Math.min(Math.max(dueDay, 1), lastDayOfMonth(year, month));

export const normalizePhone = (value?: string | null) => {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

export const phonesMatch = (left?: string | null, right?: string | null) => {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  return Boolean(a && b && a === b);
};

export const isValidWhatsappPhone = (value?: string | null) => {
  const digits = normalizePhone(value);
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
};

export const extractVerificationCode = (text: string) => {
  const digits = text.replace(/\D/g, "");
  return /^\d{6}$/.test(digits) ? digits : "";
};

export const whatsappJid = (phone: string) => {
  const normalized = normalizePhone(phone);
  return normalized ? `${normalized}@s.whatsapp.net` : "";
};

export const formatBRL = (value?: number) => {
  if (!value) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
};

export const formatDayMonth = (iso: string, timeZone: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit" }).format(date);
};

const humanWhen = (date: Date, timeZone: string, now: Date) => {
  const target = zonedParts(date, timeZone);
  const current = zonedParts(now, timeZone);
  const sameDay = target.year === current.year && target.month === current.month && target.day === current.day;
  const tomorrow = addDays(zonedDate(timeZone, current.year, current.month, current.day, 0), 1);
  const tomorrowParts = zonedParts(tomorrow, timeZone);
  const isTomorrow = target.year === tomorrowParts.year && target.month === tomorrowParts.month && target.day === tomorrowParts.day;
  const time = `${pad(target.hour)}:${pad(target.minute)}`;
  if (sameDay) return `hoje as ${time}`;
  if (isTomorrow) return `amanha as ${time}`;
  return `${pad(target.day)}/${pad(target.month)} as ${time}`;
};

const nextMonthlyDue = (from: Date, timeZone: string, dueDay: number, hour: number) => {
  const wall = zonedParts(from, timeZone);
  const thisMonth = zonedDate(timeZone, wall.year, wall.month, clampDueDay(wall.year, wall.month, dueDay), hour);
  if (thisMonth.getTime() >= from.getTime()) return thisMonth;
  const nextMonth = wall.month === 12 ? 1 : wall.month + 1;
  const nextYear = wall.month === 12 ? wall.year + 1 : wall.year;
  return zonedDate(timeZone, nextYear, nextMonth, clampDueDay(nextYear, nextMonth, dueDay), hour);
};

const nextWeeklyDue = (from: Date, timeZone: string, weekday: number, hour: number) => {
  const wall = zonedParts(from, timeZone);
  const today = zonedDate(timeZone, wall.year, wall.month, wall.day, hour);
  const currentWeekday = weekdayIndex(today, timeZone);
  const delta = (weekday - currentWeekday + 7) % 7;
  const candidate = addDays(today, delta);
  return candidate.getTime() >= from.getTime() ? candidate : addDays(candidate, 7);
};

export const nextOccurrence = (
  alert: Pick<LifeAlert, "frequency" | "dueDay" | "dueDate" | "weekday" | "preferredHour">,
  from: Date,
  timeZone: string
) => {
  const hour = Math.min(23, Math.max(0, alert.preferredHour));

  if (alert.frequency === "daily") {
    const wall = zonedParts(from, timeZone);
    const today = zonedDate(timeZone, wall.year, wall.month, wall.day, hour);
    return today.getTime() >= from.getTime() ? today : addDays(today, 1);
  }

  if (alert.frequency === "once" && alert.dueDate) {
    const [year, month, day] = alert.dueDate.split("-").map(Number);
    if (year && month && day) return zonedDate(timeZone, year, month, day, hour);
  }

  if (alert.frequency === "weekly" || alert.frequency === "biweekly") {
    const weekday = alert.weekday ?? weekdayIndex(from, timeZone);
    const next = nextWeeklyDue(from, timeZone, weekday, hour);
    return alert.frequency === "biweekly" ? addDays(next, 0) : next;
  }

  if (alert.frequency === "annual" && alert.dueDate) {
    const [, monthRaw, dayRaw] = alert.dueDate.split("-").map(Number);
    const wall = zonedParts(from, timeZone);
    const month = monthRaw || wall.month;
    const day = dayRaw || wall.day;
    const thisYear = zonedDate(timeZone, wall.year, month, clampDueDay(wall.year, month, day), hour);
    return thisYear.getTime() >= from.getTime()
      ? thisYear
      : zonedDate(timeZone, wall.year + 1, month, clampDueDay(wall.year + 1, month, day), hour);
  }

  if (alert.frequency === "quarterly") {
    const dueDay = alert.dueDay ?? zonedParts(from, timeZone).day;
    let cursor = nextMonthlyDue(from, timeZone, dueDay, hour);
    if (alert.dueDate) {
      const start = new Date(`${alert.dueDate}T00:00:00.000Z`);
      const startParts = zonedParts(Number.isNaN(start.getTime()) ? from : start, timeZone);
      while ((cursor.getUTCMonth() - (startParts.month - 1) + 12) % 3 !== 0) {
        cursor = addDays(cursor, 28);
        cursor = nextMonthlyDue(addHours(cursor, 1), timeZone, dueDay, hour);
      }
    }
    return cursor;
  }

  return nextMonthlyDue(from, timeZone, alert.dueDay ?? zonedParts(from, timeZone).day, hour);
};

export const buildCycle = (alert: Pick<LifeAlert, "remindDaysBefore" | "confirmAfterHours" | "frequency" | "dueDay" | "dueDate" | "weekday" | "preferredHour">, from: Date, timeZone: string) => {
  const dueAt = nextOccurrence(alert, from, timeZone);
  const remindAt = addDays(dueAt, -Math.max(0, alert.remindDaysBefore));
  const confirmAt = addHours(dueAt, Math.max(1, alert.confirmAfterHours));
  return {
    status: "scheduled" as const,
    dueAt: dueAt.toISOString(),
    remindAt: (remindAt.getTime() > from.getTime() ? remindAt : from).toISOString(),
    confirmAt: confirmAt.toISOString()
  };
};

export const createLifeAlert = (
  input: {
    id?: string;
    title: string;
    kind?: AlertKind;
    amount?: number;
    notes?: string;
    category?: LifeAlert["category"];
    frequency?: AlertFrequency;
    dueDay?: number;
    dueDate?: string;
    weekday?: number;
    remindDaysBefore?: number;
    askIfPaid?: boolean;
    confirmAfterHours?: number;
    snoozeHours?: number;
    preferredHour?: number;
  },
  now = new Date(),
  timeZone = defaultSecretarySettings().timezone
): LifeAlert => {
  const kind = input.kind ?? "bill";
  const draft: LifeAlert = {
    id: input.id ?? createAlertId(now),
    title: input.title.trim(),
    kind,
    amount: input.amount && input.amount > 0 ? input.amount : undefined,
    notes: input.notes?.trim() || undefined,
    category: input.category,
    frequency: input.frequency ?? (kind === "one_off" ? "once" : "monthly"),
    dueDay: input.dueDay,
    dueDate: input.dueDate,
    weekday: input.weekday,
    remindDaysBefore: input.remindDaysBefore ?? (kind === "habit" ? 0 : 2),
    askIfPaid: input.askIfPaid ?? (kind === "document" || kind === "habit" ? false : true),
    confirmAfterHours: input.confirmAfterHours ?? (kind === "income" ? 6 : 8),
    snoozeHours: input.snoozeHours ?? 24,
    preferredHour: input.preferredHour ?? 9,
    status: "active",
    cycle: {
      status: "scheduled",
      dueAt: now.toISOString(),
      remindAt: now.toISOString()
    },
    history: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  return {
    ...draft,
    cycle: buildCycle(draft, now, timeZone)
  };
};

export const parseReply = (text: string): ParsedReply => {
  const raw = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const amountMatch = raw.match(/(?:r\$\s*)?(\d{1,6}(?:[.,]\d{2})?)/);
  const amount = amountMatch?.[1] ? Number.parseFloat(amountMatch[1].replace(",", ".")) : undefined;
  const parsedAmount = amount && Number.isFinite(amount) && amount > 0 ? amount : undefined;

  if (/\b(pula|pular|ignora|ignorar|cancela esse|dispensa|nao precisa)\b/.test(raw)) {
    return { intent: "skip" };
  }

  if (/\b(amanha|semana que vem|me lembra|mais tarde|depois|daqui a)\b/.test(raw)) {
    let snoozeHours = 24;
    if (raw.includes("semana")) snoozeHours = 24 * 7;
    const hoursMatch = raw.match(/daqui a (\d+) (hora|horas)/);
    const daysMatch = raw.match(/daqui a (\d+) (dia|dias)/);
    if (hoursMatch?.[1]) snoozeHours = Number(hoursMatch[1]);
    if (daysMatch?.[1]) snoozeHours = Number(daysMatch[1]) * 24;
    return { intent: "snooze", snoozeHours };
  }

  if (/\b(nao|ainda nao|esqueci|nao paguei|nao caiu|nao recebi|nao fui|falta)\b/.test(raw)) {
    return { intent: "not_paid", snoozeHours: 24 };
  }

  if (/\b(sim|paguei|pago|foi|fui|feito|ja foi|ja paguei|recebi|caiu|afirmativo|tomei|compareci)\b/.test(raw)) {
    return { intent: "paid", amount: parsedAmount };
  }

  return { intent: "unknown", amount: parsedAmount };
};

const waBold = (value: string) => {
  const clean = value.replace(/\*/g, "").trim();
  return clean ? `*${clean}*` : "";
};

const amountLabel = (alert: LifeAlert) => (alert.amount ? ` de ${waBold(formatBRL(alert.amount))}` : "");

const verbFor = (kind: AlertKind) => {
  if (kind === "income") return "recebeu";
  if (kind === "habit") return "fez";
  if (kind === "document") return "resolveu";
  return "pagou";
};

export const buildSecretaryMessage = (
  alert: LifeAlert,
  kind: SecretaryOutboundKind,
  options: { personName?: string; timeZone?: string; extra?: string } = {}
) => {
  const name = options.personName?.split(" ")[0] || "oi";
  const timeZone = options.timeZone ?? defaultSecretarySettings().timezone;
  const due = formatDayMonth(alert.cycle.dueAt, timeZone);
  const title = alert.title;

  if (kind === "remind") {
    if (alert.kind === "income") {
      return `Oi, ${name}. Hoje e o dia de ${waBold(title)}${amountLabel(alert)}. Assim que cair, me avisa com *sim* ou *recebi*.`;
    }
    if (alert.kind === "habit") {
      return `Oi, ${name}. Check-in: ${waBold(title)}. Quando fizer, responde *feito*.`;
    }
    if (alert.kind === "document") {
      return `Oi, ${name}. Prazo de ${waBold(title)} em ${waBold(due)}. Ja deixei anotado. Qualquer coisa e so me chamar.`;
    }
    if (alert.kind === "one_off" && (alert.category === "health" || alert.notes?.includes("slot:"))) {
      const dueDate = new Date(alert.cycle.dueAt);
      const wall = zonedParts(dueDate, timeZone);
      const clock = `${pad(wall.hour)}:${pad(wall.minute)}`;
      const when = humanWhen(dueDate, timeZone, new Date());
      const detail = (alert.notes ?? "").replace(/^slot:(vespera|3h|1h|15m|checkin)(?: · )*/, "").trim();
      const extra = detail ? ` ${waBold(detail)}.` : "";
      if (alert.notes?.includes("slot:checkin")) {
        return `Oi, ${name}. Voce foi em ${waBold(title)}? Pode responder *sim* ou *ainda nao*.`;
      }
      if (alert.notes?.includes("slot:3h")) {
        return `Oi, ${name}. ${waBold("Daqui a 3 horas")} voce tem ${waBold(title)}, as ${waBold(clock)}.${extra}`;
      }
      if (alert.notes?.includes("slot:15m")) {
        return `Oi, ${name}. ${waBold("Daqui a 15 minutos")} voce tem ${waBold(title)}, as ${waBold(clock)}.${extra}`;
      }
      if (alert.notes?.includes("slot:1h")) {
        return `Oi, ${name}. ${waBold("Em 1 hora")} voce tem ${waBold(title)}, as ${waBold(clock)}.${extra}`;
      }
      return `Oi, ${name}. ${waBold("Lembrete")} ${waBold(title)} ${waBold(when)}.${extra}`;
    }
    return `Oi, ${name}. ${waBold("Lembrete")} ${waBold(title)}${amountLabel(alert)} vence em ${waBold(due)}. Ja anotei aqui. Se quiser, depois te pergunto se ja pagou.`;
  }

  if (kind === "confirm") {
    if (alert.kind === "one_off" && alert.notes?.includes("slot:checkin")) {
      return `Oi, ${name}. Voce foi em ${waBold(title)}? Pode responder *sim* ou *ainda nao*.`;
    }
    return `Oi, ${name}. Voce ja ${verbFor(alert.kind)} ${waBold(title)}${amountLabel(alert)}? Pode responder *sim*, *ainda nao* ou *me lembra amanha*.`;
  }

  if (kind === "follow_up") {
    if (alert.kind === "one_off" && alert.notes?.includes("slot:checkin")) {
      return `Oi, ${name}. Ainda nao tive confirmacao de ${waBold(title)}. Voce foi? *sim* ou *nao*.`;
    }
    return `Oi, ${name}. Ainda nao tive confirmacao de ${waBold(title)}. Ja ${verbFor(alert.kind)}? *sim*, *nao* ou *amanha*.`;
  }

  if (kind === "ack") {
    return options.extra ?? `Perfeito, ${name}. Anotei.`;
  }

  return options.extra ?? `Oi, ${name}. Estou por aqui se precisar.`;
};

const pushEvent = (alert: LifeAlert, event: Omit<AlertEvent, "id">): LifeAlert => ({
  ...alert,
  history: [...alert.history, { id: eventId(new Date(event.at)), ...event }].slice(-40),
  updatedAt: event.at
});

const withJob = (
  alert: LifeAlert,
  kind: SecretaryOutboundKind,
  now: Date,
  personName?: string,
  timeZone?: string,
  extra?: string
): SecretaryTickResult => {
  const text = buildSecretaryMessage(alert, kind, { personName, timeZone, extra });
  const next = pushEvent(
    {
      ...alert,
      cycle: {
        ...alert.cycle,
        lastOutboundAt: now.toISOString(),
        lastOutboundKind: kind
      }
    },
    {
      at: now.toISOString(),
      type: kind === "remind" ? "reminded" : kind === "confirm" || kind === "follow_up" ? "asked" : "rescheduled",
      message: text
    }
  );

  return {
    alert: next,
    jobs: [{ alertId: next.id, text, kind }]
  };
};

export const inQuietHours = (now: Date, settings: SecretarySettings) => {
  const hour = zonedParts(now, settings.timezone).hour;
  const { quietHoursStart, quietHoursEnd } = settings;
  if (quietHoursStart === quietHoursEnd) return false;
  if (quietHoursStart > quietHoursEnd) return hour >= quietHoursStart || hour < quietHoursEnd;
  return hour >= quietHoursStart && hour < quietHoursEnd;
};

const nextWakeTime = (now: Date, settings: SecretarySettings) => {
  const wall = zonedParts(now, settings.timezone);
  const todayWake = zonedDate(settings.timezone, wall.year, wall.month, wall.day, settings.quietHoursEnd);
  if (now.getTime() < todayWake.getTime() && wall.hour < settings.quietHoursEnd) return todayWake;
  const tomorrow = addDays(zonedDate(settings.timezone, wall.year, wall.month, wall.day, 0), 1);
  const next = zonedParts(tomorrow, settings.timezone);
  return zonedDate(settings.timezone, next.year, next.month, next.day, settings.quietHoursEnd);
};

export const isRecurringAlert = (alert: Pick<LifeAlert, "frequency">) => alert.frequency !== "once";

const cycleAfterCompletion = (alert: LifeAlert, now: Date, timeZone: string): LifeAlert => {
  if (alert.frequency === "once") {
    return {
      ...alert,
      status: "completed",
      updatedAt: now.toISOString()
    };
  }

  const from = addHours(new Date(alert.cycle.dueAt), 1);
  const seed = alert.frequency === "biweekly" ? addDays(from, 13) : from;
  return {
    ...alert,
    status: "active",
    cycle: buildCycle(alert, seed.getTime() > now.getTime() ? seed : now, timeZone),
    updatedAt: now.toISOString()
  };
};

export const completeAlertOccurrence = (
  alert: LifeAlert,
  now = new Date(),
  timeZone = defaultSecretarySettings().timezone
): LifeAlert => {
  const marked: LifeAlert = {
    ...alert,
    cycle: {
      ...alert.cycle,
      status: "paid",
      paidAt: now.toISOString()
    }
  };
  const next = cycleAfterCompletion(marked, now, timeZone);
  return pushEvent(next, {
    at: now.toISOString(),
    type: next.status === "completed" ? "paid" : "cycled",
    message: next.status === "completed" ? "Concluido." : "Ocorrencia concluida. Proximo aviso agendado."
  });
};

export const relatedSecretaryAlertIds = (alerts: LifeAlert[], alertId: string) => {
  const target = alerts.find((alert) => alert.id === alertId);
  if (!target) return [alertId];

  const family = secretaryAlertFamilyId(target.id);
  if (family) {
    return [...new Set(alerts.filter((alert) => secretaryAlertFamilyId(alert.id) === family).map((alert) => alert.id))];
  }

  const twins = alerts.filter(
    (alert) =>
      alert.status === target.status &&
      alert.title === target.title &&
      alert.kind === target.kind &&
      alert.frequency === target.frequency &&
      alert.cycle.dueAt === target.cycle.dueAt &&
      alert.amount === target.amount
  );
  return twins.length > 1 ? twins.map((alert) => alert.id) : [target.id];
};

export const completePlanAlertOccurrence = (plan: FinancePlan, alertId: string, now = new Date()): FinancePlan => {
  const secretary = normalizeSecretaryModuleState(plan.secretary);
  const timeZone = secretary.settings.timezone || plan.routine?.settings.timezone || defaultSecretarySettings().timezone;
  const related = new Set(relatedSecretaryAlertIds(secretary.alerts, alertId));
  return {
    ...plan,
    secretary: {
      ...secretary,
      alerts: secretary.alerts.map((alert) =>
        related.has(alert.id) ? completeAlertOccurrence(alert, now, timeZone) : alert
      ),
      updatedAt: now.toISOString()
    }
  };
};

export const tickAlert = (
  alert: LifeAlert,
  now: Date,
  settings: SecretarySettings,
  personName?: string
): SecretaryTickResult => {
  if (alert.status !== "active" || !settings.enabled) {
    return { alert, jobs: [] };
  }

  if (inQuietHours(now, settings)) {
    return { alert, jobs: [] };
  }

  const dueAt = new Date(alert.cycle.dueAt);
  const remindAt = new Date(alert.cycle.remindAt);
  const confirmAt = alert.cycle.confirmAt ? new Date(alert.cycle.confirmAt) : addHours(dueAt, alert.confirmAfterHours);

  if (alert.cycle.status === "snoozed" && alert.cycle.snoozeUntil && now.getTime() >= new Date(alert.cycle.snoozeUntil).getTime()) {
    const next: LifeAlert = {
      ...alert,
      cycle: {
        ...alert.cycle,
        status: "awaiting_confirmation",
        confirmAt: now.toISOString(),
        snoozeUntil: undefined
      }
    };
    return withJob(next, "confirm", now, personName, settings.timezone);
  }

  if (alert.cycle.status === "scheduled" && now.getTime() >= remindAt.getTime()) {
    const next: LifeAlert = {
      ...alert,
      cycle: {
        ...alert.cycle,
        status: alert.askIfPaid ? "reminded" : "reminded"
      }
    };
    return withJob(next, "remind", now, personName, settings.timezone);
  }

  if (alert.cycle.status === "reminded") {
    if (!alert.askIfPaid && now.getTime() >= addHours(dueAt, 12).getTime()) {
      const cycled = pushEvent(cycleAfterCompletion(alert, now, settings.timezone), {
        at: now.toISOString(),
        type: "cycled",
        message: "Ciclo avancado sem confirmacao."
      });
      return { alert: cycled, jobs: [] };
    }

    if (alert.askIfPaid && now.getTime() >= confirmAt.getTime()) {
      const next: LifeAlert = {
        ...alert,
        cycle: {
          ...alert.cycle,
          status: "awaiting_confirmation"
        }
      };
      return withJob(next, "confirm", now, personName, settings.timezone);
    }
  }

  if (alert.cycle.status === "awaiting_confirmation") {
    const lastOut = alert.cycle.lastOutboundAt ? new Date(alert.cycle.lastOutboundAt) : confirmAt;
    if (now.getTime() >= addHours(lastOut, alert.snoozeHours).getTime()) {
      return withJob(alert, "follow_up", now, personName, settings.timezone);
    }
  }

  return { alert, jobs: [] };
};

export const applyReplyToAlert = (
  alert: LifeAlert,
  text: string,
  now: Date,
  settings: SecretarySettings,
  personName?: string
): { alert: LifeAlert; reply: string } => {
  const parsed = parseReply(text);
  const name = personName?.split(" ")[0] || "oi";
  let next: LifeAlert = {
    ...alert,
    cycle: {
      ...alert.cycle,
      lastInboundAt: now.toISOString()
    }
  };
  next = pushEvent(next, {
    at: now.toISOString(),
    type: "replied",
    inboundText: text,
    intent: parsed.intent
  });

  if (parsed.intent === "paid") {
    next = {
      ...next,
      cycle: {
        ...next.cycle,
        status: "paid",
        paidAt: now.toISOString(),
        paidAmount: parsed.amount ?? next.amount
      }
    };
    next = pushEvent(next, { at: now.toISOString(), type: "paid", message: text });
    next = cycleAfterCompletion(next, now, settings.timezone);
    if (next.status === "active") {
      next = pushEvent(next, { at: now.toISOString(), type: "cycled", message: "Proximo ciclo agendado." });
    }
    const nextDue = next.status === "active" ? ` Proximo aviso: ${waBold(formatDayMonth(next.cycle.remindAt, settings.timezone))}.` : "";
    const doneLabel = alert.notes?.includes("slot:checkin") ? "feita" : alert.kind === "income" ? "recebido" : "pago";
    return {
      alert: next,
      reply: `Perfeito, ${name}. Marquei ${waBold(alert.title)} como ${doneLabel}.${nextDue}`
    };
  }

  if (parsed.intent === "skip") {
    next = {
      ...next,
      cycle: {
        ...next.cycle,
        status: "skipped"
      }
    };
    next = pushEvent(next, { at: now.toISOString(), type: "skipped" });
    next = cycleAfterCompletion(next, now, settings.timezone);
    return {
      alert: next,
      reply: `Combinado, ${name}. Pulei este ciclo de ${waBold(alert.title)}.`
    };
  }

  const snoozeHours = parsed.snoozeHours ?? alert.snoozeHours;
  const until = parsed.intent === "snooze" || parsed.intent === "not_paid" ? addHours(now, snoozeHours) : undefined;

  if (until) {
    const wake = inQuietHours(until, settings) ? nextWakeTime(until, settings) : until;
    next = {
      ...next,
      cycle: {
        ...next.cycle,
        status: "snoozed",
        snoozeUntil: wake.toISOString(),
        confirmAt: wake.toISOString()
      }
    };
    next = pushEvent(next, {
      at: now.toISOString(),
      type: "snoozed",
      message: `Novo aviso ${humanWhen(wake, settings.timezone, now)}`
    });
    return {
      alert: next,
      reply:
        parsed.intent === "not_paid"
          ? `Beleza, ${name}. Te lembro de ${waBold(alert.title)} ${waBold(humanWhen(wake, settings.timezone, now))}.`
          : `Combinado. Te chamo de novo ${waBold(humanWhen(wake, settings.timezone, now))}.`
    };
  }

  return {
    alert: next,
    reply: `Nao tenho certeza se ja ${verbFor(alert.kind)} ${waBold(alert.title)}. Responde *sim*, *nao* ou *amanha* que eu organizo.`
  };
};

const pendingRank = (alert: LifeAlert) => {
  const order: Record<LifeAlert["cycle"]["status"], number> = {
    awaiting_confirmation: 0,
    snoozed: 1,
    reminded: 2,
    scheduled: 3,
    paid: 4,
    skipped: 5
  };
  return order[alert.cycle.status];
};

export const pickAlertForReply = (alerts: LifeAlert[], text: string) => {
  const active = alerts.filter((alert) => alert.status === "active");
  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const mentioned = active.find((alert) => {
    const title = alert.title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    return title.length >= 3 && normalized.includes(title);
  });
  if (mentioned) return mentioned;

  return [...active].sort((left, right) => {
    const rank = pendingRank(left) - pendingRank(right);
    if (rank !== 0) return rank;
    const leftOut = left.cycle.lastOutboundAt ?? "";
    const rightOut = right.cycle.lastOutboundAt ?? "";
    return rightOut.localeCompare(leftOut);
  })[0];
};

export const listPendingSummary = (alerts: LifeAlert[], timeZone: string) => {
  const pending = alerts
    .filter((alert) => alert.status === "active" && alert.cycle.status !== "paid")
    .sort((left, right) => left.cycle.dueAt.localeCompare(right.cycle.dueAt))
    .slice(0, 6);

  if (!pending.length) return "Por agora nao tem conta pendente no meu caderno.";

  const lines = pending.map((alert) => {
    const due = formatDayMonth(alert.cycle.dueAt, timeZone);
    const amount = alert.amount ? ` (${formatBRL(alert.amount)})` : "";
    return `- ${waBold(alert.title)}${amount} · ${waBold(due)}`;
  });

  return `${waBold("Pendencias")} que estou acompanhando:\n${lines.join("\n")}`;
};

export const applyInbox = (
  alerts: LifeAlert[],
  text: string,
  now: Date,
  settings: SecretarySettings,
  personName?: string
): InboxResult => {
  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const wantsList = /\b(pendente|pendencias|o que tenho|contas|boletos|resumo)\b/.test(normalized);

  if (wantsList) {
    return {
      alerts,
      reply: listPendingSummary(alerts, settings.timezone)
    };
  }

  const matched = pickAlertForReply(alerts, text);
  if (!matched) {
    return {
      alerts,
      reply: `Oi. Sou o Zelo. Cadastre um alerta no app e eu te cobro por aqui. Se quiser, manda *pendencias*.`
    };
  }

  const applied = applyReplyToAlert(matched, text, now, settings, personName);
  return {
    alerts: alerts.map((alert) => (alert.id === matched.id ? applied.alert : alert)),
    reply: applied.reply,
    matchedAlertId: matched.id
  };
};

export const delayForQuietHours = (now: Date, settings: SecretarySettings) =>
  inQuietHours(now, settings) ? nextWakeTime(now, settings) : now;
