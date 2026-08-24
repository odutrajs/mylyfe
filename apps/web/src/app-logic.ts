import {
  defaultExpenseCategories,
  defaultFinanceModuleAccess,
  defaultIndependenceAssumptions,
  defaultLifeWorkspace,
  isUnifiedShoppingCategory,
  mergeWorkspaceModules,
  normalizeHealthModuleState,
  normalizeHomeModuleState,
  normalizeRoutineModuleState,
  normalizeSecretaryModuleState,
  pickHealthModuleState,
  pickHomeModuleState,
  pickRoutineModuleState,
  pickSecretaryModuleState,
  syncRoutineWithHealthAppointments,
  unifyShoppingCategories,
  type AccountLink,
  type Asset,
  type BudgetCategoryTarget,
  type CommitmentStatus,
  type ExpenseCategory,
  type ExpenseCategoryConfig,
  type FinanceModuleScope,
  type FinancePlan,
  type FinancialAnalysis,
  type FinancialTransaction,
  type RecurringTransaction,
  type StatementRelativeMonth,
  type TransactionType
} from "@mylyfe/domain";
import { labels, toDateInput } from "./lib";

export const financeModuleId = "finance";

export const transactionTypeLabels: Record<TransactionType, string> = {
  expense: "Despesa",
  income: "Receita",
  investment: "Investimento",
  debt_payment: "Pagamento",
  transfer: "Transferencia"
};

export const financeScopeOptions: Array<{ value: FinanceModuleScope; label: string }> = [
  { value: "dashboard", label: "Dashboard" },
  { value: "plan", label: "Dados financeiros" },
  { value: "transactions", label: "Transacoes" },
  { value: "categories", label: "Categorias" },
  { value: "history", label: "Historico" },
  { value: "sharing", label: "Compartilhamento" }
];

export const visibleFinanceScopeValues = financeScopeOptions.map((scope) => scope.value);
export const visibleFinanceScopeSet = new Set<string>(visibleFinanceScopeValues);
export const defaultVisibleFinanceScopes = () => [...visibleFinanceScopeValues];

export type TransactionAnalyticsItem = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  type: TransactionType;
  category: ExpenseCategory;
};

export type RecurringOccurrence = TransactionAnalyticsItem & {
  recurringTransaction: RecurringTransaction;
  month: string;
};

export type AppView =
  | "dashboard"
  | "plan"
  | "import"
  | "transactions"
  | "categories"
  | "history"
  | "access"
  | "secretary-home"
  | "secretary-alerts"
  | "secretary-whatsapp"
  | "secretary-settings"
  | "routine-home"
  | "routine-agenda"
  | "routine-tasks"
  | "routine-contexts"
  | "routine-calendars"
  | "health-home"
  | "health-wallet"
  | "health-appointments"
  | "health-meds"
  | "home-list"
  | "profile";

export const optionsFrom = (record: Record<string, string>) =>
  Object.entries(record).map(([value, label]) => ({ value, label }));

const expenseCategoryCache = new WeakMap<ExpenseCategoryConfig[], ExpenseCategoryConfig[]>();

export function normalizeExpenseCategories(categories?: ExpenseCategoryConfig[]) {
  if (categories) {
    const cached = expenseCategoryCache.get(categories);
    if (cached) return cached;
  }

  const defaults = defaultExpenseCategories();
  const defaultIds = new Set(defaults.map((category) => category.id));
  const overrides = new Map((categories ?? []).map((category) => [category.id, category]));
  const mergedDefaults = defaults.map((category) => ({
    ...category,
    ...overrides.get(category.id),
    isDefault: true
  }));
  const customCategories = (categories ?? [])
    .filter((category) => !defaultIds.has(category.id) && !isUnifiedShoppingCategory(category.id, category.name))
    .map((category) => ({
      ...category,
      isDefault: false,
      isActive: category.isActive ?? true
    }));

  const normalized = [...mergedDefaults, ...customCategories];
  if (categories) expenseCategoryCache.set(categories, normalized);
  return normalized;
}

