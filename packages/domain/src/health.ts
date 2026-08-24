import { parseAgendaCommand, type ParsedAgendaCommand } from "./agenda-command.js";
import {
  addManualAlert,
  addManualExpense,
  addRecurringExpense,
  expenseCategoryLabel,
  interpretSecretaryMessage,
  recurringFrequencyLabel,
  sanitizeSecretaryIntents,
  type SecretaryIntent
} from "./secretary-intent.js";
import { HEALTH_CONTEXT_ID, normalizeRoutineModuleState, upsertRoutineLocalEvent, zonedDayKey } from "./routine.js";
import {
  applyInbox,
  createLifeAlert,
  formatDayMonth,
  normalizeSecretaryModuleState,
  zonedDate,
  zonedParts
} from "./secretary.js";
import type {
  FinancePlan,
  HealthAppointment,
  HealthAppointmentKind,
  HealthCare,
  HealthCareKind,
  HealthCareStatus,
  HealthInsurance,
  HealthMedication,
  HealthModuleState,
  HealthProfile,
  LifeAlert,
  OwnerId,
  RoutineLocalEvent
} from "./types.js";

const defaultUpdatedAt = "1970-01-01T00:00:00.000Z";

export const healthCareKindLabels: Record<HealthCareKind, string> = {
  checkup: "Check-up",
  dentist: "Dentista",
  vaccine: "Vacina",
  ophthalmology: "Oftalmologista",
  gynecology: "Ginecologista",
  urology: "Urologista",
  other: "Outro"
};

export const healthAppointmentKindLabels: Record<HealthAppointmentKind, string> = {
  consult: "Consulta",
  exam: "Exame",
  follow_up: "Retorno",
  vaccine: "Vacina",
  other: "Outro"
};

export const healthCareStatusLabels: Record<HealthCareStatus, string> = {
  on_track: "Em dia",
  due_soon: "Vence em breve",
  overdue: "Atrasado"
};

export const defaultHealthCares = (): Array<Pick<HealthCare, "kind" | "title" | "intervalMonths">> => [
  { kind: "checkup", title: "Check-up anual", intervalMonths: 12 },
  { kind: "dentist", title: "Dentista", intervalMonths: 6 },
  { kind: "vaccine", title: "Vacina da gripe", intervalMonths: 12 },
  { kind: "ophthalmology", title: "Oftalmologista", intervalMonths: 12 }
];

