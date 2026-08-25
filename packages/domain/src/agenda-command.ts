import { addDays, weekdayIndex, zonedDate, zonedParts } from "./secretary.js";
import type { AlertFrequency, AlertKind, ExpenseCategory, HealthAppointmentKind } from "./types.js";

const pad = (value: number) => String(value).padStart(2,  "0");

const WEEKDAY_ALIASES: Array<{ names: string[]; day: number }> = [
  { names: ["domingo", "dom"], day: 0 },
  { names: ["segunda", "seg"], day: 1 },
  { names: ["terca", "ter"], day: 2 },
  { names: ["quarta", "qua"], day: 3 },
  { names: ["quinta", "qui"], day: 4 },
  { names: ["sexta", "sex"], day: 5 },
  { names: ["sabado", "sab"], day: 6 }
];

const ACTIVITY_TITLES: Array<{ pattern: RegExp; title: string; kind: HealthAppointmentKind }> = [
  { pattern: /\bfisioterapia\b|\bfisio\b/, title: "Fisioterapia", kind: "other" },
  { pattern: /\bpilates\b/, title: "Pilates", kind: "other" },
  { pattern: /\byoga\b/, title: "Yoga", kind: "other" },
  { pattern: /\bacademia\b/, title: "Academia", kind: "other" },
  { pattern: /\bfonoaudiologia\b|\bfono\b/, title: "Fonoaudiologia", kind: "other" },
  { pattern: /\bterapia\b/, title: "Terapia", kind: "other" },
  { pattern: /\bexame\b/, title: "Exame", kind: "exam" },
  { pattern: /\bvacina\b/, title: "Vacina", kind: "vaccine" },
  { pattern: /\bretorno\b/, title: "Retorno", kind: "follow_up" },
  { pattern: /\bconsulta\b/, title: "Consulta", kind: "consult" },
  { pattern: /\bdentista\b/, title: "Dentista", kind: "consult" }
];

export type AgendaDestination = "health" | "routine";

export type ParsedAgendaCommand = {
  title: string;
  kind: HealthAppointmentKind;
  destination: AgendaDestination;
  contextId?: string;
  time: string;
  dates: string[];
  weekdays: number[];
  calendarDays?: number;
  occurrenceCount?: number;
};

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[•–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const weekdayFromName = (value: string) => WEEKDAY_ALIASES.find((item) => item.names.includes(value))?.day;

const expandWeekdayRange = (from: number, to: number) => {
  const days: number[] = [];
  let current = from;
  for (let index = 0; index < 7; index += 1) {
    days.push(current);
    if (current === to) break;
    current = (current + 1) % 7;
  }
  return days;
};

const parseWeekdays = (normalized: string) => {
  const range = normalized.match(
    /(?:\bde\s+)?(segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab|domingo|dom)\s+a\s+(segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab|domingo|dom)\b/
  );
  if (range) {
    const from = weekdayFromName(range[1] ?? "");
    const to = weekdayFromName(range[2] ?? "");
    if (from !== undefined && to !== undefined) return expandWeekdayRange(from, to);
  }

  if (/\b(dias? de semana|dias? uteis)\b/.test(normalized)) return [1, 2, 3, 4, 5];
  if (/\b(fim de semana|final de semana)\b/.test(normalized)) return [0, 6];

  const named = WEEKDAY_ALIASES.filter((item) => item.names.some((name) => new RegExp(`\\b${name}\\b`).test(normalized))).map(
    (item) => item.day
  );
  if (named.length) return [...new Set(named)].sort((left, right) => left - right);
  if (/\b(todos os dias|todo dia|diariamente|todo santo dia)\b/.test(normalized)) return [0, 1, 2, 3, 4, 5, 6];
  return [];
};

const parseTime = (normalized: string) => {
  const stamped =
    normalized.match(/\b(?:as|a)?\s*(\d{1,2}):(\d{2})\b/) ||
    normalized.match(/\b(?:as|a)\s*(\d{1,2})\s*h(?:oras?)?\b/) ||
    normalized.match(/\b(?:as|a)\s*(\d{1,2})\b(?!\s*(?:dias?|semanas?|meses?|vezes|sessoes?))/);
  if (!stamped) return "";

  let hour = Number(stamped[1]);
  const minute = stamped[2] ? Number(stamped[2]) : 0;
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) return "";

  if (hour <= 12) {
    if (/\b(da|de)\s+tarde\b/.test(normalized) && hour < 12) hour += 12;
    if (/\b(da|de)\s+noite\b/.test(normalized) && hour < 12) hour += 12;
    if (/\b(da|de)\s+manha\b/.test(normalized) && hour === 12) hour = 0;
  }

  return `${pad(hour)}:${pad(minute)}`;
};

