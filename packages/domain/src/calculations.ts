import { unifyShoppingCategories } from "./defaults.js";
import type {
  Asset,
  BudgetSuggestion,
  CashFlowSnapshot,
  CategoryBudgetPlan,
  CategoryBudgetProgress,
  CategoryBudgetSource,
  CategoryBudgetStatus,
  CategoryExpenseItem,
  CommitmentStatus,
  Debt,
  ExpenseCategory,
  FinancePlan,
  FinancialAnalysis,
  FinancialHealthScore,
  FinancialTransaction,
  Goal,
  GoalProjection,
  IncomeCommitment,
  IncomeMetrics,
  IncomeSource,
  IndependenceScenario,
  InvestmentCapacity,
  MonthCommitment,
  MonthlyCashFlow,
  PatrimonyMetrics,
  PurchaseSimulation,
  RecurringTransaction,
  RiskProfileName,
  ScenarioName,
  ScenarioProjection,
  ScoreBand,
  ScoreComponent,
  SpendingMetrics,
  StressTestInput,
  StressTestResult
} from "./types.js";

export const DEFAULT_EMERGENCY_MONTHS = 6;
export const COMMITMENT_HORIZON_MONTHS = 3;

const financialAssetCategories = new Set<Asset["category"]>([
  "cash",
  "checking",
  "emergencyReserve",
  "cdb",
  "treasury",
  "fixedIncome",
  "stocks",
  "etfs",
  "funds",
  "internationalInvestments",
  "crypto",
  "privatePension",
  "fgts"
]);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const finite = (value: number | undefined | null) => (Number.isFinite(value) ? Number(value) : 0);
const positive = (value: number | undefined | null) => Math.max(0, finite(value));
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundScore = (value: number) => Math.round(value * 10) / 10;
const roundRatio = (value: number) => Math.round(value * 10_000) / 10_000;

const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const frequencyToMonthlyFactor = (source: IncomeSource) => {
  if (!source.isRecurring || source.frequency === "single") return 0;

  const factors: Record<IncomeSource["frequency"], number> = {
    monthly: 1,
    weekly: 52 / 12,
    biweekly: 26 / 12,
    quarterly: 1 / 3,
    annual: 1 / 12,
    single: 0
  };

  return factors[source.frequency];
};

const isActiveOn = (source: IncomeSource, asOf: Date) => {
  const start = parseDate(source.startDate);
  const end = parseDate(source.endDate);

  if (start && start > asOf) return false;
  if (end && end < asOf) return false;
  return true;
};

export const calculateNominalReturn = (realReturn: number, inflationRate: number) =>
  roundRatio((1 + finite(realReturn)) * (1 + finite(inflationRate)) - 1);

export const calculateRealReturn = (nominalReturn: number, inflationRate: number) => {
  const inflationBase = 1 + finite(inflationRate);
  if (inflationBase === 0) return 0;
  return roundRatio((1 + finite(nominalReturn)) / inflationBase - 1);
};

export const monthlyizeIncome = (source: IncomeSource) => roundMoney(positive(source.netAmount) * frequencyToMonthlyFactor(source));

const isExtraordinaryIncomeTransaction = (transaction: FinancialTransaction, asOf: Date) => {
  const date = parseDate(transaction.date);
  return Boolean(
    date &&
      date.getFullYear() === asOf.getFullYear() &&
      transaction.type === "income" &&
      transaction.audience === "personal" &&
      transaction.nature === "extraordinary"
  );
};

export const calculateIncomeMetrics = (plan: FinancePlan, asOf = new Date()): IncomeMetrics => {
  const byOwner: Record<string, number> = {};
  let recurringMonthly = 0;
  let extraordinary = 0;

  for (const source of plan.incomeSources) {
    if (!isActiveOn(source, asOf)) continue;

    const owner = source.ownerId ?? "unassigned";
    const monthlyValue = monthlyizeIncome(source);

    if (monthlyValue > 0) {
      recurringMonthly += monthlyValue;
      byOwner[owner] = roundMoney((byOwner[owner] ?? 0) + monthlyValue);
      continue;
    }

    extraordinary += positive(source.netAmount);
  }

  extraordinary += plan.transactions
    .filter((transaction) => isExtraordinaryIncomeTransaction(transaction, asOf))
    .reduce((sum, transaction) => sum + Math.abs(finite(transaction.amount)), 0);

  return {
    recurringMonthly: roundMoney(recurringMonthly),
    extraordinary: roundMoney(extraordinary),
    annualEstimated: roundMoney(recurringMonthly * 12 + extraordinary),
    byOwner
  };
};

export const calculatePatrimonyMetrics = (assets: Asset[], debts: Debt[]): PatrimonyMetrics => {
  const totalAssets = assets.reduce((sum, asset) => sum + positive(asset.value), 0);
  const totalLiabilities = debts.reduce((sum, debt) => sum + positive(debt.balance), 0);
  const financialAssets = assets
    .filter((asset) => financialAssetCategories.has(asset.category))
    .reduce((sum, asset) => sum + positive(asset.value), 0);
  const investableAssets = assets
    .filter((asset) => asset.includeInIndependence && financialAssetCategories.has(asset.category))
    .reduce((sum, asset) => sum + positive(asset.value), 0);
  const illiquidAssets = assets
    .filter((asset) => asset.liquidity === "illiquid" || !financialAssetCategories.has(asset.category))
    .reduce((sum, asset) => sum + positive(asset.value), 0);
  const liquidAssets = assets
    .filter((asset) => asset.liquidity === "immediate" || asset.category === "emergencyReserve")
    .reduce((sum, asset) => sum + positive(asset.value), 0);

  return {
    totalAssets: roundMoney(totalAssets),
    totalLiabilities: roundMoney(totalLiabilities),
    netWorth: roundMoney(totalAssets - totalLiabilities),
    financialAssets: roundMoney(financialAssets),
    investableAssets: roundMoney(investableAssets),
    illiquidAssets: roundMoney(illiquidAssets),
    liquidAssets: roundMoney(liquidAssets)
  };
};

const isForecastTransaction = (transaction: FinancialTransaction) => transaction.forecast?.kind === "installment";

const isInstallmentLike = (transaction: FinancialTransaction) =>
  Boolean(transaction.installment) ||
  isForecastTransaction(transaction) ||
  transaction.type === "debt_payment" ||
  transaction.nature === "debtPayment" ||
  transaction.category === "debt";

const isPersonalOutflow = (transaction: FinancialTransaction) =>
  transaction.audience === "personal" &&
  (transaction.type === "expense" || transaction.type === "debt_payment") &&
  !["business", "thirdParty", "transfer", "investment"].includes(transaction.nature);

const isPersonalExpense = (transaction: FinancialTransaction) =>
  transaction.type === "expense" &&
  transaction.audience === "personal" &&
  !transaction.recurringTransactionId &&
  !isForecastTransaction(transaction) &&
  !["business", "thirdParty", "transfer", "investment"].includes(transaction.nature);

const isInvestmentTransaction = (transaction: FinancialTransaction) =>
  !transaction.recurringTransactionId &&
  (transaction.type === "investment" || transaction.nature === "investment" || transaction.category === "investments");

