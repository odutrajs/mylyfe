import { parseAgendaCommand } from "./agenda-command.js";
import { classifyTransaction } from "./classification.js";
import { addDays, weekdayIndex, zonedDate, zonedParts } from "./secretary.js";
import type { ExpenseCategory, FinancePlan, HealthAppointmentKind, RecurringTransaction } from "./types.js";

export type SecretaryIntent =
  | {
      type: "book_event";
      title: string;
      time: string;
      date?: string;
      contextId?: string;
      durationMinutes?: number;
    }
  | {
      type: "book_health";
      title: string;
      time: string;
      date?: string;
      kind?: HealthAppointmentKind;
      location?: string;
      professional?: string;
    }
  | {
      type: "book_series";
      title: string;
      time: string;
      dates?: string[];
      weekdays?: number[];
      calendarDays?: number;
      occurrenceCount?: number;
      destination?: "health" | "routine";
      contextId?: string;
      kind?: HealthAppointmentKind;
    }
  | {
      type: "add_expense";
      merchant: string;
      amount: number;
      date?: string;
      category?: ExpenseCategory;
      frequency?: RecurringTransaction["frequency"];
    }
  | {
      type: "enable_reminders";
      title?: string;
    }
  | {
      type: "ask";
      message: string;
    }
  | {
      type: "alert_reply";
    };

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const pad = (value: number) => String(value).padStart(2, "0");

const KNOWN_MERCHANTS: Array<{ pattern: RegExp; merchant: string; category: ExpenseCategory }> = [
  { pattern: /\bifood\b|\bifod\b/, merchant: "iFood", category: "food" },
  { pattern: /\brappi\b/, merchant: "Rappi", category: "food" },
  { pattern: /\buber\s*eats\b/, merchant: "Uber Eats", category: "food" },
  { pattern: /\bstarbucks\b/, merchant: "Starbucks", category: "food" },
  { pattern: /\bmercado\b|\bsupermercado\b/, merchant: "Mercado", category: "food" },
  { pattern: /\buber\b/, merchant: "Uber", category: "transport" },
  { pattern: /\b99\b(?![.,]\d)/, merchant: "99", category: "transport" },
  { pattern: /\bgasolina\b|\bcombustivel\b/, merchant: "Gasolina", category: "transport" },
  { pattern: /\blatam\b/, merchant: "Latam", category: "travel" },
  { pattern: /\bazul\b/, merchant: "Azul", category: "travel" },
  { pattern: /\bpassagem\b/, merchant: "Passagem", category: "travel" },
  { pattern: /\bnetflix\b/, merchant: "Netflix", category: "subscriptions" },
  { pattern: /\bspotify\b/, merchant: "Spotify", category: "subscriptions" },
  { pattern: /\bfarmacia\b|\bdrogaria\b/, merchant: "Farmácia", category: "health" },
  { pattern: /\baluguel\b/, merchant: "Aluguel", category: "housing" },
  { pattern: /\bacademia\b/, merchant: "Academia", category: "health" },
  { pattern: /\binternet\b/, merchant: "Internet", category: "subscriptions" },
  { pattern: /\bcondominio\b/, merchant: "Condomínio", category: "housing" },
  { pattern: /\bipva\b/, merchant: "IPVA", category: "taxes" },
  { pattern: /\bplano de saude\b|\bconvenio\b/, merchant: "Plano de saúde", category: "health" }
];

export const expenseCategoryLabel = (category?: string) =>
  ({
    housing: "Moradia",
    food: "Alimentacao",
    transport: "Transporte",
    health: "Saude",
    travel: "Viagens",
    shopping: "Compras e Lazer",
    subscriptions: "Assinaturas",
    education: "Educacao",
    company: "Empresa",
    thirdParty: "Terceiros",
    taxes: "Impostos",
    investments: "Investimentos",
    debt: "Parcelas e credito",
    other: "Outros"
  })[category ?? ""] ?? "gastos";

const FREQUENCY_LABELS: Record<RecurringTransaction["frequency"], string> = {
  monthly: "todo mes",
  weekly: "toda semana",
  biweekly: "quinzenal",
  quarterly: "trimestral",
  annual: "todo ano"
};

export const recurringFrequencyLabel = (frequency?: RecurringTransaction["frequency"]) =>
  (frequency && FREQUENCY_LABELS[frequency]) || "recorrente";