const parseSpan = (normalized: string) => {
  const sessions = normalized.match(/\b(?:por\s+)?(\d{1,2})\s*(?:sessoes?|vezes)\b/);
  if (sessions) return { occurrenceCount: Math.min(40, Math.max(1, Number(sessions[1]))) };

  const weeks = normalized.match(/\b(?:por|durante)\s+(\d{1,2})\s+semanas?\b/);
  if (weeks) return { calendarDays: Math.min(90, Math.max(1, Number(weeks[1]) * 7)) };

  const months = normalized.match(/\b(?:por|durante)\s+(\d{1,2})\s+mes(?:es)?\b/);
  if (months) return { calendarDays: Math.min(90, Math.max(1, Number(months[1]) * 30)) };

  const days = normalized.match(/\b(?:por|durante)\s+(\d{1,2})\s+dias?\b/);
  if (days) return { calendarDays: Math.min(90, Math.max(1, Number(days[1]))) };

  return {};
};

const hasRecurrenceCue = (
  normalized: string,
  weekdays: number[],
  span: { calendarDays?: number; occurrenceCount?: number }
) => {
  if (span.calendarDays || span.occurrenceCount) return true;
  if (/\b(toda|todas|todo|todos|sempre|diariamente|todo santo dia)\b/.test(normalized)) return true;
  if (/\b(dias? de semana|dias? uteis|fim de semana|final de semana|todos os dias|todo dia)\b/.test(normalized)) {
    return true;
  }
  if (
    /\b(?:de\s+)?(segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab|domingo|dom)\s+a\s+(segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab|domingo|dom)\b/.test(
      normalized
    )
  ) {
    return true;
  }
  return weekdays.length > 1;
};

const parseStartDate = (normalized: string, now: Date, timeZone: string) => {
  const wall = zonedParts(now, timeZone);
  const dateMatch = normalized.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/);
  if (dateMatch) {
    const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + Number(dateMatch[3]) : Number(dateMatch[3])) : wall.year;
    return zonedDate(timeZone, year, Number(dateMatch[2]), Number(dateMatch[1]), 12);
  }
  if (/\bamanha\b/.test(normalized)) {
    return addDays(zonedDate(timeZone, wall.year, wall.month, wall.day, 12), 1);
  }
  if (/\bhoje\b/.test(normalized) || /\bagora\b/.test(normalized)) {
    return zonedDate(timeZone, wall.year, wall.month, wall.day, 12);
  }
  return zonedDate(timeZone, wall.year, wall.month, wall.day, 12);
};

const dateKey = (date: Date, timeZone: string) => {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
};

const isPastSlot = (dateKeyValue: string, time: string, now: Date, timeZone: string) => {
  const [year = 1970, month = 1, day = 1] = dateKeyValue.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return zonedDate(timeZone, year, month, day, hour, minute).getTime() <= now.getTime();
};

export const expandAgendaDates = (
  input: {
    time: string;
    weekdays: number[];
    calendarDays?: number;
    occurrenceCount?: number;
    start: Date;
  },
  now: Date,
  timeZone: string
) => {
  const weekdays = input.weekdays.length ? input.weekdays : [0, 1, 2, 3, 4, 5, 6];
  const dates: string[] = [];
  const startKey = dateKey(input.start, timeZone);
  const startParts = zonedParts(input.start, timeZone);
  const origin = zonedDate(timeZone, startParts.year, startParts.month, startParts.day, 12);
  const span = input.calendarDays ?? 1;
  let cursor = input.start;

  for (let step = 0; step < 120 && dates.length < 40; step += 1) {
    const key = dateKey(cursor, timeZone);
    const weekday = weekdayIndex(cursor, timeZone);
    const matchesWeekday = weekdays.includes(weekday);
    const cursorParts = zonedParts(cursor, timeZone);
    const daysFromStart = Math.round(
      (zonedDate(timeZone, cursorParts.year, cursorParts.month, cursorParts.day, 12).getTime() - origin.getTime()) / 86_400_000
    );
    const withinWindow = input.occurrenceCount ? true : daysFromStart >= 0 && daysFromStart < span;

    if (matchesWeekday && withinWindow && !isPastSlot(key, input.time, now, timeZone) && key >= startKey) {
      dates.push(key);
      if (input.occurrenceCount && dates.length >= input.occurrenceCount) break;
    }

    if (!input.occurrenceCount && !withinWindow) break;
    cursor = addDays(cursor, 1);
  }

  return dates;
};