const isPersonalRecurringExpense = (transaction: RecurringTransaction) =>
  transaction.type === "expense" &&
  transaction.audience === "personal" &&
  !["business", "thirdParty", "transfer", "investment"].includes(transaction.nature);

const isRecurringInvestment = (transaction: RecurringTransaction) =>
  transaction.type === "investment" || transaction.nature === "investment" || transaction.category === "investments";

const recurringFrequencyToMonthlyFactor = (transaction: RecurringTransaction) => {
  const factors: Record<RecurringTransaction["frequency"], number> = {
    monthly: 1,
    weekly: 52 / 12,
    biweekly: 26 / 12,
    quarterly: 1 / 3,
    annual: 1 / 12
  };

  return factors[transaction.frequency];
};

const isRecurringActiveOn = (transaction: RecurringTransaction, asOf: Date) => {
  const start = parseDate(transaction.startDate);
  const end = parseDate(transaction.endDate);

  if (start && start > asOf) return false;
  if (end && end < asOf) return false;
  return true;
};

const monthsBetween = (from: Date, to: Date) => (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();

const recursInMonth = (transaction: RecurringTransaction, asOf: Date) => {
  const start = parseDate(transaction.startDate);
  if (!start || !isRecurringActiveOn(transaction, new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0, 23, 59, 59, 999))) return false;

  const diff = monthsBetween(start, asOf);
  if (diff < 0) return false;

  if (transaction.frequency === "monthly") return true;
  if (transaction.frequency === "quarterly") return diff % 3 === 0;
  if (transaction.frequency === "annual") return diff % 12 === 0;
  return true;
};

export const calculateRecurringMonthlyAmount = (
  recurringTransactions: RecurringTransaction[],
  asOf = new Date(),
  predicate: (transaction: RecurringTransaction) => boolean
) =>
  roundMoney(
    recurringTransactions
      .filter((transaction) => predicate(transaction) && isRecurringActiveOn(transaction, asOf))
      .reduce((sum, transaction) => sum + positive(transaction.amount) * recurringFrequencyToMonthlyFactor(transaction), 0)
  );

export const calculateRecurringCurrentMonthAmount = (
  recurringTransactions: RecurringTransaction[],
  asOf = new Date(),
  predicate: (transaction: RecurringTransaction) => boolean
) =>
  roundMoney(
    recurringTransactions
      .filter((transaction) => predicate(transaction) && recursInMonth(transaction, asOf))
      .reduce((sum, transaction) => {
        if (transaction.frequency === "weekly" || transaction.frequency === "biweekly") {
          return sum + positive(transaction.amount) * recurringFrequencyToMonthlyFactor(transaction);
        }
        return sum + positive(transaction.amount);
      }, 0)
  );

const transactionsInWindow = (transactions: FinancialTransaction[], asOf: Date, months: number) => {
  const start = addMonths(new Date(asOf.getFullYear(), asOf.getMonth(), 1), -(months - 1));
  const end = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0, 23, 59, 59, 999);

  return transactions.filter((transaction) => {
    const date = parseDate(transaction.date);
    return Boolean(date && date >= start && date <= end);
  });
};

const monthKeyInWindow = (key: string, asOf: Date, months?: number) => {
  if (!months) return key <= monthKey(asOf);
  const start = monthKey(addMonths(new Date(asOf.getFullYear(), asOf.getMonth(), 1), -(months - 1)));
  const end = monthKey(asOf);
  return key >= start && key <= end;
};

const spendingMonthKey = (transaction: FinancialTransaction) => {
  if (transaction.statement?.referenceMonth) return transaction.statement.referenceMonth;
  const date = parseDate(transaction.date);
  return date ? monthKey(date) : null;
};

export const calculateObservedMonthlySpending = (
  transactions: FinancialTransaction[],
  asOf = new Date(),
  months?: number
) => {
  const monthlyTotals = new Map<string, number>();
  const relevant = transactions.filter((transaction) => {
    const key = spendingMonthKey(transaction);
    return Boolean(key && monthKeyInWindow(key, asOf, months) && isPersonalExpense(transaction));
  });

  for (const transaction of relevant) {
    const key = spendingMonthKey(transaction);
    if (!key) continue;
    monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + Math.abs(finite(transaction.amount)));
  }

  if (monthlyTotals.size === 0) {
    return {
      average: null,
      median: null,
      monthsWithData: 0
    };
  }

  const values = [...monthlyTotals.values()].sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  const midpoint = Math.floor(values.length / 2);
  const median = values.length % 2 === 0 ? (values[midpoint - 1]! + values[midpoint]!) / 2 : values[midpoint]!;

  return {
    average: roundMoney(total / monthlyTotals.size),
    median: roundMoney(median),
    monthsWithData: monthlyTotals.size
  };
};

export const calculateCurrentMonthSpend = (
  transactions: FinancialTransaction[],
  asOf = new Date(),
  recurringTransactions: RecurringTransaction[] = []
) => {
  const key = monthKey(asOf);
  const importedSpend = transactions
      .filter((transaction) => {
        return spendingMonthKey(transaction) === key && isPersonalExpense(transaction);
      })
    .reduce((sum, transaction) => sum + Math.abs(finite(transaction.amount)), 0);

  return roundMoney(importedSpend + calculateRecurringCurrentMonthAmount(recurringTransactions, asOf, isPersonalRecurringExpense));
};

export const calculateActualMonthlyInvestments = (
  plan: FinancePlan,
  asOf = new Date(),
  months = 3
) => {
  const recurringInvestment = calculateRecurringMonthlyAmount(plan.recurringTransactions ?? [], asOf, isRecurringInvestment);
  const relevant = transactionsInWindow(plan.transactions, asOf, months).filter(isInvestmentTransaction);

  if (relevant.length === 0) {
    return roundMoney(positive(plan.expenseProfile.currentMonthlyInvestments) + recurringInvestment);
  }

  const monthlyTotals = new Map<string, number>();

  for (const transaction of relevant) {
    const date = parseDate(transaction.date);
    if (!date) continue;
    const key = monthKey(date);
    monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + Math.abs(finite(transaction.amount)));
  }

  if (monthlyTotals.size === 0) return positive(plan.expenseProfile.currentMonthlyInvestments);

  const total = [...monthlyTotals.values()].reduce((sum, value) => sum + value, 0);
  return roundMoney(total / monthlyTotals.size + recurringInvestment);
};

export const calculateSpendingMetrics = (plan: FinancePlan, asOf = new Date()): SpendingMetrics => {
  const observed = calculateObservedMonthlySpending(plan.transactions, asOf);
  const recurringMonthlyExpenses = calculateRecurringMonthlyAmount(plan.recurringTransactions ?? [], asOf, isPersonalRecurringExpense);
  const estimatedMonthly = positive(plan.expenseProfile.estimatedMonthlySpend);
  const observedAverage = observed.average;
  const observedMedian = observed.median;
  const source = observedMedian === null && recurringMonthlyExpenses === 0 ? "estimated" : "observed";
  const recurringAwareAverage = (observedAverage ?? 0) + recurringMonthlyExpenses;
  const recurringAwareMedian = (observedMedian ?? 0) + recurringMonthlyExpenses;

  return {
    estimatedMonthly,
    observedMonthlyAverage: observedAverage === null && recurringMonthlyExpenses === 0 ? null : roundMoney(recurringAwareAverage),
    observedMonthlyMedian: observedMedian === null && recurringMonthlyExpenses === 0 ? null : roundMoney(recurringAwareMedian),
    observedMonths: observed.monthsWithData,
    currentMonthSpend: calculateCurrentMonthSpend(plan.transactions, asOf, plan.recurringTransactions ?? []),
    livingCostUsed: source === "observed" ? positive(recurringAwareMedian) : estimatedMonthly,
    source
  };
};