export function expenseCategoryOptions(plan: FinancePlan, includeInactive = true) {
  return normalizeExpenseCategories(plan.expenseCategories)
    .filter((category) => includeInactive || category.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
    .map((category) => ({
      value: category.id,
      label: category.isActive ? category.name : `${category.name} (inativa)`,
      color: category.color
    }));
}

export function expenseCategoryById(plan: FinancePlan, id: ExpenseCategory) {
  return normalizeExpenseCategories(plan.expenseCategories).find((category) => category.id === id);
}

export function expenseCategoryName(plan: FinancePlan, id: ExpenseCategory) {
  return expenseCategoryById(plan, id)?.name ?? labels.category[id as keyof typeof labels.category] ?? id;
}

export function expenseCategoryColor(plan: FinancePlan, id: ExpenseCategory) {
  return expenseCategoryById(plan, id)?.color ?? "#6b7280";
}

export function slugifyCategoryId(value: string, categories: ExpenseCategoryConfig[]) {
  const base =
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36) || "categoria";
  const existing = new Set(categories.map((category) => category.id));
  let next = `custom-${base}`;
  let suffix = 2;

  while (existing.has(next)) {
    next = `custom-${base}-${suffix}`;
    suffix += 1;
  }

  return next as ExpenseCategory;
}

const statementMonthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});

