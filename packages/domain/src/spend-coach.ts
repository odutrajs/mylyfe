import {
  analyzePlan,
  calculateMonthlyCashFlow,
  dateFromMonthKey,
  formatMonthKey,
  listCategoryExpensesInMonth,
  listMonthIncomes
} from "./calculations.js";
import type { ExpenseCategory, FinancePlan } from "./types.js";

export const SPEND_COACH_MAX_QUESTIONS = 2;
export const SPEND_COACH_MAX_LINES = 60;

export type SpendCoachMessageRole = "user" | "assistant";
export type SpendCoachTurnStatus = "question" | "advice";

export type SpendCoachMessage = {
  role: SpendCoachMessageRole;
  content: string;
  status?: SpendCoachTurnStatus;
};

export type SpendCoachLine = {
  id: string;
  name: string;
  amount: number;
  category: string;
  kind: "transaction" | "recurring" | "forecast" | "income";
  date?: string;
};

export type SpendCoachAbout = {
  id?: string;
  name: string;
  amount?: number;
  category?: string;
};

export type SpendCoachHotspot = {
  title: string;
  amount: number;
  why: string;
};

export type SpendCoachCut = {
  title: string;
  monthlySave: number;
  how: string;
};

export type SpendCoachTurn = {
  status: SpendCoachTurnStatus;
  question?: string;
  about?: SpendCoachAbout;
  summary?: string;
  hotspots: SpendCoachHotspot[];
  cuts: SpendCoachCut[];
  nextStep?: string;
};

export type SpendCoachBrief = {
  month: string;
  person: { name: string; age?: number };
  income: number;
  spent: number;
  leftover: number;
  savingsRate: number | null;
  emergencyFundMonths: number | null;
  emergencyTargetMonths: number;
  committedPercent: number | null;
  freeIncome: number;
  incomes: Array<{ name: string; amount: number; type?: string; recurring: boolean }>;
  categories: Array<{ name: string; spent: number; limit: number; status: string }>;
  expenses: SpendCoachLine[];
  unclear: SpendCoachLine[];
  debts: Array<{ name: string; monthlyPayment: number; balance: number }>;
  assets: Array<{ name: string; value: number; category: string }>;
  goals: Array<{ name: string; target: number; current: number }>;
  recentMonths: Array<{ month: string; income: number; outflow: number; net: number }>;
  score: { value: number; band: string; cautions: string[] };
};

const money = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const asOfForMonth = (month: string, now = new Date()) =>
  month === formatMonthKey(now) ? now : dateFromMonthKey(month);

const personOf = (plan: FinancePlan) => {
  const person = plan.profile.people.find((item) => item.role === "primary") ?? plan.profile.people[0];
  const age =
    typeof person?.age === "number" && person.age > 0
      ? person.age
      : person?.birthDate
        ? Math.max(0, new Date().getFullYear() - Number(person.birthDate.slice(0, 4)))
        : undefined;
  return { name: person?.name?.trim() || "você", age };
};

const looksUnclear = (item: SpendCoachLine, income: number) => {
  if (item.kind === "income") return false;
  const name = item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const bundled = /ifood|rappi|uber|99\b|amazon|mercado livre|shopee|magazine|americanas|nubank|picpay|paypal|elo|visa|master/.test(
    name
  );
  const vague = /pix|transferencia|pagamento|compra| diversos|outros|loja/.test(name);
  const large = item.amount >= 200 || (income > 0 && item.amount / income >= 0.05);
  const flexible = /food|shopping|transport|subscriptions|travel|other/.test(item.category);
  return large && (bundled || vague || (flexible && item.kind === "transaction"));
};