export const calculateMonthlyDebtPayments = (debts: Debt[]) =>
  roundMoney(debts.reduce((sum, debt) => sum + positive(debt.monthlyPayment), 0));

export const dateFromMonthKey = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, 15, 12, 0, 0, 0);
};

const shiftMonthKey = (asOf: Date, offset: number) => monthKey(addMonths(new Date(asOf.getFullYear(), asOf.getMonth(), 1), offset));

const formatRatioPercent = (value: number) => `${roundScore(value * 100)}%`;

export const interpolateScore = (value: number, points: Array<[number, number]>) => {
  if (points.length === 0) return 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];

  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index]!;
    if (value <= x1) {
      const [x0, y0] = points[index - 1]!;
      const span = x1 - x0;
      return span === 0 ? y1 : y0 + ((value - x0) / span) * (y1 - y0);
    }
  }

  return last[1];
};

export const scoreBand = (value: number): ScoreBand => {
  if (value >= 9) return "excellent";
  if (value >= 7.5) return "healthy";
  if (value >= 6) return "balanced";
  if (value >= 4) return "attention";
  return "critical";
};

export const scoreBandLabel: Record<ScoreBand, string> = {
  excellent: "Excelente",
  healthy: "Saudavel",
  balanced: "Equilibrado",
  attention: "Atencao",
  critical: "Critico"
};

export const commitmentStatus = (ratio: number | null): CommitmentStatus => {
  if (ratio === null) return "healthy";
  if (ratio >= 0.7) return "critical";
  if (ratio >= 0.5) return "high";
  if (ratio >= 0.35) return "moderate";
  return "healthy";
};

export const calculateInstallmentsInMonth = (transactions: FinancialTransaction[], month: string) =>
  roundMoney(
    transactions
      .filter((transaction) => isPersonalOutflow(transaction) && isInstallmentLike(transaction) && spendingMonthKey(transaction) === month)
      .reduce((sum, transaction) => sum + Math.abs(finite(transaction.amount)), 0)
  );

export const calculateRemainingInstallments = (transactions: FinancialTransaction[], asOf = new Date()) => {
  const current = monthKey(asOf);
  const future = transactions.filter((transaction) => {
    const key = spendingMonthKey(transaction);
    return Boolean(key && key > current && isPersonalOutflow(transaction) && isInstallmentLike(transaction));
  });
  const months = future.map((transaction) => spendingMonthKey(transaction)).filter((value): value is string => Boolean(value));

  return {
    balance: roundMoney(future.reduce((sum, transaction) => sum + Math.abs(finite(transaction.amount)), 0)),
    count: future.length,
    lastMonth: months.length > 0 ? months.reduce((latest, value) => (value > latest ? value : latest)) : null
  };
};

const buildMonthCommitment = (plan: FinancePlan, asOf: Date, offset: number, recurringIncome: number): MonthCommitment => {
  const month = shiftMonthKey(asOf, offset);
  const recurring = calculateRecurringCurrentMonthAmount(plan.recurringTransactions ?? [], dateFromMonthKey(month), isPersonalRecurringExpense);
  const installments = calculateInstallmentsInMonth(plan.transactions, month);
  const debts = calculateMonthlyDebtPayments(plan.debts);
  const total = roundMoney(recurring + installments + debts);

  return {
    month,
    recurring,
    installments,
    debts,
    total,
    percentOfIncome: recurringIncome > 0 ? roundRatio(total / recurringIncome) : null
  };
};

export const calculateIncomeCommitment = (plan: FinancePlan, asOf = new Date()): IncomeCommitment => {
  const recurringIncome = calculateIncomeMetrics(plan, asOf).recurringMonthly;
  const thisMonth = buildMonthCommitment(plan, asOf, 0, recurringIncome);
  const nextMonth = buildMonthCommitment(plan, asOf, 1, recurringIncome);
  const horizon = Array.from({ length: COMMITMENT_HORIZON_MONTHS }, (_, index) =>
    buildMonthCommitment(plan, asOf, index, recurringIncome)
  );
  const remaining = calculateRemainingInstallments(plan.transactions, asOf);
  const committedPercent = nextMonth.percentOfIncome ?? thisMonth.percentOfIncome;
  const freeIncome = roundMoney(recurringIncome - nextMonth.total);
  const peak = [...horizon].sort((left, right) => right.total - left.total)[0];

  return {
    recurringIncome,
    thisMonth,
    nextMonth,
    horizon,
    remainingInstallmentBalance: remaining.balance,
    remainingInstallmentCount: remaining.count,
    lastInstallmentMonth: remaining.lastMonth,
    committedPercent,
    freeIncome,
    freePercent: recurringIncome > 0 ? roundRatio(freeIncome / recurringIncome) : null,
    status: commitmentStatus(committedPercent),
    peakMonth: peak && peak.total > 0 ? peak.month : null
  };
};

export const calculateCashFlowSnapshot = (plan: FinancePlan, asOf = new Date()): CashFlowSnapshot => {
  const income = calculateIncomeMetrics(plan, asOf).recurringMonthly;
  const month = monthKey(asOf);
  const recurring = calculateRecurringCurrentMonthAmount(plan.recurringTransactions ?? [], asOf, isPersonalRecurringExpense);
  const installments = calculateInstallmentsInMonth(plan.transactions, month);
  const variable = roundMoney(
    plan.transactions
      .filter(
        (transaction) =>
          spendingMonthKey(transaction) === month && isPersonalExpense(transaction) && !isInstallmentLike(transaction)
      )
      .reduce((sum, transaction) => sum + Math.abs(finite(transaction.amount)), 0)
  );
  const leftover = roundMoney(income - recurring - installments - variable - calculateMonthlyDebtPayments(plan.debts));

  return {
    income,
    recurring,
    installments,
    variable,
    investments: calculateActualMonthlyInvestments(plan, asOf),
    leftover,
    leftoverPercent: income > 0 ? roundRatio(leftover / income) : null
  };
};

export const formatMonthKey = (date: Date) => monthKey(date);

export const monthKeyFromOffset = (asOf: Date, offset: number) => shiftMonthKey(asOf, offset);

export const calculateMonthlyCashFlow = (plan: FinancePlan, month: string): MonthlyCashFlow => {
  const asOf = dateFromMonthKey(month);
  const recurringIncome = calculateIncomeMetrics(plan, asOf).recurringMonthly;
  const extraIncome = plan.transactions
    .filter((transaction) => spendingMonthKey(transaction) === month && transaction.type === "income" && transaction.nature === "extraordinary")
    .reduce((sum, transaction) => sum + Math.abs(finite(transaction.amount)), 0);
  const snapshot = calculateCashFlowSnapshot(plan, asOf);
  const income = roundMoney(recurringIncome + extraIncome);
  const outflow = roundMoney(snapshot.recurring + snapshot.installments + snapshot.variable + calculateMonthlyDebtPayments(plan.debts));
  return {
    month,
    income,
    outflow,
    net: roundMoney(income - outflow)
  };
};