export const defaultHealthModuleState = (): HealthModuleState => ({
  profiles: [],
  cares: [],
  appointments: [],
  medications: [],
  updatedAt: defaultUpdatedAt
});

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const optionalDay = (value: unknown) => {
  const day = asString(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
};

const clampHour = (value: unknown, fallback = 8) => {
  const hour = Number(value);
  if (!Number.isFinite(hour)) return fallback;
  return Math.min(23, Math.max(0, Math.round(hour)));
};

const isCareKind = (value: unknown): value is HealthCareKind =>
  value === "checkup" ||
  value === "dentist" ||
  value === "vaccine" ||
  value === "ophthalmology" ||
  value === "gynecology" ||
  value === "urology" ||
  value === "other";

const isAppointmentKind = (value: unknown): value is HealthAppointmentKind =>
  value === "consult" || value === "exam" || value === "follow_up" || value === "vaccine" || value === "other";

const normalizeProfile = (profile: Partial<HealthProfile>): HealthProfile => ({
  personId: asString(profile.personId),
  bloodType: asString(profile.bloodType).trim() || undefined,
  allergies: asString(profile.allergies).trim() || undefined,
  emergencyContact: asString(profile.emergencyContact).trim() || undefined,
  doctors: asString(profile.doctors).trim() || undefined
});

const normalizeInsurance = (insurance?: Partial<HealthInsurance> | null): HealthInsurance | undefined => {
  if (!insurance) return undefined;
  const provider = asString(insurance.provider).trim();
  if (!provider && !asString(insurance.cardNumber).trim() && !optionalDay(insurance.expiresOn) && !insurance.monthlyCost) {
    return undefined;
  }
  return {
    provider: provider || "Plano de saude",
    cardNumber: asString(insurance.cardNumber).trim() || undefined,
    expiresOn: optionalDay(insurance.expiresOn),
    monthlyCost: Number(insurance.monthlyCost) > 0 ? Number(insurance.monthlyCost) : undefined,
    holderPersonId: asString(insurance.holderPersonId) || undefined,
    dependentPersonIds: Array.isArray(insurance.dependentPersonIds)
      ? insurance.dependentPersonIds.filter((id): id is OwnerId => typeof id === "string")
      : undefined
  };
};

const normalizeCare = (care: Partial<HealthCare>, index: number): HealthCare => ({
  id: asString(care.id) || `care-${index + 1}`,
  personId: asString(care.personId) || "primary",
  kind: isCareKind(care.kind) ? care.kind : "other",
  title: asString(care.title).trim() || healthCareKindLabels[isCareKind(care.kind) ? care.kind : "other"],
  intervalMonths: Number.isFinite(Number(care.intervalMonths)) ? Math.max(1, Math.round(Number(care.intervalMonths))) : 12,
  lastDoneOn: optionalDay(care.lastDoneOn)
});

const normalizeAppointment = (appointment: Partial<HealthAppointment>, index: number): HealthAppointment => ({
  id: asString(appointment.id) || `appt-${index + 1}`,
  personId: asString(appointment.personId) || "primary",
  kind: isAppointmentKind(appointment.kind) ? appointment.kind : "consult",
  title: asString(appointment.title).trim() || healthAppointmentKindLabels[isAppointmentKind(appointment.kind) ? appointment.kind : "consult"],
  professional: asString(appointment.professional).trim() || undefined,
  location: asString(appointment.location).trim() || undefined,
  start: asString(appointment.start),
  end: asString(appointment.end) || asString(appointment.start),
  notes: asString(appointment.notes).trim() || undefined,
  careId: asString(appointment.careId) || undefined,
  done: Boolean(appointment.done),
  remindOnWhatsApp: appointment.remindOnWhatsApp !== false,
  routineLocalEventId: asString(appointment.routineLocalEventId) || undefined,
  secretaryAlertId: asString(appointment.secretaryAlertId) || undefined,
  secretaryAlertIds: (appointment.secretaryAlertIds ?? []).map(asString).filter(Boolean)
});

const normalizeMedication = (medication: Partial<HealthMedication>, index: number): HealthMedication => ({
  id: asString(medication.id) || `med-${index + 1}`,
  personId: asString(medication.personId) || "primary",
  name: asString(medication.name).trim(),
  dosage: asString(medication.dosage).trim() || undefined,
  prescriptionExpiresOn: optionalDay(medication.prescriptionExpiresOn),
  stockNote: asString(medication.stockNote).trim() || undefined,
  remindOnWhatsApp: Boolean(medication.remindOnWhatsApp),
  reminderHour: clampHour(medication.reminderHour, 8),
  takeAlertId: asString(medication.takeAlertId) || undefined,
  prescriptionAlertId: asString(medication.prescriptionAlertId) || undefined
});

export const normalizeHealthModuleState = (state?: Partial<HealthModuleState> | null): HealthModuleState => ({
  profiles: (state?.profiles ?? []).map(normalizeProfile).filter((profile) => profile.personId),
  insurance: normalizeInsurance(state?.insurance),
  cares: (state?.cares ?? []).map(normalizeCare).filter((care) => care.title),
  appointments: (state?.appointments ?? []).map(normalizeAppointment).filter((appointment) => appointment.title && appointment.start),
  medications: (state?.medications ?? []).map(normalizeMedication).filter((medication) => medication.name),
  updatedAt: asString(state?.updatedAt) || defaultUpdatedAt
});

export const pickHealthModuleState = (
  incoming?: Partial<HealthModuleState> | null,
  existing?: Partial<HealthModuleState> | null
) => {
  if (!incoming) return normalizeHealthModuleState(existing);
  if (!existing) return normalizeHealthModuleState(incoming);

  const incomingTime = Date.parse(incoming.updatedAt ?? "") || 0;
  const existingTime = Date.parse(existing.updatedAt ?? "") || 0;
  return normalizeHealthModuleState(incomingTime >= existingTime ? incoming : existing);
};

export const createHealthId = (prefix: string, now = new Date()) =>
  `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const healthCareDueOn = (care: HealthCare) => {
  if (!care.lastDoneOn) return undefined;
  const [year, month, day] = care.lastDoneOn.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const due = new Date(Date.UTC(year, month - 1 + care.intervalMonths, day));
  return due.toISOString().slice(0, 10);
};

export const healthCareStatus = (care: HealthCare, asOf = new Date()): HealthCareStatus => {
  const today = asOf.toISOString().slice(0, 10);
  const due = healthCareDueOn(care);
  if (!due) return "overdue";
  if (due < today) return "overdue";
  const soon = new Date(asOf);
  soon.setUTCDate(soon.getUTCDate() + 14);
  if (due <= soon.toISOString().slice(0, 10)) return "due_soon";
  return "on_track";
};

const monthKey = (asOf: Date) => `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}`;

const transactionMonth = (value: string) => {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}/.test(day) ? day.slice(0, 7) : "";
};

export const summarizeHealthFinances = (plan: FinancePlan, asOf = new Date()) => {
  const month = monthKey(asOf);
  const health = normalizeHealthModuleState(plan.health);
  const expenses = (plan.transactions ?? []).filter(
    (transaction) => transaction.type === "expense" && transaction.category === "health" && transactionMonth(transaction.date) === month
  );
  const reimbursable = (plan.transactions ?? []).filter(
    (transaction) => transaction.category === "health" && transaction.audience === "reimbursable"
  );
  const recurringPlan = (plan.recurringTransactions ?? [])
    .filter((transaction) => transaction.category === "health")
    .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);

  return {
    month,
    monthSpend: expenses.reduce((sum, transaction) => sum + (transaction.amount || 0), 0),
    reimbursablePending: reimbursable.reduce((sum, transaction) => sum + (transaction.amount || 0), 0),
    reimbursableCount: reimbursable.length,
    insuranceMonthly: health.insurance?.monthlyCost ?? (recurringPlan || undefined)
  };
};

export const appointmentWallDate = (iso: string, timeZone: string) => zonedDayKey(new Date(iso), timeZone);

const padDate = (value: number) => String(value).padStart(2, "0");

export type ParsedAppointmentConfirmation = {
  title: string;
  date: string;
  time: string;
  location?: string;
  professional?: string;
};

const looksLikeAppointmentConfirmation = (text: string) => {
  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const triggered = /consulta agendada/.test(normalized) || /@secretaria\b/.test(normalized) || /@agendar\b/.test(normalized);
  return triggered && /\d{1,2}:\d{2}/.test(normalized) && (/\d{1,2}\/\d{1,2}/.test(normalized) || /\bamanha\b/.test(normalized));
};

const resolveConfirmationDate = (day: number, month: number, year: number | undefined, now: Date, timeZone: string) => {
  const wall = zonedParts(now, timeZone);
  const resolvedYear = year ?? wall.year;
  let candidate = zonedDate(timeZone, resolvedYear, month, day, 12);
  if (year === undefined) {
    const today = zonedDate(timeZone, wall.year, wall.month, wall.day, 0);
    if (candidate.getTime() < today.getTime() - 12 * 60 * 60 * 1000) {
      candidate = zonedDate(timeZone, wall.year + 1, month, day, 12);
    }
  }
  const parts = zonedParts(candidate, timeZone);
  return `${parts.year}-${padDate(parts.month)}-${padDate(parts.day)}`;
};

export const parseAppointmentConfirmation = (
  text: string,
  now = new Date(),
  timeZone = "America/Sao_Paulo"
): ParsedAppointmentConfirmation | null => {
  if (!looksLikeAppointmentConfirmation(text)) return null;

  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "");
  const timeMatch = normalized.match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) return null;
  const time = `${padDate(Number(timeMatch[1]))}:${timeMatch[2]}`;

  const dateMatch = normalized.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
  let date = "";
  if (dateMatch) {
    const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + Number(dateMatch[3]) : Number(dateMatch[3])) : undefined;
    date = resolveConfirmationDate(Number(dateMatch[1]), Number(dateMatch[2]), year, now, timeZone);
  } else if (/\bamanha\b/i.test(normalized)) {
    const wall = zonedParts(now, timeZone);
    const tomorrow = zonedParts(new Date(zonedDate(timeZone, wall.year, wall.month, wall.day, 12).getTime() + 24 * 60 * 60 * 1000), timeZone);
    date = `${tomorrow.year}-${padDate(tomorrow.month)}-${padDate(tomorrow.day)}`;
  }
  if (!date) return null;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•\-–\s]+/, "").replace(/^R:\s*/i, "").trim())
    .filter(Boolean);
  const timeLine = lines.findIndex((line) => /\d{1,2}:\d{2}/.test(line));
  const locationLines = (timeLine >= 0 ? lines.slice(timeLine + 1) : []).filter(
    (line) => !/consulta agendada|@secretaria|@agendar/i.test(line)
  );
  const location = locationLines.join(" · ") || undefined;
  const clinic = locationLines[0];
  const title = clinic && clinic.length <= 48 ? `Consulta · ${clinic}` : "Consulta";

  return { title, date, time, location };
};

const findAppointmentAt = (plan: FinancePlan, start: string) =>
  normalizeHealthModuleState(plan.health).appointments.find(
    (appointment) => !appointment.done && Math.abs(new Date(appointment.start).getTime() - new Date(start).getTime()) < 60_000
  );

const bookAppointmentFromConfirmation = (plan: FinancePlan, parsed: ParsedAppointmentConfirmation, now: Date) => {
  const timezone = plan.secretary?.settings?.timezone || plan.routine?.settings?.timezone || "America/Sao_Paulo";
  const { start, end } = buildAppointmentDateTime(parsed.date, parsed.time, timezone);
  const existing = findAppointmentAt(plan, start);
  return upsertHealthAppointment(
    plan,
    {
      id: existing?.id,
      title: parsed.title,
      kind: "consult",
      personId: existing?.personId || "primary",
      professional: parsed.professional || existing?.professional,
      location: parsed.location || existing?.location,
      start,
      end,
      remindOnWhatsApp: true
    },
    now
  );
};

const bookAppointmentsFromAgendaCommand = (plan: FinancePlan, parsed: ParsedAgendaCommand, now: Date) => {
  const timezone = plan.secretary?.settings?.timezone || plan.routine?.settings?.timezone || "America/Sao_Paulo";
  const remindOnWhatsApp = parsed.dates.length <= 2;
  return parsed.dates.reduce((current, date) => {
    const { start, end } = buildAppointmentDateTime(date, parsed.time, timezone);
    const existing = findAppointmentAt(current, start);
    return upsertHealthAppointment(
      current,
      {
        id: existing?.id,
        title: parsed.title,
        kind: parsed.kind,
        personId: existing?.personId || "primary",
        start,
        end,
        notes: parsed.dates.length > 1 ? `Serie ${parsed.title}` : existing?.notes,
        remindOnWhatsApp
      },
      now
    );
  }, plan);
};

const findLocalEventAt = (plan: FinancePlan, start: string, title: string) =>
  normalizeRoutineModuleState(plan.routine).localEvents.find(
    (event) =>
      event.source !== "health" &&
      event.title.toLowerCase() === title.toLowerCase() &&
      Math.abs(new Date(event.start).getTime() - new Date(start).getTime()) < 60_000
  );

const bookRoutineEventsFromAgendaCommand = (plan: FinancePlan, parsed: ParsedAgendaCommand, now: Date) => {
  const timezone = plan.secretary?.settings?.timezone || plan.routine?.settings?.timezone || "America/Sao_Paulo";
  const remind = parsed.dates.length <= 2;
  return parsed.dates.reduce((current, date) => {
    const { start, end } = buildAppointmentDateTime(date, parsed.time, timezone);
    const existing = findLocalEventAt(current, start, parsed.title);
    const routine = upsertRoutineLocalEvent(
      current.routine,
      {
        id: existing?.id,
        title: parsed.title,
        start,
        end,
        allDay: false,
        contextId: parsed.contextId || existing?.contextId || "context-personal",
        source: "manual"
      },
      now
    );
    const created = routine.localEvents.find((event) => event.start === start && event.title === parsed.title) ?? existing;
    let alerts = normalizeSecretaryModuleState(current.secretary).alerts;
    if (remind && created) {
      const remindAt = new Date(new Date(start).getTime() - 15 * 60 * 1000);
      if (remindAt.getTime() > now.getTime()) {
        const wall = zonedParts(new Date(start), timezone);
        const alert = createLifeAlert(
          {
            id: `alert-event-${created.id}-15m`,
            title: parsed.title,
            kind: "one_off",
            frequency: "once",
            dueDate: zonedDayKey(new Date(start), timezone),
            preferredHour: Math.min(21, Math.max(8, wall.hour)),
            remindDaysBefore: 0,
            askIfPaid: false,
            notes: "slot:15m"
          },
          now,
          timezone
        );
        alerts = upsertAlert(alerts, {
          ...alert,
          cycle: {
            ...alert.cycle,
            dueAt: start,
            remindAt: remindAt.toISOString(),
            confirmAt: start
          }
        });
      }
    }
    return {
      ...current,
      routine,
      secretary: {
        ...normalizeSecretaryModuleState(current.secretary),
        alerts,
        updatedAt: now.toISOString()
      }
    };
  }, plan);
};

const weekdayLabels = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

const formatWeekdaySpan = (weekdays: number[]) => {
  if (weekdays.length === 7) return "todos os dias";
  if (weekdays.join(",") === "1,2,3,4,5") return "de segunda a sexta";
  if (weekdays.join(",") === "0,6") return "no fim de semana";
  if (!weekdays.length) return "";
  return weekdays.map((day) => weekdayLabels[day]).join(", ");
};

export const buildAppointmentDateTime = (date: string, time: string, timeZone: string, durationMinutes = 60) => {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const start = zonedDate(timeZone, year, month, day, hour || 0, minute || 0);
  const end = new Date(start.getTime() + Math.max(15, durationMinutes) * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
};

const upsertById = <T extends { id: string }>(items: T[], next: T) =>
  items.some((item) => item.id === next.id) ? items.map((item) => (item.id === next.id ? next : item)) : [...items, next];

const upsertAlert = (alerts: LifeAlert[], next: LifeAlert) =>
  alerts.some((alert) => alert.id === next.id) ? alerts.map((alert) => (alert.id === next.id ? next : alert)) : [...alerts, next];

const cancelAlert = (alerts: LifeAlert[], alertId?: string, now = new Date()) =>
  alertId
    ? alerts.map((alert) => (alert.id === alertId ? { ...alert, status: "cancelled" as const, updatedAt: now.toISOString() } : alert))
    : alerts;

const appointmentAlertIds = (appointment: Pick<HealthAppointment, "secretaryAlertId" | "secretaryAlertIds">) =>
  [...new Set([appointment.secretaryAlertId, ...(appointment.secretaryAlertIds ?? [])].filter(Boolean) as string[])];

const cancelAppointmentAlerts = (
  alerts: LifeAlert[],
  appointment: Pick<HealthAppointment, "secretaryAlertId" | "secretaryAlertIds">,
  now: Date
) => appointmentAlertIds(appointment).reduce((current, alertId) => cancelAlert(current, alertId, now), alerts);

const isSeriesAppointment = (appointment: Pick<HealthAppointment, "notes" | "title">, appointments: HealthAppointment[]) =>
  /^serie\b/i.test(appointment.notes ?? "") ||
  appointments.filter((item) => item.title === appointment.title && !item.done).length > 2;

const appointmentReminderSpecs = (startIso: string, appointmentId: string, now: Date, series = false) => {
  const start = new Date(startIso).getTime();
  const specs = series
    ? [{ id: `alert-appt-${appointmentId}-15m`, slot: "15m", remindAt: new Date(start - 15 * 60 * 1000) }]
    : [
        { id: `alert-appt-${appointmentId}`, slot: "vespera", remindAt: new Date(start - 24 * 60 * 60 * 1000) },
        { id: `alert-appt-${appointmentId}-3h`, slot: "3h", remindAt: new Date(start - 3 * 60 * 60 * 1000) },
        { id: `alert-appt-${appointmentId}-1h`, slot: "1h", remindAt: new Date(start - 60 * 60 * 1000) },
        { id: `alert-appt-${appointmentId}-checkin`, slot: "checkin", remindAt: new Date(start + 2 * 60 * 60 * 1000) }
      ];
  return specs.filter((item) => item.remindAt.getTime() > now.getTime());
};

const foldInboxText = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

const looksLikeWhatsAppReminderRequest = (text: string) => {
  const raw = foldInboxText(text);
  if (/\bnao (quero|precisa)\b/.test(raw)) return false;
  if (/\b(amanha|semana que vem|mais tarde|depois)\b/.test(raw) && /\b(me avisa|me lembra)\b/.test(raw)) return false;
  return /\b((eu )?quero (o )?aviso|pode avisar|me avisa|avisa (no|pelo) (whats?app|zap)|quero (o )?lembrete|pode lembrar|ativa(r)? (o )?aviso|manda (o )?aviso)\b/.test(
    raw
  );
};

const enableWhatsAppRemindersFromInbox = (plan: FinancePlan, text: string, now: Date) => {
  const health = normalizeHealthModuleState(plan.health);
  const raw = foldInboxText(text);
  const upcoming = health.appointments.filter(
    (appointment) => !appointment.done && appointment.start && new Date(appointment.start).getTime() > now.getTime()
  );
  const silent = upcoming.filter((appointment) => !appointment.remindOnWhatsApp);
  const mentioned = silent.filter((appointment) => appointment.title.length >= 4 && raw.includes(foldInboxText(appointment.title)));
  const targets = mentioned.length ? mentioned : silent;
  if (!targets.length) return null;

  const next = targets.reduce(
    (current, appointment) => upsertHealthAppointment(current, { ...appointment, remindOnWhatsApp: true }, now),
    plan
  );
  return { plan: next, count: targets.length, title: targets[0]?.title ?? "compromisso" };
};

const createAppointmentReminder = (
  appointment: HealthAppointment,
  title: string,
  spec: { id: string; slot: string; remindAt: Date },
  now: Date,
  timeZone: string
) => {
  const wall = zonedParts(new Date(appointment.start), timeZone);
  const alert = createLifeAlert(
    {
      id: spec.id,
      title,
      kind: "one_off",
      frequency: "once",
      dueDate: appointmentWallDate(appointment.start, timeZone),
      preferredHour: Math.min(21, Math.max(8, wall.hour)),
      remindDaysBefore: spec.slot === "vespera" ? 1 : 0,
      askIfPaid: spec.slot === "checkin",
      snoozeHours: 24,
      category: "health",
      notes: [`slot:${spec.slot}`, appointment.professional, appointment.location].filter(Boolean).join(" · ")
    },
    now,
    timeZone
  );

  return {
    ...alert,
    cycle: {
      ...alert.cycle,
      dueAt: appointment.start,
      remindAt: spec.remindAt.toISOString(),
      confirmAt:
        spec.slot === "checkin"
          ? new Date(spec.remindAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
          : appointment.start
    }
  };
};

const appointmentTitle = (input: Pick<HealthAppointment, "title" | "kind">, personName?: string) => {
  const base = input.title.trim() || healthAppointmentKindLabels[input.kind];
  return personName ? `${base} · ${personName}` : base;
};

const toLocalEvent = (appointment: HealthAppointment, title: string): RoutineLocalEvent => ({
  id: appointment.routineLocalEventId || `local-${appointment.id}`,
  source: "health",
  title,
  start: appointment.start,
  end: appointment.end,
  allDay: false,
  location: appointment.location,
  notes: appointment.notes,
  contextId: HEALTH_CONTEXT_ID,
  healthAppointmentId: appointment.id,
  status: appointment.done ? "cancelled" : undefined
});

export const syncRoutineWithHealthAppointments = (plan: FinancePlan): FinancePlan => {
  const health = normalizeHealthModuleState(plan.health);
  const routine = normalizeRoutineModuleState(plan.routine);
  const healthEvents = health.appointments
    .filter((appointment) => appointment.start)
    .map((appointment) => {
      const person = plan.profile.people.find((item) => item.id === appointment.personId);
      return toLocalEvent(appointment, appointmentTitle(appointment, person?.name));
    });
  const otherEvents = routine.localEvents.filter((event) => event.source !== "health" && !event.healthAppointmentId);
  return {
    ...plan,
    health,
    routine: {
      ...routine,
      localEvents: [...otherEvents, ...healthEvents]
    }
  };
};

export const upsertHealthAppointment = (
  plan: FinancePlan,
  input: Partial<HealthAppointment> & { title?: string; start: string; end: string },
  now = new Date()
): FinancePlan => {
  const health = normalizeHealthModuleState(plan.health);
  const routine = normalizeRoutineModuleState(plan.routine);
  const secretary = normalizeSecretaryModuleState(plan.secretary);
  const id = asString(input.id) || createHealthId("appt", now);
  const existing = health.appointments.find((appointment) => appointment.id === id);
  const person = plan.profile.people.find((item) => item.id === (input.personId || existing?.personId));
  const appointment = normalizeAppointment(
    {
      ...existing,
      ...input,
      id,
      routineLocalEventId: existing?.routineLocalEventId || `local-${id}`,
      secretaryAlertId: existing?.secretaryAlertId
    },
    health.appointments.length
  );
  const title = appointmentTitle(appointment, person?.name);
  const localEvent = toLocalEvent(appointment, title);
  appointment.routineLocalEventId = localEvent.id;

  let alerts = cancelAppointmentAlerts(secretary.alerts, appointment, now);
  const reminderIds: string[] = [];
  if (appointment.remindOnWhatsApp && !appointment.done) {
    for (const spec of appointmentReminderSpecs(
      appointment.start,
      id,
      now,
      isSeriesAppointment(appointment, health.appointments)
    )) {
      const alert = createAppointmentReminder(appointment, title, spec, now, routine.settings.timezone);
      reminderIds.push(alert.id);
      alerts = upsertAlert(alerts, alert);
    }
    appointment.secretaryAlertId = reminderIds[0];
    appointment.secretaryAlertIds = reminderIds;
  } else {
    appointment.secretaryAlertId = undefined;
    appointment.secretaryAlertIds = [];
  }

  return {
    ...plan,
    health: {
      ...health,
      appointments: upsertById(health.appointments, appointment),
      updatedAt: now.toISOString()
    },
    routine: {
      ...routine,
      localEvents: upsertById(
        routine.localEvents.filter((event) => event.healthAppointmentId !== appointment.id || event.id === localEvent.id),
        localEvent
      ),
      updatedAt: now.toISOString()
    },
    secretary: {
      ...secretary,
      alerts,
      updatedAt: now.toISOString()
    }
  };
};

export const removeHealthAppointment = (plan: FinancePlan, appointmentId: string, now = new Date()): FinancePlan => {
  const health = normalizeHealthModuleState(plan.health);
  const routine = normalizeRoutineModuleState(plan.routine);
  const secretary = normalizeSecretaryModuleState(plan.secretary);
  const appointment = health.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return plan;

  return {
    ...plan,
    health: {
      ...health,
      appointments: health.appointments.filter((item) => item.id !== appointmentId),
      updatedAt: now.toISOString()
    },
    routine: {
      ...routine,
      localEvents: routine.localEvents.filter((event) => event.healthAppointmentId !== appointmentId && event.id !== appointment.routineLocalEventId),
      updatedAt: now.toISOString()
    },
    secretary: {
      ...secretary,
      alerts: cancelAppointmentAlerts(secretary.alerts, appointment, now),
      updatedAt: now.toISOString()
    }
  };
};

export const appointmentIdFromSecretaryAlert = (alertId?: string) => {
  if (!alertId?.startsWith("alert-appt-")) return "";
  return alertId.replace(/^alert-appt-/, "").replace(/-(3h|1h|15m|checkin)$/, "");
};

const parsedFromIntent = (intent: Extract<SecretaryIntent, { type: "book_event" | "book_health" | "book_series" }>): ParsedAgendaCommand => ({
  title: intent.title,
  kind: intent.type === "book_health" ? (intent.kind ?? "consult") : intent.type === "book_series" ? (intent.kind ?? "other") : "other",
  destination: intent.type === "book_health" ? "health" : intent.type === "book_series" ? (intent.destination ?? "health") : "routine",
  contextId: intent.type === "book_event" ? intent.contextId : intent.type === "book_series" ? intent.contextId : "context-health",
  time: intent.time,
  dates: intent.type === "book_series" ? (intent.dates ?? []) : intent.date ? [intent.date] : [],
  weekdays: intent.type === "book_series" ? (intent.weekdays ?? []) : [],
  calendarDays: intent.type === "book_series" ? intent.calendarDays : undefined,
  occurrenceCount: intent.type === "book_series" ? intent.occurrenceCount : undefined
});

const formatBookedReply = (parsed: ParsedAgendaCommand, timezone: string) => {
  const first = parsed.dates[0] ?? "";
  const last = parsed.dates[parsed.dates.length - 1] ?? "";
  const firstIso = first ? buildAppointmentDateTime(first, parsed.time, timezone).start : "";
  const lastIso = last ? buildAppointmentDateTime(last, parsed.time, timezone).start : "";
  const span = formatWeekdaySpan(parsed.weekdays);
  const when =
    parsed.dates.length === 1
      ? `em *${formatDayMonth(firstIso, timezone)} as ${parsed.time}*`
      : `*${span || "na agenda"} as ${parsed.time}*, ${parsed.dates.length} horarios, de *${formatDayMonth(firstIso, timezone)}* a *${formatDayMonth(lastIso, timezone)}*`;
  const remind =
    parsed.dates.length > 2
      ? " Coloquei na agenda do Zelo. Se quiser aviso no WhatsApp em cada dia, me fala."
      : parsed.destination === "routine"
        ? " Te aviso 15 minutos antes."
        : " Vou lembrar na vespera, 3h e 1h antes.";
  return `Pronto. Cadastrei *${parsed.title}* ${when}.${remind}`;
};

export const applySecretaryInboxToPlan = (
  plan: FinancePlan,
  text: string,
  now = new Date(),
  personName?: string,
  intents?: SecretaryIntent[],
  personId?: string
) => {
  const secretary = normalizeSecretaryModuleState(plan.secretary);
  const parsedAppointment = parseAppointmentConfirmation(text, now, secretary.settings.timezone);
  if (parsedAppointment) {
    const booked = bookAppointmentFromConfirmation(plan, parsedAppointment, now);
    const created = booked.health.appointments.find((appointment) => {
      const start = new Date(appointment.start).getTime();
      const expected = new Date(buildAppointmentDateTime(parsedAppointment.date, parsedAppointment.time, secretary.settings.timezone).start).getTime();
      return Math.abs(start - expected) < 60_000;
    });
    return {
      plan: booked,
      reply: `Pronto. Cadastrei *${parsedAppointment.title}* em *${formatDayMonth(created?.start ?? "", secretary.settings.timezone)} as ${parsedAppointment.time}*. Vou lembrar na vespera, 3h e 1h antes, e 2h depois confirmo se voce foi.`,
      matchedAlertId: created?.secretaryAlertId
    };
  }

  const resolved = sanitizeSecretaryIntents(
    text,
    intents?.length ? intents : interpretSecretaryMessage(text, now, secretary.settings.timezone),
    now,
    secretary.settings.timezone
  );
  if (!resolved.some((intent) => intent.type === "alert_reply")) {
    let next = plan;
    const replies: string[] = [];
    let matchedAlertId: string | undefined;
    for (const intent of resolved) {
      if (intent.type === "ask") {
        replies.push(intent.message);
        continue;
      }
      if (intent.type === "add_expense") {
        if (intent.frequency) {
          const added = addRecurringExpense(next, intent, now, secretary.settings.timezone);
          next = added.plan;
          const amount = added.recurring.amount.toFixed(2).replace(".", ",");
          const when = formatDayMonth(added.recurring.startDate, secretary.settings.timezone);
          replies.push(
            `Pronto. Cadastrei *${added.recurring.name}* de *R$ ${amount}* em ${expenseCategoryLabel(added.recurring.category)}, recorrente ${recurringFrequencyLabel(added.recurring.frequency)}, a partir de *${when}*.`
          );
          continue;
        }
        const added = addManualExpense(next, intent, now, secretary.settings.timezone, personId);
        next = added.plan;
        const amount = added.transaction.amount.toFixed(2).replace(".", ",");
        const when = formatDayMonth(added.transaction.date, secretary.settings.timezone);
        replies.push(
          `Pronto. Registrei *${added.transaction.merchant}* de *R$ ${amount}* em ${expenseCategoryLabel(added.transaction.category)}, em *${when}*.`
        );
        continue;
      }
      if (intent.type === "add_alert") {
        const added = addManualAlert(next, intent, now, secretary.settings.timezone);
        next = added.plan;
        const when = formatDayMonth(added.alert.cycle.dueAt, secretary.settings.timezone);
        replies.push(`Pronto. Cadastrei o lembrete *${added.alert.title}* para *${when}*.`);
        matchedAlertId = added.alert.id;
        continue;
      }
      if (intent.type === "enable_reminders") {
        const reminderRequest = enableWhatsAppRemindersFromInbox(next, intent.title ? `${text} ${intent.title}` : text, now);
        if (reminderRequest) {
          next = reminderRequest.plan;
          replies.push(
            `Combinado. Vou te avisar no WhatsApp 15 minutos antes de cada *${reminderRequest.title}* (${reminderRequest.count} horarios).`
          );
        } else {
          replies.push(`Por agora nao achei compromisso na agenda sem aviso. Se quiser, me fala o que cadastrar.`);
        }
        continue;
      }
      if (intent.type === "book_event" || intent.type === "book_health" || intent.type === "book_series") {
        let parsed = parsedFromIntent(intent);
        if (!parsed.dates.length) {
          const fallback = parseAgendaCommand(text, now, secretary.settings.timezone);
          if (fallback) parsed = fallback;
        }
        if (!parsed.dates.length) {
          replies.push("Entendi o compromisso, mas falta data ou horario.");
          continue;
        }
        next =
          parsed.destination === "routine"
            ? bookRoutineEventsFromAgendaCommand(next, parsed, now)
            : bookAppointmentsFromAgendaCommand(next, parsed, now);
        replies.push(formatBookedReply(parsed, secretary.settings.timezone));
        matchedAlertId =
          parsed.destination === "routine"
            ? next.secretary.alerts.find((alert) => alert.id.endsWith("-15m") && alert.title === parsed.title)?.id
            : next.health.appointments.find((appointment) => appointment.title === parsed.title)?.secretaryAlertId;
      }
    }
    if (replies.length) {
      return { plan: next, reply: replies.join(" "), matchedAlertId };
    }
  }

  const inbox = applyInbox(secretary.alerts, text, now, secretary.settings, personName);
  let next: FinancePlan = {
    ...plan,
    secretary: {
      ...secretary,
      alerts: inbox.alerts,
      updatedAt: now.toISOString()
    }
  };
  const matched = inbox.alerts.find((alert) => alert.id === inbox.matchedAlertId);
  const appointmentId = appointmentIdFromSecretaryAlert(matched?.id);
  if (
    appointmentId &&
    matched?.notes?.includes("slot:checkin") &&
    (matched.cycle.status === "paid" || matched.status === "completed")
  ) {
    next = markHealthAppointmentDone(next, appointmentId, now);
  }
  return { plan: next, reply: inbox.reply, matchedAlertId: inbox.matchedAlertId };
};

export const markHealthAppointmentDone = (plan: FinancePlan, appointmentId: string, now = new Date()): FinancePlan => {
  const health = normalizeHealthModuleState(plan.health);
  const appointment = health.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return plan;
  const today = now.toISOString().slice(0, 10);
  const nextCares = appointment.careId
    ? health.cares.map((care) => (care.id === appointment.careId ? { ...care, lastDoneOn: today } : care))
    : health.cares;

  return upsertHealthAppointment(
    {
      ...plan,
      health: {
        ...health,
        cares: nextCares,
        updatedAt: now.toISOString()
      }
    },
    { ...appointment, done: true, remindOnWhatsApp: false },
    now
  );
};

export const upsertHealthCare = (plan: FinancePlan, input: Partial<HealthCare> & { title?: string }, now = new Date()): FinancePlan => {
  const health = normalizeHealthModuleState(plan.health);
  const care = normalizeCare(
    {
      ...health.cares.find((item) => item.id === input.id),
      ...input,
      id: asString(input.id) || createHealthId("care", now)
    },
    health.cares.length
  );

  return {
    ...plan,
    health: {
      ...health,
      cares: upsertById(health.cares, care),
      updatedAt: now.toISOString()
    }
  };
};

export const removeHealthCare = (plan: FinancePlan, careId: string, now = new Date()): FinancePlan => {
  const health = normalizeHealthModuleState(plan.health);
  return {
    ...plan,
    health: {
      ...health,
      cares: health.cares.filter((care) => care.id !== careId),
      appointments: health.appointments.map((appointment) =>
        appointment.careId === careId ? { ...appointment, careId: undefined } : appointment
      ),
      updatedAt: now.toISOString()
    }
  };
};

export const markHealthCareDone = (plan: FinancePlan, careId: string, now = new Date()): FinancePlan => {
  const health = normalizeHealthModuleState(plan.health);
  return {
    ...plan,
    health: {
      ...health,
      cares: health.cares.map((care) => (care.id === careId ? { ...care, lastDoneOn: now.toISOString().slice(0, 10) } : care)),
      updatedAt: now.toISOString()
    }
  };
};

export const upsertHealthMedication = (
  plan: FinancePlan,
  input: Partial<HealthMedication> & { name: string },
  now = new Date()
): FinancePlan => {
  const health = normalizeHealthModuleState(plan.health);
  const secretary = normalizeSecretaryModuleState(plan.secretary);
  const timezone = plan.secretary?.settings?.timezone || plan.routine?.settings?.timezone || "America/Sao_Paulo";
  const id = asString(input.id) || createHealthId("med", now);
  const existing = health.medications.find((item) => item.id === id);
  const medication = normalizeMedication(
    {
      ...existing,
      ...input,
      id
    },
    health.medications.length
  );
  const person = plan.profile.people.find((item) => item.id === medication.personId);
  const label = person?.name ? `${medication.name} · ${person.name}` : medication.name;

  let alerts = secretary.alerts;
  if (medication.remindOnWhatsApp) {
    const takeAlert = createLifeAlert(
      {
        id: medication.takeAlertId || `alert-med-${id}`,
        title: `Tomar ${label}`,
        kind: "habit",
        frequency: "daily",
        preferredHour: medication.reminderHour,
        remindDaysBefore: 0,
        askIfPaid: true,
        category: "health",
        notes: medication.dosage
      },
      now,
      timezone
    );
    medication.takeAlertId = takeAlert.id;
    alerts = upsertAlert(alerts, takeAlert);
  } else if (medication.takeAlertId) {
    alerts = cancelAlert(alerts, medication.takeAlertId, now);
    medication.takeAlertId = undefined;
  }

  if (medication.prescriptionExpiresOn) {
    const prescriptionAlert = createLifeAlert(
      {
        id: medication.prescriptionAlertId || `alert-rx-${id}`,
        title: `Renovar receita: ${label}`,
        kind: "document",
        frequency: "once",
        dueDate: medication.prescriptionExpiresOn,
        preferredHour: 9,
        remindDaysBefore: 7,
        askIfPaid: false,
        category: "health"
      },
      now,
      timezone
    );
    medication.prescriptionAlertId = prescriptionAlert.id;
    alerts = upsertAlert(alerts, prescriptionAlert);
  } else if (medication.prescriptionAlertId) {
    alerts = cancelAlert(alerts, medication.prescriptionAlertId, now);
    medication.prescriptionAlertId = undefined;
  }

  return {
    ...plan,
    health: {
      ...health,
      medications: upsertById(health.medications, medication),
      updatedAt: now.toISOString()
    },
    secretary: {
      ...secretary,
      alerts,
      updatedAt: now.toISOString()
    }
  };
};

export const removeHealthMedication = (plan: FinancePlan, medicationId: string, now = new Date()): FinancePlan => {
  const health = normalizeHealthModuleState(plan.health);
  const secretary = normalizeSecretaryModuleState(plan.secretary);
  const medication = health.medications.find((item) => item.id === medicationId);
  if (!medication) return plan;

  return {
    ...plan,
    health: {
      ...health,
      medications: health.medications.filter((item) => item.id !== medicationId),
      updatedAt: now.toISOString()
    },
    secretary: {
      ...secretary,
      alerts: cancelAlert(cancelAlert(secretary.alerts, medication.takeAlertId, now), medication.prescriptionAlertId, now),
      updatedAt: now.toISOString()
    }
  };
};

export const upsertHealthProfile = (plan: FinancePlan, profile: HealthProfile, now = new Date()): FinancePlan => {
  const health = normalizeHealthModuleState(plan.health);
  const next = normalizeProfile(profile);
  return {
    ...plan,
    health: {
      ...health,
      profiles: health.profiles.some((item) => item.personId === next.personId)
        ? health.profiles.map((item) => (item.personId === next.personId ? next : item))
        : [...health.profiles, next],
      updatedAt: now.toISOString()
    }
  };
};

export const upsertHealthInsurance = (plan: FinancePlan, insurance: HealthInsurance, now = new Date()): FinancePlan => {
  const health = normalizeHealthModuleState(plan.health);
  return {
    ...plan,
    health: {
      ...health,
      insurance: normalizeInsurance(insurance),
      updatedAt: now.toISOString()
    }
  };
};