export const buildSpendCoachBrief = (plan: FinancePlan, month: string, now = new Date()): SpendCoachBrief => {
  const asOf = asOfForMonth(month, now);
  const analysis = analyzePlan(plan, asOf);
  const flow = calculateMonthlyCashFlow(plan, month);
  const categoryIds = new Set<ExpenseCategory>([
    ...plan.expenseCategories.map((item) => item.id),
    ...plan.transactions.map((item) => item.category),
    ...(plan.recurringTransactions ?? []).map((item) => item.category)
  ]);

  const expenses: SpendCoachLine[] = [];
  const seen = new Set<string>();
  for (const category of categoryIds) {
    for (const item of listCategoryExpensesInMonth(plan, month, category)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      expenses.push({
        id: item.id,
        name: item.name,
        amount: money(item.amount),
        category,
        kind: item.kind,
        date: item.date
      });
    }
  }
  expenses.sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name, "pt-BR"));

  const incomes = listMonthIncomes(plan, month).map((item) => ({
    name: item.name,
    amount: money(item.amount),
    type: item.type,
    recurring: item.kind === "recurring"
  }));

  const spent = money(expenses.reduce((sum, item) => sum + item.amount, 0));
  const limited = expenses.slice(0, SPEND_COACH_MAX_LINES);

  return {
    month,
    person: personOf(plan),
    income: money(flow.income),
    spent,
    leftover: money(flow.net),
    savingsRate: analysis.savingsRate,
    emergencyFundMonths: analysis.emergencyFundMonths,
    emergencyTargetMonths: plan.expenseProfile.emergencyFundTargetMonths,
    committedPercent: analysis.commitment.committedPercent,
    freeIncome: money(analysis.commitment.freeIncome),
    incomes,
    categories: analysis.categoryBudgets
      .filter((item) => item.spent > 0 || item.limit > 0)
      .map((item) => ({
        name: item.name,
        spent: money(item.spent),
        limit: money(item.limit),
        status: item.status
      }))
      .sort((left, right) => right.spent - left.spent),
    expenses: limited,
    unclear: limited.filter((item) => looksUnclear(item, flow.income)).slice(0, 8),
    debts: plan.debts
      .filter((item) => item.balance > 0 || item.monthlyPayment > 0)
      .map((item) => ({
        name: item.name,
        monthlyPayment: money(item.monthlyPayment),
        balance: money(item.balance)
      })),
    assets: plan.assets
      .filter((item) => item.value > 0)
      .map((item) => ({
        name: item.name,
        value: money(item.value),
        category: item.category
      })),
    goals: plan.goals.map((item) => ({
      name: item.name,
      target: money(item.targetValue),
      current: money(item.currentValue)
    })),
    recentMonths: [-2, -1, 0].map((offset) => {
      const [year, monthNumber] = month.split("-").map(Number);
      const key = formatMonthKey(new Date((year ?? 1970), (monthNumber ?? 1) - 1 + offset, 15));
      const item = calculateMonthlyCashFlow(plan, key);
      return { month: item.month, income: money(item.income), outflow: money(item.outflow), net: money(item.net) };
    }),
    score: {
      value: analysis.score.value,
      band: analysis.score.band,
      cautions: analysis.score.cautions.slice(0, 4)
    }
  };
};

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const asNumber = (value: unknown) => (Number.isFinite(Number(value)) ? money(Number(value)) : 0);

const hotspotOf = (value: unknown): SpendCoachHotspot | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as { title?: unknown; amount?: unknown; why?: unknown };
  const title = asString(item.title);
  if (!title) return null;
  return { title, amount: asNumber(item.amount), why: asString(item.why) };
};

const cutOf = (value: unknown): SpendCoachCut | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as { title?: unknown; monthlySave?: unknown; how?: unknown };
  const title = asString(item.title);
  if (!title) return null;
  return { title, monthlySave: asNumber(item.monthlySave), how: asString(item.how) };
};

const aboutOf = (value: unknown): SpendCoachAbout | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const item = value as { id?: unknown; name?: unknown; amount?: unknown; category?: unknown };
  const name = asString(item.name);
  if (!name) return undefined;
  return {
    id: asString(item.id) || undefined,
    name,
    amount: item.amount === undefined ? undefined : asNumber(item.amount),
    category: asString(item.category) || undefined
  };
};

export const countSpendCoachQuestions = (messages: SpendCoachMessage[]) =>
  messages.filter((item) => item.role === "assistant" && item.status === "question").length;

export const normalizeSpendCoachTurn = (value: unknown, forceAdvice = false): SpendCoachTurn | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    status?: unknown;
    question?: unknown;
    about?: unknown;
    summary?: unknown;
    hotspots?: unknown;
    cuts?: unknown;
    nextStep?: unknown;
  };
  const question = asString(raw.question);
  const summary = asString(raw.summary);
  const hotspots = Array.isArray(raw.hotspots) ? raw.hotspots.map(hotspotOf).filter((item): item is SpendCoachHotspot => Boolean(item)) : [];
  const cuts = Array.isArray(raw.cuts) ? raw.cuts.map(cutOf).filter((item): item is SpendCoachCut => Boolean(item)) : [];
  const wantsQuestion = !forceAdvice && raw.status === "question" && question.length > 0;
  if (wantsQuestion) {
    return { status: "question", question, about: aboutOf(raw.about), hotspots, cuts };
  }
  if (summary || hotspots.length || cuts.length) {
    return {
      status: "advice",
      summary: summary || "Encontrei alguns pontos para aliviar o mês.",
      hotspots,
      cuts,
      nextStep: asString(raw.nextStep) || undefined
    };
  }
  return null;
};

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const skippedAnswer = (text: string) =>
  /pular|pode seguir|nao sei|não sei|sem essa|segue sem/i.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