export const calculateMonthlyCashFlowSeries = (plan: FinancePlan, asOf = new Date(), pastMonths = 5, futureMonths = 6) =>
  Array.from({ length: pastMonths + futureMonths + 1 }, (_, index) =>
    calculateMonthlyCashFlow(plan, shiftMonthKey(asOf, index - pastMonths))
  );

const ignoredBudgetCategories = new Set(["investments", "company", "thirdParty"]);

export const DASHBOARD_CATEGORY_LIMIT = 5;

export const DEFAULT_CATEGORY_SHARES: Record<string, number> = {
  housing: 0.35,
  food: 0.15,
  transport: 0.1,
  health: 0.06,
  shopping: 0.12,
  subscriptions: 0.03,
  education: 0.04,
  travel: 0.04,
  taxes: 0.04,
  debt: 0.05,
  other: 0.02
};

export const isBudgetableCategory = (category: string) => !ignoredBudgetCategories.has(category);

export const calculateCategoryBudgetPlan = (plan: FinancePlan, asOf = new Date()): CategoryBudgetPlan => {
  const income = calculateIncomeMetrics(plan, asOf).recurringMonthly;
  const configuredInvestment = positive(plan.budget.monthlyInvestmentTarget);
  const actualInvestment = calculateActualMonthlyInvestments(plan, asOf);
  const investment =
    configuredInvestment > 0 ? configuredInvestment : actualInvestment > 0 ? actualInvestment : roundMoney(income * 0.2);

  const reserved = income > 0 ? Math.min(investment, income) : 0;

  return {
    income,
    investment: roundMoney(reserved || investment),
    expenseEnvelope: roundMoney(Math.max(0, income - reserved))
  };
};

export const resolveCategoryShare = (plan: FinancePlan, category: ExpenseCategory, envelope = calculateCategoryBudgetPlan(plan).expenseEnvelope) => {
  const target = (plan.budget.categoryTargets ?? []).find((item) => item.category === category);
  if (target && Number.isFinite(target.share)) return clamp(positive(target.share), 0, 1);
  if (target && positive(target.monthlyTarget) > 0 && envelope > 0) return clamp(target.monthlyTarget / envelope, 0, 1);
  return DEFAULT_CATEGORY_SHARES[category] ?? 0;
};

const medianValue = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1]! + sorted[midpoint]!) / 2 : sorted[midpoint]!;
};

const categoryBudgetStatus = (usedPercent: number | null, remaining: number | null): CategoryBudgetStatus => {
  if (remaining !== null && remaining < 0) return "over";
  if (usedPercent === null) return "watch";
  if (usedPercent >= 0.85) return "tight";
  if (usedPercent >= 0.6) return "watch";
  return "comfortable";
};

export const listCategoryExpensesInMonth = (
  plan: FinancePlan,
  month: string,
  category: ExpenseCategory
): CategoryExpenseItem[] => {
  const unified = unifyShoppingCategories(plan);
  const asOf = dateFromMonthKey(month);

  const imported = unified.transactions
    .filter((transaction) => spendingMonthKey(transaction) === month && transaction.category === category && isPersonalExpense(transaction))
    .map((transaction) => ({
      id: transaction.id,
      name: transaction.merchant,
      amount: Math.abs(finite(transaction.amount)),
      date: transaction.date,
      kind: "transaction" as const,
      installment: transaction.installment
    }));

  const recurring = (unified.recurringTransactions ?? [])
    .filter((transaction) => isPersonalRecurringExpense(transaction) && transaction.category === category && recursInMonth(transaction, asOf))
    .map((transaction) => {
      const monthlyFactor =
        transaction.frequency === "weekly" || transaction.frequency === "biweekly"
          ? recurringFrequencyToMonthlyFactor(transaction)
          : 1;
      return {
        id: `rec-${transaction.id}`,
        name: transaction.name,
        amount: positive(transaction.amount) * monthlyFactor,
        date: transaction.startDate,
        kind: "recurring" as const
      };
    });

  const forecasts = unified.transactions
    .filter(
      (transaction) =>
        spendingMonthKey(transaction) === month &&
        transaction.category === category &&
        isForecastTransaction(transaction) &&
        isPersonalOutflow(transaction)
    )
    .map((transaction) => ({
      id: transaction.id,
      name: transaction.merchant,
      amount: Math.abs(finite(transaction.amount)),
      date: transaction.date,
      kind: "forecast" as const,
      installment: transaction.installment
    }));

  return [...imported, ...recurring, ...forecasts].sort((left, right) => (right.date ?? "").localeCompare(left.date ?? "") || right.amount - left.amount);
};

export const calculateCategorySpendInMonth = (plan: FinancePlan, month: string, category: ExpenseCategory) =>
  roundMoney(listCategoryExpensesInMonth(plan, month, category).reduce((sum, item) => sum + item.amount, 0));

export const calculateCategoryBudgetProgress = (plan: FinancePlan, asOf = new Date()): CategoryBudgetProgress[] => {
  const unified = unifyShoppingCategories(plan);
  const current = monthKey(asOf);
  const budgetPlan = calculateCategoryBudgetPlan(unified, asOf);
  const configs = new Map((unified.expenseCategories ?? []).map((category) => [category.id, category]));
  const targets = new Map((unified.budget.categoryTargets ?? []).map((target) => [target.category, target]));
  const categoryIds = new Set<string>([
    ...configs.keys(),
    ...targets.keys(),
    ...unified.transactions.map((transaction) => transaction.category),
    ...(unified.recurringTransactions ?? []).map((transaction) => transaction.category)
  ]);

  return [...categoryIds]
    .flatMap((category) => {
      if (!isBudgetableCategory(category)) return [];
      const config = configs.get(category);
      if (config && !config.isActive) return [];

      const spent = calculateCategorySpendInMonth(unified, current, category);
      const pastMonths = Array.from({ length: 6 }, (_, index) => shiftMonthKey(asOf, -(index + 1)))
        .map((month) => calculateCategorySpendInMonth(unified, month, category))
        .filter((value) => value > 0);
      const recurring = calculateRecurringMonthlyAmount(
        unified.recurringTransactions ?? [],
        asOf,
        (transaction) => isPersonalRecurringExpense(transaction) && transaction.category === category
      );
      const target = targets.get(category);
      const share = resolveCategoryShare(unified, category, budgetPlan.expenseEnvelope);
      const hasCustomShare = Boolean(target && (Number.isFinite(target.share) || positive(target.monthlyTarget) > 0));

      let limit = 0;
      let source: CategoryBudgetSource = "none";
      if (budgetPlan.expenseEnvelope > 0 && share > 0) {
        limit = roundMoney(budgetPlan.expenseEnvelope * share);
        source = hasCustomShare ? "budget" : "suggested";
      } else if (positive(target?.monthlyTarget) > 0) {
        limit = positive(target?.monthlyTarget);
        source = "budget";
      } else if (pastMonths.length > 0) {
        limit = roundMoney(medianValue(pastMonths));
        source = "history";
      } else if (recurring > 0) {
        limit = recurring;
        source = "recurring";
      }

      if (spent <= 0 && limit <= 0) return [];

      const remaining = limit > 0 ? roundMoney(limit - spent) : null;
      const usedPercent = limit > 0 ? roundRatio(spent / limit) : null;

      return [
        {
          category,
          name: config?.name ?? category,
          color: config?.color ?? "#6b7280",
          spent,
          limit,
          remaining,
          usedPercent,
          share,
          status: categoryBudgetStatus(usedPercent, remaining),
          source
        }
      ];
    })
    .sort((left, right) => (right.usedPercent ?? -1) - (left.usedPercent ?? -1) || right.spent - left.spent);
};