export function formatReferenceMonth(referenceMonth: string) {
  const [yearRaw, monthRaw] = referenceMonth.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return referenceMonth;

  const formatted = statementMonthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatStatementLabel(statement: NonNullable<FinancialTransaction["statement"]>) {
  return formatReferenceMonth(statement.referenceMonth);
}

export function escapeCsvCell(value: string) {
  if (/[;"\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function planIdFromEmail(email: string) {
  const normalized = normalizeEmail(email).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `user-${normalized || "local"}`;
}

export function displayNameFromEmail(email: string) {
  const localPart = normalizeEmail(email).split("@")[0] ?? "";
  const words = localPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return "Usuario MyLyfe";
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function planStorageKey(planId: string) {
  return `mylyfe-finance-plan:${planId}`;
}

export function legacyPlanStorageKey(planId: string) {
  return `tfinance-plan:${planId}`;
}

export function normalizeAccountLinkPermissions(permissions?: Partial<AccountLink["permissions"]>): AccountLink["permissions"] {
  const modules = permissions?.modules?.length
    ? permissions.modules.map((module) => {
        if (module.moduleId !== financeModuleId) return module;
        const scopes = (module.scopes ?? []).filter((scope) => visibleFinanceScopeSet.has(scope));
        return {
          ...module,
          scopes: scopes.length ? scopes : ["dashboard"]
        };
      })
    : [defaultFinanceModuleAccess("editor", defaultVisibleFinanceScopes())];

  return {
    canViewSharedPlan: permissions?.canViewSharedPlan ?? true,
    canEditOwnData: permissions?.canEditOwnData ?? true,
    canEditSharedData: permissions?.canEditSharedData ?? false,
    canSeePartnerPrivateData: permissions?.canSeePartnerPrivateData ?? false,
    modules
  };
}

export function normalizeAccountLink(link: AccountLink): AccountLink {
  return {
    ...link,
    sharedHome: link.sharedHome !== false,
    permissions: normalizeAccountLinkPermissions(link.permissions)
  };
}

export function financeAccessFor(link: AccountLink) {
  return (
    normalizeAccountLinkPermissions(link.permissions).modules.find((module) => module.moduleId === financeModuleId) ??
    defaultFinanceModuleAccess("viewer", ["dashboard"])
  );
}

export function financeScopeLabels(scopes: string[]) {
  const labelsByScope = new Map(financeScopeOptions.map((scope) => [scope.value, scope.label]));
  return scopes
    .map((scope) => labelsByScope.get(scope as FinanceModuleScope))
    .filter((label): label is string => Boolean(label))
    .join(", ");
}

export function isEmptyPlan(plan: FinancePlan) {
  return (
    !plan.onboardingCompleted &&
    plan.incomeSources.length === 0 &&
    plan.assets.length === 0 &&
    plan.transactions.length === 0 &&
    (plan.recurringTransactions ?? []).length === 0
  );
}

export function planUpdatedTime(plan: FinancePlan) {
  const updated = Date.parse(plan.updatedAt || plan.createdAt || "");
  return Number.isFinite(updated) ? updated : 0;
}

export function mergeCategoryTargets(preferred: BudgetCategoryTarget[], fallback: BudgetCategoryTarget[]) {
  const merged = new Map<string, BudgetCategoryTarget>();
  for (const target of fallback) merged.set(target.category, target);
  for (const target of preferred) merged.set(target.category, target);
  return [...merged.values()];
}

export function pickFreshestPlan(remote: FinancePlan, stored: FinancePlan | null) {
  if (!stored) return remote;
  const freshest = isEmptyPlan(remote) && !isEmptyPlan(stored)
    ? stored
    : planUpdatedTime(stored) > planUpdatedTime(remote)
      ? stored
      : remote;
  const other = freshest === remote ? stored : remote;
  const categoryTargets = mergeCategoryTargets(freshest.budget?.categoryTargets ?? [], other.budget?.categoryTargets ?? []);

  return syncRoutineWithHealthAppointments({
    ...freshest,
    budget: categoryTargets.length
      ? {
          ...freshest.budget,
          categoryTargets
        }
      : freshest.budget,
    health: pickHealthModuleState(remote.health, stored.health),
    secretary: pickSecretaryModuleState(remote.secretary, stored.secretary),
    routine: pickRoutineModuleState(remote.routine, stored.routine),
    home: pickHomeModuleState(remote.home, stored.home)
  });
}

export function updateById<T extends { id: string }>(items: T[], id: string, patch: Partial<T>) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function removeById<T extends { id: string }>(items: T[], id: string) {
  return items.filter((item) => item.id !== id);
}

export function clearSharingMetadata<T extends object>(item: T): T {
  const { visibility: _visibility, linkedOwnerIds: _linkedOwnerIds, ...cleanItem } = item as T & {
    visibility?: string;
    linkedOwnerIds?: string[];
  };

  return cleanItem as T;
}

export function isIgnoredImportedReceipt(transaction: FinancialTransaction) {
  return (
    (transaction.source === "csv" || transaction.source === "pdf") &&
    /pagamento recebido|cr[eé]dito de|estorno|iof de volta/i.test(`${transaction.merchant} ${transaction.description ?? ""}`)
  );
}

export function normalizeInstallmentText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function installmentAmountBucket(value: number) {
  return Math.round(Math.abs(value));
}

export function parseInstallmentFromMerchant(merchant: string) {
  const match = merchant.match(/(?:^|\s)[-–—]?\s*parcela\s+(\d{1,3})\s*\/\s*(\d{1,3})\b/i);
  if (!match) return null;

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || total < 1 || current > total) return null;

  return {
    current,
    total,
    baseMerchant:
      merchant
        .slice(0, match.index)
        .replace(/\s*[-–—]\s*$/, "")
        .trim() || merchant.trim()
  };
}

export function isInstallmentForecast(transaction: FinancialTransaction) {
  return transaction.forecast?.kind === "installment";
}

export function installmentBaseMerchant(transaction: FinancialTransaction) {
  return parseInstallmentFromMerchant(transaction.merchant)?.baseMerchant ?? transaction.description ?? transaction.merchant;
}

export function installmentOccurrenceKey(transaction: FinancialTransaction) {
  if (!transaction.installment) return "";
  return [
    normalizeInstallmentText(installmentBaseMerchant(transaction)),
    transaction.installment.current,
    transaction.installment.total,
    installmentAmountBucket(transaction.amount)
  ].join("|");
}

export function installmentChainKey(transaction: FinancialTransaction) {
  if (!transaction.installment) return "";
  return [normalizeInstallmentText(installmentBaseMerchant(transaction)), transaction.installment.total, installmentAmountBucket(transaction.amount)].join("|");
}

export function addMonthsToIsoDate(value: string, amount: number) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const firstDay = new Date(parsed.getFullYear(), parsed.getMonth() + amount, 1, 12);
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();
  const day = Math.min(parsed.getDate(), lastDay);
  return new Date(firstDay.getFullYear(), firstDay.getMonth(), day, 12).toISOString();
}

export function installmentForecastId(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return `tx-forecast-${hash.toString(16).padStart(8, "0")}`;
}

export function monthStart(month: string) {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex)) return null;
  return new Date(year, monthIndex, 1);
}