export const parseExpenseFrequency = (text: string): RecurringTransaction["frequency"] | undefined => {
  const normalized = fold(text);
  if (/\b(quinzenal|quinzena|a cada 15 dias|de 15 em 15)\b/.test(normalized)) return "biweekly";
  if (/\b(trimestral|a cada 3 meses|todo trimestre)\b/.test(normalized)) return "quarterly";
  if (/\b(anual|todo ano|todos os anos|por ano|uma vez ao ano)\b/.test(normalized)) return "annual";
  if (
    /\b(toda semana|todas as semanas|semanal|por semana)\b/.test(normalized) ||
    /\b(toda|todo|todas|todos)\s+(segunda|terca|quarta|quinta|sexta|sabado|domingo)s?\b/.test(normalized)
  ) {
    return "weekly";
  }
  if (
    /\b(todo mes|todos os meses|mensal|por mes|de mes em mes|cada mes|assinatura|recorrente|mensalidade|todo dia\s+\d{1,2})\b/.test(
      normalized
    )
  ) {
    return "monthly";
  }
  return undefined;
};

const WEEKDAY_ALIASES: Array<{ names: string[]; day: number }> = [
  { names: ["domingo", "dom"], day: 0 },
  { names: ["segunda", "seg"], day: 1 },
  { names: ["terca", "ter"], day: 2 },
  { names: ["quarta", "qua"], day: 3 },
  { names: ["quinta", "qui"], day: 4 },
  { names: ["sexta", "sex"], day: 5 },
  { names: ["sabado", "sab"], day: 6 }
];

const dateKey = (date: Date, timeZone: string) => {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
};

const hasExpenseDateCue = (normalized: string) =>
  /\b(ontem|anteontem|hoje|semana passada|antes de ontem)\b/.test(normalized) ||
  /\b\d{1,2}\s*\/\s*\d{1,2}\b/.test(normalized) ||
  /\b(?:todo\s+)?dia\s+\d{1,2}\b/.test(normalized) ||
  (!parseExpenseFrequency(normalized) &&
    WEEKDAY_ALIASES.some((item) => item.names.some((name) => new RegExp(`\\b${name}\\b`).test(normalized))));

export const parseExpenseDate = (
  text: string,
  now = new Date(),
  timeZone = "America/Sao_Paulo"
): string | undefined => {
  const normalized = fold(text);
  const wall = zonedParts(now, timeZone);
  const today = zonedDate(timeZone, wall.year, wall.month, wall.day, 12);
  const frequency = parseExpenseFrequency(normalized);

  const explicit = normalized.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/);
  if (explicit) {
    const year = explicit[3] ? (explicit[3].length === 2 ? 2000 + Number(explicit[3]) : Number(explicit[3])) : wall.year;
    return `${year}-${pad(Number(explicit[2]))}-${pad(Number(explicit[1]))}`;
  }
  if (/\banteontem\b|\bantes de ontem\b/.test(normalized)) return dateKey(addDays(today, -2), timeZone);
  if (/\bontem\b/.test(normalized)) return dateKey(addDays(today, -1), timeZone);
  if (/\bhoje\b/.test(normalized)) return dateKey(today, timeZone);
  if (/\bsemana passada\b/.test(normalized)) return dateKey(addDays(today, -7), timeZone);

  const dueDay = normalized.match(/\b(?:todo\s+)?dia\s+(\d{1,2})\b/);
  if (dueDay) {
    const lastDay = new Date(wall.year, wall.month, 0).getDate();
    const day = Math.min(lastDay, Math.max(1, Number(dueDay[1])));
    return `${wall.year}-${pad(wall.month)}-${pad(day)}`;
  }

  if (!frequency) {
    const weekday = WEEKDAY_ALIASES.find((item) => item.names.some((name) => new RegExp(`\\b${name}\\b`).test(normalized)));
    if (weekday) {
      const current = weekdayIndex(now, timeZone);
      const daysBack = (current - weekday.day + 7) % 7;
      return dateKey(addDays(today, -daysBack), timeZone);
    }
  }

  return undefined;
};

const parseAmount = (normalized: string) => {
  const cleaned = KNOWN_MERCHANTS.reduce(
    (value, item) => value.replace(item.pattern, " "),
    normalized
      .replace(/\b\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\b/g, " ")
      .replace(/\b(?:todo\s+)?dia\s+\d{1,2}\b/g, " ")
  );
  const match =
    cleaned.match(/r\$\s*(\d{1,6}(?:[.,]\d{2})?)/) ||
    cleaned.match(/\b(\d{1,6}[.,]\d{2})\b/) ||
    cleaned.match(
      /\b(?:comprei|gastei|paguei|pago|gasto|pedi|assino|mensalidade|assinatura)\b[^0-9]{0,40}(\d{1,6}(?:[.,]\d{2})?)/
    ) ||
    cleaned.match(/\b(\d{1,6})\s*(?:reais)?\b/);
  if (!match?.[1]) return undefined;
  const amount = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
};