const EVENT_NOUNS: Array<{ pattern: RegExp; label: string; contextId: string }> = [
  { pattern: /\breunioes?\b|\breuniao\b/, label: "Reunião", contextId: "context-work" },
  { pattern: /\bcalls?\b|\bchamada\b/, label: "Call", contextId: "context-work" },
  { pattern: /\bdaily\b/, label: "Daily", contextId: "context-work" },
  { pattern: /\balinhamento\b/, label: "Alinhamento", contextId: "context-work" },
  { pattern: /\bentrevista\b/, label: "Entrevista", contextId: "context-work" },
  { pattern: /\balmoco\b/, label: "Almoço", contextId: "context-personal" },
  { pattern: /\bcafe\b/, label: "Café", contextId: "context-personal" }
];

const knownActivity = (normalized: string) => ACTIVITY_TITLES.find((item) => item.pattern.test(normalized));

const titleCaseName = (value: string) => value.replace(/^\w/, (letter) => letter.toUpperCase());

const extractMeeting = (normalized: string) => {
  const matches = EVENT_NOUNS.filter((item) => item.pattern.test(normalized));
  const noun = matches.find((item) => item.label !== "Reunião") ?? matches[0];
  if (!noun) return null;
  const person = normalized.match(
    /\b(?:reuniao|reunioes|call|calls|chamada|daily|alinhamento|entrevista|almoco|cafe)\b(?:\s+com\s+(?:a|o|as|os)\s+|\s+com\s+)([a-z]+)/
  )?.[1];
  return {
    title: person ? `${noun.label} com ${titleCaseName(person)}` : noun.label,
    contextId: noun.contextId
  };
};

const hasEventNoun = (normalized: string) => EVENT_NOUNS.some((item) => item.pattern.test(normalized));

const hasEventAnnounce = (normalized: string) =>
  /\b(tenho|temos|terei|teremos|vou ter|vamos ter|marcada|marcado)\b/.test(normalized);