export const selectDashboardCategoryBudgets = (items: CategoryBudgetProgress[]) =>
  items
    .filter((item) => item.spent > 0 || item.status === "over" || item.status === "tight")
    .slice(0, DASHBOARD_CATEGORY_LIMIT);

export const calculateMonthlyInvestmentCapacity = (plan: FinancePlan, asOf = new Date()): InvestmentCapacity => {
  const income = calculateIncomeMetrics(plan, asOf);
  const spending = calculateSpendingMetrics(plan, asOf);
  const debtPayments = calculateMonthlyDebtPayments(plan.debts);
  const provisions = positive(plan.expenseProfile.monthlyProvisions);
  const potential = income.recurringMonthly - spending.livingCostUsed - debtPayments - provisions;
  const actualInvestment = calculateActualMonthlyInvestments(plan, asOf);

  return {
    recurringIncome: income.recurringMonthly,
    livingCost: spending.livingCostUsed,
    debtPayments,
    provisions,
    potential: roundMoney(potential),
    actualInvestment,
    conversionEfficiency: potential > 0 ? roundRatio(actualInvestment / potential) : null
  };
};

export const calculateSavingsRate = (plan: FinancePlan, asOf = new Date()) => {
  const income = calculateIncomeMetrics(plan, asOf).recurringMonthly;
  if (income <= 0) return null;
  return roundRatio(calculateActualMonthlyInvestments(plan, asOf) / income);
};

export const calculateEmergencyFundMonths = (plan: FinancePlan, asOf = new Date()) => {
  const reserve = calculatePatrimonyMetrics(plan.assets, plan.debts).liquidAssets;
  const monthlyNeed = calculateSpendingMetrics(plan, asOf).livingCostUsed + calculateMonthlyDebtPayments(plan.debts);

  if (monthlyNeed <= 0) return null;
  return roundRatio(reserve / monthlyNeed);
};

export const calculateBudgetSuggestion = (plan: FinancePlan, asOf = new Date()): BudgetSuggestion => {
  const capacity = calculateMonthlyInvestmentCapacity(plan, asOf);
  const recurringIncome = capacity.recurringIncome;
  const monthlyProvisionTarget = positive(plan.expenseProfile.monthlyProvisions);
  const monthlyExpenseTarget = positive(capacity.livingCost);
  const rawInvestmentTarget = recurringIncome - monthlyExpenseTarget - capacity.debtPayments - monthlyProvisionTarget;
  const monthlyInvestmentTarget = Math.max(0, rawInvestmentTarget);

  return {
    monthlyExpenseTarget: roundMoney(monthlyExpenseTarget),
    monthlyInvestmentTarget: roundMoney(monthlyInvestmentTarget),
    monthlyProvisionTarget: roundMoney(monthlyProvisionTarget),
    margin: roundMoney(recurringIncome - monthlyExpenseTarget - capacity.debtPayments - monthlyProvisionTarget - monthlyInvestmentTarget)
  };
};

const estimateAge = (birthDate?: string, explicitAge?: number, asOf = new Date()) => {
  if (explicitAge && explicitAge > 0) return explicitAge;
  const birth = parseDate(birthDate);
  if (!birth) return 0;

  let age = asOf.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(asOf.getFullYear(), birth.getMonth(), birth.getDate());
  if (birthdayThisYear > asOf) age -= 1;
  return Math.max(0, age);
};

export const calculateGoalCurrentValue = (goal: Goal, assets: Asset[]) => {
  const eligible =
    goal.eligibleAssetCategories.length > 0 ? new Set(goal.eligibleAssetCategories) : financialAssetCategories;
  const fromAssets = assets
    .filter((asset) => eligible.has(asset.category))
    .reduce((sum, asset) => sum + positive(asset.value), 0);

  return roundMoney(Math.max(positive(goal.currentValue), fromAssets));
};

export const withGoalAssetProgress = (goal: Goal, assets: Asset[]): Goal => ({
  ...goal,
  currentValue: calculateGoalCurrentValue(goal, assets)
});

export const calculateGoalProjection = (
  goal: Goal,
  monthlyContribution: number,
  nominalReturn: number,
  inflationRate: number,
  asOf = new Date()
): GoalProjection => {
  const targetTodayValue = positive(goal.targetValue);
  let targetNominalValue = targetTodayValue;
  let projectedValue = positive(goal.currentValue);

  if (targetTodayValue <= 0) {
    return {
      goalId: goal.id,
      monthsToGoal: 0,
      estimatedDate: asOf.toISOString(),
      targetNominalValue: 0,
      targetTodayValue: 0,
      projectedValueAtTarget: 0
    };
  }

  if (projectedValue >= targetTodayValue) {
    return {
      goalId: goal.id,
      monthsToGoal: 0,
      estimatedDate: asOf.toISOString(),
      targetNominalValue: roundMoney(targetTodayValue),
      targetTodayValue: roundMoney(targetTodayValue),
      projectedValueAtTarget: roundMoney(projectedValue)
    };
  }

  const monthlyReturn = finite(nominalReturn) / 12;
  const monthlyInflation = finite(inflationRate) / 12;
  const contribution = Math.max(0, finite(monthlyContribution));

  for (let month = 1; month <= 1200; month += 1) {
    projectedValue = projectedValue * (1 + monthlyReturn) + contribution;
    targetNominalValue = goal.inflationAdjusted ? targetNominalValue * (1 + monthlyInflation) : targetNominalValue;

    if (projectedValue >= targetNominalValue) {
      const estimated = addMonths(asOf, month);
      return {
        goalId: goal.id,
        monthsToGoal: month,
        estimatedDate: estimated.toISOString(),
        targetNominalValue: roundMoney(targetNominalValue),
        targetTodayValue: roundMoney(targetTodayValue),
        projectedValueAtTarget: roundMoney(projectedValue)
      };
    }
  }

  return {
    goalId: goal.id,
    monthsToGoal: null,
    estimatedDate: null,
    targetNominalValue: roundMoney(targetNominalValue),
    targetTodayValue: roundMoney(targetTodayValue),
    projectedValueAtTarget: roundMoney(projectedValue)
  };
};