export function monthEnd(month: string) {
  const start = monthStart(month);
  if (!start) return null;
  return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function addMonthKey(month: string, amount: number) {
  const start = monthStart(month);
  if (!start) return month;
  start.setMonth(start.getMonth() + amount);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
}

export function forecastStatementMonth(transaction: FinancialTransaction, offset: number) {
  const baseMonth = transaction.statement?.referenceMonth ?? toDateInput(transaction.date).slice(0, 7);
  return addMonthKey(baseMonth, offset);
}

export function statementRelativeMonthForClient(referenceMonth: string, asOf = new Date()): StatementRelativeMonth {
  const [yearRaw, monthRaw] = referenceMonth.split("-");
  const referenceIndex = Number(yearRaw) * 12 + Number(monthRaw);
  const currentIndex = asOf.getFullYear() * 12 + asOf.getMonth() + 1;
  const diff = referenceIndex - currentIndex;

  if (diff === 0) return "current";
  if (diff === -1) return "previous";
  if (diff === 1) return "next";
  return diff < 0 ? "past" : "future";
}

export function reconcileInstallmentForecastsForClient(transactions: FinancialTransaction[]) {
  const actuals = transactions
    .filter((transaction) => !isInstallmentForecast(transaction))
    .map((transaction) => {
      const parsed = parseInstallmentFromMerchant(transaction.merchant);
      if (!parsed) return transaction;

      return {
        ...transaction,
        installment: transaction.installment ?? {
          current: parsed.current,
          total: parsed.total
        }
      };
    });
  const occupiedKeys = new Set(actuals.map(installmentOccurrenceKey).filter(Boolean));
  const latestActualByChain = new Map<string, FinancialTransaction>();
  const generatedAt = new Date().toISOString();

  for (const transaction of actuals) {
    if (!transaction.installment) continue;
    const chainKey = installmentChainKey(transaction);
    if (!chainKey) continue;

    const currentLatest = latestActualByChain.get(chainKey);
    if (
      !currentLatest ||
      (currentLatest.installment && transaction.installment.current > currentLatest.installment.current) ||
      (currentLatest.installment?.current === transaction.installment.current && transaction.date > currentLatest.date)
    ) {
      latestActualByChain.set(chainKey, transaction);
    }
  }

  const forecasts = [...latestActualByChain.values()].flatMap((transaction) => {
    if (!transaction.installment || transaction.installment.current >= transaction.installment.total) return [];

    return Array.from({ length: transaction.installment.total - transaction.installment.current }, (_, index): FinancialTransaction | null => {
      const current = transaction.installment!.current + index + 1;
      const total = transaction.installment!.total;
      const baseMerchant = installmentBaseMerchant(transaction);
      const key = [normalizeInstallmentText(baseMerchant), current, total, installmentAmountBucket(transaction.amount)].join("|");
      if (occupiedKeys.has(key)) return null;
      occupiedKeys.add(key);

      const referenceMonth = forecastStatementMonth(transaction, current - transaction.installment!.current);
      return {
        ...transaction,
        id: installmentForecastId(key),
        date: addMonthsToIsoDate(transaction.date, current - transaction.installment!.current),
        merchant: `${baseMerchant} - Parcela ${current}/${total}`,
        description: transaction.description ?? baseMerchant,
        source: "api",
        statement: {
          issuer: transaction.statement?.issuer ?? "unknown",
          referenceMonth,
          relativeMonth: statementRelativeMonthForClient(referenceMonth),
          importedAt: generatedAt
        },
        installment: {
          current,
          total
        },
        forecast: {
          kind: "installment",
          generatedFromTransactionId: transaction.id
        },
        reviewed: true
      };
    }).filter((transaction): transaction is FinancialTransaction => Boolean(transaction));
  });

  return [...actuals, ...forecasts];
}

export function normalizePlanForClient(plan: FinancePlan): FinancePlan {
  const unified = unifyShoppingCategories(plan);
  const workspace = {
    ...defaultLifeWorkspace(unified.id),
    ...(unified.workspace ?? {}),
    modules: mergeWorkspaceModules(unified.workspace?.modules)
  };
  const expenseCategories = normalizeExpenseCategories(unified.expenseCategories);
  const accountLinks = (unified.profile.accountLinks ?? []).map(normalizeAccountLink);
  const acceptedLinkedPeople = new Set(
    accountLinks.filter((link) => link.status === "accepted" && link.inviteePersonId).map((link) => link.inviteePersonId)
  );
  const people = unified.profile.people.filter(
    (person) => person.role === "primary" || person.accountStatus === "linked" || acceptedLinkedPeople.has(person.id)
  );
  const validOwnerIds = new Set(people.map((person) => person.id));
  const validRecurringIds = new Set((unified.recurringTransactions ?? []).map((transaction) => transaction.id));
  const clearInvalidOwner = <T extends { ownerId?: string }>(item: T): T =>
    item.ownerId && !validOwnerIds.has(item.ownerId) ? { ...item, ownerId: undefined } : item;
  const normalizeTransaction = (transaction: FinancialTransaction): FinancialTransaction => ({
    ...transaction,
    spentByPersonId:
      transaction.spentByPersonId && validOwnerIds.has(transaction.spentByPersonId) ? transaction.spentByPersonId : undefined,
    recurringTransactionId:
      transaction.recurringTransactionId && validRecurringIds.has(transaction.recurringTransactionId)
        ? transaction.recurringTransactionId
        : undefined
  });
  const normalizeAsset = (asset: Asset): Asset => {
    const { ownerId: _ownerId, ...cleanAsset } = asset as Asset & { ownerId?: string };
    return {
      ...clearSharingMetadata(cleanAsset),
      sharedWithPersonIds: (cleanAsset.sharedWithPersonIds ?? []).filter((personId) => validOwnerIds.has(personId)),
      includeInIndependence: false
    };
  };

  return syncRoutineWithHealthAppointments({
    ...unified,
    workspace,
    profile: {
      ...unified.profile,
      people,
      accountLinks
    },
    incomeSources: (unified.incomeSources ?? []).map((income) => clearSharingMetadata(clearInvalidOwner(income))),
    assets: (unified.assets ?? []).map(normalizeAsset),
    debts: (unified.debts ?? []).map((debt) => clearSharingMetadata(clearInvalidOwner(debt))),
    expenseProfile: {
      estimatedMonthlySpend: unified.expenseProfile?.estimatedMonthlySpend ?? 0,
      currentMonthlyInvestments: unified.expenseProfile?.currentMonthlyInvestments ?? 0,
      monthlyProvisions: unified.expenseProfile?.monthlyProvisions ?? 0,
      emergencyFundTargetMonths: unified.expenseProfile?.emergencyFundTargetMonths ?? 0
    },
    budget: {
      ...unified.budget,
      mode: unified.budget?.mode ?? "suggested",
      monthlyExpenseTarget: unified.budget?.monthlyExpenseTarget,
      monthlyInvestmentTarget: unified.budget?.monthlyInvestmentTarget,
      monthlyProvisionTarget: unified.budget?.monthlyProvisionTarget,
      categoryTargets: unified.budget?.categoryTargets ?? []
    },
    independence: {
      desiredMonthlySpend: unified.independence?.desiredMonthlySpend ?? 0,
      targetAge: unified.independence?.targetAge ?? 0,
      assumptions: {
        ...defaultIndependenceAssumptions(),
        ...unified.independence?.assumptions
      }
    },
    transactions: reconcileInstallmentForecastsForClient(
      (unified.transactions ?? []).filter((transaction) => !isIgnoredImportedReceipt(transaction)).map(normalizeTransaction)
    ),
    recurringTransactions: unified.recurringTransactions ?? [],
    expenseCategories,
    classificationRules: unified.classificationRules ?? [],
    monthlySnapshots: unified.monthlySnapshots ?? [],
    secretary: normalizeSecretaryModuleState(unified.secretary),
    routine: normalizeRoutineModuleState(unified.routine),
    health: normalizeHealthModuleState(unified.health),
    home: normalizeHomeModuleState(unified.home)
  });
}

export function readInitialView(search = typeof window === "undefined" ? "" : window.location.search): AppView {
  const params = new URLSearchParams(search);
  const routine = params.get("routine");
  if (routine === "home" || routine === "agenda") return "routine-agenda";
  if (routine === "tasks") return "routine-tasks";
  if (routine === "contexts") return "routine-contexts";
  if (routine === "calendars") return "routine-calendars";
  const health = params.get("health");
  if (health === "home") return "health-home";
  if (health === "wallet") return "health-wallet";
  if (health === "appointments") return "health-appointments";
  if (health === "meds") return "health-meds";
  const home = params.get("home");
  if (home === "list" || home === "mercado") return "home-list";
  if (params.get("profile")) return "profile";
  return "dashboard";
}

export function transactionMonthKey(transaction: FinancialTransaction) {
  return toDateInput(transaction.date).slice(0, 7);
}

export function currentTransactionMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function formatTransactionMonth(month: string) {
  return month ? formatReferenceMonth(month) : "Sem mes";
}

export function isExpenseLikeTransaction(transaction: FinancialTransaction) {
  return transaction.type === "expense" || transaction.type === "debt_payment" || transaction.type === "investment";
}

export function isExpenseLikeItem(item: Pick<TransactionAnalyticsItem, "type">) {
  return item.type === "expense" || item.type === "debt_payment" || item.type === "investment";
}

export function addMonthsToDateInput(dateInput: string, amount: number) {
  const base = new Date(`${dateInput}T12:00:00`);
  if (Number.isNaN(base.getTime())) return dateInput;

  const targetMonth = new Date(base.getFullYear(), base.getMonth() + amount, 1, 12);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  const day = Math.min(base.getDate(), lastDay);
  return `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function monthKeysBetween(startMonth: string, endMonth: string) {
  const months: string[] = [];
  let cursor = startMonth;
  let guard = 0;

  while (cursor <= endMonth && guard < 60) {
    months.push(cursor);
    cursor = addMonthKey(cursor, 1);
    guard += 1;
  }

  return months;
}

export function nextMonthKeys(startMonth: string, months: number) {
  return Array.from({ length: months }, (_, index) => addMonthKey(startMonth, index));
}

export function recurringMonthlyFactor(frequency: RecurringTransaction["frequency"]) {
  const factors: Record<RecurringTransaction["frequency"], number> = {
    monthly: 1,
    weekly: 52 / 12,
    biweekly: 26 / 12,
    quarterly: 1 / 3,
    annual: 1 / 12
  };

  return factors[frequency];
}

export function recurringMonthsBetween(start: Date, month: Date) {
  return (month.getFullYear() - start.getFullYear()) * 12 + month.getMonth() - start.getMonth();
}

export function recurringOccursInMonth(transaction: RecurringTransaction, month: string) {
  const monthFirstDay = monthStart(month);
  const monthLastDay = monthEnd(month);
  const start = new Date(transaction.startDate);
  const end = transaction.endDate ? new Date(transaction.endDate) : null;
  if (!monthFirstDay || !monthLastDay || Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) return false;
  if (start > monthLastDay || (end && end < monthFirstDay)) return false;

  const monthDiff = recurringMonthsBetween(start, monthFirstDay);
  if (monthDiff < 0) return false;
  if (transaction.frequency === "monthly") return true;
  if (transaction.frequency === "quarterly") return monthDiff % 3 === 0;
  if (transaction.frequency === "annual") return monthDiff % 12 === 0;
  return true;
}

export function recurringOccurrenceDate(transaction: RecurringTransaction, month: string) {
  const start = new Date(transaction.startDate);
  const firstDay = monthStart(month);
  if (!firstDay || Number.isNaN(start.getTime())) return `${month}-01`;
  const day = Math.min(start.getDate(), new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate());
  return `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function recurringOccurrenceAmount(transaction: RecurringTransaction) {
  return (Number.isFinite(transaction.amount) ? Number(transaction.amount) : 0) * recurringMonthlyFactor(transaction.frequency);
}

export function buildRecurringOccurrences(transactions: RecurringTransaction[], months: string[]) {
  return transactions.flatMap((transaction) =>
    months
      .filter((month) => recurringOccursInMonth(transaction, month))
      .map(
        (month): RecurringOccurrence => ({
          id: `${transaction.id}-${month}`,
          date: recurringOccurrenceDate(transaction, month),
          merchant: transaction.name,
          amount: recurringOccurrenceAmount(transaction),
          type: transaction.type,
          category: transaction.category,
          recurringTransaction: transaction,
          month
        })
      )
  );
}

export function categoryBudgetCaption(item: FinancialAnalysis["categoryBudgets"][number]) {
  if (item.status === "over") return "Acima do orcamento";
  if (item.status === "tight") return "Perto do limite";
  if (item.remaining !== null) return "Dentro do limite";
  return "Sem teto neste mes";
}

export function snapShare(value: number) {
  return Math.round(value / 0.001) * 0.001;
}

export const thirdPartySpenderValue = "__third_party__";

export function spenderValueForTransaction(transaction: FinancialTransaction) {
  if (transaction.audience === "thirdParty" || transaction.nature === "thirdParty" || transaction.category === "thirdParty") {
    return thirdPartySpenderValue;
  }

  return transaction.spentByPersonId ?? "";
}

export function spenderPatch(value: string, transaction?: FinancialTransaction): Partial<FinancialTransaction> {
  if (value === thirdPartySpenderValue) {
    return {
      spentByPersonId: undefined,
      audience: "thirdParty",
      nature: "thirdParty",
      category: "thirdParty"
    };
  }

  return {
    spentByPersonId: value || undefined,
    audience: "personal",
    nature: transaction?.nature === "thirdParty" ? "variable" : transaction?.nature
  };
}

export function maskDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return [day, month, year].filter(Boolean).join("/");
}

export function formatDateDisplay(value?: string) {
  const dateInput = toDateInput(value);
  if (!dateInput) return "";
  const [year, month, day] = dateInput.split("-");
  return `${day}/${month}/${year}`;
}

export function parseDateDisplay(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function commitmentTone(status: CommitmentStatus): "good" | "warn" | "bad" {
  if (status === "healthy") return "good";
  if (status === "moderate") return "warn";
  return "bad";
}

export function scoreBarTone(score: number) {
  return score >= 7.5 ? "good" : score >= 5 ? "warn" : "bad";
}