const parseExpense = (
  text: string,
  now = new Date(),
  timeZone = "America/Sao_Paulo"
): Extract<SecretaryIntent, { type: "add_expense" }> | null => {
  const normalized = fold(text);
  const amount = parseAmount(normalized);
  if (!amount) return null;

  const known = KNOWN_MERCHANTS.find((item) => item.pattern.test(normalized));
  const hasVerb = /\b(comprei|gastei|paguei|pago|gasto|pedi|lancar|registrar|assino|mensalidade|assinatura|recorrente)\b/.test(
    normalized
  );
  const frequency = parseExpenseFrequency(normalized);
  if (!known && !hasVerb && !frequency) return null;
  if (/\b(as|a)\s*\d{1,2}:\d{2}\b/.test(normalized) && !hasVerb && !known) return null;

  const leftover = normalized
    .replace(/r\$\s*\d{1,6}(?:[.,]\d{2})?/, " ")
    .replace(/\b\d{1,6}[.,]\d{2}\b/, " ")
    .replace(/\b\d{1,6}\b/, " ")
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\b/g, " ")
    .replace(/\b(?:todo\s+)?dia\s+\d{1,2}\b/g, " ")
    .replace(/\b(ontem|anteontem|hoje|semana passada|antes de ontem)\b/g, " ")
    .replace(/\b(segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab|domingo|dom)s?\b/g, " ")
    .replace(
      /\b(todo|toda|todos|todas|mes|meses|semana|semanas|mensal|semanal|quinzenal|trimestral|anual|ano|recorrente|assinatura|mensalidade|por|cada)\b/g,
      " "
    )
    .replace(/\b(comprei|gastei|paguei|pago|gasto|pedi|lancar|registrar|assino|no|na|do|da|de|um|uma|reais)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const merchant = known?.merchant || leftover.replace(/^\w/, (letter) => letter.toUpperCase()) || "Gasto";
  return {
    type: "add_expense",
    merchant,
    amount,
    date: parseExpenseDate(text, now, timeZone) ?? dateKey(now, timeZone),
    category: known?.category,
    frequency
  };
};

const isClearAlertReply = (text: string) =>
  /^(sim|nao|ainda nao|amanha|paguei|pago|fui|feito|recebi|caiu|tomei|compareci|pendencias|pendente|me lembra( amanha)?|semana que vem)$/.test(
    fold(text)
  );

export const interpretSecretaryMessage = (
  text: string,
  now = new Date(),
  timeZone = "America/Sao_Paulo"
): SecretaryIntent[] => {
  if (isClearAlertReply(text)) return [{ type: "alert_reply" }];

  const agenda = parseAgendaCommand(text, now, timeZone);
  if (agenda) return intentsFromAgenda(agenda);

  const expense = parseExpense(text, now, timeZone);
  if (expense) return [expense];

  const normalized = fold(text);
  if (/\b(quero aviso|pode avisar|me avisa|quero lembrete)\b/.test(normalized) && !/\b(amanha|depois)\b/.test(normalized)) {
    return [{ type: "enable_reminders" }];
  }

  if (/\b(reuniao|entrevista|call|daily|fisio|consulta|agenda)\b/.test(normalized)) {
    return [
      {
        type: "ask",
        message: "Entendi que e um compromisso, mas falta horario. Ex: entrevista hoje as 16:30."
      }
    ];
  }

  return sanitizeSecretaryIntents(
    text,
    [
      {
        type: "ask",
        message:
          "Nao entendi. Manda tipo: *entrevista hoje as 16:30* ou *comprei ifood 77,90*. Para contas, responde *sim*, *nao* ou *amanha*."
      }
    ],
    now,
    timeZone
  );
};

const intentsFromAgenda = (agenda: ReturnType<typeof parseAgendaCommand>): SecretaryIntent[] => {
  if (!agenda) return [];
  if (agenda.dates.length > 1) {
    return [
      {
        type: "book_series",
        title: agenda.title,
        time: agenda.time,
        dates: agenda.dates,
        weekdays: agenda.weekdays,
        calendarDays: agenda.calendarDays,
        occurrenceCount: agenda.occurrenceCount,
        destination: agenda.destination,
        contextId: agenda.contextId,
        kind: agenda.kind
      }
    ];
  }
  const date = agenda.dates[0];
  if (agenda.destination === "health") {
    return [{ type: "book_health", title: agenda.title, time: agenda.time, date, kind: agenda.kind }];
  }
  return [{ type: "book_event", title: agenda.title, time: agenda.time, date, contextId: agenda.contextId }];
};