export const calculateFinancialIndependenceNumber = (
  plan: FinancePlan,
  asOf = new Date()
): IndependenceScenario[] => {
  const desiredMonthlySpend = positive(plan.independence.desiredMonthlySpend);
  const withdrawalRate = finite(plan.independence.assumptions.sustainableWithdrawalRate);
  const taxRate = clamp(finite(plan.independence.assumptions.taxRate), 0, 0.99);
  const inflationRate = finite(plan.independence.assumptions.inflationRate);
  const primary = plan.profile.people.find((person) => person.role === "primary");
  const currentAge = estimateAge(primary?.birthDate, primary?.age, asOf);
  const yearsUntilTargetAge = Math.max(0, positive(plan.independence.targetAge) - currentAge);
  const spendYear = desiredMonthlySpend * 12;
  const netWithdrawalRate = withdrawalRate * (1 - taxRate);

  const scenarios: Array<[ScenarioName, number]> = [
    ["conservative", plan.independence.assumptions.conservativeRealReturn],
    ["base", plan.independence.assumptions.baseRealReturn],
    ["optimistic", plan.independence.assumptions.optimisticRealReturn]
  ];

  return scenarios.map(([scenario]) => {
    const requiredTodayValue = spendYear > 0 && netWithdrawalRate > 0 ? spendYear / netWithdrawalRate : 0;
    const requiredNominalValue = requiredTodayValue * (1 + inflationRate) ** yearsUntilTargetAge;

    return {
      scenario,
      requiredTodayValue: roundMoney(requiredTodayValue),
      requiredNominalValue: roundMoney(requiredNominalValue),
      yearsUntilTargetAge
    };
  });
};

export const projectWealth = (plan: FinancePlan, asOf = new Date()): ScenarioProjection[] => {
  const patrimony = calculatePatrimonyMetrics(plan.assets, plan.debts);
  const initial = patrimony.investableAssets;
  const contribution = Math.max(0, calculateMonthlyInvestmentCapacity(plan, asOf).potential);
  const inflationRate = finite(plan.independence.assumptions.inflationRate);
  const contributionGrowthMonthly = finite(plan.independence.assumptions.contributionGrowthRate) / 12;
  const horizons = [1, 3, 5, 10, 15, 20];

  const scenarioReturns: Array<[ScenarioName, number]> = [
    ["conservative", plan.independence.assumptions.conservativeRealReturn],
    ["base", plan.independence.assumptions.baseRealReturn],
    ["optimistic", plan.independence.assumptions.optimisticRealReturn]
  ];

  return scenarioReturns.map(([scenario, realReturn]) => {
    const nominalReturn = calculateNominalReturn(realReturn, inflationRate);
    const monthlyReturn = nominalReturn / 12;
    const points = horizons.map((year) => {
      let value = initial;
      let monthlyContribution = contribution;

      for (let month = 1; month <= year * 12; month += 1) {
        value = value * (1 + monthlyReturn) + monthlyContribution;
        monthlyContribution *= 1 + contributionGrowthMonthly;
      }

      return {
        year,
        nominalValue: roundMoney(value),
        todayPurchasingPower: roundMoney(value / (1 + inflationRate) ** year)
      };
    });

    return {
      scenario,
      realReturn: roundRatio(finite(realReturn)),
      nominalReturn,
      points
    };
  });
};

export const suggestRiskProfile = (plan: FinancePlan): RiskProfileName => {
  const answers = plan.risk.answers;
  const growthScore =
    positive(answers.investmentHorizon) +
    positive(answers.financialKnowledge) +
    positive(answers.volatilityTolerance) +
    positive(answers.reactionToDrawdown) +
    positive(answers.incomeStability);
  const pressureScore = positive(answers.liquidityNeed) + positive(answers.dependentsPressure) + positive(answers.nearTermGoalsPressure);
  const raw = growthScore - pressureScore;

  if (raw <= 0) return "conservative";
  if (raw <= 6) return "balanced";
  if (raw <= 12) return "growth";
  return "aggressive";
};

const component = (
  key: ScoreComponent["key"],
  label: string,
  score: number,
  weight: number,
  explanation: string
): ScoreComponent => ({
  key,
  label,
  score: roundScore(clamp(score, 0, 10)),
  weight,
  explanation
});

const emergencyTargetMonths = (plan: FinancePlan) =>
  positive(plan.expenseProfile.emergencyFundTargetMonths) || DEFAULT_EMERGENCY_MONTHS;

const scoreCashFlow = (income: number, livingCost: number, committed: number) => {
  if (income <= 0) {
    return { score: committed + livingCost > 0 ? 1 : 4, surplusRate: null as number | null };
  }

  const surplusRate = (income - Math.max(livingCost, committed)) / income;
  return {
    score: interpolateScore(surplusRate, [
      [-0.2, 0],
      [0, 3],
      [0.1, 6],
      [0.2, 8.5],
      [0.3, 10]
    ]),
    surplusRate
  };
};

const scoreCommitment = (ratio: number | null, hasIncome: boolean, hasCommitments: boolean) => {
  if (!hasIncome) return hasCommitments ? 0 : 5;
  if (ratio === null) return 5;
  return interpolateScore(ratio, [
    [0, 10],
    [0.3, 9],
    [0.4, 7.5],
    [0.5, 5],
    [0.7, 2],
    [1, 0]
  ]);
};

const scoreEmergency = (months: number | null, liquidAssets: number, monthlyNeed: number) => {
  if (monthlyNeed <= 0) return liquidAssets > 0 ? 8 : 3;
  if (months === null) return 0;
  return interpolateScore(months, [
    [0, 0],
    [1, 3],
    [3, 6.5],
    [6, 9.2],
    [12, 10]
  ]);
};

const scoreSavings = (income: number, realizedRate: number | null, potential: number) => {
  if (income <= 0) return { score: 0, blended: null as number | null };
  const realized = Math.max(0, realizedRate ?? 0);
  const potentialRate = Math.max(0, potential) / income;
  const blended = realized * 0.55 + potentialRate * 0.45;
  return {
    score: interpolateScore(blended, [
      [0, 1],
      [0.05, 4],
      [0.1, 6.5],
      [0.2, 8.8],
      [0.3, 10]
    ]),
    blended
  };
};

const scoreSpendingControl = (income: number, currentSpend: number, medianSpend: number | null) => {
  if (income <= 0) return currentSpend > 0 ? 2 : 5;

  const ratio = currentSpend / income;
  let score = interpolateScore(ratio, [
    [0.5, 10],
    [0.7, 8],
    [0.85, 6],
    [1, 3.5],
    [1.2, 0]
  ]);

  if (medianSpend && medianSpend > 0 && currentSpend > medianSpend * 1.5) {
    score -= interpolateScore(currentSpend / medianSpend, [
      [1.5, 0.8],
      [2, 2]
    ]);
  }

  return clamp(score, 0, 10);
};