const stripScheduleWords = (normalized: string) =>
  normalized
    .replace(/@secretaria|@agendar/g, " ")
    .replace(
      /\b(adicion[aeo]|adicionar|marc[aeo]|marcar|agend[aeo]|agendar|coloc[aeo]|colocar|bot[aeo]|botar|cri[aeo]|criar|cadastr[aeo]|cadastrar|tenho|temos|terei|vou|vamos|ter|que|lembrete|lembrar|lembra|avisa|avisar|recorde|esquecer)\b/g,
      " "
    )
    .replace(/\b(na|no|da|do|de|em|pra|para|minha|meu|nossa|nosso|sua|seu)\s+(agenda|calendario)\b/g, " ")
    .replace(/\b(todos os dias|todo dia|diariamente|dias? de semana|dias? uteis|fim de semana|final de semana)\b/g, " ")
    .replace(
      /\b(?:de\s+)?(segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab|domingo|dom)\s+a\s+(segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab|domingo|dom)\b/g,
      " "
    )
    .replace(/\b(segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab|domingo|dom)s?\b/g, " ")
    .replace(/\b(?:as|a)\s*\d{1,2}(?::\d{2})?\s*(?:h(?:oras?)?)?\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\b(da|de)\s+(manha|tarde|noite)\b/g, " ")
    .replace(/\b(?:por|durante)\s+\d{1,2}\s+(?:dias?|semanas?|meses?|sessoes?|vezes)\b/g, " ")
    .replace(/\b\d{1,2}\s*(?:sessoes?|vezes)\b/g, " ")
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\b/g, " ")
    .replace(/\b(hoje|amanha|por favor|pf|pfv)\b/g, " ")
    .replace(/\b(na|no|da|do|de|em|pra|para|com|a|o|as|os|um|uma|minha|meu)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractTitle = (normalized: string) => {
  const meeting = extractMeeting(normalized);
  if (meeting) return meeting.title;
  const activity = knownActivity(normalized);
  if (activity) {
    const extra = stripScheduleWords(normalized.replace(activity.pattern, " "));
    return extra && extra.length >= 4
      ? `${activity.title} ${extra.replace(/^\w/, (letter) => letter.toUpperCase())}`
      : activity.title;
  }

  const cleaned = stripScheduleWords(normalized);
  if (!cleaned) return "Compromisso";
  return cleaned.replace(/^\w/, (letter) => letter.toUpperCase());
};

const hasScheduleIntent = (normalized: string) =>
  /\b(adicion[aeo]|adicionar|marc[aeo]|marcar|agend[aeo]|agendar|coloc[aeo]|colocar|bot[aeo]|botar|cri[aeo]|criar|cadastr[aeo]|cadastrar)\b/.test(
    normalized
  ) ||
  /\b(na|no)\s+(minha|nossa|sua)?\s*(agenda|calendario)\b/.test(normalized) ||
  /@secretaria\b|@agendar\b/.test(normalized);

const looksLikeBillReply = (normalized: string) => {
  if (/\b(ainda nao|nao paguei|nao fui|depois te falo|pendencias)\b/.test(normalized)) return true;
  if (!/\b(me lembra|me avisa)\b/.test(normalized)) return false;
  const rest = normalized
    .replace(/\b(me lembra|me avisa)\b/g, " ")
    .replace(/\b(amanha|depois|por favor|pf|pfv)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return rest.length < 3;
};

const REMINDER_LANGUAGE =
  /\b(lembrete|me lembra|me avisa|lembrar (?:de|que)|nao (?:me )?esquecer|me recorde)\b/;
const REMINDER_TASK =
  /\b(pagar|pagamento|conta|boleto|fatura|vencimento|tomar|remedio|renovar|documento|prazo|iptu|ipva)\b/;

const hasStrongAgendaCue = (normalized: string) =>
  Boolean(knownActivity(normalized) || extractMeeting(normalized) || hasEventNoun(normalized)) ||
  /\b(na|no)\s+(minha|nossa|sua)?\s*(agenda|calendario)\b/.test(normalized) ||
  /@agendar\b/.test(normalized);

export const looksLikeReminderCommand = (text: string) => {
  const normalized = fold(text);
  if (looksLikeBillReply(normalized) || /consulta agendada/.test(normalized)) return false;
  if (hasStrongAgendaCue(normalized)) return false;
  if (REMINDER_LANGUAGE.test(normalized)) return true;
  const hasWhen =
    Boolean(parseTime(normalized)) ||
    /\b(hoje|amanha|agora|todo dia|todos os dias|toda semana|todo mes|diariamente|semanal|mensal)\b/.test(
      normalized
    ) ||
    /\b\d{1,2}\s*\/\s*\d{1,2}\b/.test(normalized);
  return REMINDER_TASK.test(normalized) && hasWhen;
};

export type ParsedReminderCommand = {
  title: string;
  kind: AlertKind;
  frequency: AlertFrequency;
  dueDate?: string;
  weekday?: number;
  dueDay?: number;
  preferredHour: number;
  category?: ExpenseCategory;
};

const reminderKind = (normalized: string): { kind: AlertKind; category?: ExpenseCategory } => {
  if (/\b(iptu|ipva|imposto|das|irpf)\b/.test(normalized)) return { kind: "tax" };
  if (/\b(tomar|remedio|medicacao|habito)\b/.test(normalized)) return { kind: "habit", category: "health" };
  if (/\b(renovar|documento|receita|cnh|passaporte|prazo)\b/.test(normalized)) return { kind: "document" };
  if (/\b(netflix|spotify|assinatura)\b/.test(normalized)) return { kind: "subscription" };
  if (/\b(pagar|pagamento|conta|boleto|fatura|luz|agua|aluguel|vencimento)\b/.test(normalized)) return { kind: "bill" };
  return { kind: "one_off" };
};

const reminderFrequency = (normalized: string): AlertFrequency => {
  if (/\b(todo dia|todos os dias|diariamente|todo santo dia)\b/.test(normalized)) return "daily";
  if (
    /\b(toda semana|todas as semanas|semanal)\b/.test(normalized) ||
    /\b(toda|todo|todas|todos)\s+(segunda|terca|quarta|quinta|sexta|sabado|domingo)s?\b/.test(normalized)
  ) {
    return "weekly";
  }
  if (/\b(todo mes|todos os meses|mensal)\b/.test(normalized)) return "monthly";
  return "once";
};

const reminderTitle = (normalized: string) => {
  const cleaned = stripScheduleWords(normalized)
    .replace(/\b(lembrete|lembrar|lembra|avisa|avisar|recorde|esquecer)\b/g, " ")
    .replace(/\b(quero|pode|criar|adicionar|cadastrar|faz|fazer|coloca|colocar|me)\b/g, " ")
    .replace(/\b(um|uma|o|a|de|que|pra|para)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 3) return "";
  return cleaned.replace(/^\w/, (letter) => letter.toUpperCase());
};

export const parseReminderCommand = (
  text: string,
  now = new Date(),
  timeZone = "America/Sao_Paulo"
): ParsedReminderCommand | null => {
  if (!looksLikeReminderCommand(text)) return null;
  const normalized = fold(text);
  const title = reminderTitle(normalized);
  if (!title) return null;

  const frequency = reminderFrequency(normalized);
  const time = parseTime(normalized);
  const [hour = 9] = time ? time.split(":").map(Number) : [9];
  const preferredHour = Math.min(21, Math.max(8, hour));
  const start = parseStartDate(normalized, now, timeZone);
  const dueDate = dateKey(start, timeZone);
  const { kind, category } = reminderKind(normalized);

  if (frequency === "weekly") {
    const weekdays = parseWeekdays(normalized);
    return {
      title,
      kind,
      category,
      frequency,
      weekday: weekdays[0] ?? weekdayIndex(start, timeZone),
      preferredHour
    };
  }
  if (frequency === "monthly") {
    return {
      title,
      kind,
      category,
      frequency,
      dueDay: zonedParts(start, timeZone).day,
      preferredHour
    };
  }
  if (frequency === "daily") {
    return { title, kind, category, frequency, preferredHour };
  }
  return { title, kind, category, frequency, dueDate, preferredHour };
};

export const looksLikeIncompleteAgendaCommand = (text: string) => {
  const normalized = fold(text);
  if (looksLikeBillReply(normalized) || /consulta agendada/.test(normalized) || looksLikeReminderCommand(text)) {
    return false;
  }
  return (hasEventNoun(normalized) && (hasEventAnnounce(normalized) || /\bcom\b/.test(normalized))) && !parseTime(normalized);
};

export const looksLikeAgendaCommand = (text: string) => {
  const normalized = fold(text);
  if (looksLikeBillReply(normalized) || /consulta agendada/.test(normalized) || looksLikeReminderCommand(text)) {
    return false;
  }
  const time = parseTime(normalized);
  const weekdays = parseWeekdays(normalized);
  const span = parseSpan(normalized);
  const hasRelativeDate = /\b(hoje|amanha|agora)\b/.test(normalized) || /\b\d{1,2}\s*\/\s*\d{1,2}\b/.test(normalized);
  const meeting = extractMeeting(normalized);
  const implicitOnce = Boolean(meeting) || (hasEventNoun(normalized) && hasEventAnnounce(normalized));
  const activityOnce = Boolean(knownActivity(normalized) && time);
  const hasTitle = Boolean(knownActivity(normalized) || meeting) || extractTitle(normalized) !== "Compromisso";
  return Boolean(
    time &&
      (weekdays.length || span.calendarDays || span.occurrenceCount || hasRelativeDate || implicitOnce || activityOnce) &&
      (hasScheduleIntent(normalized) || hasTitle || implicitOnce)
  );
};

export const parseAgendaCommand = (
  text: string,
  now = new Date(),
  timeZone = "America/Sao_Paulo"
): ParsedAgendaCommand | null => {
  if (!looksLikeAgendaCommand(text)) return null;

  const normalized = fold(text);
  const time = parseTime(normalized);
  if (!time) return null;

  const weekdays = parseWeekdays(normalized);
  const span = parseSpan(normalized);
  const recurring = hasRecurrenceCue(normalized, weekdays, span);
  const selectedWeekdays = weekdays.length ? weekdays : recurring ? [0, 1, 2, 3, 4, 5, 6] : [];
  let start = parseStartDate(normalized, now, timeZone);
  for (let step = 0; step < 14; step += 1) {
    const key = dateKey(addDays(start, step), timeZone);
    const weekday = weekdayIndex(addDays(start, step), timeZone);
    if ((selectedWeekdays.length === 0 || selectedWeekdays.includes(weekday)) && !isPastSlot(key, time, now, timeZone)) {
      start = addDays(start, step);
      break;
    }
  }
  const dates = expandAgendaDates(
    {
      time,
      weekdays: selectedWeekdays,
      calendarDays: span.calendarDays ?? (span.occurrenceCount ? undefined : recurring ? 28 : 1),
      occurrenceCount: span.occurrenceCount,
      start
    },
    now,
    timeZone
  );

  if (!dates.length) return null;

  const activity = knownActivity(normalized);
  const meeting = extractMeeting(normalized);
  return {
    title: extractTitle(normalized),
    kind: activity?.kind ?? "other",
    destination: activity ? "health" : "routine",
    contextId: meeting?.contextId ?? (activity ? "context-health" : "context-personal"),
    time,
    dates,
    weekdays,
    calendarDays: span.calendarDays,
    occurrenceCount: span.occurrenceCount
  };
};