const messageHasClock = (text: string) =>
  /\b\d{1,2}:\d{2}\b/.test(text) || /\bas\s+\d{1,2}\s*h?(?!\d)/i.test(text);

export const sanitizeSecretaryIntents = (
  text: string,
  intents: SecretaryIntent[],
  now = new Date(),
  timeZone = "America/Sao_Paulo"
): SecretaryIntent[] => {
  const localAgenda = parseAgendaCommand(text, now, timeZone);
  const localExpense = parseExpense(text, now, timeZone);
  let source = localAgenda
    ? intentsFromAgenda(localAgenda)
    : localExpense
      ? [localExpense]
      : intents.some((intent) => intent.type === "alert_reply") && !isClearAlertReply(text)
        ? intents.filter((intent) => intent.type !== "alert_reply")
        : intents;
  if (!source.length) {
    source = [
      {
        type: "ask",
        message:
          "Nao entendi. Manda tipo: *entrevista hoje as 16:30* ou *comprei ifood 77,90*. Para contas, responde *sim*, *nao* ou *amanha*."
      }
    ];
  }

  const next: SecretaryIntent[] = [];
  for (const intent of source) {
    if ((intent.type === "book_event" || intent.type === "book_health" || intent.type === "book_series") && !messageHasClock(text)) {
      next.push({
        type: "ask",
        message: "Entendi o compromisso, mas falta o horario. Ex: reuniao com a Carolina as 17:00."
      });
      continue;
    }
    if (intent.type === "add_expense") {
      const known = KNOWN_MERCHANTS.find((item) => item.pattern.test(fold(text)));
      const parsedDate = parseExpenseDate(text, now, timeZone);
      next.push({
        ...intent,
        merchant: known?.merchant ?? intent.merchant,
        category: known?.category ?? intent.category,
        date: parsedDate ?? (hasExpenseDateCue(fold(text)) ? intent.date : dateKey(now, timeZone)),
        frequency: parseExpenseFrequency(text)
      });
      continue;
    }
    next.push(intent);
  }
  return next;
};

export const addManualExpense = (
  plan: FinancePlan,
  intent: Extract<SecretaryIntent, { type: "add_expense" }>,
  now = new Date(),
  timeZone = "America/Sao_Paulo",
  personId?: string
) => {
  const known = KNOWN_MERCHANTS.find((item) => item.pattern.test(fold(intent.merchant)));
  const date = intent.date || dateKey(now, timeZone);
  const classified = classifyTransaction(
    {
      merchant: intent.merchant,
      amount: intent.amount,
      date
    },
    plan.classificationRules ?? [],
    plan.transactions ?? []
  );
  const transaction = {
    id: `tx-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T15:00:00.000Z` : now.toISOString(),
    merchant: intent.merchant,
    amount: intent.amount,
    type: "expense" as const,
    audience: classified.audience,
    spentByPersonId: personId,
    nature: classified.nature,
    category: known?.category || intent.category || classified.category,
    confidence: 1,
    source: "manual" as const,
    reviewed: true
  };

  return {
    plan: {
      ...plan,
      transactions: [...(plan.transactions ?? []), transaction]
    },
    transaction
  };
};

export const addRecurringExpense = (
  plan: FinancePlan,
  intent: Extract<SecretaryIntent, { type: "add_expense" }>,
  now = new Date(),
  timeZone = "America/Sao_Paulo"
) => {
  const known = KNOWN_MERCHANTS.find((item) => item.pattern.test(fold(intent.merchant)));
  const date = intent.date || dateKey(now, timeZone);
  const category = known?.category || intent.category || "other";
  const classified = classifyTransaction(
    { merchant: intent.merchant, amount: intent.amount, date },
    plan.classificationRules ?? [],
    plan.transactions ?? []
  );
  const recurring: RecurringTransaction = {
    id: `rec-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: intent.merchant,
    amount: intent.amount,
    type: "expense",
    audience: classified.audience,
    nature: category === "housing" || category === "subscriptions" || category === "taxes" ? "recurring" : classified.nature,
    category,
    frequency: intent.frequency ?? "monthly",
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T15:00:00.000Z` : now.toISOString(),
    reviewed: true
  };

  return {
    plan: {
      ...plan,
      recurringTransactions: [...(plan.recurringTransactions ?? []), recurring]
    },
    recurring
  };
};