const scoreIncomeStability = (plan: FinancePlan, asOf: Date) => {
  const active = plan.incomeSources.filter((source) => source.isRecurring && isActiveOn(source, asOf));
  if (active.length === 0) return { score: 0, average: 0, sources: 0 };

  const weighted = active.reduce(
    (acc, source) => {
      const weight = Math.max(monthlyizeIncome(source), 1);
      return {
        total: acc.total + clamp(positive(source.stabilityScore), 0, 10) * weight,
        weight: acc.weight + weight
      };
    },
    { total: 0, weight: 0 }
  );
  const average = weighted.weight > 0 ? weighted.total / weighted.weight : 0;
  const diversityBonus = Math.min(Math.max(active.length - 1, 0) * 0.4, 1.2);

  return {
    score: clamp(average + diversityBonus, 0, 10),
    average,
    sources: active.length
  };
};

const scoreFutureBurden = (income: number, remainingBalance: number) => {
  if (remainingBalance <= 0) return { score: 10, monthsOfIncome: 0 };
  if (income <= 0) return { score: 1, monthsOfIncome: null as number | null };

  const monthsOfIncome = remainingBalance / income;
  return {
    score: interpolateScore(monthsOfIncome, [
      [0, 10],
      [1, 8],
      [2, 6.5],
      [4, 4],
      [8, 0.5]
    ]),
    monthsOfIncome
  };
};

const buildScoreSummary = (value: number, band: ScoreBand, commitment: IncomeCommitment, weakest: ScoreComponent | undefined) => {
  const commitmentText =
    commitment.committedPercent === null
      ? "ainda sem renda recorrente para medir o comprometimento"
      : `${formatRatioPercent(commitment.committedPercent)} da renda do proximo mes ja esta comprometida`;

  if (band === "excellent") return `Saude financeira excelente: ${commitmentText}.`;
  if (band === "healthy") return `Situacao saudavel, com ${commitmentText}.`;
  if (band === "balanced") return `Equilibrio razoavel, mas ${commitmentText}.`;
  if (band === "attention") {
    return weakest
      ? `Atencao: ${commitmentText}. O ponto mais fraco hoje e ${weakest.label.toLowerCase()}.`
      : `Atencao: ${commitmentText}.`;
  }
  return weakest
    ? `Quadro critico: ${commitmentText}. Priorize ${weakest.label.toLowerCase()}.`
    : `Quadro critico: ${commitmentText}.`;
};

export const calculateFinancialHealthScore = (plan: FinancePlan, asOf = new Date()): FinancialHealthScore => {
  const income = calculateIncomeMetrics(plan, asOf);
  const patrimony = calculatePatrimonyMetrics(plan.assets, plan.debts);
  const capacity = calculateMonthlyInvestmentCapacity(plan, asOf);
  const spending = calculateSpendingMetrics(plan, asOf);
  const commitment = calculateIncomeCommitment(plan, asOf);
  const emergencyMonths = calculateEmergencyFundMonths(plan, asOf);
  const savingsRate = calculateSavingsRate(plan, asOf);
  const targetMonths = emergencyTargetMonths(plan);
  const cashFlow = scoreCashFlow(income.recurringMonthly, capacity.livingCost, commitment.nextMonth.total);
  const savings = scoreSavings(income.recurringMonthly, savingsRate, capacity.potential);
  const stability = scoreIncomeStability(plan, asOf);
  const burden = scoreFutureBurden(income.recurringMonthly, commitment.remainingInstallmentBalance);
  const monthlyNeed = capacity.livingCost + capacity.debtPayments;

  const components = [
    component(
      "cashFlow",
      "Folga mensal",
      cashFlow.score,
      0.2,
      cashFlow.surplusRate === null
        ? "Sem renda recorrente para medir a folga entre ganho e custo de vida."
        : `Depois do custo tipico e dos compromissos, sobra ${formatRatioPercent(cashFlow.surplusRate)} da renda.`
    ),
    component(
      "incomeCommitment",
      "Renda comprometida",
      scoreCommitment(commitment.committedPercent, income.recurringMonthly > 0, commitment.nextMonth.total > 0),
      0.18,
      commitment.committedPercent === null
        ? "Cadastre uma renda recorrente para calcular o quanto ja esta comprometido."
        : `Recorrentes, parcelas e dividas travam ${formatRatioPercent(commitment.committedPercent)} da renda no proximo mes.`
    ),
    component(
      "emergencyReserve",
      "Reserva de emergencia",
      scoreEmergency(emergencyMonths, patrimony.liquidAssets, monthlyNeed),
      0.16,
      emergencyMonths === null
        ? patrimony.liquidAssets > 0
          ? "Ha liquidez, mas o custo mensal ainda e insuficiente para medir quantos meses ela cobre."
          : "Sem reserva liquida cadastrada."
        : `A liquidez cobre ${roundScore(emergencyMonths)} meses. A referencia saudavel e ${targetMonths} meses.`
    ),
    component(
      "savingsCapacity",
      "Capacidade de poupanca",
      savings.score,
      0.14,
      savings.blended === null
        ? "Sem renda recorrente para estimar quanto da renda vira poupanca."
        : `Aporte realizado e folga potencial equivalem a ${formatRatioPercent(savings.blended)} da renda.`
    ),
    component(
      "spendingControl",
      "Controle de gastos",
      scoreSpendingControl(income.recurringMonthly, spending.currentMonthSpend, spending.observedMonthlyMedian),
      0.12,
      income.recurringMonthly > 0
        ? `O mes vigente consome ${formatRatioPercent(spending.currentMonthSpend / income.recurringMonthly)} da renda.`
        : "Sem renda recorrente para comparar o ritmo de gasto."
    ),
    component(
      "incomeStability",
      "Estabilidade de renda",
      stability.score,
      0.1,
      stability.sources > 0
        ? `${stability.sources} fonte(s) recorrente(s), estabilidade media ${roundScore(stability.average)}/10.`
        : "Nenhuma renda recorrente ativa."
    ),
    component(
      "futureBurden",
      "Carga futura",
      burden.score,
      0.1,
      commitment.remainingInstallmentCount === 0
        ? "Sem parcelas futuras previstas."
        : burden.monthsOfIncome === null
          ? `${commitment.remainingInstallmentCount} lancamentos futuros somam compromisso sem renda para lastrear.`
          : `${commitment.remainingInstallmentCount} parcelas futuras equivalem a ${roundScore(burden.monthsOfIncome)} meses de renda.`
    )
  ];

  const value = roundScore(components.reduce((sum, item) => sum + item.score * item.weight, 0));
  const band = scoreBand(value);
  const weakest = [...components].sort((left, right) => left.score - right.score)[0];
  const strengths = components
    .filter((item) => item.score >= 7.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.label);
  const cautions = components
    .filter((item) => item.score < 5)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((item) => item.label);

  return {
    value,
    band,
    summary: buildScoreSummary(value, band, commitment, weakest),
    components,
    strengths,
    cautions
  };
};

export const getPrimaryGoal = (plan: FinancePlan) =>
  plan.goals.find((goal) => goal.isPrimary) ?? [...plan.goals].sort((a, b) => b.priority - a.priority)[0] ?? null;