const questionFor = (item: SpendCoachLine) => {
  const value = brl(item.amount);
  if (item.category === "food") return `${item.name} de ${value} é delivery do dia a dia, mercado ou algo pontual?`;
  if (item.category === "transport") return `${item.name} de ${value} é deslocamento diário ou um extra neste mês?`;
  if (item.category === "subscriptions") return `Você ainda usa bastante ${item.name} (${value}) ou dá para cancelar ou trocar de plano?`;
  if (item.category === "shopping") return `${item.name} de ${value} foi necessidade ou uma compra que dá para adiar?`;
  return `${item.name} de ${value} é um gasto fixo, um extra ou tem como reduzir?`;
};

export const buildLocalSpendCoachAdvice = (brief: SpendCoachBrief): SpendCoachTurn => {
  const top = brief.categories.filter((item) => item.spent > 0).slice(0, 3);
  const flexible = brief.expenses.filter((item) => /food|shopping|subscriptions|travel|transport/.test(item.category));
  const hotspots = top.map((item) => ({
    title: item.name,
    amount: item.spent,
    why:
      brief.income > 0
        ? `${Math.round((item.spent / brief.income) * 100)}% da renda deste mês.`
        : "É um dos maiores grupos de gasto agora."
  }));
  const cuts = flexible.slice(0, 3).map((item) => ({
    title: item.name,
    monthlySave: money(item.amount * (item.kind === "recurring" ? 1 : 0.3)),
    how:
      item.kind === "recurring"
        ? "Vale revisar se essa recorrência ainda é necessária ou se existe um plano mais barato."
        : "Dá para reduzir a frequência neste mês e observar o impacto na folga."
  }));
  const leftoverLabel =
    brief.leftover >= 0 ? `Ainda sobram ${brl(brief.leftover)} no mês.` : `O mês já passou ${brl(Math.abs(brief.leftover))} do que entra.`;
  const saveLabel =
    brief.savingsRate === null ? "Ainda não dá para cravar quanto você poupa." : `Você está poupando cerca de ${Math.round(brief.savingsRate * 100)}% da renda.`;

  return {
    status: "advice",
    summary: `${brief.person.name}, neste mês entram ${brl(brief.income)} e saem ${brl(brief.spent)}. ${leftoverLabel} ${saveLabel}`,
    hotspots,
    cuts,
    nextStep:
      cuts[0]
        ? `Comece por ${cuts[0].title.toLowerCase()} nesta semana e acompanhe a folga no próximo extrato.`
        : "Lance ganhos e gastos com nome claro para eu apontar cortes mais precisos."
  };
};

export const resolveLocalSpendCoachTurn = (brief: SpendCoachBrief, messages: SpendCoachMessage[] = []): SpendCoachTurn => {
  const asked = countSpendCoachQuestions(messages);
  const lastUser = [...messages].reverse().find((item) => item.role === "user");
  const askedIds = new Set(
    messages
      .filter((item) => item.role === "assistant" && item.status === "question")
      .map((item) => item.content)
  );
  const nextUnclear = brief.unclear.find((item) => !askedIds.has(questionFor(item)));
  if (asked < SPEND_COACH_MAX_QUESTIONS && nextUnclear && !(lastUser && skippedAnswer(lastUser.content))) {
    return {
      status: "question",
      question: questionFor(nextUnclear),
      about: {
        id: nextUnclear.id,
        name: nextUnclear.name,
        amount: nextUnclear.amount,
        category: nextUnclear.category
      },
      hotspots: [],
      cuts: []
    };
  }

  const advice = buildLocalSpendCoachAdvice(brief);
  const notes = messages.filter((item) => item.role === "user" && !skippedAnswer(item.content)).map((item) => item.content.trim());
  if (notes.length && advice.summary) {
    advice.summary = `${advice.summary} Levei em conta o que você me contou sobre as contas.`;
  }
  return advice;
};