export const analyzePlan = (plan: FinancePlan, asOf = new Date()): FinancialAnalysis => {
  const income = calculateIncomeMetrics(plan, asOf);
  const patrimony = calculatePatrimonyMetrics(plan.assets, plan.debts);
  const spending = calculateSpendingMetrics(plan, asOf);
  const capacity = calculateMonthlyInvestmentCapacity(plan, asOf);
  const savingsRate = calculateSavingsRate(plan, asOf);
  const emergencyFundMonths = calculateEmergencyFundMonths(plan, asOf);
  const budgetSuggestion = calculateBudgetSuggestion(plan, asOf);
  const primaryGoal = getPrimaryGoal(plan);
  const resolvedPrimaryGoal = primaryGoal ? withGoalAssetProgress(primaryGoal, plan.assets) : null;
  const nominalReturn = calculateNominalReturn(plan.independence.assumptions.baseRealReturn, plan.independence.assumptions.inflationRate);
  const primaryGoalProjection = resolvedPrimaryGoal
    ? calculateGoalProjection(
        resolvedPrimaryGoal,
        Math.max(0, capacity.potential),
        nominalReturn,
        plan.independence.assumptions.inflationRate,
        asOf
      )
    : null;

  return {
    income,
    patrimony,
    spending,
    capacity,
    savingsRate,
    emergencyFundMonths,
    commitment: calculateIncomeCommitment(plan, asOf),
    cashFlow: calculateCashFlowSnapshot(plan, asOf),
    budgetSuggestion,
    categoryBudgetPlan: calculateCategoryBudgetPlan(plan, asOf),
    categoryBudgets: calculateCategoryBudgetProgress(plan, asOf),
    primaryGoalProjection,
    independence: calculateFinancialIndependenceNumber(plan, asOf),
    projections: projectWealth(plan, asOf),
    riskProfile: plan.risk.reviewedProfile ?? suggestRiskProfile(plan),
    score: calculateFinancialHealthScore(plan, asOf)
  };
};

export const simulatePurchaseImpact = (
  plan: FinancePlan,
  amount: number,
  goalId?: string,
  asOf = new Date()
): PurchaseSimulation => {
  const patrimony = calculatePatrimonyMetrics(plan.assets, plan.debts);
  const capacity = calculateMonthlyInvestmentCapacity(plan, asOf);
  const emergencyMonths = calculateEmergencyFundMonths(plan, asOf);
  const targetEmergencyMonths = positive(plan.expenseProfile.emergencyFundTargetMonths);
  const liquidityAfterPurchase = patrimony.liquidAssets - positive(amount);
  const goal = goalId ? plan.goals.find((item) => item.id === goalId) : getPrimaryGoal(plan);
  const resolvedGoal = goal ? withGoalAssetProgress(goal, plan.assets) : null;
  let goalDelayMonths: number | null = null;

  if (resolvedGoal) {
    const nominalReturn = calculateNominalReturn(plan.independence.assumptions.baseRealReturn, plan.independence.assumptions.inflationRate);
    const before = calculateGoalProjection(resolvedGoal, Math.max(0, capacity.potential), nominalReturn, plan.independence.assumptions.inflationRate, asOf);
    const afterGoal = {
      ...resolvedGoal,
      currentValue: Math.max(0, positive(resolvedGoal.currentValue) - positive(amount))
    };
    const after = calculateGoalProjection(afterGoal, Math.max(0, capacity.potential), nominalReturn, plan.independence.assumptions.inflationRate, asOf);

    goalDelayMonths = before.monthsToGoal !== null && after.monthsToGoal !== null ? after.monthsToGoal - before.monthsToGoal : null;
  }

  const reserveAdequateAfterPurchase =
    targetEmergencyMonths > 0 && emergencyMonths !== null
      ? liquidityAfterPurchase / Math.max(1, calculateSpendingMetrics(plan, asOf).livingCostUsed + calculateMonthlyDebtPayments(plan.debts)) >=
        targetEmergencyMonths
      : liquidityAfterPurchase >= 0;

  return {
    canPay: liquidityAfterPurchase >= 0,
    amount: positive(amount),
    impactOnMonthlyInvestment: -positive(amount),
    liquidityAfterPurchase: roundMoney(liquidityAfterPurchase),
    reserveAdequateAfterPurchase,
    goalDelayMonths
  };
};

export const runStressTest = (plan: FinancePlan, input: StressTestInput, asOf = new Date()): StressTestResult => {
  const income = calculateIncomeMetrics(plan, asOf);
  const spending = calculateSpendingMetrics(plan, asOf);
  const patrimony = calculatePatrimonyMetrics(plan.assets, plan.debts);
  const debtPayments = calculateMonthlyDebtPayments(plan.debts);
  const monthlyNeed = spending.livingCostUsed + debtPayments;
  let reserveImpact = 0;
  let netWorthImpact = 0;
  const notes: string[] = [];

  if (input.type === "incomeLoss") {
    reserveImpact = monthlyNeed * positive(input.durationMonths ?? 1);
    netWorthImpact = reserveImpact;
    notes.push("Simula meses sem a fonte de renda selecionada, mantendo o custo de vida.");
  }

  if (input.type === "incomeReduction") {
    const loss = income.recurringMonthly * clamp(positive(input.magnitude), 0, 1);
    reserveImpact = loss * positive(input.durationMonths ?? 1);
    netWorthImpact = reserveImpact;
    notes.push("Simula reducao percentual da renda recorrente.");
  }

  if (input.type === "unemployment") {
    reserveImpact = monthlyNeed * positive(input.durationMonths ?? 1);
    netWorthImpact = reserveImpact;
    notes.push("Simula desemprego com despesas e parcelas preservadas.");
  }

  if (input.type === "unexpectedExpense" || input.type === "realEstatePurchase") {
    reserveImpact = positive(input.magnitude);
    netWorthImpact = reserveImpact;
    notes.push("Simula saida extraordinaria de caixa.");
  }

  if (input.type === "marketDrop") {
    netWorthImpact = patrimony.investableAssets * clamp(positive(input.magnitude), 0, 1);
    notes.push("Simula queda percentual sobre patrimonio investivel.");
  }

  if (input.type === "costOfLivingIncrease") {
    reserveImpact = spending.livingCostUsed * clamp(positive(input.magnitude), 0, 1) * positive(input.durationMonths ?? 1);
    netWorthImpact = reserveImpact;
    notes.push("Simula aumento percentual do custo de vida.");
  }

  const reserveAfterScenario = patrimony.liquidAssets - reserveImpact;
  const coverageMonthsAfterScenario = monthlyNeed > 0 ? reserveAfterScenario / monthlyNeed : 0;

  return {
    type: input.type,
    reserveAfterScenario: roundMoney(reserveAfterScenario),
    coverageMonthsAfterScenario: roundRatio(coverageMonthsAfterScenario),
    needsToSellInvestments: reserveAfterScenario < 0,
    impactOnNetWorth: roundMoney(netWorthImpact),
    notes
  };
};

export const buildMonthlySnapshot = (plan: FinancePlan, asOf = new Date()) => {
  const analysis = analyzePlan(plan, asOf);

  return {
    id: monthKey(asOf),
    month: monthKey(asOf),
    totalNetWorth: analysis.patrimony.netWorth,
    financialNetWorth: analysis.patrimony.financialAssets,
    recurringIncome: analysis.income.recurringMonthly,
    observedSpend: analysis.spending.currentMonthSpend,
    investedAmount: analysis.capacity.actualInvestment,
    savingsRate: analysis.savingsRate ?? 0
  };
};
