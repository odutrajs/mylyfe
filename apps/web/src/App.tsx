import {
  Activity,
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Bell,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CreditCard,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Database,
  Download,
  EllipsisVertical,
  Eye,
  EyeOff,
  FileUp,
  Gauge,
  GraduationCap,
  HeartPulse,
  Home,
  Layers,
  Link2,
  ListTodo,
  LineChart,
  Loader2,
  LogIn,
  LogOut,
  MessageCircle,
  Palette,
  Percent,
  Pill,
  PiggyBank,
  Plane,
  Plus,
  Receipt,
  Repeat,
  Save,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Tag,
  Target,
  Trash2,
  User,
  Users,
  UtensilsCrossed,
  WalletCards
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  analyzePlan,
  assetCategories,
  buildMonthlySnapshot,
  calculateGoalCurrentValue,
  calculateNominalReturn,
  isBudgetableCategory,
  resolveCategoryShare,
  selectDashboardCategoryBudgets,
  accountLinkSharesHome,
  applySharedHomeToAccountLink,
  canAccessSharedHome,
  createEmptyPlan,
  findAcceptedAccountLinkForEmail,
  findPersonByEmail,
  isLinkedInvitee,
  isWorkspaceAdmin,
  lifeModulePlanId,
  overlayPersonalLifeModules,
  personalLifeModulesFromComposed,
  stripHostLifeFromPersonal,
  sessionDisplayName,
  sharedPlanFromComposed,
  defaultExpenseCategories,
  defaultFinanceModuleAccess,
  defaultHomeModuleAccess,
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
  scoreBandLabel,
  simulatePurchaseImpact,
  type AccountLink,
  type Asset,
  type AssetCategory,
  type BudgetCategoryTarget,
  type CommitmentStatus,
  type Debt,
  type DebtType,
  type ExpenseCategory,
  type ExpenseCategoryConfig,
  type FinancePlan,
  type FinancialAnalysis,
  type FinancialTransaction,
  type Frequency,
  type FinanceModuleScope,
  type Goal,
  type IncomeSource,
  type IncomeType,
  type Liquidity,
  type ModuleAccessRole,
  type Person,
  type RecurringTransaction,
  type RiskProfileName,
  type ShoppingActor,
  type StatementRelativeMonth,
  type TransactionAudience,
  type TransactionNature,
  type TransactionType
} from "@mylyfe/domain";
import { BrandLockup, Mascot, mascotMoodFromCommitment, mascotMoodFromScore, type MascotMood } from "./Mascot";
import { MoneyField } from "./MoneyField";
import { HealthView } from "./HealthView";
import { HomeView } from "./HomeView";
import { RoutineView } from "./RoutineView";
import { SecretaryView } from "./SecretaryView";
import { WhatsAppPhoneField } from "./WhatsAppPhoneField";
import {
  apiRequest,
  clearAuthToken,
  currency,
  emptyToZero,
  labels,
  monthsLabel,
  number,
  percent,
  preciseCurrency,
  readAuthToken,
  toDateInput,
  uid,
  writeAuthToken
} from "./lib";

type SaveState = "idle" | "saving" | "saved" | "offline";
type FinanceView = "dashboard" | "plan" | "import" | "transactions" | "categories" | "history" | "access";
type SecretaryModuleView = "secretary-home" | "secretary-alerts" | "secretary-whatsapp" | "secretary-settings";
type RoutineModuleView = "routine-home" | "routine-agenda" | "routine-tasks" | "routine-contexts" | "routine-calendars";
type HealthModuleView = "health-home" | "health-wallet" | "health-appointments" | "health-meds";
type HomeModuleView = "home-list";
type View = FinanceView | SecretaryModuleView | RoutineModuleView | HealthModuleView | HomeModuleView | "profile";
type SelectOption = { value: string; label: string; color?: string };
type TransactionAnalyticsItem = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  type: TransactionType;
  category: ExpenseCategory;
};
type RecurringOccurrence = TransactionAnalyticsItem & {
  recurringTransaction: RecurringTransaction;
  month: string;
};
type UserSession = {
  userId: string;
  planId: string;
  name: string;
  email: string;
  personalPlanId?: string;
};
const appName = "Zelo";
const financeModuleId = "finance";
const secretaryViews = new Set<View>(["secretary-home", "secretary-alerts", "secretary-whatsapp", "secretary-settings"]);
const routineViews = new Set<View>(["routine-home", "routine-agenda", "routine-tasks", "routine-contexts", "routine-calendars"]);
const healthViews = new Set<View>(["health-home", "health-wallet", "health-appointments", "health-meds"]);
const homeViews = new Set<View>(["home-list"]);
const sessionStorageKey = "mylyfe-session";
const legacySessionStorageKey = "tfinance-session";
const authCredentialsStorageKey = "mylyfe-auth-credentials";
const planStoragePrefix = "mylyfe-finance-plan";
const legacyPlanStoragePrefix = "tfinance-plan";
const pendingInviteStorageKey = "mylyfe-pending-invite";
const planMembershipStorageKey = "mylyfe-plan-memberships";

const frequencyOptions = optionsFrom(labels.frequency);
const recurringFrequencyOptions = frequencyOptions.filter((option) => option.value !== "single");
const incomeTypeOptions = optionsFrom(labels.incomeType);
const recurringIncomeTypeOptions = incomeTypeOptions.filter((option) => option.value !== "freelance");
const assetCategoryOptions = optionsFrom(labels.assetCategory);
const debtTypeOptions = optionsFrom(labels.debtType);
const liquidityOptions = optionsFrom(labels.liquidity);
const maritalOptions = optionsFrom(labels.maritalStatus);
const riskOptions = optionsFrom(labels.risk).filter((item) => item.value !== "undefined");
const transactionTypeLabels: Record<TransactionType, string> = {
  expense: "Gasto",
  income: "Renda",
  investment: "Aporte",
  debt_payment: "Pagamento/parcelamento",
  transfer: "Transferencia"
};
const thirdPartySpenderValue = "__third_party__";
const transactionPageSize = 50;
const financeScopeOptions: Array<{ value: FinanceModuleScope; label: string }> = [
  { value: "dashboard", label: "Dashboard" },
  { value: "transactions", label: "Gastos" },
  { value: "categories", label: "Categorias" },
  { value: "plan", label: "Dados financeiros" },
  { value: "history", label: "Historico" },
  { value: "sharing", label: "Acessos" }
];
const visibleFinanceScopeValues = financeScopeOptions.map((scope) => scope.value);
const visibleFinanceScopeSet = new Set<string>(visibleFinanceScopeValues);
const defaultVisibleFinanceScopes = () => [...visibleFinanceScopeValues];
const moduleRoleOptions: Array<{ value: ModuleAccessRole; label: string }> = [
  { value: "viewer", label: "Visualizador" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" }
];
const moduleRoleLabels: Record<ModuleAccessRole, string> = {
  viewer: "Visualizador",
  editor: "Editor",
  admin: "Admin"
};
const moduleCatalog = [
  { id: "finance", name: "Financeiro", description: "Planejamento, gastos, patrimonio e metas.", icon: <WalletCards size={18} />, status: "active" },
  { id: "secretary", name: "Secretaria", description: "WhatsApp, lembretes, contas e confirmacoes.", icon: <MessageCircle size={18} />, status: "active" },
  { id: "routine", name: "Rotina", description: "Briefing do dia, tarefas e agenda.", icon: <CalendarClock size={18} />, status: "active" },
  { id: "health", name: "Saude", description: "Consultas, exames, medicamentos e carteira.", icon: <Activity size={18} />, status: "active" },
  { id: "home", name: "Casa", description: "Lista de mercado compartilhada no WhatsApp.", icon: <ShoppingBag size={18} />, status: "active" },
  { id: "projects", name: "Projetos", description: "Objetivos pessoais e iniciativas.", icon: <Target size={18} />, status: "planned" }
] as const;

const chartColors = {
  conservative: "#2F5D73",
  base: "#b45309",
  optimistic: "#be123c",
  accent: "#0878F9"
};

const commitmentLabels: Record<CommitmentStatus, string> = {
  healthy: "Sob controle",
  moderate: "Moderado",
  high: "Alto",
  critical: "Critico"
};

const commitmentTone = (status: CommitmentStatus): "good" | "warn" | "bad" => {
  if (status === "healthy") return "good";
  if (status === "moderate") return "warn";
  return "bad";
};

const scoreBarTone = (score: number) => (score >= 7.5 ? "good" : score >= 5 ? "warn" : "bad");

const statementRelativeLabels: Record<StatementRelativeMonth, string> = {
  past: "Mes passado",
  previous: "Mes anterior",
  current: "Mes vigente",
  next: "Proxima fatura",
  future: "Fatura futura"
};

const statementMonthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});

type ImportedStatementSummary = NonNullable<FinancialTransaction["statement"]> & {
  source?: string;
  sourceFile?: string;
};

function optionsFrom(record: Record<string, string>) {
  return Object.entries(record).map(([value, label]) => ({ value, label }));
}

const expenseCategoryCache = new WeakMap<ExpenseCategoryConfig[], ExpenseCategoryConfig[]>();

function normalizeExpenseCategories(categories?: ExpenseCategoryConfig[]) {
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

function expenseCategoryOptions(plan: FinancePlan, includeInactive = true) {
  return normalizeExpenseCategories(plan.expenseCategories)
    .filter((category) => includeInactive || category.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
    .map((category) => ({
      value: category.id,
      label: category.isActive ? category.name : `${category.name} (inativa)`,
      color: category.color
    }));
}

function expenseCategoryById(plan: FinancePlan, id: ExpenseCategory) {
  return normalizeExpenseCategories(plan.expenseCategories).find((category) => category.id === id);
}

function expenseCategoryName(plan: FinancePlan, id: ExpenseCategory) {
  return expenseCategoryById(plan, id)?.name ?? labels.category[id as keyof typeof labels.category] ?? id;
}

function expenseCategoryColor(plan: FinancePlan, id: ExpenseCategory) {
  return expenseCategoryById(plan, id)?.color ?? "#6b7280";
}

function CategoryPill({ plan, id }: { plan: FinancePlan; id: ExpenseCategory }) {
  return (
    <span className="category-pill">
      <span className="select-swatch" style={{ backgroundColor: expenseCategoryColor(plan, id) }} />
      <span>{expenseCategoryName(plan, id)}</span>
    </span>
  );
}

function slugifyCategoryId(value: string, categories: ExpenseCategoryConfig[]) {
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

function formatReferenceMonth(referenceMonth: string) {
  const [yearRaw, monthRaw] = referenceMonth.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return referenceMonth;

  const formatted = statementMonthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatStatementLabel(statement: NonNullable<FinancialTransaction["statement"]>) {
  return formatReferenceMonth(statement.referenceMonth);
}

function escapeCsvCell(value: string) {
  if (/[;"\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportTransactionsCsv(plan: FinancePlan, transactions: FinancialTransaction[]) {
  const header = ["Data", "Descricao", "Valor", "Tipo", "Categoria", "Status", "Fatura"];
  const rows = [...transactions]
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
    .map((transaction) => [
      formatDateDisplay(transaction.date),
      transaction.merchant,
      transaction.amount.toFixed(2).replace(".", ","),
      transactionTypeLabels[transaction.type],
      expenseCategoryName(plan, transaction.category),
      isInstallmentForecast(transaction) ? "Previsto" : transaction.reviewed ? "Aprovado" : "Pendente",
      transaction.statement ? formatStatementLabel(transaction.statement) : ""
    ]);
  const csv = [header, ...rows].map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `extrato-${plan.id}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function planIdFromEmail(email: string) {
  const normalized = normalizeEmail(email).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `user-${normalized || "local"}`;
}

function displayNameFromEmail(email: string) {
  const localPart = normalizeEmail(email).split("@")[0] ?? "";
  const words = localPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return "Usuario Zelo";
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function clearLocalAuthCache() {
  localStorage.removeItem(sessionStorageKey);
  localStorage.removeItem(legacySessionStorageKey);
  localStorage.removeItem(authCredentialsStorageKey);
  clearAuthToken();
}

type PendingInviteContext = {
  token: string;
  planId: string;
};

type PlanMembership = {
  sharedPlanId: string;
  personalPlanId: string;
};

function readPendingInviteContext(): PendingInviteContext | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const token = params.get("invite") ?? "";
  const planId = params.get("plan") ?? "";
  if (token) {
    const context = { token, planId };
    sessionStorage.setItem(pendingInviteStorageKey, JSON.stringify(context));
    return context;
  }

  const stored = sessionStorage.getItem(pendingInviteStorageKey);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as PendingInviteContext;
    return parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

function clearPendingInviteContext() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(pendingInviteStorageKey);
}

function readPlanMemberships(): Record<string, PlanMembership> {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem(planMembershipStorageKey);
  if (!stored) return {};

  try {
    return JSON.parse(stored) as Record<string, PlanMembership>;
  } catch {
    return {};
  }
}

function rememberPlanMembership(email: string, sharedPlanId: string, personalPlanId: string) {
  const normalized = normalizeEmail(email);
  const memberships = readPlanMemberships();
  memberships[normalized] = { sharedPlanId, personalPlanId };
  localStorage.setItem(planMembershipStorageKey, JSON.stringify(memberships));
}

function persistSession(session: UserSession) {
  localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

async function persistServerSession(session: UserSession) {
  persistSession(session);
  if (!readAuthToken()) return;
  await apiRequest("/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ planId: session.planId, name: session.name })
  }).catch(() => undefined);
}

function clearInviteFromUrl() {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", window.location.pathname);
}

function planStorageKey(planId: string) {
  return `${planStoragePrefix}:${planId}`;
}

function legacyPlanStorageKey(planId: string) {
  return `${legacyPlanStoragePrefix}:${planId}`;
}

function normalizeAccountLinkPermissions(permissions?: Partial<AccountLink["permissions"]>): AccountLink["permissions"] {
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

function normalizeAccountLink(link: AccountLink): AccountLink {
  return {
    ...link,
    sharedHome: link.sharedHome !== false,
    permissions: normalizeAccountLinkPermissions(link.permissions)
  };
}

function financeAccessFor(link: AccountLink) {
  return (
    normalizeAccountLinkPermissions(link.permissions).modules.find((module) => module.moduleId === financeModuleId) ??
    defaultFinanceModuleAccess("viewer", ["dashboard"])
  );
}

function financeScopeLabels(scopes: string[]) {
  const labelsByScope = new Map(financeScopeOptions.map((scope) => [scope.value, scope.label]));
  return scopes
    .map((scope) => labelsByScope.get(scope as FinanceModuleScope))
    .filter((label): label is string => Boolean(label))
    .join(", ");
}

function isEmptyPlan(plan: FinancePlan) {
  return (
    !plan.onboardingCompleted &&
    plan.incomeSources.length === 0 &&
    plan.assets.length === 0 &&
    plan.transactions.length === 0 &&
    (plan.recurringTransactions ?? []).length === 0
  );
}

function planUpdatedTime(plan: FinancePlan) {
  const updated = Date.parse(plan.updatedAt || plan.createdAt || "");
  return Number.isFinite(updated) ? updated : 0;
}

function mergeCategoryTargets(preferred: BudgetCategoryTarget[], fallback: BudgetCategoryTarget[]) {
  const merged = new Map<string, BudgetCategoryTarget>();
  for (const target of fallback) merged.set(target.category, target);
  for (const target of preferred) merged.set(target.category, target);
  return [...merged.values()];
}

function pickFreshestPlan(remote: FinancePlan, stored: FinancePlan | null) {
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

function parseStoredPlanSnapshot(value: string | null, id: string) {
  if (!value) return null;

  try {
    return normalizePlanForClient({ ...(JSON.parse(value) as FinancePlan), id });
  } catch {
    return null;
  }
}

function withSessionProfile(plan: FinancePlan, session: UserSession | null) {
  if (!session || !isEmptyPlan(plan)) return plan;

  return {
    ...plan,
    profile: {
      ...plan.profile,
      people: plan.profile.people.map((person) =>
        person.role === "primary"
          ? {
              ...person,
              name: person.name || session.name,
              email: person.email || session.email
            }
          : person
      )
    }
  };
}

function findSharedPlanIdForEmail(email: string) {
  const normalized = normalizeEmail(email);
  const membership = readPlanMemberships()[normalized];
  if (membership?.sharedPlanId) return membership.sharedPlanId;
  if (typeof window === "undefined") return undefined;

  const prefix = `${planStoragePrefix}:`;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const planId = key.slice(prefix.length);
    const snapshot = parseStoredPlanSnapshot(localStorage.getItem(key), planId);
    const linked = (snapshot?.profile.accountLinks ?? []).some(
      (link) => link.status === "accepted" && normalizeEmail(link.inviteeEmail ?? "") === normalized
    );
    if (linked) return planId;
  }

  return undefined;
}

function findSessionPerson(plan: FinancePlan, session: UserSession) {
  return findPersonByEmail(plan, session.email);
}

function isLinkedPartner(plan: FinancePlan, session: UserSession) {
  return isLinkedInvitee(plan, session.email);
}

function partnerNeedsOnboarding(plan: FinancePlan, session: UserSession) {
  const person = findSessionPerson(plan, session);
  return Boolean(person && isLinkedPartner(plan, session) && !person.onboardingCompleted);
}

function ensureInviteePerson(plan: FinancePlan, session: UserSession | null) {
  if (!session) return plan;
  const link = findAcceptedAccountLinkForEmail(plan, session.email);
  if (!link || findSessionPerson(plan, session)) return plan;
  return applyAcceptedInvite(plan, link, session).plan;
}

function usesSplitLinkedWorkspace(plan: FinancePlan, session: UserSession | null) {
  return Boolean(
    session?.personalPlanId && session.personalPlanId !== plan.id && isLinkedInvitee(plan, session.email)
  );
}

function inviteEmailMismatch(invite: AccountLink, session: UserSession) {
  return Boolean(invite.inviteeEmail && normalizeEmail(invite.inviteeEmail) !== normalizeEmail(session.email));
}

function sharedSessionForPlan(session: UserSession, planId: string, name?: string): UserSession {
  return {
    ...session,
    planId,
    personalPlanId: session.personalPlanId ?? planIdFromEmail(session.email),
    name: name?.trim() || session.name
  };
}

function applyAcceptedInvite(
  plan: FinancePlan,
  invite: AccountLink,
  session: UserSession,
  profile?: { name?: string; age?: number }
) {
  const existingPerson = plan.profile.people.find((person) => normalizeEmail(person.email ?? "") === normalizeEmail(session.email));
  const personId = invite.inviteePersonId ?? existingPerson?.id ?? uid("person");
  const acceptedAt = invite.acceptedAt ?? new Date().toISOString();
  const inviteSplit = invite.expenseSplit ?? {
    primaryPercent: 50,
    partnerPercent: 50
  };
  const nextPerson: Person = {
    id: personId,
    name: profile?.name?.trim() || invite.inviteeName || existingPerson?.name || session.name || "Conta vinculada",
    email: session.email,
    age: profile?.age || existingPerson?.age,
    birthDate: existingPerson?.birthDate,
    role: "partner",
    accountStatus: "linked",
    onboardingCompleted: existingPerson?.onboardingCompleted ?? false
  };

  const people = plan.profile.people.some((person) => person.id === personId)
    ? plan.profile.people.map((person) => (person.id === personId ? { ...person, ...nextPerson } : person))
    : [...plan.profile.people, nextPerson];

  const nextPlan: FinancePlan = {
    ...plan,
    profile: {
      ...plan.profile,
      people,
      sharing: {
        ...plan.profile.sharing,
        sharedAccounts: invite.sharedAccounts ?? true,
        expenseSplit: {
          primaryPercent: inviteSplit.primaryPercent,
          partnerPercent: inviteSplit.partnerPercent
        }
      },
      accountLinks: (plan.profile.accountLinks ?? []).map((link) =>
        link.id === invite.id
          ? {
              ...link,
              status: "accepted",
              inviteePersonId: personId,
              inviteeName: nextPerson.name,
              inviteeEmail: nextPerson.email,
              acceptedAt
            }
          : link
      )
    }
  };

  return {
    plan: nextPlan,
    person: nextPerson,
    session: sharedSessionForPlan(session, plan.id, nextPerson.name)
  };
}

function updateById<T extends { id: string }>(items: T[], id: string, patch: Partial<T>) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function removeById<T extends { id: string }>(items: T[], id: string) {
  return items.filter((item) => item.id !== id);
}

function upsertPrimaryGoal(goals: Goal[], targetValue: number) {
  const primaryGoal = goals.find((goal) => goal.isPrimary) ?? goals[0];

  if (!primaryGoal) {
    return [
      {
        id: uid("goal"),
        name: "Meta principal",
        targetValue,
        currentValue: 0,
        priority: 5,
        inflationAdjusted: false,
        eligibleAssetCategories: [],
        isPrimary: true
      }
    ];
  }

  return goals.map((goal) =>
    goal.id === primaryGoal.id
      ? {
          ...goal,
          name: goal.name || "Meta principal",
          targetValue,
          priority: Math.max(goal.priority, 5),
          isPrimary: true
        }
      : {
          ...goal,
          isPrimary: false
        }
  );
}

function clearSharingMetadata<T extends object>(item: T): T {
  const { visibility: _visibility, linkedOwnerIds: _linkedOwnerIds, ...cleanItem } = item as T & {
    visibility?: string;
    linkedOwnerIds?: string[];
  };

  return cleanItem as T;
}

function isIgnoredImportedReceipt(transaction: FinancialTransaction) {
  return (
    (transaction.source === "csv" || transaction.source === "pdf") &&
    /pagamento recebido|cr[eé]dito de|estorno|iof de volta/i.test(`${transaction.merchant} ${transaction.description ?? ""}`)
  );
}

function normalizeInstallmentText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function installmentAmountBucket(value: number) {
  return Math.round(Math.abs(value));
}

function parseInstallmentFromMerchant(merchant: string) {
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

function isInstallmentForecast(transaction: FinancialTransaction) {
  return transaction.forecast?.kind === "installment";
}

function installmentBaseMerchant(transaction: FinancialTransaction) {
  return parseInstallmentFromMerchant(transaction.merchant)?.baseMerchant ?? transaction.description ?? transaction.merchant;
}

function installmentOccurrenceKey(transaction: FinancialTransaction) {
  if (!transaction.installment) return "";
  return [
    normalizeInstallmentText(installmentBaseMerchant(transaction)),
    transaction.installment.current,
    transaction.installment.total,
    installmentAmountBucket(transaction.amount)
  ].join("|");
}

function installmentChainKey(transaction: FinancialTransaction) {
  if (!transaction.installment) return "";
  return [normalizeInstallmentText(installmentBaseMerchant(transaction)), transaction.installment.total, installmentAmountBucket(transaction.amount)].join("|");
}

function addMonthsToIsoDate(value: string, amount: number) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const firstDay = new Date(parsed.getFullYear(), parsed.getMonth() + amount, 1, 12);
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();
  const day = Math.min(parsed.getDate(), lastDay);
  return new Date(firstDay.getFullYear(), firstDay.getMonth(), day, 12).toISOString();
}

function installmentForecastId(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return `tx-forecast-${hash.toString(16).padStart(8, "0")}`;
}

function forecastStatementMonth(transaction: FinancialTransaction, offset: number) {
  const baseMonth = transaction.statement?.referenceMonth ?? toDateInput(transaction.date).slice(0, 7);
  return addMonthKey(baseMonth, offset);
}

function reconcileInstallmentForecastsForClient(transactions: FinancialTransaction[]) {
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
      const key = [
        normalizeInstallmentText(baseMerchant),
        current,
        total,
        installmentAmountBucket(transaction.amount)
      ].join("|");
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

function statementRelativeMonthForClient(referenceMonth: string, asOf = new Date()): StatementRelativeMonth {
  const [yearRaw, monthRaw] = referenceMonth.split("-");
  const referenceIndex = Number(yearRaw) * 12 + Number(monthRaw);
  const currentIndex = asOf.getFullYear() * 12 + asOf.getMonth() + 1;
  const diff = referenceIndex - currentIndex;

  if (diff === 0) return "current";
  if (diff === -1) return "previous";
  if (diff === 1) return "next";
  return diff < 0 ? "past" : "future";
}

function normalizePlanForClient(plan: FinancePlan): FinancePlan {
  const unified = unifyShoppingCategories(plan);
  const workspace = {
    ...defaultLifeWorkspace(unified.id),
    ...(unified.workspace ?? {}),
    modules: mergeWorkspaceModules(unified.workspace?.modules)
  };
  const expenseCategories = normalizeExpenseCategories(unified.expenseCategories);
  const accountLinks = (unified.profile.accountLinks ?? []).map(normalizeAccountLink);
  const acceptedLinkedPeople = new Set(
    accountLinks
      .filter((link) => link.status === "accepted" && link.inviteePersonId)
      .map((link) => link.inviteePersonId)
  );
  const people = unified.profile.people.filter(
    (person) => person.role === "primary" || person.accountStatus === "linked" || acceptedLinkedPeople.has(person.id)
  );
  const validOwnerIds = new Set(people.map((person) => person.id));
  // keep a marker so the return wrap is unique — actually don't do this
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

function readInitialView(): View {
  if (typeof window === "undefined") return "dashboard";
  const routine = new URLSearchParams(window.location.search).get("routine");
  if (routine === "home" || routine === "agenda") return "routine-agenda";
  if (routine === "tasks") return "routine-tasks";
  if (routine === "contexts") return "routine-contexts";
  if (routine === "calendars") return "routine-calendars";
  const health = new URLSearchParams(window.location.search).get("health");
  if (health === "home") return "health-home";
  if (health === "wallet") return "health-wallet";
  if (health === "appointments") return "health-appointments";
  if (health === "meds") return "health-meds";
  const home = new URLSearchParams(window.location.search).get("home");
  if (home === "list" || home === "mercado") return "home-list";
  if (new URLSearchParams(window.location.search).get("profile")) return "profile";
  return "dashboard";
}

export default function App() {
  const [plan, setPlan] = useState<FinancePlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [view, setView] = useState<View>(readInitialView);
  const [session, setSession] = useState<UserSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [inviteToken, setInviteToken] = useState(() => readPendingInviteContext()?.token ?? "");
  const [invitePlanId, setInvitePlanId] = useState(() => readPendingInviteContext()?.planId ?? "");
  const sessionRef = useRef(session);
  const autoLinkedInviteRef = useRef("");
  const allowSaveRef = useRef(false);
  const planRef = useRef(plan);
  const sharedPlanSnapshotRef = useRef<FinancePlan | null>(null);
  const personalPlanSnapshotRef = useRef<FinancePlan | null>(null);
  sessionRef.current = session;
  planRef.current = plan;
  const activePlanId = invitePlanId || session?.planId || (inviteToken ? "primary" : "");

  const signOut = () => {
    void apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearLocalAuthCache();
    setSession(null);
    setPlan(null);
    setLoaded(true);
    setAuthReady(true);
  };

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const token = readAuthToken();
      if (!token) {
        localStorage.removeItem(sessionStorageKey);
        localStorage.removeItem(legacySessionStorageKey);
        localStorage.removeItem(authCredentialsStorageKey);
        if (active) {
          setSession(null);
          setAuthReady(true);
        }
        return;
      }

      try {
        const response = await apiRequest("/auth/me");
        if (!response.ok) throw new Error("Sessao invalida");
        const payload = (await response.json()) as { session?: UserSession };
        if (!payload.session) throw new Error("Sessao invalida");
        if (active) {
          persistSession(payload.session);
          setSession(payload.session);
        }
      } catch {
        clearLocalAuthCache();
        if (active) setSession(null);
      } finally {
        if (active) setAuthReady(true);
      }
    }

    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadPlan() {
      if (!activePlanId) {
        setLoaded(true);
        return;
      }

      setLoaded(false);
      setPlan(null);
      allowSaveRef.current = false;

      try {
        const response = await apiRequest(`/plans/${activePlanId}`);
        if (!response.ok) throw new Error("API indisponivel");
        let remote = normalizePlanForClient((await response.json()) as FinancePlan);
        const storedUserPlan = parseStoredPlanSnapshot(
          localStorage.getItem(planStorageKey(activePlanId)) ?? localStorage.getItem(legacyPlanStorageKey(activePlanId)),
          activePlanId
        );
        const storedLegacyPlan = parseStoredPlanSnapshot(localStorage.getItem(legacyPlanStoragePrefix), activePlanId);

        if (storedUserPlan) {
          remote = pickFreshestPlan(remote, storedUserPlan);
        } else if (isEmptyPlan(remote) && storedLegacyPlan) {
          remote = storedLegacyPlan;
        }

        const currentSession = sessionRef.current;
        remote = ensureInviteePerson(remote, currentSession);
        sharedPlanSnapshotRef.current = remote;
        personalPlanSnapshotRef.current = null;

        if (
          currentSession?.personalPlanId &&
          currentSession.personalPlanId !== activePlanId &&
          isLinkedInvitee(remote, currentSession.email)
        ) {
          const personalResponse = await apiRequest(`/plans/${currentSession.personalPlanId}`);
          if (personalResponse.ok) {
            const personal = stripHostLifeFromPersonal(
              normalizePlanForClient((await personalResponse.json()) as FinancePlan),
              remote
            );
            personalPlanSnapshotRef.current = personal;
            remote = overlayPersonalLifeModules(remote, personal, currentSession.email);
          }
        }

        if (active) {
          setPlan(withSessionProfile(remote, currentSession));
          setSaveState("saved");
        }
      } catch {
        const stored =
          localStorage.getItem(planStorageKey(activePlanId)) ??
          localStorage.getItem(legacyPlanStorageKey(activePlanId)) ??
          localStorage.getItem(legacyPlanStoragePrefix);
        if (active) {
          const fallbackPlan = parseStoredPlanSnapshot(stored, activePlanId) ?? createEmptyPlan(activePlanId);
          setPlan(withSessionProfile(fallbackPlan, sessionRef.current));
          setSaveState("offline");
        }
      } finally {
        if (active) setLoaded(true);
      }
    }

    loadPlan();
    return () => {
      active = false;
    };
  }, [activePlanId, session?.email, session?.personalPlanId]);

  useEffect(() => {
    if (!loaded || !plan || !activePlanId) return;

    if (!allowSaveRef.current) {
      const unlock = window.setTimeout(() => {
        allowSaveRef.current = true;
      }, 0);
      return () => window.clearTimeout(unlock);
    }

    setSaveState((current) => (current === "offline" ? "offline" : "saving"));

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const normalizedPlan = normalizePlanForClient(plan);
      localStorage.setItem(planStorageKey(activePlanId), JSON.stringify(normalizedPlan));
      const currentSession = sessionRef.current;

      try {
        if (
          currentSession &&
          usesSplitLinkedWorkspace(sharedPlanSnapshotRef.current ?? normalizedPlan, currentSession) &&
          sharedPlanSnapshotRef.current &&
          personalPlanSnapshotRef.current
        ) {
          const sharedToSave = sharedPlanFromComposed(
            normalizedPlan,
            sharedPlanSnapshotRef.current,
            currentSession.email
          );
          const personalToSave = personalLifeModulesFromComposed(
            normalizedPlan,
            personalPlanSnapshotRef.current,
            currentSession.email,
            sharedPlanSnapshotRef.current
          );
          const [sharedResponse, personalResponse] = await Promise.all([
            apiRequest(`/plans/${activePlanId}`, {
              method: "PUT",
              body: JSON.stringify(sharedToSave),
              signal: controller.signal
            }),
            apiRequest(`/plans/${currentSession.personalPlanId}`, {
              method: "PUT",
              body: JSON.stringify(personalToSave),
              signal: controller.signal
            })
          ]);
          if (!sharedResponse.ok || !personalResponse.ok) throw new Error("Falha ao salvar");
          sharedPlanSnapshotRef.current = sharedToSave;
          personalPlanSnapshotRef.current = personalToSave;
        } else {
          const response = await apiRequest(`/plans/${activePlanId}`, {
            method: "PUT",
            body: JSON.stringify(normalizedPlan),
            signal: controller.signal
          });
          if (!response.ok) throw new Error("Falha ao salvar");
          sharedPlanSnapshotRef.current = normalizedPlan;
        }

        setSaveState("saved");
      } catch {
        if (!controller.signal.aborted) setSaveState("offline");
      }
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activePlanId, loaded, plan]);

  useEffect(() => {
    if (!activePlanId) return;

    const flushPlan = () => {
      const current = planRef.current;
      if (!current) return;
      const normalizedPlan = normalizePlanForClient(current);
      localStorage.setItem(planStorageKey(activePlanId), JSON.stringify(normalizedPlan));
      const currentSession = sessionRef.current;
      if (
        currentSession &&
        usesSplitLinkedWorkspace(sharedPlanSnapshotRef.current ?? normalizedPlan, currentSession) &&
        sharedPlanSnapshotRef.current &&
        personalPlanSnapshotRef.current
      ) {
        const sharedToSave = sharedPlanFromComposed(
          normalizedPlan,
          sharedPlanSnapshotRef.current,
          currentSession.email
        );
        const personalToSave = personalLifeModulesFromComposed(
          normalizedPlan,
          personalPlanSnapshotRef.current,
          currentSession.email,
          sharedPlanSnapshotRef.current
        );
        void apiRequest(`/plans/${activePlanId}`, {
          method: "PUT",
          body: JSON.stringify(sharedToSave),
          keepalive: true
        }).catch(() => undefined);
        void apiRequest(`/plans/${currentSession.personalPlanId}`, {
          method: "PUT",
          body: JSON.stringify(personalToSave),
          keepalive: true
        }).catch(() => undefined);
        return;
      }
      void apiRequest(`/plans/${activePlanId}`, {
        method: "PUT",
        body: JSON.stringify(normalizedPlan),
        keepalive: true
      }).catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushPlan();
    };

    window.addEventListener("pagehide", flushPlan);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushPlan);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activePlanId]);

  const analysisRef = useRef<FinancialAnalysis | null>(null);
  const analysis = useMemo(() => {
    if (!plan) return null;
    const needsLiveAnalysis =
      !plan.onboardingCompleted || view === "dashboard" || view === "categories" || view === "history";
    if (!needsLiveAnalysis && analysisRef.current) return analysisRef.current;
    const next = analyzePlan(plan);
    analysisRef.current = next;
    return next;
  }, [plan, view]);
  const inviteByToken = inviteToken
    ? (plan?.profile.accountLinks ?? []).find((link) => link.token === inviteToken)
    : undefined;
  const pendingInvite = inviteByToken?.status === "pending" ? inviteByToken : undefined;

  useEffect(() => {
    if (!plan || !session || !pendingInvite) return;
    if (inviteEmailMismatch(pendingInvite, session)) return;
    const linkKey = `${pendingInvite.token}:${normalizeEmail(session.email)}`;
    if (autoLinkedInviteRef.current === linkKey) return;

    autoLinkedInviteRef.current = linkKey;
    const accepted = applyAcceptedInvite(plan, pendingInvite, session);
    rememberPlanMembership(session.email, accepted.session.planId, accepted.session.personalPlanId ?? accepted.session.userId);
    sharedPlanSnapshotRef.current = accepted.plan;
    void persistServerSession(accepted.session);
    void apiRequest(`/plans/${accepted.plan.id}`, {
      method: "PUT",
      body: JSON.stringify(normalizePlanForClient(accepted.plan))
    }).catch(() => undefined);
    setPlan(accepted.plan);
    setSession(accepted.session);
    clearPendingInviteContext();
    clearInviteFromUrl();
    setInviteToken("");
    setInvitePlanId(accepted.session.planId);
  }, [plan, session, pendingInvite]);

  useEffect(() => {
    if (!plan || !session || !inviteByToken || inviteByToken.status !== "accepted") return;
    if (inviteEmailMismatch(inviteByToken, session)) return;
    rememberPlanMembership(session.email, plan.id, session.personalPlanId ?? planIdFromEmail(session.email));
    const nextSession = sharedSessionForPlan(session, plan.id);
    if (nextSession.planId !== session.planId || nextSession.personalPlanId !== session.personalPlanId) {
      void persistServerSession(nextSession);
      setSession(nextSession);
    }
    clearPendingInviteContext();
    clearInviteFromUrl();
    setInviteToken("");
    setInvitePlanId(plan.id);
  }, [inviteByToken, plan, session]);

  useEffect(() => {
    if (!plan || !session || !isLinkedPartner(plan, session)) return;
    const person = findSessionPerson(plan, session);
    const nextName = person?.name?.trim();
    if (!nextName || nextName === session.name) return;
    const namedSession = { ...session, name: nextName };
    persistSession(namedSession);
    void persistServerSession(namedSession);
    setSession(namedSession);
  }, [plan, session]);

  if (!authReady) return <LoadingScreen />;

  if (inviteToken && !session && (!plan || !analysis)) return <LoadingScreen />;

  if (!session) {
    return (
      <AuthScreen
        initialEmail={pendingInvite?.inviteeEmail ?? inviteByToken?.inviteeEmail ?? ""}
        initialName={pendingInvite?.inviteeName ?? inviteByToken?.inviteeName ?? ""}
        inviteMode={Boolean(inviteToken)}
        lockEmail={Boolean(pendingInvite?.inviteeEmail || inviteByToken?.inviteeEmail)}
        onAuthenticated={(nextSession, token) => {
          writeAuthToken(token);
          localStorage.removeItem(authCredentialsStorageKey);
          const personalPlanId = nextSession.personalPlanId ?? nextSession.userId;
          const sessionForContext =
            inviteToken && (invitePlanId || activePlanId)
              ? { ...nextSession, personalPlanId, planId: invitePlanId || activePlanId }
              : nextSession;
          persistSession(sessionForContext);
          if (sessionForContext.planId !== nextSession.planId) {
            void persistServerSession(sessionForContext);
          }
          setSession(sessionForContext);
        }}
      />
    );
  }

  if (!plan || !analysis) return <LoadingScreen />;

  if (inviteToken && pendingInvite && inviteEmailMismatch(pendingInvite, session)) {
    return <InviteBlocked invite={pendingInvite} session={session} onSignOut={signOut} />;
  }

  if (inviteToken && pendingInvite && !findSessionPerson(plan, session)) {
    return <LoadingScreen />;
  }

  if (inviteToken && inviteByToken?.status === "revoked") {
    return (
      <InviteIssue
        title="Este convite foi revogado"
        description="Peca um novo link para a pessoa que compartilhou o Financeiro com voce."
        onSignOut={signOut}
      />
    );
  }

  if (inviteToken && !inviteByToken) {
    return (
      <InviteIssue
        title="Convite invalido"
        description="Esse link nao foi encontrado neste plano. Confira se o endereco esta completo ou peca um novo convite."
        onSignOut={signOut}
      />
    );
  }

  const sessionPerson = findSessionPerson(plan, session);
  if (sessionPerson && partnerNeedsOnboarding(plan, session)) {
    return (
      <PartnerOnboarding
        plan={plan}
        setPlan={setPlan}
        saveState={saveState}
        person={sessionPerson}
        session={session}
        onSignOut={signOut}
      />
    );
  }

  if (!plan.onboardingCompleted && !isLinkedPartner(plan, session)) {
    return <Onboarding plan={plan} setPlan={setPlan} analysis={analysis} saveState={saveState} session={session} onSignOut={signOut} />;
  }

  return (
    <Shell
      plan={plan}
      setPlan={setPlan}
      analysis={analysis}
      saveState={saveState}
      view={view}
      setView={setView}
      session={session}
      setSession={setSession}
      onSignOut={signOut}
    />
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <Mascot mood="think" size="xl" />
      <span>Organizando...</span>
    </main>
  );
}

function AuthScreen({
  onAuthenticated,
  initialEmail = "",
  initialName = "",
  inviteMode = false,
  lockEmail = false
}: {
  onAuthenticated: (session: UserSession, token: string) => void;
  initialEmail?: string;
  initialName?: string;
  inviteMode?: boolean;
  lockEmail?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "signup">(inviteMode && initialName ? "signup" : "login");
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mascotMood, setMascotMood] = useState<MascotMood>("wave");
  const isNewAccount = mode === "signup";

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const timer = window.setTimeout(() => setMascotMood("celebrate"), 2400);
    const loop = window.setInterval(() => {
      setMascotMood((current) => (current === "wave" ? "celebrate" : "wave"));
    }, 5200);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(loop);
    };
  }, []);

  const submit = async () => {
    const normalizedEmail = normalizeEmail(email);

    if (mode === "signup" && name.trim().length < 2) {
      setError("Informe seu nome para criar a conta.");
      return;
    }

    if (!normalizedEmail.includes("@") || password.length < 6) {
      setError("Informe e-mail valido e senha com pelo menos 6 caracteres.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await apiRequest(mode === "signup" ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || displayNameFromEmail(normalizedEmail),
          email: normalizedEmail,
          password,
          phone: phone.trim() || undefined
        })
      });
      const payload = (await response.json()) as { error?: string; token?: string; session?: UserSession };
      if (!response.ok || !payload.token || !payload.session) {
        if (mode === "signup" && response.status === 409) setMode("login");
        setError(payload.error || "Nao foi possivel autenticar.");
        return;
      }

      onAuthenticated(payload.session, payload.token);
    } catch {
      setError("Nao foi possivel falar com o servidor. Tente de novo em instantes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-landing">
      <section className="auth-landing-hero">
        <BrandLockup title={appName} caption="Cuide da vida em um so lugar" mood="wave" />
        <div className="auth-landing-stage">
          <span className="auth-blob auth-blob-a" />
          <span className="auth-blob auth-blob-b" />
          <span className="auth-blob auth-blob-c" />
          <span className="auth-spark auth-spark-a" />
          <span className="auth-spark auth-spark-b" />
          <span className="auth-spark auth-spark-c" />
        </div>
        <div className="auth-landing-copy">
          <p className="auth-landing-kicker">Oi. Eu sou o Zelo.</p>
          <h1>Cuide da vida em um so lugar</h1>
          <p>Financas, mercado, agenda, lembretes e o que for compartilhado.</p>
        </div>
      </section>

      <section className="auth-landing-panel">
        <form
          className="auth-card"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="auth-card-head">
            <div className="auth-card-badge">
              <Mascot mood={mascotMood} size="sm" title="Zelo" />
              <span>
                {inviteMode
                  ? "Convite Zelo"
                  : mode === "login"
                    ? "Bem-vindo de volta"
                    : "Vamos comecar juntos"}
              </span>
            </div>
            <h1>
              {inviteMode
                ? isNewAccount
                  ? "Criar conta para entrar no convite"
                  : "Entrar para aceitar o convite"
                : mode === "login"
                  ? "Entrar"
                  : "Cadastrar"}
            </h1>
            <p>
              {inviteMode
                ? isNewAccount
                  ? "Cadastre-se com o e-mail do convite. Ao continuar, sua conta e vinculada automaticamente. Se o mercado foi compartilhado, a lista da Casa tambem aparece pra voce."
                  : "Entre com sua senha. Sua conta sera vinculada automaticamente a esta conta compartilhada."
                : mode === "login"
                  ? "A conta fica no servidor. Entre com e-mail e senha de qualquer navegador."
                  : "Crie a conta no servidor. Se este e-mail ja tinha dados, eles continuam no mesmo plano."}
            </p>
          </div>
          {!inviteMode && (
            <div className="auth-mode-toggle" role="tablist" aria-label="Tipo de acesso">
              <button
                type="button"
                className={mode === "login" ? "active" : ""}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                Entrar
              </button>
              <button
                type="button"
                className={mode === "signup" ? "active" : ""}
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
              >
                Cadastrar
              </button>
            </div>
          )}
          <div className="form-grid single">
            {mode === "signup" && <TextField label="Seu nome" value={name} onChange={setName} />}
            {mode === "signup" && (
              <TextField label="WhatsApp com DDD" value={phone} onChange={setPhone} type="tel" autoComplete="tel" />
            )}
            {mode === "signup" && (
              <p className="form-note">
                Depois a gente confirma este numero no WhatsApp. So assim a secretaria liga gastos e reunioes a voce.
              </p>
            )}
            {lockEmail ? (
              <ReadOnlyField label="E-mail do convite" value={email} />
            ) : (
              <TextField label="E-mail" value={email} onChange={setEmail} type="email" autoComplete="email" />
            )}
            <TextField
              label="Senha"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {error && <p className="form-note warn">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />}
            {inviteMode ? (isNewAccount ? "Criar conta e vincular" : "Entrar e vincular") : mode === "login" ? "Entrar" : "Comecar cadastro"}
          </button>
          {!inviteMode && (
            <button
              className="auth-switch-link"
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Ainda nao tenho conta. Quero cadastrar" : "Ja tenho conta. Quero entrar"}
            </button>
          )}
        </form>
      </section>
    </main>
  );
}

function InviteBlocked({
  invite,
  session,
  onSignOut
}: {
  invite: AccountLink;
  session: UserSession;
  onSignOut: () => void;
}) {
  return (
    <main className="invite-accept-shell">
      <section className="invite-accept-card">
        <BrandLockup title={appName} caption="Convite de modulo" mood="think" />
        <div>
          <h1>Este convite e de outro e-mail</h1>
          <p>
            Voce entrou como {session.email}, mas o convite foi criado para {invite.inviteeEmail}. Saia e entre com o e-mail
            correto para vincular as contas.
          </p>
        </div>
        <button className="primary-button" onClick={onSignOut}>
          <Users size={16} /> Trocar de conta
        </button>
      </section>
    </main>
  );
}

function InviteIssue({
  title,
  description,
  onSignOut
}: {
  title: string;
  description: string;
  onSignOut: () => void;
}) {
  return (
    <main className="invite-accept-shell">
      <section className="invite-accept-card">
        <BrandLockup title={appName} caption="Convite de modulo" mood="think" />
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button className="primary-button" onClick={onSignOut}>
          <Users size={16} /> Voltar ao inicio
        </button>
      </section>
    </main>
  );
}

function Onboarding({
  plan,
  setPlan,
  analysis,
  saveState,
  session,
  onSignOut
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  analysis: FinancialAnalysis;
  saveState: SaveState;
  session: UserSession;
  onSignOut: () => void;
}) {
  const [step, setStep] = useState(0);
  const steps = ["Perfil", "Rendas", "Patrimonio", "Dividas", "Objetivos", "Diagnostico"];

  const complete = () => {
    setPlan((current) => (current ? { ...current, onboardingCompleted: true } : current));
  };

  return (
    <main className="onboarding-shell">
      <aside className="onboarding-aside">
        <BrandLockup title={appName} caption="Modulo financeiro" />
        <div className="consulting-panel">
          <Mascot mood="wave" size="md" />
          <div className="consulting-panel-copy">
            <h1>Vamos entender sua vida financeira</h1>
            <p>O diagnostico nasce dos seus dados e muda junto com eles.</p>
          </div>
        </div>
        <ol className="step-list">
          {steps.map((label, index) => (
            <li key={label} className={index === step ? "active" : index < step ? "done" : ""}>
              <span>{index < step ? <Check size={14} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <button className="onboarding-login-button" type="button" onClick={onSignOut}>
          <LogIn size={16} />
          <span>
            <strong>Ja tenho conta</strong>
            <em>Entrar com e-mail e senha</em>
          </span>
        </button>
      </aside>

      <section className="onboarding-content">
        <div className="onboarding-content-header">
          <StatusPill saveState={saveState} />
          <button className="onboarding-switch-link" type="button" onClick={onSignOut}>
            Ja tenho conta. Quero entrar
          </button>
        </div>
        {step === 0 && (
          <p className="onboarding-account-note">
            Voce esta comecando um cadastro novo{session.email ? ` como ${session.email}` : ""}. Se ja tinha uma conta Zelo,
            entre com o mesmo e-mail e senha para recuperar seus dados.
          </p>
        )}
        {step === 0 && <ProfileStep plan={plan} setPlan={setPlan} />}
        {step === 1 && <IncomeEditor plan={plan} setPlan={setPlan} compact />}
        {step === 2 && <AssetEditor plan={plan} setPlan={setPlan} compact />}
        {step === 3 && <DebtEditor plan={plan} setPlan={setPlan} compact />}
        {step === 4 && <GoalEditor plan={plan} setPlan={setPlan} compact />}
        {step === 5 && <DiagnosticPreview plan={plan} analysis={analysis} />}

        <div className="wizard-actions">
          <button className="secondary-button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
            Voltar
          </button>
          {step < steps.length - 1 ? (
            <button className="primary-button" onClick={() => setStep((current) => current + 1)}>
              Avancar <ArrowRight size={16} />
            </button>
          ) : (
            <button className="primary-button" onClick={complete}>
              Abrir dashboard <ArrowRight size={16} />
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function PartnerOnboarding({
  plan,
  setPlan,
  saveState,
  person,
  session,
  onSignOut
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  saveState: SaveState;
  person: Person;
  session: UserSession;
  onSignOut: () => void;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const existingAssetIds = useRef(new Set(plan.assets.map((asset) => asset.id)));
  const steps = ["Seu perfil", "Sua renda", "Seu patrimonio"];
  const host = plan.profile.people.find((item) => item.role === "primary");
  const currentPerson = plan.profile.people.find((item) => item.id === person.id) ?? person;
  const ownIncomes = plan.incomeSources.filter((income) => income.ownerId === currentPerson.id);
  const hasValidIncome = ownIncomes.some((income) => income.name.trim().length > 1 && income.netAmount > 0);
  const profileReady = currentPerson.name.trim().length > 1 && (currentPerson.age ?? 0) > 0;

  const updatePerson = (patch: Partial<Person>) => {
    setPlan((current) =>
      current
        ? {
            ...current,
            profile: {
              ...current.profile,
              people: current.profile.people.map((item) => (item.id === currentPerson.id ? { ...item, ...patch } : item))
            }
          }
        : current
    );
  };

  const goNext = () => {
    if (step === 0 && !profileReady) {
      setError("Preencha seu nome e idade para continuar. Esses dados identificam voce no plano compartilhado.");
      return;
    }
    if (step === 1 && !hasValidIncome) {
      setError("Cadastre pelo menos uma renda sua com nome e valor liquido maior que zero.");
      return;
    }
    setError("");
    setStep((current) => current + 1);
  };

  const complete = () => {
    if (!profileReady || !hasValidIncome) {
      setError("Nome, idade e pelo menos uma renda sua sao obrigatorios para entrar no dashboard.");
      setStep(!profileReady ? 0 : 1);
      return;
    }

    setPlan((current) =>
      current
        ? {
            ...current,
            profile: {
              ...current.profile,
              people: current.profile.people.map((item) =>
                item.id === currentPerson.id ? { ...item, onboardingCompleted: true } : item
              )
            }
          }
        : current
    );
  };

  return (
    <main className="onboarding-shell">
      <aside className="onboarding-aside">
        <BrandLockup title={appName} caption="Conta vinculada" />
        <div className="consulting-panel">
          <Mascot mood="wave" size="md" />
          <div className="consulting-panel-copy">
            <h1>Agora cadastre os seus dados</h1>
            <p>
              Voce e {currentPerson.name || session.name}, uma pessoa apartada de {host?.name || "quem te convidou"}.
              O plano e compartilhado, mas renda e cadastro sao os seus.
            </p>
          </div>
        </div>
        <ol className="step-list">
          {steps.map((label, index) => (
            <li key={label} className={index === step ? "active" : index < step ? "done" : ""}>
              <span>{index < step ? <Check size={14} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <button className="onboarding-login-button" type="button" onClick={onSignOut}>
          <LogIn size={16} />
          <span>
            <strong>Entrar com outra conta</strong>
            <em>Sair e trocar de e-mail</em>
          </span>
        </button>
      </aside>

      <section className="onboarding-content">
        <div className="onboarding-content-header">
          <StatusPill saveState={saveState} />
          <button className="onboarding-switch-link" type="button" onClick={onSignOut}>
            Entrar com outra conta
          </button>
        </div>
        <p className="partner-onboarding-note">
          Conta {session.email} vinculada a {host?.name || "outra pessoa"}. Preencha somente o que e seu
          {canAccessSharedHome(plan, session.email) ? ", inclusive a lista de mercado compartilhada" : ""}.
        </p>
        {step === 0 && (
          <EditorSection title="Seu perfil" icon={<BadgeDollarSign size={18} />}>
            <div className="form-grid">
              <TextField label="Seu nome" value={currentPerson.name} onChange={(name) => updatePerson({ name })} />
              <NumberField label="Sua idade" value={currentPerson.age ?? 0} onChange={(age) => updatePerson({ age })} />
              <DateField label="Data de nascimento" value={currentPerson.birthDate} onChange={(birthDate) => updatePerson({ birthDate })} />
              <WhatsAppPhoneField
                personId={currentPerson.id}
                phone={currentPerson.phone ?? ""}
                verifiedAt={currentPerson.whatsappVerifiedAt}
                onPhoneChange={(phone, verifiedAt) => updatePerson({ phone, whatsappVerifiedAt: verifiedAt })}
              />
              <ReadOnlyField label="E-mail da sua conta" value={session.email} />
            </div>
          </EditorSection>
        )}
        {step === 1 && <IncomeEditor plan={plan} setPlan={setPlan} compact lockedOwnerId={currentPerson.id} />}
        {step === 2 && (
          <>
            <p className="form-note">
              Opcional: cadastre ativos que sao seus. O patrimonio de {host?.name || "quem te convidou"} continua separado.
            </p>
            <AssetEditor plan={plan} setPlan={setPlan} compact excludeAssetIds={existingAssetIds.current} />
          </>
        )}

        {error && <p className="form-note warn">{error}</p>}
        <div className="wizard-actions">
          <button className="secondary-button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
            Voltar
          </button>
          {step < steps.length - 1 ? (
            <button className="primary-button" onClick={goNext}>
              Avancar <ArrowRight size={16} />
            </button>
          ) : (
            <button className="primary-button" onClick={complete}>
              Entrar no dashboard <ArrowRight size={16} />
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function Shell({
  plan,
  setPlan,
  analysis,
  saveState,
  view,
  setView,
  session,
  setSession,
  onSignOut
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  analysis: FinancialAnalysis;
  saveState: SaveState;
  view: View;
  setView: (view: View) => void;
  session: UserSession | null;
  setSession: Dispatch<SetStateAction<UserSession | null>>;
  onSignOut: () => void;
}) {
  const [financeMenuOpen, setFinanceMenuOpen] = useState(true);
  const [secretaryMenuOpen, setSecretaryMenuOpen] = useState(true);
  const [routineMenuOpen, setRoutineMenuOpen] = useState(true);
  const [healthMenuOpen, setHealthMenuOpen] = useState(true);
  const [homeMenuOpen, setHomeMenuOpen] = useState(true);
  const canAccessHome = !session || canAccessSharedHome(plan, session.email);
  const visibleModules = moduleCatalog.filter((module) => module.id !== "home" || canAccessHome);
  const currentUserName = session ? sessionDisplayName(plan, session.email, session.name) : plan.profile.people[0]?.name || "Espaco pessoal";
  const hostName = plan.profile.people.find((person) => person.role === "primary")?.name;
  const linked = Boolean(session && isLinkedPartner(plan, session));
  const isAdmin = Boolean(session && isWorkspaceAdmin(plan, session.email, session.personalPlanId));
  const lifePlanId = session ? lifeModulePlanId(plan, session.email, session.personalPlanId) : plan.id;
  const sessionPerson = session ? findSessionPerson(plan, session) : undefined;
  const shoppingActor: ShoppingActor | undefined = session
    ? (() => {
        const person = findSessionPerson(plan, session);
        return person ? { personId: person.id, name: person.name } : { name: session.name };
      })()
    : undefined;
  const activeModule =
    view === "profile"
      ? ""
      : secretaryViews.has(view)
        ? "secretary"
        : routineViews.has(view)
          ? "routine"
          : healthViews.has(view)
            ? "health"
            : homeViews.has(view)
              ? "home"
              : "finance";

  useEffect(() => {
    if (!canAccessHome && homeViews.has(view)) setView("dashboard");
    if (isAdmin) return;
    if (view === "access") setView("dashboard");
    if (view === "secretary-whatsapp" || view === "secretary-settings") setView("secretary-home");
  }, [canAccessHome, isAdmin, setView, view]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand-lockup-button" type="button" onClick={() => setView("profile")}>
          <BrandLockup title={plan.workspace.name || appName} caption={currentUserName} />
        </button>

        <div className="sidebar-section">
          <span>Modulos</span>
          <div className="module-list">
            {visibleModules.map((module) => (
              <ModuleButton
                key={module.id}
                module={module}
                active={module.id === activeModule}
                onClick={() => {
                  if (module.id === "finance") setView("dashboard");
                  if (module.id === "secretary") setView("secretary-home");
                  if (module.id === "routine") setView("routine-agenda");
                  if (module.id === "health") setView("health-home");
                  if (module.id === "home") setView("home-list");
                }}
              />
            ))}
          </div>
        </div>

        {activeModule === "finance" && (
          <nav className="sidebar-section">
            <button
              className={`nav-section-toggle ${financeMenuOpen ? "open" : ""}`}
              type="button"
              aria-expanded={financeMenuOpen}
              onClick={() => setFinanceMenuOpen((current) => !current)}
            >
              <span>Financeiro</span>
              <ChevronDown size={16} />
            </button>
            {financeMenuOpen && (
              <div className="nav-submenu">
                <NavButton icon={<BarChart3 size={18} />} label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
                <NavButton icon={<FileUp size={18} />} label="Lancar" active={view === "import"} onClick={() => setView("import")} />
                <NavButton icon={<WalletCards size={18} />} label="Transacoes" active={view === "transactions"} onClick={() => setView("transactions")} />
                <NavButton icon={<Palette size={18} />} label="Categorias" active={view === "categories"} onClick={() => setView("categories")} />
                <NavButton icon={<ClipboardList size={18} />} label="Dados financeiros" active={view === "plan"} onClick={() => setView("plan")} />
                <NavButton icon={<LineChart size={18} />} label="Historico" active={view === "history"} onClick={() => setView("history")} />
                {isAdmin && (
                  <NavButton icon={<ShieldCheck size={18} />} label="Acessos" active={view === "access"} onClick={() => setView("access")} />
                )}
              </div>
            )}
          </nav>
        )}

        {activeModule === "secretary" && (
          <nav className="sidebar-section">
            <button
              className={`nav-section-toggle ${secretaryMenuOpen ? "open" : ""}`}
              type="button"
              aria-expanded={secretaryMenuOpen}
              onClick={() => setSecretaryMenuOpen((current) => !current)}
            >
              <span>Secretaria</span>
              <ChevronDown size={16} />
            </button>
            {secretaryMenuOpen && (
              <div className="nav-submenu">
                <NavButton icon={<MessageCircle size={18} />} label="Painel" active={view === "secretary-home"} onClick={() => setView("secretary-home")} />
                <NavButton icon={<Bell size={18} />} label="Lembretes" active={view === "secretary-alerts"} onClick={() => setView("secretary-alerts")} />
                {isAdmin && (
                  <>
                    <NavButton icon={<Smartphone size={18} />} label="WhatsApp" active={view === "secretary-whatsapp"} onClick={() => setView("secretary-whatsapp")} />
                    <NavButton icon={<SlidersHorizontal size={18} />} label="Preferencias" active={view === "secretary-settings"} onClick={() => setView("secretary-settings")} />
                  </>
                )}
              </div>
            )}
          </nav>
        )}

        {activeModule === "health" && (
          <nav className="sidebar-section">
            <button
              className={`nav-section-toggle ${healthMenuOpen ? "open" : ""}`}
              type="button"
              aria-expanded={healthMenuOpen}
              onClick={() => setHealthMenuOpen((current) => !current)}
            >
              <span>Saude</span>
              <ChevronDown size={16} />
            </button>
            {healthMenuOpen && (
              <div className="nav-submenu">
                <NavButton icon={<HeartPulse size={18} />} label="Painel" active={view === "health-home"} onClick={() => setView("health-home")} />
                <NavButton icon={<ShieldCheck size={18} />} label="Carteira" active={view === "health-wallet"} onClick={() => setView("health-wallet")} />
                <NavButton icon={<CalendarDays size={18} />} label="Consultas" active={view === "health-appointments"} onClick={() => setView("health-appointments")} />
                <NavButton icon={<Pill size={18} />} label="Medicamentos" active={view === "health-meds"} onClick={() => setView("health-meds")} />
              </div>
            )}
          </nav>
        )}

        {canAccessHome && activeModule === "home" && (
          <nav className="sidebar-section">
            <button
              className={`nav-section-toggle ${homeMenuOpen ? "open" : ""}`}
              type="button"
              aria-expanded={homeMenuOpen}
              onClick={() => setHomeMenuOpen((current) => !current)}
            >
              <span>Casa</span>
              <ChevronDown size={16} />
            </button>
            {homeMenuOpen && (
              <div className="nav-submenu">
                <NavButton icon={<ShoppingBag size={18} />} label="Mercado" active={view === "home-list"} onClick={() => setView("home-list")} />
              </div>
            )}
          </nav>
        )}

        {activeModule === "routine" && (
          <nav className="sidebar-section">
            <button
              className={`nav-section-toggle ${routineMenuOpen ? "open" : ""}`}
              type="button"
              aria-expanded={routineMenuOpen}
              onClick={() => setRoutineMenuOpen((current) => !current)}
            >
              <span>Rotina</span>
              <ChevronDown size={16} />
            </button>
            {routineMenuOpen && (
              <div className="nav-submenu">
                <NavButton icon={<CalendarDays size={18} />} label="Agenda" active={view === "routine-home" || view === "routine-agenda"} onClick={() => setView("routine-agenda")} />
                <NavButton icon={<ListTodo size={18} />} label="Tarefas" active={view === "routine-tasks"} onClick={() => setView("routine-tasks")} />
                <NavButton icon={<Layers size={18} />} label="Contextos" active={view === "routine-contexts"} onClick={() => setView("routine-contexts")} />
                <NavButton icon={<Link2 size={18} />} label="Calendarios" active={view === "routine-calendars"} onClick={() => setView("routine-calendars")} />
              </div>
            )}
          </nav>
        )}
        {session && (
          <nav className="sidebar-section">
            <NavButton icon={<User size={18} />} label="Perfil" active={view === "profile"} onClick={() => setView("profile")} />
            <button className="nav-button" onClick={onSignOut}>
              <LogOut size={18} />
              <span>Sair</span>
            </button>
          </nav>
        )}
        <StatusPill saveState={saveState} />
      </aside>

      <section className="workspace">
        {view === "dashboard" && (
          <Dashboard plan={plan} setPlan={setPlan} analysis={analysis} onOpenCategories={() => setView("categories")} />
        )}
        {view === "plan" && <PlanEditor plan={plan} setPlan={setPlan} />}
        {view === "import" && <ImportView plan={plan} setPlan={setPlan} />}
        {view === "transactions" && <TransactionsView plan={plan} setPlan={setPlan} />}
        {view === "categories" && (
          <CategoriesView plan={plan} setPlan={setPlan} analysis={analysis} saveState={saveState} />
        )}
        {view === "history" && <HistoryView plan={plan} setPlan={setPlan} analysis={analysis} />}
        {isAdmin && view === "access" && <AccessView plan={plan} setPlan={setPlan} />}
        {view === "secretary-home" && (
          <SecretaryView
            plan={plan}
            setPlan={setPlan}
            section="home"
            admin={isAdmin}
            viewerPhone={sessionPerson?.phone}
            onOpenSection={setView}
          />
        )}
        {view === "secretary-alerts" && (
          <SecretaryView plan={plan} setPlan={setPlan} section="alerts" admin={isAdmin} onOpenSection={setView} />
        )}
        {isAdmin && view === "secretary-whatsapp" && (
          <SecretaryView plan={plan} setPlan={setPlan} section="whatsapp" admin={isAdmin} onOpenSection={setView} />
        )}
        {isAdmin && view === "secretary-settings" && (
          <SecretaryView plan={plan} setPlan={setPlan} section="settings" admin={isAdmin} onOpenSection={setView} />
        )}
        {(view === "routine-home" || view === "routine-agenda") && (
          <RoutineView plan={plan} setPlan={setPlan} section="agenda" lifePlanId={lifePlanId} />
        )}
        {view === "routine-tasks" && <RoutineView plan={plan} setPlan={setPlan} section="tasks" lifePlanId={lifePlanId} />}
        {view === "routine-contexts" && (
          <RoutineView plan={plan} setPlan={setPlan} section="contexts" lifePlanId={lifePlanId} />
        )}
        {view === "routine-calendars" && (
          <RoutineView plan={plan} setPlan={setPlan} section="calendars" lifePlanId={lifePlanId} />
        )}
        {view === "health-home" && <HealthView plan={plan} setPlan={setPlan} section="home" />}
        {view === "health-wallet" && <HealthView plan={plan} setPlan={setPlan} section="wallet" />}
        {view === "health-appointments" && <HealthView plan={plan} setPlan={setPlan} section="appointments" />}
        {view === "health-meds" && <HealthView plan={plan} setPlan={setPlan} section="meds" />}
        {canAccessHome && view === "home-list" && (
          <HomeView plan={plan} setPlan={setPlan} section="list" actor={shoppingActor} admin={isAdmin} />
        )}
        {view === "profile" && session && (
          <ProfileView
            plan={plan}
            setPlan={setPlan}
            session={session}
            setSession={setSession}
            linked={linked}
            hostName={hostName}
            onSignOut={onSignOut}
          />
        )}
      </section>
    </main>
  );
}

function ModuleButton({
  module,
  active,
  onClick
}: {
  module: (typeof moduleCatalog)[number];
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`module-button ${active ? "active" : ""}`}
      disabled={module.status !== "active"}
      title={module.description}
      onClick={onClick}
    >
      {module.icon}
      <span>{module.name}</span>
      {module.status !== "active" && <small>Em breve</small>}
    </button>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function StatusPill({ saveState }: { saveState: SaveState }) {
  const content = {
    idle: "Pronto",
    saving: "Salvando",
    saved: "Salvo",
    offline: "Local"
  }[saveState];

  return (
    <div className={`status-pill ${saveState}`}>
      {saveState === "saving" ? <Loader2 className="spin" size={14} /> : <Database size={14} />}
      {content}
    </div>
  );
}

function ProfileView({
  plan,
  setPlan,
  session,
  setSession,
  linked,
  hostName,
  onSignOut
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  session: UserSession;
  setSession: Dispatch<SetStateAction<UserSession | null>>;
  linked: boolean;
  hostName?: string;
  onSignOut: () => void;
}) {
  const person = findSessionPerson(plan, session);
  const current = person ?? {
    id: uid("person"),
    name: session.name,
    email: session.email,
    role: linked ? ("partner" as const) : ("primary" as const),
    accountStatus: linked ? ("linked" as const) : ("local" as const)
  };

  const updatePerson = (patch: Partial<Person>) => {
    setPlan((existing) => {
      if (!existing) return existing;
      const exists = existing.profile.people.some((item) => item.id === current.id);
      const people = exists
        ? existing.profile.people.map((item) => (item.id === current.id ? { ...item, ...patch } : item))
        : [...existing.profile.people, { ...current, ...patch }];
      return {
        ...existing,
        profile: {
          ...existing.profile,
          people
        }
      };
    });
    if (patch.name && patch.name.trim() && patch.name.trim() !== session.name) {
      const nextSession = { ...session, name: patch.name.trim() };
      persistSession(nextSession);
      void persistServerSession(nextSession);
      setSession(nextSession);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Zelo / Conta"
        title="Seu perfil"
        subtitle={
          linked
            ? `Estes dados sao seus. O Financeiro compartilhado continua sendo de ${hostName || "quem te convidou"}.`
            : "Nome, WhatsApp e dados da sua conta neste aparelho."
        }
      />
      <div className="editor-grid">
        <EditorSection title="Seus dados" icon={<User size={18} />}>
          <div className="form-grid">
            <TextField label="Seu nome" value={current.name} onChange={(name) => updatePerson({ name })} />
            <ReadOnlyField label="E-mail da sua conta" value={session.email} />
            <WhatsAppPhoneField
              personId={current.id}
              phone={current.phone ?? ""}
              verifiedAt={current.whatsappVerifiedAt}
              onPhoneChange={(phone, verifiedAt) => updatePerson({ phone, whatsappVerifiedAt: verifiedAt })}
            />
            <NumberField label="Sua idade" value={current.age ?? 0} onChange={(age) => updatePerson({ age })} />
            <DateField
              label="Data de nascimento"
              value={current.birthDate}
              onChange={(birthDate) => updatePerson({ birthDate })}
            />
          </div>
          {linked && (
            <p className="form-note">
              Conta vinculada ao Financeiro de {hostName || "outra pessoa"}. Rotina, saude e secretaria desta sessao
              sao as suas, nao as do titular.
            </p>
          )}
        </EditorSection>
        <EditorSection title="Sessao" icon={<LogOut size={18} />}>
          <p className="form-note">Sair nao desfaz o vinculo. Voce entra de novo com {session.email}.</p>
          <div className="wizard-actions">
            <button className="secondary-button" type="button" onClick={onSignOut}>
              <LogOut size={16} />
              Sair da conta
            </button>
          </div>
        </EditorSection>
      </div>
    </div>
  );
}

function Dashboard({
  plan,
  setPlan,
  analysis,
  onOpenCategories
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  analysis: FinancialAnalysis;
  onOpenCategories: () => void;
}) {
  const primaryGoal = plan.goals.find((goal) => goal.id === analysis.primaryGoalProjection?.goalId);
  const goalCurrentValue = primaryGoal ? calculateGoalCurrentValue(primaryGoal, plan.assets) : 0;
  const goalProgress = primaryGoal && primaryGoal.targetValue > 0 ? goalCurrentValue / primaryGoal.targetValue : 0;
  const reserveValue =
    analysis.emergencyFundMonths === null
      ? currency.format(analysis.patrimony.liquidAssets)
      : `${currency.format(analysis.patrimony.liquidAssets)} · ${number.format(analysis.emergencyFundMonths)} meses`;
  const assetsByCategory = useMemo(
    () =>
      assetCategories
        .map((category) => ({
          name: labels.assetCategory[category],
          value: plan.assets.filter((asset) => asset.category === category).reduce((sum, asset) => sum + asset.value, 0)
        }))
        .filter((item) => item.value > 0),
    [plan.assets]
  );
  const horizonRows = useMemo(
    () =>
      analysis.commitment.horizon.map((item) => ({
        month: formatReferenceMonth(item.month),
        Recorrentes: item.recurring,
        Parcelas: item.installments,
        ...(item.debts > 0 ? { Dividas: item.debts } : {})
      })),
    [analysis.commitment.horizon]
  );
  const hasHorizonData = analysis.commitment.horizon.some((item) => item.total > 0);
  const dashboardBudgets = useMemo(() => selectDashboardCategoryBudgets(analysis.categoryBudgets), [analysis.categoryBudgets]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Zelo / Financeiro"
        title="Financeiro"
        subtitle="Score, comprometimento de renda e fluxo de caixa recalculados com lancamentos futuros, recorrentes e patrimonio."
      />

      <CommitmentOverview analysis={analysis} />

      <section className="metric-grid">
        <MetricCard icon={<Banknote />} label="Renda mensal" value={currency.format(analysis.income.recurringMonthly)} hint="Base recorrente usada no score" />
        <MetricCard
          icon={<Percent />}
          label="Comprometido no proximo mes"
          value={analysis.commitment.committedPercent === null ? "Sem renda" : percent.format(analysis.commitment.committedPercent)}
          hint={`${currency.format(analysis.commitment.nextMonth.total)} em ${formatReferenceMonth(analysis.commitment.nextMonth.month)}`}
          tone={commitmentTone(analysis.commitment.status)}
        />
        <MetricCard
          icon={<PiggyBank />}
          label="Renda livre"
          value={analysis.commitment.freePercent === null ? "A calcular" : percent.format(analysis.commitment.freePercent)}
          hint={currency.format(analysis.commitment.freeIncome)}
          tone={analysis.commitment.freeIncome < 0 ? "bad" : "good"}
        />
        <MetricCard
          icon={<CircleDollarSign />}
          label="Gasto do mes"
          value={currency.format(analysis.spending.currentMonthSpend)}
          hint={
            analysis.income.recurringMonthly > 0
              ? `${percent.format(analysis.spending.currentMonthSpend / analysis.income.recurringMonthly)} da renda`
              : "Sem renda para comparar"
          }
        />
        <MetricCard
          icon={<ClipboardList />}
          label="Folga para aplicar"
          value={currency.format(analysis.budgetSuggestion.monthlyInvestmentTarget)}
          hint={analysis.cashFlow.leftoverPercent === null ? "Capacidade planejada" : `Sobra atual ${percent.format(analysis.cashFlow.leftoverPercent)}`}
        />
        <MetricCard icon={<Activity />} label="Aporte mensal" value={currency.format(analysis.capacity.actualInvestment)} hint="Media recente + recorrentes de investimento" />
        <MetricCard
          icon={<ShieldCheck />}
          label="Reserva"
          value={reserveValue}
          hint={analysis.emergencyFundMonths === null ? "Liquidez imediata" : "Meses de custo essencial cobertos"}
        />
        <MetricCard
          icon={<CalendarRange />}
          label="Parcelas futuras"
          value={currency.format(analysis.commitment.remainingInstallmentBalance)}
          hint={
            analysis.commitment.remainingInstallmentCount === 0
              ? "Nenhum lancamento futuro"
              : `${analysis.commitment.remainingInstallmentCount} lancamentos${analysis.commitment.lastInstallmentMonth ? ` ate ${formatReferenceMonth(analysis.commitment.lastInstallmentMonth)}` : ""}`
          }
          tone={analysis.commitment.remainingInstallmentBalance > analysis.income.recurringMonthly * 2 ? "warn" : "default"}
        />
        {plan.debts.length > 0 && (
          <MetricCard
            icon={<BadgeDollarSign />}
            label="Dividas"
            value={currency.format(analysis.patrimony.totalLiabilities)}
            hint={`${currency.format(analysis.commitment.nextMonth.debts)} por mes`}
            tone={analysis.commitment.nextMonth.debts > analysis.income.recurringMonthly * 0.3 ? "warn" : "default"}
          />
        )}
      </section>

      <PurchaseSimulator plan={plan} analysis={analysis} />

      <section className="dashboard-grid">
        <Panel
          title="Categorias"
          icon={<Palette size={18} />}
          wide
          action={
            <button className="panel-link" type="button" onClick={onOpenCategories}>
              Gerenciar
            </button>
          }
        >
          {dashboardBudgets.length > 0 ? (
            <div className="category-mobile-list">
              {dashboardBudgets.map((item) => (
                <button className={`category-mobile-row status-${item.status}`} type="button" key={item.category} onClick={onOpenCategories}>
                  <span className="category-glyph">{categoryGlyph(item.category)}</span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{categoryBudgetCaption(item)}</small>
                  </span>
                  <span
                    className="category-ring"
                    style={{ "--score": `${Math.min((item.usedPercent ?? 0) * 100, 100)}%` } as React.CSSProperties}
                  />
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="Sem categorias apertadas neste mes" />
          )}
        </Panel>

        <Panel title="Score financeiro" icon={<Gauge size={18} />}>
          <div className="score-wrap">
            <div className="score-hero">
              <div className="score-ring-stack">
                <div
                  className={`score-ring band-${analysis.score.band}`}
                  style={{ "--score": `${analysis.score.value * 10}%` } as React.CSSProperties}
                >
                  <strong>{number.format(analysis.score.value)}</strong>
                  <span>/ 10</span>
                </div>
                <Mascot className="score-buddy" mood={mascotMoodFromScore(analysis.score.band)} size="md" />
              </div>
              <em>{scoreBandLabel[analysis.score.band]}</em>
              <p>{analysis.score.summary}</p>
            </div>
            <div className="score-list">
              {analysis.score.components.map((item) => (
                <div className="score-row" key={item.key}>
                  <span>{item.label}</span>
                  <strong>{number.format(item.score)}</strong>
                  <div className="bar-track">
                    <div className={scoreBarTone(item.score)} style={{ width: `${item.score * 10}%` }} />
                  </div>
                  <small>{item.explanation}</small>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Fluxo do mes" icon={<CircleDollarSign size={18} />}>
          <div className="cash-flow">
            <FlowRow label="Renda recorrente" value={analysis.cashFlow.income} />
            <FlowRow label="Recorrentes" value={-analysis.cashFlow.recurring} tone="minus" />
            <FlowRow label="Parcelas do mes" value={-analysis.cashFlow.installments} tone="minus" />
            <FlowRow label="Gastos variaveis" value={-analysis.cashFlow.variable} tone="minus" />
            <FlowRow
              label={analysis.cashFlow.leftover >= 0 ? "Sobra do mes" : "Estouro do mes"}
              value={analysis.cashFlow.leftover}
              tone="total"
            />
            <p>
              Aportes recentes: {currency.format(analysis.cashFlow.investments)}. Patrimonio financeiro em{" "}
              {currency.format(analysis.patrimony.financialAssets)}.
            </p>
          </div>
        </Panel>

        <Panel title="Compromissos nos proximos meses" icon={<CalendarRange size={18} />}>
          {hasHorizonData ? (
            <>
              <ChartFrame compact>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={horizonRows}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d9ded8" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => currency.format(Number(value))} width={84} />
                    <Tooltip formatter={(value) => currency.format(Number(value))} />
                    <Bar dataKey="Recorrentes" stackId="commit" fill={chartColors.conservative} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Parcelas" stackId="commit" fill={chartColors.base} radius={[6, 6, 0, 0]} />
                    {analysis.commitment.horizon.some((item) => item.debts > 0) ? (
                      <Bar dataKey="Dividas" stackId="commit" fill={chartColors.optimistic} />
                    ) : null}
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
              <p className="panel-note">
                Pico em {analysis.commitment.peakMonth ? formatReferenceMonth(analysis.commitment.peakMonth) : "nenhum mes"}.
                {analysis.income.recurringMonthly > 0
                  ? ` Media do horizonte: ${percent.format(
                      analysis.commitment.horizon.reduce((sum, item) => sum + item.total, 0) /
                        analysis.commitment.horizon.length /
                        analysis.income.recurringMonthly
                    )} da renda.`
                  : ""}
              </p>
            </>
          ) : (
            <EmptyState title="Sem recorrentes ou parcelas futuras" />
          )}
        </Panel>

        <Panel title="Meta principal" icon={<Target size={18} />}>
          {primaryGoal ? (
            <div className="goal-focus">
              <div>
                <span>{primaryGoal.name || "Meta sem nome"}</span>
                <strong>{currency.format(goalCurrentValue)}</strong>
                <small>de {currency.format(primaryGoal.targetValue)}</small>
              </div>
              <div className="progress-track">
                <div style={{ width: `${Math.min(goalProgress * 100, 100)}%` }} />
              </div>
              <p>
                {percent.format(Math.min(goalProgress, 1))} concluido, ja contando CDB e demais investimentos financeiros.
                Faltam aproximadamente {monthsLabel(analysis.primaryGoalProjection?.monthsToGoal ?? null)} mantendo o ritmo atual.
              </p>
            </div>
          ) : (
            <EmptyState title="Sem meta principal" />
          )}
        </Panel>

        <Panel title="Composicao patrimonial" icon={<WalletCards size={18} />}>
          {assetsByCategory.length > 0 ? (
            <ChartFrame compact>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assetsByCategory} layout="vertical" margin={{ left: 12, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#d9ded8" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => currency.format(Number(value))} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {assetsByCategory.map((_, index) => (
                      <Cell key={index} fill={[chartColors.conservative, chartColors.base, chartColors.optimistic, chartColors.accent][index % 4]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          ) : (
            <EmptyState title="Sem patrimonio cadastrado" />
          )}
        </Panel>
      </section>
    </div>
  );
}

function PurchaseSimulator({ plan, analysis }: { plan: FinancePlan; analysis: FinancialAnalysis }) {
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState<"cash" | "installment">("cash");
  const [installments, setInstallments] = useState(12);
  const [category, setCategory] = useState<ExpenseCategory>("shopping");
  const installmentCount = mode === "installment" ? Math.max(2, Math.trunc(installments) || 2) : 1;
  const monthlyAmount = installmentCount > 1 ? amount / installmentCount : amount;
  const simulation = useMemo(
    () => (amount > 0 ? simulatePurchaseImpact(plan, mode === "cash" ? amount : monthlyAmount) : null),
    [amount, mode, monthlyAmount, plan]
  );
  const committedAfterTotal = analysis.commitment.nextMonth.total + (mode === "installment" ? monthlyAmount : 0);
  const committedAfterPercent =
    analysis.commitment.recurringIncome > 0 ? committedAfterTotal / analysis.commitment.recurringIncome : null;
  const resultTone =
    !simulation || amount <= 0
      ? "idle"
      : !simulation.canPay || (committedAfterPercent !== null && committedAfterPercent >= 0.8)
        ? "bad"
        : !simulation.reserveAdequateAfterPurchase ||
            (committedAfterPercent !== null && committedAfterPercent >= 0.5) ||
            (simulation.goalDelayMonths ?? 0) > 3
          ? "warn"
          : "ok";
  const headline =
    !simulation || amount <= 0
      ? "Informe um valor para ver se a compra cabe agora."
      : resultTone === "bad"
        ? mode === "cash"
          ? "Nao cabe a vista com a liquidez atual."
          : "Essa parcela aperta demais a renda do proximo mes."
        : resultTone === "warn"
          ? "Da para fazer, mas o plano fica mais apertado."
          : mode === "cash"
            ? "Pode pagar a vista sem quebrar a reserva."
            : "A parcela cabe na folha do proximo mes.";
  const details = simulation
    ? [
        mode === "installment"
          ? `Parcela de ${currency.format(monthlyAmount)} em ${installmentCount}x na categoria ${expenseCategoryName(plan, category)}.`
          : `Saida a vista de ${currency.format(amount)} em ${expenseCategoryName(plan, category)}.`,
        `Liquidez depois da compra: ${currency.format(simulation.liquidityAfterPurchase)}.`,
        committedAfterPercent === null
          ? "Cadastre uma renda recorrente para medir o comprometimento."
          : `Comprometimento no proximo mes: ${percent.format(committedAfterPercent)}.`,
        simulation.goalDelayMonths === null
          ? "Sem meta principal para estimar atraso."
          : simulation.goalDelayMonths <= 0
            ? "A meta principal nao atrasa com essa compra."
            : `A meta principal atrasa cerca de ${monthsLabel(simulation.goalDelayMonths)}.`
      ]
    : [];

  return (
    <Panel title="Posso gastar?" icon={<ShoppingBag size={18} />} wide>
      <div className="form-grid">
        <MoneyField label="Valor da compra" value={amount} onChange={setAmount} />
        <SelectField
          label="Categoria"
          value={category}
          options={expenseCategoryOptions(plan)}
          onChange={(value) => setCategory(value as ExpenseCategory)}
        />
        <SegmentedField
          label="Forma de pagamento"
          value={mode}
          options={[
            { value: "cash", label: "A vista" },
            { value: "installment", label: "Parcelado" }
          ]}
          onChange={(value) => setMode(value as "cash" | "installment")}
        />
        {mode === "installment" && (
          <NumberField label="Numero de parcelas" value={installments} onChange={setInstallments} />
        )}
      </div>
      <div className={`decision-result ${resultTone === "idle" ? "" : resultTone}`.trim()}>
        <strong>{headline}</strong>
        {details.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </Panel>
  );
}

function CommitmentOverview({ analysis }: { analysis: FinancialAnalysis }) {
  const { commitment } = analysis;
  const income = Math.max(commitment.recurringIncome, 0);
  const locked = commitment.nextMonth.total;
  const free = Math.max(commitment.freeIncome, 0);
  const overflow = Math.max(-commitment.freeIncome, 0);
  const stackTotal = Math.max(income, locked + free, 1);
  const parts = [
    { key: "Recorrentes", value: commitment.nextMonth.recurring, color: chartColors.conservative },
    { key: "Parcelas", value: commitment.nextMonth.installments, color: chartColors.base },
    { key: "Dividas", value: commitment.nextMonth.debts, color: chartColors.optimistic },
    { key: overflow > 0 ? "Estouro" : "Livre", value: overflow > 0 ? overflow : free, color: overflow > 0 ? "#7f1d1d" : "#d6e8c8" }
  ].filter((part) => part.value > 0);

  return (
    <section className={`commitment-hero status-${commitment.status}`}>
      <div>
        <div className="commitment-hero-heading">
          <Mascot mood={mascotMoodFromCommitment(commitment.status)} size="lg" />
          <div>
            <span>Renda comprometida no proximo mes</span>
            <strong>{commitment.committedPercent === null ? "—" : percent.format(commitment.committedPercent)}</strong>
            <em>{commitmentLabels[commitment.status]}</em>
          </div>
        </div>
        <p>
          {income > 0
            ? `${currency.format(locked)} de ${currency.format(income)} ja tem destino em ${formatReferenceMonth(commitment.nextMonth.month)}.`
            : "Cadastre uma renda recorrente para medir quanto dos lancamentos futuros ja come a folha."}
        </p>
      </div>
      <div className="commitment-hero-side">
        <div className="commitment-stack" aria-hidden={parts.length === 0}>
          {parts.map((part) => (
            <div key={part.key} style={{ width: `${(part.value / stackTotal) * 100}%`, background: part.color }} title={`${part.key}: ${currency.format(part.value)}`} />
          ))}
        </div>
        <div className="commitment-legend">
          {parts.map((part) => (
            <span key={part.key}>
              <i style={{ background: part.color }} />
              {part.key} {currency.format(part.value)}
            </span>
          ))}
        </div>
        <div className="commitment-mini-grid">
          <div>
            <span>Este mes</span>
            <strong>{commitment.thisMonth.percentOfIncome === null ? "—" : percent.format(commitment.thisMonth.percentOfIncome)}</strong>
          </div>
          <div>
            <span>Renda livre</span>
            <strong>{commitment.freePercent === null ? "—" : percent.format(commitment.freePercent)}</strong>
          </div>
          <div>
            <span>Parcelas futuras</span>
            <strong>{currency.format(commitment.remainingInstallmentBalance)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowRow({ label, value, tone }: { label: string; value: number; tone?: "minus" | "total" }) {
  return (
    <div className={`flow-row ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{currency.format(value)}</strong>
    </div>
  );
}

function AccessView({ plan, setPlan }: { plan: FinancePlan; setPlan: Dispatch<SetStateAction<FinancePlan | null>> }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Zelo / Permissoes"
        title="Acessos da conta"
        subtitle="Convide pessoas para o Financeiro e, se quiser, compartilhe tambem a lista de mercado."
      />
      <section className="module-overview-grid">
        {moduleCatalog.map((module) => (
          <article className={`module-overview-card ${module.status}`} key={module.id}>
            <div>
              {module.icon}
              <strong>{module.name}</strong>
            </div>
            <p>{module.description}</p>
            <span>{module.status === "active" ? "Ativo" : "Planejado"}</span>
          </article>
        ))}
      </section>
      <ModuleAccessPanel plan={plan} setPlan={setPlan} />
    </div>
  );
}

function ModuleAccessPanel({
  plan,
  setPlan
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
}) {
  const primary = plan.profile.people.find((person) => person.role === "primary") ?? plan.profile.people[0];
  const accountLinks = plan.profile.accountLinks ?? [];
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSharedAccounts, setInviteSharedAccounts] = useState(true);
  const [inviteSharedHome, setInviteSharedHome] = useState(true);
  const [inviteSharedPatrimony, setInviteSharedPatrimony] = useState(true);
  const [invitePrimaryShare, setInvitePrimaryShare] = useState(0.5);
  const [inviteRole, setInviteRole] = useState<ModuleAccessRole>("editor");
  const [inviteScopes, setInviteScopes] = useState<FinanceModuleScope[]>(defaultVisibleFinanceScopes);
  const [copyStatus, setCopyStatus] = useState("");

  const inviteUrl = (token: string) => `${window.location.origin}/?invite=${token}&plan=${plan.id}`;
  const toggleScope = (scope: FinanceModuleScope) => {
    setInviteScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
    );
  };

  const copyInvite = async (token: string) => {
    const link = inviteUrl(token);
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus("Link copiado.");
    } catch {
      setCopyStatus(link);
    }
  };

  const createInvite = async () => {
    const token = crypto.randomUUID().replaceAll("-", "").slice(0, 18);
    const link: AccountLink = {
      id: uid("link"),
      token,
      inviterPersonId: primary?.id ?? "primary",
      inviteeName: inviteName.trim() || undefined,
      inviteeEmail: inviteEmail.trim() || undefined,
      status: "pending",
      sharedAccounts: inviteSharedAccounts,
      sharedHome: inviteSharedHome,
      expenseSplit: {
        primaryPercent: Math.round(invitePrimaryShare * 100),
        partnerPercent: Math.max(0, 100 - Math.round(invitePrimaryShare * 100))
      },
      permissions: {
        canViewSharedPlan: true,
        canEditOwnData: true,
        canEditSharedData: inviteRole === "admin",
        canSeePartnerPrivateData: false,
        modules: [
          defaultFinanceModuleAccess(inviteRole, inviteScopes.length ? inviteScopes : ["dashboard"]),
          ...(inviteSharedHome ? [defaultHomeModuleAccess(inviteRole)] : [])
        ]
      },
      createdAt: new Date().toISOString()
    };

    setPlan((current) =>
          current
        ? {
            ...current,
            profile: {
              ...current.profile,
              planningMode: "family",
              sharing: {
                ...current.profile.sharing,
                sharedAccounts: inviteSharedAccounts,
                patrimonyMode: inviteSharedPatrimony ? "joint" : "separate",
                expenseSplit: {
                  primaryPercent: link.expenseSplit.primaryPercent,
                  partnerPercent: link.expenseSplit.partnerPercent
                }
              },
              accountLinks: [...(current.profile.accountLinks ?? []), link]
            }
          }
        : current
    );
    setInviteName("");
    setInviteEmail("");
    setInviteSharedAccounts(true);
    setInviteSharedHome(true);
    setInviteSharedPatrimony(true);
    setInvitePrimaryShare(0.5);
    setInviteRole("editor");
    setInviteScopes(defaultVisibleFinanceScopes());
    await copyInvite(token);
  };

  const updateSharedHome = (linkId: string, sharedHome: boolean) => {
    setPlan((current) =>
      current
        ? {
            ...current,
            profile: {
              ...current.profile,
              accountLinks: (current.profile.accountLinks ?? []).map((link) =>
                link.id === linkId
                  ? applySharedHomeToAccountLink(link, sharedHome, financeAccessFor(link).role)
                  : link
              )
            }
          }
        : current
    );
  };

  const revokeInvite = (linkId: string) => {
    setPlan((current) =>
      current
        ? {
            ...current,
            profile: {
              ...current.profile,
              accountLinks: (current.profile.accountLinks ?? []).map((link) =>
                link.id === linkId ? { ...link, status: "revoked", revokedAt: new Date().toISOString() } : link
              )
            }
          }
        : current
    );
  };

  return (
    <Panel title="Convites e compartilhamento" icon={<Users size={18} />} wide>
      <div className="family-link-panel">
        <header>
          <div>
            <Users size={18} />
            <strong>Adicionar pessoa a conta</strong>
          </div>
          <span>{accountLinks.filter((link) => link.status === "accepted").length} ativa(s)</span>
        </header>
        <div className="form-grid">
          <TextField label="Nome do convidado" value={inviteName} onChange={setInviteName} />
          <TextField label="E-mail do convidado" value={inviteEmail} onChange={setInviteEmail} />
          <SelectField
            label="Papel no modulo"
            value={inviteRole}
            options={moduleRoleOptions}
            onChange={(role) => setInviteRole(role as ModuleAccessRole)}
          />
          <ToggleField label="Despesas compartilhadas" checked={inviteSharedAccounts} onChange={setInviteSharedAccounts} />
          <ToggleField label="Patrimonio compartilhado" checked={inviteSharedPatrimony} onChange={setInviteSharedPatrimony} />
          <ToggleField
            label="Lista de mercado compartilhada"
            hint="A pessoa entra na mesma lista da Casa, no app e no WhatsApp."
            checked={inviteSharedHome}
            onChange={setInviteSharedHome}
          />
          {inviteSharedAccounts && (
            <>
              <PercentField label="Sua parte nas despesas compartilhadas" value={invitePrimaryShare} onChange={setInvitePrimaryShare} />
              <ReadOnlyField label="Parte do convidado(a)" value={`${Math.max(0, 100 - Math.round(invitePrimaryShare * 100))}%`} />
            </>
          )}
          <ScopeSelector selected={inviteScopes} onToggle={toggleScope} />
          <div className="field action-field">
            <span>Convite</span>
            <button className="secondary-button" onClick={createInvite}>
              <Link2 size={16} /> Gerar link
            </button>
          </div>
        </div>
        {copyStatus && <p className="form-note">{copyStatus}</p>}
        <div className="link-list">
          {accountLinks.length === 0 && <EmptyState title="Nenhum convite criado" />}
          {accountLinks
            .slice()
            .reverse()
            .map((link) => {
              const access = financeAccessFor(link);
              const sharesHome = accountLinkSharesHome(link);
              return (
                <div className="account-link-card" key={link.id}>
                  <div>
                    <strong>{link.inviteeName || link.inviteeEmail || "Convite sem nome"}</strong>
                    <span>
                      {link.status === "pending" ? "Pendente" : link.status === "accepted" ? "Vinculado" : "Revogado"} ·{" "}
                      {moduleRoleLabels[access.role]}
                    </span>
                    <small>
                      {financeScopeLabels(access.scopes)}
                      {sharesHome ? " · Mercado compartilhado" : " · Sem acesso ao mercado"}
                    </small>
                    {link.status !== "revoked" && (
                      <button
                        type="button"
                        className={`home-share-chip ${sharesHome ? "active" : ""}`}
                        onClick={() => updateSharedHome(link.id, !sharesHome)}
                      >
                        <ShoppingBag size={14} />
                        {sharesHome ? "Mercado compartilhado" : "Compartilhar mercado"}
                      </button>
                    )}
                    {link.status !== "revoked" && <code>{inviteUrl(link.token)}</code>}
                  </div>
                  <div className="account-link-actions">
                    {link.status !== "revoked" && (
                      <button className="icon-button" title="Copiar link" onClick={() => copyInvite(link.token)}>
                        <Copy size={16} />
                      </button>
                    )}
                    {link.status === "pending" && (
                      <button className="icon-button danger" title="Revogar convite" onClick={() => revokeInvite(link.id)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </Panel>
  );
}

function ScopeSelector({
  selected,
  onToggle
}: {
  selected: FinanceModuleScope[];
  onToggle: (scope: FinanceModuleScope) => void;
}) {
  return (
    <div className="scope-selector">
      <span>Areas do Financeiro</span>
      <div>
        {financeScopeOptions.map((scope) => (
          <button
            type="button"
            key={scope.value}
            className={selected.includes(scope.value) ? "active" : ""}
            onClick={() => onToggle(scope.value)}
          >
            {scope.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function transactionMonthKey(transaction: FinancialTransaction) {
  return toDateInput(transaction.date).slice(0, 7);
}

function currentTransactionMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatTransactionMonth(month: string) {
  return month ? formatReferenceMonth(month) : "Sem mes";
}

function isExpenseLikeTransaction(transaction: FinancialTransaction) {
  return transaction.type === "expense" || transaction.type === "debt_payment" || transaction.type === "investment";
}

function isExpenseLikeItem(item: Pick<TransactionAnalyticsItem, "type">) {
  return item.type === "expense" || item.type === "debt_payment" || item.type === "investment";
}

function monthStart(month: string) {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex)) return null;
  return new Date(year, monthIndex, 1);
}

function monthEnd(month: string) {
  const start = monthStart(month);
  if (!start) return null;
  return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonthKey(month: string, amount: number) {
  const start = monthStart(month);
  if (!start) return month;
  start.setMonth(start.getMonth() + amount);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
}

function addMonthsToDateInput(dateInput: string, amount: number) {
  const base = new Date(`${dateInput}T12:00:00`);
  if (Number.isNaN(base.getTime())) return dateInput;

  const targetMonth = new Date(base.getFullYear(), base.getMonth() + amount, 1, 12);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  const day = Math.min(base.getDate(), lastDay);
  return `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKeysBetween(startMonth: string, endMonth: string) {
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

function nextMonthKeys(startMonth: string, months: number) {
  return Array.from({ length: months }, (_, index) => addMonthKey(startMonth, index));
}

function recurringMonthlyFactor(frequency: RecurringTransaction["frequency"]) {
  const factors: Record<RecurringTransaction["frequency"], number> = {
    monthly: 1,
    weekly: 52 / 12,
    biweekly: 26 / 12,
    quarterly: 1 / 3,
    annual: 1 / 12
  };

  return factors[frequency];
}

function recurringMonthsBetween(start: Date, month: Date) {
  return (month.getFullYear() - start.getFullYear()) * 12 + month.getMonth() - start.getMonth();
}

function recurringOccursInMonth(transaction: RecurringTransaction, month: string) {
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

function recurringOccurrenceDate(transaction: RecurringTransaction, month: string) {
  const start = new Date(transaction.startDate);
  const firstDay = monthStart(month);
  if (!firstDay || Number.isNaN(start.getTime())) return `${month}-01`;
  const day = Math.min(start.getDate(), new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate());
  return `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function recurringOccurrenceAmount(transaction: RecurringTransaction) {
  return (Number.isFinite(transaction.amount) ? Number(transaction.amount) : 0) * recurringMonthlyFactor(transaction.frequency);
}

function buildRecurringOccurrences(transactions: RecurringTransaction[], months: string[]) {
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

function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <header className="page-header">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  tone = "default"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

function categoryGlyph(category: string) {
  const icons: Record<string, ReactNode> = {
    housing: <Home size={18} />,
    food: <UtensilsCrossed size={18} />,
    transport: <Car size={18} />,
    health: <HeartPulse size={18} />,
    travel: <Plane size={18} />,
    shopping: <ShoppingBag size={18} />,
    subscriptions: <Repeat size={18} />,
    education: <GraduationCap size={18} />,
    taxes: <Receipt size={18} />,
    debt: <CreditCard size={18} />,
    other: <CircleDot size={18} />
  };

  return icons[category] ?? <Tag size={18} />;
}

function categoryBudgetCaption(item: FinancialAnalysis["categoryBudgets"][number]) {
  if (item.remaining === null) return `${currency.format(item.spent)} gastos neste mes`;
  if (item.remaining < 0) return `Passou ${currency.format(Math.abs(item.remaining))} do teto`;
  if (item.status === "tight") return `Apenas ${currency.format(item.remaining)} restando`;
  if (item.status === "watch") return `Restam ${currency.format(item.remaining)}`;
  return `${currency.format(item.remaining)} disponiveis`;
}

function Panel({
  title,
  icon,
  children,
  wide,
  action
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  wide?: boolean;
  action?: ReactNode;
}) {
  return (
    <section className={`panel ${wide ? "wide" : ""}`}>
      <header>
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ChartFrame({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return <div className={`chart-frame ${compact ? "compact" : ""}`}>{children}</div>;
}

function EmptyState({ title, mood = "search" }: { title: string; mood?: MascotMood }) {
  return (
    <div className="empty-state">
      <Mascot mood={mood} size="lg" />
      <span>{title}</span>
    </div>
  );
}

function InsightList({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "strong" | "attention" }) {
  return (
    <article className={`insight-list ${tone}`}>
      <h3>{title}</h3>
      {(items.length ? items : [empty]).map((item) => (
        <p key={item}>{item}</p>
      ))}
    </article>
  );
}

function PlanEditor({ plan, setPlan }: { plan: FinancePlan; setPlan: Dispatch<SetStateAction<FinancePlan | null>> }) {
  return (
    <div className="page">
      <PageHeader eyebrow="Zelo / Financeiro" title="Dados financeiros" subtitle="Tudo que muda aqui recalcula diagnostico e metas do modulo." />
      <div className="editor-grid">
        <ProfileStep plan={plan} setPlan={setPlan} />
        <IncomeEditor plan={plan} setPlan={setPlan} />
        <AssetEditor plan={plan} setPlan={setPlan} />
        <DebtEditor plan={plan} setPlan={setPlan} />
        <GoalEditor plan={plan} setPlan={setPlan} />
        <RiskEditor plan={plan} setPlan={setPlan} />
      </div>
    </div>
  );
}

function ProfileStep({ plan, setPlan }: { plan: FinancePlan; setPlan: Dispatch<SetStateAction<FinancePlan | null>> }) {
  const primary = plan.profile.people.find((person) => person.role === "primary") ?? plan.profile.people[0] ?? {
    id: "primary",
    name: "",
    role: "primary" as const
  };

  const updatePerson = (personId: string, patch: Partial<Person>) => {
    setPlan((current) =>
      current
        ? {
            ...current,
            profile: {
              ...current.profile,
              people: current.profile.people.map((person) => (person.id === personId ? { ...person, ...patch } : person))
            }
          }
        : current
    );
  };

  return (
    <EditorSection title="Perfil" icon={<BadgeDollarSign size={18} />}>
      <div className="form-grid">
        <TextField label="Nome" value={primary.name} onChange={(name) => updatePerson(primary.id, { name })} />
        <NumberField label="Idade" value={primary.age ?? 0} onChange={(age) => updatePerson(primary.id, { age })} />
        <DateField label="Data de nascimento" value={primary.birthDate} onChange={(birthDate) => updatePerson(primary.id, { birthDate })} />
        <WhatsAppPhoneField
          personId={primary.id}
          phone={primary.phone ?? ""}
          verifiedAt={primary.whatsappVerifiedAt}
          onPhoneChange={(phone, verifiedAt) => updatePerson(primary.id, { phone, whatsappVerifiedAt: verifiedAt })}
        />
        <SelectField
          label="Estado civil"
          value={plan.profile.maritalStatus}
          options={maritalOptions}
          onChange={(maritalStatus) =>
            setPlan((current) =>
              current
                ? {
                    ...current,
                    profile: {
                      ...current.profile,
                      maritalStatus: maritalStatus as FinancePlan["profile"]["maritalStatus"]
                    }
                  }
                : current
            )
          }
        />
        <SegmentedField
          label="Planejamento"
          value={plan.profile.planningMode}
          options={[
            { value: "individual", label: "Individual" },
            { value: "family", label: "Casal/Familia" }
          ]}
          onChange={(planningMode) =>
            setPlan((current) =>
              current
                ? {
                    ...current,
                    profile: {
                      ...current.profile,
                      planningMode: planningMode as FinancePlan["profile"]["planningMode"]
                    }
                  }
                : current
            )
          }
        />
        {plan.profile.planningMode === "family" && (
          <SelectField
            label="Patrimonio"
            value={plan.profile.sharing.patrimonyMode}
            options={[
              { value: "joint", label: "Conjunto" },
              { value: "separate", label: "Separado" },
              { value: "mixed", label: "Misto" }
            ]}
            onChange={(patrimonyMode) =>
              setPlan((current) =>
                current
                  ? {
                      ...current,
                      profile: {
                        ...current.profile,
                        sharing: {
                          ...current.profile.sharing,
                          patrimonyMode: patrimonyMode as FinancePlan["profile"]["sharing"]["patrimonyMode"]
                        }
                      }
                    }
                  : current
              )
            }
          />
        )}
      </div>

    </EditorSection>
  );
}

function IncomeEditor({
  plan,
  setPlan,
  compact,
  lockedOwnerId
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  compact?: boolean;
  lockedOwnerId?: string;
}) {
  const owners = ownerOptions(plan);
  const incomes = lockedOwnerId
    ? plan.incomeSources.filter((income) => income.ownerId === lockedOwnerId)
    : plan.incomeSources;

  const addIncome = () => {
    setPlan((current) =>
      current
        ? {
            ...current,
            incomeSources: [
              ...current.incomeSources,
              {
                id: uid("income"),
                name: "",
                type: "other",
                ownerId: lockedOwnerId,
                netAmount: 0,
                frequency: "monthly",
                isRecurring: true,
                stabilityScore: 0
              }
            ]
          }
        : current
    );
  };

  return (
    <EditorSection
      title={lockedOwnerId ? "Sua renda" : "Rendas"}
      icon={<Banknote size={18} />}
      action={
        <button className="icon-button labeled" onClick={addIncome} title="Adicionar renda">
          <Plus size={16} /> Renda
        </button>
      }
      compact={compact}
    >
      <div className="item-list">
        {incomes.length === 0 && <EmptyState title={lockedOwnerId ? "Cadastre a sua renda para continuar" : "Nenhuma renda cadastrada"} />}
        {incomes.map((income) => (
          <div className="editable-item" key={income.id}>
            <div className="item-form">
              <TextField label="Nome" value={income.name} onChange={(name) => patchIncome(setPlan, income.id, { name })} />
              <SelectField label="Tipo" value={income.type === "freelance" ? "other" : income.type} options={recurringIncomeTypeOptions} onChange={(type) => patchIncome(setPlan, income.id, { type: type as IncomeType })} />
              {!lockedOwnerId && (
                <SelectField label="Pessoa" value={income.ownerId ?? ""} options={owners} onChange={(ownerId) => patchIncome(setPlan, income.id, { ownerId: ownerId || undefined })} />
              )}
              <MoneyField label="Valor liquido" value={income.netAmount} onChange={(netAmount) => patchIncome(setPlan, income.id, { netAmount })} />
              <MoneyField label="Valor bruto" value={income.grossAmount ?? 0} onChange={(grossAmount) => patchIncome(setPlan, income.id, { grossAmount })} />
              <SelectField
                label="Frequencia"
                value={income.frequency === "single" ? "monthly" : income.frequency}
                options={recurringFrequencyOptions}
                onChange={(frequency) => patchIncome(setPlan, income.id, { frequency: frequency as Frequency, isRecurring: true, endDate: undefined })}
              />
              <NumberField label="Estabilidade 0-10" value={income.stabilityScore} onChange={(stabilityScore) => patchIncome(setPlan, income.id, { stabilityScore })} />
              <DateField label="Inicio" value={income.startDate} onChange={(startDate) => patchIncome(setPlan, income.id, { startDate })} />
            </div>
            <button className="icon-button danger" title="Remover renda" onClick={() => removeIncome(setPlan, income.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </EditorSection>
  );
}

function AssetEditor({
  plan,
  setPlan,
  compact,
  excludeAssetIds
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  compact?: boolean;
  excludeAssetIds?: Set<string>;
}) {
  const linkedPeople = acceptedLinkedPeople(plan);
  const assets = excludeAssetIds ? plan.assets.filter((asset) => !excludeAssetIds.has(asset.id)) : plan.assets;

  const addAsset = () => {
    setPlan((current) =>
      current
        ? {
            ...current,
            assets: [
              ...current.assets,
              {
                id: uid("asset"),
                name: "",
                category: "cash",
                value: 0,
                liquidity: "immediate",
                sharedWithPersonIds: [],
                includeInIndependence: false
              }
            ]
          }
        : current
    );
  };

  return (
    <EditorSection
      title={excludeAssetIds ? "Seu patrimonio" : "Patrimonio"}
      icon={<WalletCards size={18} />}
      action={
        <button className="icon-button labeled" onClick={addAsset} title="Adicionar ativo">
          <Plus size={16} /> Ativo
        </button>
      }
      compact={compact}
    >
      <div className="item-list">
        {assets.length === 0 && <EmptyState title={excludeAssetIds ? "Nenhum ativo seu por enquanto" : "Nenhum ativo cadastrado"} />}
        {assets.map((asset) => (
          <div className="editable-item" key={asset.id}>
            <div className="item-form">
              <TextField label="Nome" value={asset.name} onChange={(name) => patchAsset(setPlan, asset.id, { name })} />
              <SelectField label="Categoria" value={asset.category} options={assetCategoryOptions} onChange={(category) => patchAsset(setPlan, asset.id, { category: category as AssetCategory })} />
              <MoneyField label="Valor atual" value={asset.value} onChange={(value) => patchAsset(setPlan, asset.id, { value })} />
              <SelectField label="Liquidez" value={asset.liquidity} options={liquidityOptions} onChange={(liquidity) => patchAsset(setPlan, asset.id, { liquidity: liquidity as Liquidity })} />
            </div>
            {linkedPeople.length > 0 && (
              <ShareAssetField
                people={linkedPeople}
                values={asset.sharedWithPersonIds ?? []}
                onChange={(sharedWithPersonIds) => patchAsset(setPlan, asset.id, { sharedWithPersonIds })}
              />
            )}
            <button className="icon-button danger" title="Remover ativo" onClick={() => removeAsset(setPlan, asset.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </EditorSection>
  );
}

function DebtEditor({
  plan,
  setPlan,
  compact
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  compact?: boolean;
}) {
  const owners = ownerOptions(plan);

  const addDebt = () => {
    setPlan((current) =>
      current
        ? {
            ...current,
            debts: [
              ...current.debts,
              {
                id: uid("debt"),
                name: "",
                type: "loan",
                balance: 0,
                monthlyPayment: 0
              }
            ]
          }
        : current
    );
  };

  return (
    <EditorSection
      title="Dividas"
      icon={<BadgeDollarSign size={18} />}
      action={
        <button className="icon-button labeled" onClick={addDebt} title="Adicionar divida">
          <Plus size={16} /> Divida
        </button>
      }
      compact={compact}
    >
      <div className="item-list">
        {plan.debts.length === 0 && (
          <EmptyState title="Nenhuma divida cadastrada. Financiamento, cartao rotativo e emprestimo entram aqui." />
        )}
        {plan.debts.map((debt) => (
          <div className="editable-item" key={debt.id}>
            <div className="item-form">
              <TextField label="Nome" value={debt.name} onChange={(name) => patchDebt(setPlan, debt.id, { name })} />
              <SelectField
                label="Tipo"
                value={debt.type}
                options={debtTypeOptions}
                onChange={(type) => patchDebt(setPlan, debt.id, { type: type as DebtType })}
              />
              <MoneyField label="Saldo" value={debt.balance} onChange={(balance) => patchDebt(setPlan, debt.id, { balance })} />
              <MoneyField
                label="Parcela mensal"
                value={debt.monthlyPayment}
                onChange={(monthlyPayment) => patchDebt(setPlan, debt.id, { monthlyPayment })}
              />
              <PercentField
                label="Taxa anual"
                value={debt.annualInterestRate ?? 0}
                onChange={(annualInterestRate) => patchDebt(setPlan, debt.id, { annualInterestRate })}
              />
              <NumberField
                label="Meses restantes"
                value={debt.remainingMonths ?? 0}
                onChange={(remainingMonths) => patchDebt(setPlan, debt.id, { remainingMonths: remainingMonths || undefined })}
              />
              <DateField
                label="Data final"
                value={debt.finalDate}
                onChange={(finalDate) => patchDebt(setPlan, debt.id, { finalDate })}
              />
              <TextField
                label="Credor"
                value={debt.creditor ?? ""}
                onChange={(creditor) => patchDebt(setPlan, debt.id, { creditor })}
              />
              <SelectField
                label="Pessoa"
                value={debt.ownerId ?? ""}
                options={owners}
                onChange={(ownerId) => patchDebt(setPlan, debt.id, { ownerId: ownerId || undefined })}
              />
            </div>
            <button className="icon-button danger" title="Remover divida" onClick={() => removeDebt(setPlan, debt.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </EditorSection>
  );
}

function GoalEditor({
  plan,
  setPlan,
  compact
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  compact?: boolean;
}) {
  const primaryGoal = plan.goals.find((goal) => goal.isPrimary) ?? plan.goals[0];

  const updatePrimaryGoal = (targetValue: number) => {
    setPlan((current) =>
      current ? { ...current, goals: upsertPrimaryGoal(current.goals, targetValue) } : current
    );
  };

  return (
    <EditorSection title="Objetivos" icon={<Target size={18} />} compact={compact}>
      <div className="form-grid single">
        <MoneyField label="Valor da meta principal" value={primaryGoal?.targetValue ?? 0} onChange={updatePrimaryGoal} />
      </div>
    </EditorSection>
  );
}

function RiskEditor({ plan, setPlan }: { plan: FinancePlan; setPlan: Dispatch<SetStateAction<FinancePlan | null>> }) {
  const suggested = analyzePlan(plan).riskProfile;

  return (
    <EditorSection title="Perfil de risco" icon={<Gauge size={18} />}>
      <div className="risk-grid">
        <RangeField label="Horizonte" value={plan.risk.answers.investmentHorizon} onChange={(investmentHorizon) => patchRiskAnswer(setPlan, { investmentHorizon })} />
        <RangeField label="Conhecimento" value={plan.risk.answers.financialKnowledge} onChange={(financialKnowledge) => patchRiskAnswer(setPlan, { financialKnowledge })} />
        <RangeField label="Volatilidade" value={plan.risk.answers.volatilityTolerance} onChange={(volatilityTolerance) => patchRiskAnswer(setPlan, { volatilityTolerance })} />
        <RangeField label="Liquidez" value={plan.risk.answers.liquidityNeed} onChange={(liquidityNeed) => patchRiskAnswer(setPlan, { liquidityNeed })} />
        <RangeField label="Quedas" value={plan.risk.answers.reactionToDrawdown} onChange={(reactionToDrawdown) => patchRiskAnswer(setPlan, { reactionToDrawdown })} />
        <RangeField label="Estabilidade" value={plan.risk.answers.incomeStability} onChange={(incomeStability) => patchRiskAnswer(setPlan, { incomeStability })} />
        <RangeField label="Dependentes" value={plan.risk.answers.dependentsPressure} onChange={(dependentsPressure) => patchRiskAnswer(setPlan, { dependentsPressure })} />
        <RangeField label="Metas proximas" value={plan.risk.answers.nearTermGoalsPressure} onChange={(nearTermGoalsPressure) => patchRiskAnswer(setPlan, { nearTermGoalsPressure })} />
      </div>
      <div className="review-row">
        <span>Perfil sugerido: <strong>{labels.risk[suggested]}</strong></span>
        <SelectField
          label="Revisao"
          value={plan.risk.reviewedProfile ?? ""}
          options={[{ value: "", label: "Usar sugerido" }, ...riskOptions]}
          onChange={(reviewedProfile) => patchRisk(setPlan, { reviewedProfile: reviewedProfile ? (reviewedProfile as RiskProfileName) : undefined })}
        />
      </div>
    </EditorSection>
  );
}

function DiagnosticPreview({ plan, analysis }: { plan: FinancePlan; analysis: FinancialAnalysis }) {
  const primaryGoal = plan.goals.find((goal) => goal.id === analysis.primaryGoalProjection?.goalId);

  return (
    <EditorSection title="Diagnostico financeiro" icon={<Gauge size={18} />}>
      <div className="diagnostic-buddy">
        <Mascot mood={mascotMoodFromScore(analysis.score.band)} size="lg" />
        <p>
          {analysis.score.band === "excellent" || analysis.score.band === "healthy"
            ? "Boa. Seu cenario ja tem base para crescer."
            : analysis.score.band === "attention" || analysis.score.band === "critical"
              ? "Ha pontos que pedem atencao. Quer ver o que mudou?"
              : "Complete os dados para um diagnostico mais firme."}
        </p>
      </div>
      <section className="metric-grid compact">
        <MetricCard icon={<WalletCards />} label="Patrimonio" value={currency.format(analysis.patrimony.totalAssets)} />
        <MetricCard icon={<ShieldCheck />} label="Liquidez" value={currency.format(analysis.patrimony.liquidAssets)} />
        <MetricCard
          icon={<Percent />}
          label="Renda comprometida"
          value={analysis.commitment.committedPercent === null ? "A calcular" : percent.format(analysis.commitment.committedPercent)}
          hint={commitmentLabels[analysis.commitment.status]}
          tone={commitmentTone(analysis.commitment.status)}
        />
        <MetricCard icon={<Banknote />} label="Capacidade" value={currency.format(analysis.capacity.potential)} />
        <MetricCard icon={<Gauge />} label="Score" value={`${number.format(analysis.score.value)} / 10`} hint={scoreBandLabel[analysis.score.band]} />
        <MetricCard icon={<Target />} label="Meta principal" value={primaryGoal ? currency.format(primaryGoal.targetValue) : "A definir"} />
      </section>
      <div className="insight-strip">
        <InsightList title="Pontos fortes" items={analysis.score.strengths} empty="Sem pontos fortes ainda" tone="strong" />
        <InsightList title="Pontos de atencao" items={analysis.score.cautions} empty="Sem pontos de atencao ainda" tone="attention" />
      </div>
    </EditorSection>
  );
}

const SHARE_SLIDER_MAX = 0.5;
const SHARE_SLIDER_STEP = 0.001;

function snapShare(value: number) {
  const stepped = Math.round(value / SHARE_SLIDER_STEP) * SHARE_SLIDER_STEP;
  return Math.min(SHARE_SLIDER_MAX, Math.max(0, Math.round(stepped * 1000) / 1000));
}

function MascotShareSlider({
  value,
  envelope,
  onChange
}: {
  value: number;
  envelope: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [dragging, setDragging] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(value);
  const dirtyRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (dragging) return;
    draftRef.current = value;
    setDraft(value);
  }, [dragging, value]);

  const commitDraft = () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    onChangeRef.current(draftRef.current);
  };

  useEffect(
    () => () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      onChangeRef.current(draftRef.current);
    },
    []
  );

  const applyShare = (share: number, commit: boolean) => {
    const next = snapShare(share);
    if (next !== draftRef.current) {
      draftRef.current = next;
      dirtyRef.current = true;
      setDraft(next);
    }
    if (commit) commitDraft();
  };

  const shareFromClientX = (clientX: number) => {
    const rail = railRef.current;
    if (!rail) return draftRef.current;
    const rect = rail.getBoundingClientRect();
    return ((clientX - rect.left) / Math.max(rect.width, 1)) * SHARE_SLIDER_MAX;
  };

  const progress = `${(draft / SHARE_SLIDER_MAX) * 100}%`;

  return (
    <>
      <div>
        <strong>{percent.format(draft)}</strong>
        <small>{currency.format(envelope * draft)} por mes</small>
      </div>
      <div
        ref={sliderRef}
        className={`mascot-slider${dragging ? " dragging" : ""}`}
        style={{ "--progress": progress } as React.CSSProperties}
        role="slider"
        tabIndex={0}
        aria-label="Percentual da categoria no teto de gastos"
        aria-valuemin={0}
        aria-valuemax={50}
        aria-valuenow={Math.round(draft * 1000) / 10}
        aria-valuetext={percent.format(draft)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          sliderRef.current?.setPointerCapture(event.pointerId);
          setDragging(true);
          applyShare(shareFromClientX(event.clientX), false);
        }}
        onPointerMove={(event) => {
          if (!sliderRef.current?.hasPointerCapture(event.pointerId)) return;
          event.preventDefault();
          applyShare(shareFromClientX(event.clientX), false);
        }}
        onPointerUp={(event) => {
          applyShare(shareFromClientX(event.clientX), true);
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          commitDraft();
          setDragging(false);
        }}
        onPointerCancel={() => {
          commitDraft();
          setDragging(false);
        }}
        onKeyDown={(event) => {
          const delta =
            event.key === "ArrowRight" || event.key === "ArrowUp"
              ? SHARE_SLIDER_STEP * 5
              : event.key === "ArrowLeft" || event.key === "ArrowDown"
                ? -SHARE_SLIDER_STEP * 5
                : event.key === "Home"
                  ? -SHARE_SLIDER_MAX
                  : event.key === "End"
                    ? SHARE_SLIDER_MAX
                    : 0;
          if (!delta && event.key !== "Home" && event.key !== "End") return;
          event.preventDefault();
          applyShare(draftRef.current + delta, true);
        }}
      >
        <div className="mascot-slider-track">
          <div className="mascot-slider-fill" />
        </div>
        <div className="mascot-slider-rail" ref={railRef}>
          <div className="mascot-slider-buddy">
            <Mascot size="sm" mood="idle" />
          </div>
        </div>
      </div>
    </>
  );
}

function CategoriesView({
  plan,
  setPlan,
  analysis,
  saveState
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  analysis: FinancialAnalysis;
  saveState: SaveState;
}) {
  const categories = useMemo(
    () =>
      normalizeExpenseCategories(plan.expenseCategories).sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
      ),
    [plan.expenseCategories]
  );
  const budgetable = useMemo(
    () => categories.filter((category) => category.isActive && isBudgetableCategory(category.id)),
    [categories]
  );
  const [selectedId, setSelectedId] = useState(budgetable[0]?.id ?? "");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#0f766e");
  const [status, setStatus] = useState("");
  const envelope = analysis.categoryBudgetPlan;
  const selected = budgetable.find((category) => category.id === selectedId) ?? budgetable[0];
  const selectedShare = selected ? resolveCategoryShare(plan, selected.id, envelope.expenseEnvelope) : 0;
  const allocated = useMemo(
    () => budgetable.reduce((sum, category) => sum + resolveCategoryShare(plan, category.id, envelope.expenseEnvelope), 0),
    [budgetable, envelope.expenseEnvelope, plan]
  );

  const usageByCategory = (categoryId: ExpenseCategory) => ({
    transactions: plan.transactions.filter((transaction) => transaction.category === categoryId).length,
    recurring: (plan.recurringTransactions ?? []).filter((transaction) => transaction.category === categoryId).length
  });

  const upsertCategoryShare = (categoryId: ExpenseCategory, share: number) => {
    const nextShare = Math.min(0.5, Math.max(0, share));
    setPlan((current) => {
      if (!current) return current;
      const remaining = (current.budget.categoryTargets ?? []).filter((target) => target.category !== categoryId);
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        budget: {
          ...current.budget,
          categoryTargets: [
            ...remaining,
            {
              category: categoryId,
              share: nextShare,
              monthlyTarget: envelope.expenseEnvelope * nextShare
            }
          ]
        }
      };
    });
  };

  const saveCategories = (nextCategories: ExpenseCategoryConfig[]) => {
    setPlan((current) =>
      current
        ? {
            ...current,
            updatedAt: new Date().toISOString(),
            expenseCategories: normalizeExpenseCategories(nextCategories)
          }
        : current
    );
  };

  const patchCategory = (categoryId: ExpenseCategory, patch: Partial<ExpenseCategoryConfig>) => {
    const now = new Date().toISOString();
    saveCategories(
      categories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              ...patch,
              updatedAt: now
            }
          : category
      )
    );
  };

  const addCategory = () => {
    const name = newCategoryName.trim();
    if (!name) {
      setStatus("Informe um nome para criar a categoria.");
      return;
    }

    if (isUnifiedShoppingCategory(slugifyCategoryId(name, categories), name)) {
      setStatus("Compras, Lazer e Compras Online ja ficam juntas em Compras e Lazer.");
      return;
    }

    const now = new Date().toISOString();
    const category: ExpenseCategoryConfig = {
      id: slugifyCategoryId(name, categories),
      name,
      color: newCategoryColor,
      isDefault: false,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    saveCategories([...categories, category]);
    setSelectedId(category.id);
    setNewCategoryName("");
    setNewCategoryColor("#0f766e");
    setStatus("Categoria criada.");
  };

  const removeCategory = (category: ExpenseCategoryConfig) => {
    const usage = usageByCategory(category.id);
    const canHardDelete = !category.isDefault && usage.transactions === 0 && usage.recurring === 0;
    const now = new Date().toISOString();
    const nextCategories = canHardDelete
      ? categories.filter((item) => item.id !== category.id)
      : categories.map((item) => (item.id === category.id ? { ...item, isActive: false, updatedAt: now } : item));

    setPlan((current) =>
      current
        ? {
            ...current,
            updatedAt: now,
            expenseCategories: normalizeExpenseCategories(nextCategories),
            budget: {
              ...current.budget,
              categoryTargets: (current.budget.categoryTargets ?? []).filter((target) => target.category !== category.id)
            }
          }
        : current
    );

    if (selectedId === category.id) {
      setSelectedId(budgetable.find((item) => item.id !== category.id)?.id ?? "");
    }
    setStatus(`${category.name} removida.`);
  };

  const restoreCategory = (category: ExpenseCategoryConfig) => {
    patchCategory(category.id, { isActive: true });
    setSelectedId(category.id);
    setStatus(`${category.name} restaurada.`);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Financeiro"
        title="Categorias"
        subtitle="O teto sai da renda menos o aporte. Cada categoria recebe um percentual sugerido, e voce ajusta arrastando o Zelo."
      />

      <section className="metric-grid compact">
        <MetricCard icon={<Banknote />} label="Renda mensal" value={currency.format(envelope.income)} />
        <MetricCard icon={<PiggyBank />} label="Aporte reservado" value={currency.format(envelope.investment)} hint="O que sai da folha antes dos tetos" />
        <MetricCard icon={<ClipboardList />} label="Teto de gastos" value={currency.format(envelope.expenseEnvelope)} hint={`${percent.format(allocated)} da folha ja rateado`} />
      </section>

      <Panel title="Aporte desejado" icon={<PiggyBank size={18} />} wide>
        <div className="form-grid">
          <MoneyField
            label="Quanto quer aportar por mes"
            value={plan.budget.monthlyInvestmentTarget ?? envelope.investment}
            onChange={(monthlyInvestmentTarget) =>
              setPlan((current) =>
                current
                  ? {
                      ...current,
                      budget: {
                        ...current.budget,
                        monthlyInvestmentTarget
                      }
                    }
                  : current
              )
            }
          />
        </div>
        <p className="panel-note">
          Sobra {currency.format(envelope.expenseEnvelope)} para ratear entre moradia, comida, transporte e o restante.
        </p>
      </Panel>

      {selected ? (
        <Panel title={`Ajustar ${selected.name}`} icon={<SlidersHorizontal size={18} />} wide>
          <div className="category-share-editor">
            <MascotShareSlider
              key={selected.id}
              value={selectedShare}
              envelope={envelope.expenseEnvelope}
              onChange={(share) => upsertCategoryShare(selected.id, share)}
            />
            <p className="form-note">
              {saveState === "saving"
                ? "Salvando percentual..."
                : saveState === "offline"
                  ? "Percentual guardado neste aparelho."
                  : "Salvo automaticamente."}
            </p>
          </div>
        </Panel>
      ) : null}

      <Panel title="Rateio das categorias" icon={<Palette size={18} />} wide>
        <div className="category-mobile-list editor">
          {budgetable.map((category) => {
            const share = resolveCategoryShare(plan, category.id, envelope.expenseEnvelope);
            const progress = analysis.categoryBudgets.find((item) => item.category === category.id);
            return (
              <button
                className={`category-mobile-row ${selected?.id === category.id ? "selected" : ""} ${progress ? `status-${progress.status}` : ""}`}
                type="button"
                key={category.id}
                onClick={() => setSelectedId(category.id)}
              >
                <span className="category-glyph">{categoryGlyph(category.id)}</span>
                <span>
                  <strong>{category.name}</strong>
                  <small>
                    {percent.format(share)} · {currency.format(envelope.expenseEnvelope * share)}
                  </small>
                </span>
                <span
                  className="category-ring"
                  style={{ "--score": `${Math.min((progress?.usedPercent ?? 0) * 100, 100)}%` } as React.CSSProperties}
                />
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Nova categoria" icon={<Plus size={18} />} wide>
        <div className="form-grid">
          <TextField label="Nome" value={newCategoryName} onChange={setNewCategoryName} />
          <ColorField label="Cor" value={newCategoryColor} onChange={setNewCategoryColor} />
        </div>
        <div className="manual-entry-actions">
          <button className="primary-button" onClick={addCategory}>
            <Plus size={16} /> Criar categoria
          </button>
        </div>
        {status && <p className="form-note">{status}</p>}
        <div className="category-manager-list">
          {categories
            .filter((category) => category.isActive)
            .map((category) => {
              const usage = usageByCategory(category.id);
              return (
                <div className="category-manager-item" key={category.id}>
                  <span className="category-swatch" style={{ backgroundColor: category.color }} />
                  <TextField value={category.name} onChange={(name) => patchCategory(category.id, { name })} />
                  <ColorField value={category.color} onChange={(color) => patchCategory(category.id, { color })} />
                  <span className="category-usage">
                    {number.format(usage.transactions)} gasto(s) · {number.format(usage.recurring)} recorrente(s)
                  </span>
                  <button className="icon-button danger" aria-label={`Remover ${category.name}`} onClick={() => removeCategory(category)}>
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
        </div>
        {categories.some((category) => !category.isActive) ? (
          <div className="category-hidden-list">
            <p className="form-note">Removidas desta lista. Gastos antigos continuam no historico.</p>
            {categories
              .filter((category) => !category.isActive)
              .map((category) => (
                <div className="category-manager-item hidden" key={category.id}>
                  <span className="category-swatch" style={{ backgroundColor: category.color }} />
                  <span>{category.name}</span>
                  <button className="secondary-button" type="button" onClick={() => restoreCategory(category)}>
                    Restaurar
                  </button>
                </div>
              ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function TransactionReviewTable({
  plan,
  setPlan,
  transactions,
  emptyTitle,
  setStatus
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  transactions: FinancialTransaction[];
  emptyTitle: string;
  setStatus?: (status: string) => void;
}) {
  const [page, setPage] = useState(1);
  const recurringTransactions = plan.recurringTransactions ?? [];
  const transactionSignature = `${transactions.length}:${transactions[0]?.id ?? ""}:${transactions[transactions.length - 1]?.id ?? ""}`;

  useEffect(() => {
    setPage(1);
  }, [transactionSignature]);
  const categoryOptions = useMemo(() => expenseCategoryOptions(plan), [plan.expenseCategories]);
  const spenderOptions = useMemo(() => spenderSelectOptions(plan), [plan.profile.accountLinks, plan.profile.people]);
  const recurringLinkOptions = useMemo(
    () => [
      { value: "", label: "Nao vincular" },
      ...recurringTransactions.map((transaction) => ({
        value: transaction.id,
        label: `${transaction.name} · ${preciseCurrency.format(transaction.amount)}`
      }))
    ],
    [recurringTransactions]
  );

  const recurringPatch = (recurringTransactionId: string): Partial<FinancialTransaction> => {
    const recurringTransaction = recurringTransactions.find((item) => item.id === recurringTransactionId);

    if (!recurringTransaction) {
      return {
        recurringTransactionId: undefined
      };
    }

    return {
      recurringTransactionId,
      type: recurringTransaction.type,
      audience: recurringTransaction.audience,
      nature: recurringTransaction.nature,
      category: recurringTransaction.category
    };
  };

  const updateTransactionDraft = (transaction: FinancialTransaction, patch: Partial<FinancialTransaction>) => {
    const updated = {
      ...transaction,
      ...patch,
      reviewed: false,
      confidence: Math.min(transaction.confidence, 0.35)
    };

    setPlan((current) =>
      current
        ? {
            ...current,
            transactions: current.transactions.map((item) => (item.id === transaction.id ? updated : item))
          }
        : current
    );
  };

  const correctTransaction = async (transaction: FinancialTransaction, patch: Partial<FinancialTransaction>) => {
    const updated = {
      ...transaction,
      ...patch,
      reviewed: true,
      confidence: 1
    };

    setPlan((current) =>
      current
        ? {
            ...current,
            transactions: current.transactions.map((item) => (item.id === transaction.id ? updated : item))
          }
        : current
    );

    try {
      const response = await apiRequest(`/plans/${plan.id}/transactions/${transaction.id}/correct`, {
        method: "POST",
        body: JSON.stringify({
          audience: updated.audience,
          nature: updated.nature,
          category: updated.category,
          spentByPersonId: updated.spentByPersonId ?? null,
          recurringTransactionId: updated.recurringTransactionId ?? null
        })
      });
      const result = (await response.json()) as { plan?: FinancePlan };
      if (result.plan) setPlan(result.plan);
    } catch {
      setStatus?.("Correcao salva localmente.");
    }
  };

  const sortedTransactions = useMemo(
    () => [...transactions].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id)),
    [transactions]
  );
  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / transactionPageSize));
  const currentPage = Math.min(page, totalPages);
  const pageTransactions = sortedTransactions.slice((currentPage - 1) * transactionPageSize, currentPage * transactionPageSize);

  return (
    <div className="transaction-table">
      <div className="transaction-head">
        <span></span>
        <span>Status</span>
        <span>Data</span>
        <span>Descricao</span>
        <span>Valor</span>
        <span>Fatura</span>
        <span>Classificacao</span>
        <span>Aprovar</span>
      </div>
      {transactions.length === 0 && <EmptyState title={emptyTitle} />}
      {pageTransactions.map((transaction) => (
        <div className="transaction-row" key={transaction.id}>
          <TransactionActionMenu
            transaction={transaction}
            spenderOptions={spenderOptions}
            recurringTransactions={recurringTransactions}
            recurringLinkOptions={recurringLinkOptions}
            recurringPatch={recurringPatch}
            updateTransactionDraft={updateTransactionDraft}
            removeTransaction={(item) => {
              setPlan((current) =>
                current
                  ? {
                      ...current,
                      transactions: current.transactions.filter((transactionItem) => transactionItem.id !== item.id)
                    }
                  : current
              );
              setStatus?.("Lancamento removido.");
            }}
          />
          <span className={`review-badge ${isInstallmentForecast(transaction) ? "forecast" : transaction.reviewed ? "done" : "pending"}`}>
            {isInstallmentForecast(transaction) ? "Previsto" : transaction.reviewed ? "Aprovado" : "Revisar"}
          </span>
          <span>{formatDateDisplay(transaction.date)}</span>
          <strong>{transaction.merchant}</strong>
          <span>{preciseCurrency.format(transaction.amount)}</span>
          <span>{transaction.statement ? formatStatementLabel(transaction.statement) : "Sem fatura"}</span>
          <div className="classification-controls">
            <span className={`type-pill ${transaction.type}`}>{transactionTypeLabels[transaction.type]}</span>
            <SelectField
              value={transaction.category}
              options={categoryOptions}
              onChange={(category) => updateTransactionDraft(transaction, { category: category as ExpenseCategory })}
            />
          </div>
          <div className="approval-cell">
            {transaction.reviewed ? (
              <Check size={18} />
            ) : (
              <button className="icon-button approve" title="Aprovar classificacao" aria-label={`Aprovar ${transaction.merchant}`} onClick={() => correctTransaction(transaction, {})}>
                <Check size={18} />
              </button>
            )}
          </div>
        </div>
      ))}
      {sortedTransactions.length > transactionPageSize && (
        <div className="pagination-bar">
          <button className="secondary-button" type="button" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            Anterior
          </button>
          <span>
            Pagina {number.format(currentPage)} de {number.format(totalPages)} · {number.format(sortedTransactions.length)} lancamentos
          </span>
          <button
            className="secondary-button"
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Proxima
          </button>
        </div>
      )}
    </div>
  );
}

function TransactionActionMenu({
  transaction,
  spenderOptions,
  recurringTransactions,
  recurringLinkOptions,
  recurringPatch,
  updateTransactionDraft,
  removeTransaction
}: {
  transaction: FinancialTransaction;
  spenderOptions: SelectOption[];
  recurringTransactions: RecurringTransaction[];
  recurringLinkOptions: SelectOption[];
  recurringPatch: (recurringTransactionId: string) => Partial<FinancialTransaction>;
  updateTransactionDraft: (transaction: FinancialTransaction, patch: Partial<FinancialTransaction>) => void;
  removeTransaction: (transaction: FinancialTransaction) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState({ top: 0, left: 0, width: 300, maxHeight: 420 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const button = buttonRef.current;
      if (!button) {
        setOpen(false);
        return;
      }

      const rect = button.getBoundingClientRect();
      const viewportPadding = 14;
      const gap = 6;
      const width = Math.min(340, (window.visualViewport?.width ?? window.innerWidth) - viewportPadding * 2);
      const maxHeight = Math.min(420, (window.visualViewport?.height ?? window.innerHeight) - viewportPadding * 2);
      const top = Math.min(rect.bottom + gap, (window.visualViewport?.height ?? window.innerHeight) - maxHeight - viewportPadding);
      const left = Math.min(Math.max(viewportPadding, rect.left), (window.visualViewport?.width ?? window.innerWidth) - width - viewportPadding);

      setMenuRect({
        top: Math.max(viewportPadding, top),
        left,
        width,
        maxHeight
      });
    };

    updateMenuPosition();

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest(".select-menu.floating")) return;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  return (
    <div className="transaction-action-cell">
      <button
        ref={buttonRef}
        type="button"
        className="icon-button transaction-action-button"
        aria-label={`Mais opcoes para ${transaction.merchant}`}
        title="Mais opcoes"
        onClick={() => setOpen((current) => !current)}
      >
        <EllipsisVertical size={18} />
      </button>
      {open &&
        createPortal(
          <div className="transaction-action-menu" ref={menuRef} style={menuRect}>
            <strong>Opcoes do lancamento</strong>
            <SelectField
              label="Responsavel"
              value={spenderValueForTransaction(transaction)}
              options={spenderOptions}
              onChange={(spentByPersonId) => updateTransactionDraft(transaction, spenderPatch(spentByPersonId, transaction))}
            />
            {recurringTransactions.length > 0 && (
              <SelectField
                label="Conta recorrente"
                value={transaction.recurringTransactionId ?? ""}
                options={recurringLinkOptions}
                onChange={(recurringTransactionId) => updateTransactionDraft(transaction, recurringPatch(recurringTransactionId))}
              />
            )}
            <button
              type="button"
              className="danger-menu-button"
              onClick={() => {
                removeTransaction(transaction);
                setOpen(false);
              }}
            >
              <Trash2 size={16} />
              Excluir lancamento
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}

function ImportView({ plan, setPlan }: { plan: FinancePlan; setPlan: Dispatch<SetStateAction<FinancePlan | null>> }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [lastStatement, setLastStatement] = useState<ImportedStatementSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [launchTab, setLaunchTab] = useState<"launch" | "import" | "review">("launch");
  const pendingTransactions = useMemo(() => plan.transactions.filter((transaction) => !transaction.reviewed), [plan.transactions]);
  const reviewedTransactions = useMemo(() => plan.transactions.filter((transaction) => transaction.reviewed), [plan.transactions]);
  const importedTransactions = useMemo(
    () => plan.transactions.filter((transaction) => transaction.source === "csv" || transaction.source === "pdf"),
    [plan.transactions]
  );
  const recurringTransactions = plan.recurringTransactions ?? [];
  const categoryOptions = useMemo(() => expenseCategoryOptions(plan), [plan.expenseCategories]);
  const spenderOptions = useMemo(() => spenderSelectOptions(plan), [plan.profile.accountLinks, plan.profile.people]);
  const recurringLinkOptions = useMemo(
    () => [
      { value: "", label: "Nao vincular" },
      ...recurringTransactions.map((transaction) => ({
        value: transaction.id,
        label: `${transaction.name} · ${preciseCurrency.format(transaction.amount)}`
      }))
    ],
    [recurringTransactions]
  );
  const currentMonthSpend = useMemo(
    () =>
      plan.transactions
        .filter((transaction) => !transaction.recurringTransactionId && (transaction.type === "expense" || transaction.type === "debt_payment"))
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    [plan.transactions]
  );
  const [manualEntry, setManualEntry] = useState({
    date: new Date().toISOString().slice(0, 10),
    merchant: "",
    amount: 0,
    type: "expense" as FinancialTransaction["type"],
    audience: "personal" as TransactionAudience,
    nature: "variable" as TransactionNature,
    category: "other" as ExpenseCategory,
    spentByPersonId: "",
    isRecurring: false,
    isInstallment: false,
    installmentStart: 1,
    installmentTotal: 2,
    frequency: "monthly" as RecurringTransaction["frequency"]
  });

  const importFile = async () => {
    if (!file) return;
    setBusy(true);
    setStatus("");

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await apiRequest(`/plans/${plan.id}/import/card-statement`, {
        method: "POST",
        body
      });
      const result = (await response.json()) as {
        imported?: number;
        skippedDuplicates?: number;
        statement?: ImportedStatementSummary;
        plan?: FinancePlan;
        error?: string;
      };
      if (!response.ok || !result.plan) throw new Error(result.error ?? "Falha na importacao");
      setPlan(result.plan);
      setLastStatement(result.statement ?? null);
      setLaunchTab("review");
      setStatus(
        `${result.imported ?? 0} transacoes importadas. ${result.skippedDuplicates ?? 0} duplicadas ignoradas.${
          result.statement ? ` Fatura ${formatStatementLabel(result.statement)}.` : ""
        }`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Nao foi possivel importar.");
    } finally {
      setBusy(false);
    }
  };

  const recurringPatch = (recurringTransactionId: string): Partial<FinancialTransaction> => {
    const recurringTransaction = recurringTransactions.find((item) => item.id === recurringTransactionId);

    if (!recurringTransaction) {
      return {
        recurringTransactionId: undefined
      };
    }

    return {
      recurringTransactionId,
      type: recurringTransaction.type,
      audience: recurringTransaction.audience,
      nature: recurringTransaction.nature,
      category: recurringTransaction.category
    };
  };

  const updateTransactionDraft = (transaction: FinancialTransaction, patch: Partial<FinancialTransaction>) => {
    const updated = {
      ...transaction,
      ...patch,
      reviewed: false,
      confidence: Math.min(transaction.confidence, 0.35)
    };

    setPlan((current) =>
      current
        ? {
            ...current,
            transactions: current.transactions.map((item) => (item.id === transaction.id ? updated : item))
          }
        : current
    );
  };

  const correctTransaction = async (transaction: FinancialTransaction, patch: Partial<FinancialTransaction>) => {
    const updated = {
      ...transaction,
      ...patch,
      reviewed: true,
      confidence: 1
    };

    setPlan((current) =>
      current
        ? {
            ...current,
            transactions: current.transactions.map((item) => (item.id === transaction.id ? updated : item))
          }
        : current
    );

    try {
      const response = await apiRequest(`/plans/${plan.id}/transactions/${transaction.id}/correct`, {
        method: "POST",
        body: JSON.stringify({
          audience: updated.audience,
          nature: updated.nature,
          category: updated.category,
          spentByPersonId: updated.spentByPersonId ?? null,
          recurringTransactionId: updated.recurringTransactionId ?? null
        })
      });
      const result = (await response.json()) as { plan?: FinancePlan };
      if (result.plan) setPlan(result.plan);
    } catch {
      setStatus("Correcao salva localmente.");
    }
  };

  const updateManualType = (type: FinancialTransaction["type"]) => {
    setManualEntry((current) => ({
      ...current,
      type,
      isRecurring: type === "income" ? false : current.isRecurring,
      isInstallment: type === "income" || type === "transfer" ? false : current.isInstallment,
      nature:
        current.spentByPersonId === thirdPartySpenderValue
          ? "thirdParty"
          : type === "income"
          ? "extraordinary"
          : type === "investment"
          ? "investment"
          : type === "debt_payment"
          ? "debtPayment"
          : current.isInstallment
          ? "debtPayment"
          : current.isRecurring
          ? "recurring"
          : "variable",
      category:
        current.spentByPersonId === thirdPartySpenderValue
          ? "thirdParty"
          : type === "investment"
          ? "investments"
          : type === "debt_payment"
          ? "debt"
          : "other"
    }));
  };

  const updateManualRecurring = (isRecurring: boolean) => {
    setManualEntry((current) => ({
      ...current,
      isRecurring,
      isInstallment: isRecurring ? false : current.isInstallment,
      type: isRecurring && current.type === "income" ? "expense" : current.type,
      nature:
        current.spentByPersonId === thirdPartySpenderValue
          ? "thirdParty"
          : isRecurring
          ? "recurring"
          : current.type === "income"
          ? "extraordinary"
          : current.type === "investment"
          ? "investment"
          : current.type === "debt_payment"
          ? "debtPayment"
          : "variable"
    }));
  };

  const updateManualInstallment = (isInstallment: boolean) => {
    setManualEntry((current) => ({
      ...current,
      isInstallment,
      isRecurring: isInstallment ? false : current.isRecurring,
      type: isInstallment && current.type === "income" ? "expense" : current.type,
      nature:
        current.spentByPersonId === thirdPartySpenderValue
          ? "thirdParty"
          : isInstallment && current.nature !== "investment"
          ? "debtPayment"
          : current.nature,
      category: isInstallment && current.category === "other" ? "debt" : current.category
    }));
  };

  const updateManualSpender = (spentByPersonId: string) => {
    setManualEntry((current) => {
      if (spentByPersonId === thirdPartySpenderValue) {
        return {
          ...current,
          spentByPersonId,
          audience: "thirdParty",
          nature: "thirdParty",
          category: "thirdParty"
        };
      }

      return {
        ...current,
        spentByPersonId,
        audience: "personal",
        nature: current.nature === "thirdParty" ? (current.isRecurring ? "recurring" : "variable") : current.nature,
        category: current.category === "thirdParty" ? "other" : current.category
      };
    });
  };

  const addManualTransaction = () => {
    if (!manualEntry.merchant.trim() || manualEntry.amount <= 0) {
      setStatus("Informe descricao e valor para salvar o lancamento.");
      return;
    }

    if (manualEntry.isInstallment) {
      if (manualEntry.type === "income" || manualEntry.type === "transfer") {
        setStatus("Parcelamento finito deve ser cadastrado como gasto, aporte ou pagamento/parcelamento.");
        return;
      }

      const installmentStart = Math.max(1, Math.trunc(manualEntry.installmentStart));
      const installmentTotal = Math.max(1, Math.trunc(manualEntry.installmentTotal));
      if (installmentStart > installmentTotal) {
        setStatus("A parcela inicial nao pode ser maior que o total de parcelas.");
        return;
      }

      const transactions = Array.from({ length: installmentTotal - installmentStart + 1 }, (_, index): FinancialTransaction => {
        const installmentCurrent = installmentStart + index;
        return {
          id: uid("tx"),
          date: new Date(`${addMonthsToDateInput(manualEntry.date, index)}T12:00:00`).toISOString(),
          merchant: `${manualEntry.merchant.trim()} - Parcela ${installmentCurrent}/${installmentTotal}`,
          description: manualEntry.merchant.trim(),
          amount: manualEntry.amount,
          type: manualEntry.type,
          audience: manualEntry.audience,
          nature: manualEntry.nature,
          category: manualEntry.category,
          spentByPersonId:
            manualEntry.spentByPersonId && manualEntry.spentByPersonId !== thirdPartySpenderValue ? manualEntry.spentByPersonId : undefined,
          installment: {
            current: installmentCurrent,
            total: installmentTotal
          },
          confidence: 1,
          source: "manual",
          reviewed: true
        };
      });

      setPlan((current) =>
        current
          ? {
              ...current,
              transactions: [...current.transactions, ...transactions]
            }
          : current
      );
      setManualEntry((current) => ({
        ...current,
        merchant: "",
        amount: 0,
        spentByPersonId: "",
        isInstallment: false,
        installmentStart: 1,
        installmentTotal: 2
      }));
      setStatus(`${transactions.length} parcela(s) salvas.`);
      return;
    }

    if (manualEntry.isRecurring) {
      if (manualEntry.type === "income" || manualEntry.type === "transfer") {
        setStatus("Renda recorrente deve ser cadastrada em Rendas.");
        return;
      }

      const recurringTransaction: RecurringTransaction = {
        id: uid("rec"),
        name: manualEntry.merchant.trim(),
        amount: manualEntry.amount,
        type: manualEntry.type as Exclude<TransactionType, "income" | "transfer">,
        audience: manualEntry.audience,
        nature: manualEntry.nature,
        category: manualEntry.category,
        frequency: manualEntry.frequency,
        startDate: new Date(`${manualEntry.date}T12:00:00`).toISOString(),
        reviewed: true
      };

      setPlan((current) =>
        current
          ? {
              ...current,
              recurringTransactions: [...(current.recurringTransactions ?? []), recurringTransaction]
            }
          : current
      );
      setManualEntry((current) => ({
        ...current,
        merchant: "",
        amount: 0,
        spentByPersonId: "",
        isInstallment: false
      }));
      setStatus("Conta recorrente salva.");
      return;
    }

    const transaction: FinancialTransaction = {
      id: uid("tx"),
      date: new Date(`${manualEntry.date}T12:00:00`).toISOString(),
      merchant: manualEntry.merchant.trim(),
      amount: manualEntry.amount,
      type: manualEntry.type,
      audience: manualEntry.audience,
      nature: manualEntry.nature,
      category: manualEntry.category,
      spentByPersonId: manualEntry.spentByPersonId && manualEntry.spentByPersonId !== thirdPartySpenderValue ? manualEntry.spentByPersonId : undefined,
      confidence: 1,
      source: "manual",
      reviewed: true
    };

    setPlan((current) =>
      current
        ? {
            ...current,
            transactions: [...current.transactions, transaction]
          }
        : current
    );
    setManualEntry((current) => ({
      ...current,
      merchant: "",
      amount: 0,
      spentByPersonId: "",
      isInstallment: false
    }));
    setStatus("Lancamento salvo.");
  };

  const patchRecurringTransaction = (id: string, patch: Partial<RecurringTransaction>) => {
    setPlan((current) =>
      current
        ? {
            ...current,
            recurringTransactions: (current.recurringTransactions ?? []).map((transaction) =>
              transaction.id === id ? { ...transaction, ...patch } : transaction
            )
          }
        : current
    );
  };

  const removeRecurringTransaction = (id: string) => {
    setPlan((current) =>
      current
        ? {
            ...current,
            recurringTransactions: (current.recurringTransactions ?? []).filter((transaction) => transaction.id !== id)
          }
        : current
    );
    setStatus("Conta recorrente removida.");
  };

  const approveAllPending = () => {
    if (pendingTransactions.length === 0) return;

    const pendingIds = new Set(pendingTransactions.map((transaction) => transaction.id));
    setPlan((current) =>
      current
        ? {
            ...current,
            transactions: current.transactions.map((transaction) =>
              pendingIds.has(transaction.id) ? { ...transaction, reviewed: true, confidence: 1 } : transaction
            )
          }
        : current
    );
    setStatus(`${pendingTransactions.length} transacoes aprovadas.`);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Zelo / Financeiro"
        title="Lancar"
        subtitle="Novo lancamento, importacao de fatura e revisao de pendencias ficam separados. Ao aprovar, o item vai para Transacoes."
      />

      <div className="metric-grid compact">
        <MetricCard icon={<WalletCards />} label="Transacoes" value={number.format(plan.transactions.length)} />
        <MetricCard icon={<ClipboardList />} label="Para revisar" value={number.format(pendingTransactions.length)} />
        <MetricCard icon={<Check />} label="Aprovadas" value={number.format(reviewedTransactions.length)} />
        <MetricCard icon={<FileUp />} label="Importadas" value={number.format(importedTransactions.length)} />
        <MetricCard icon={<CalendarClock />} label="Recorrentes" value={number.format(recurringTransactions.length)} />
        <MetricCard icon={<CircleDollarSign />} label="Gastos lancados" value={preciseCurrency.format(currentMonthSpend)} />
      </div>

      <div className="filter-tabs launch-tabs" role="tablist" aria-label="Etapas de lancamento">
        <button type="button" role="tab" aria-selected={launchTab === "launch"} className={launchTab === "launch" ? "active" : ""} onClick={() => setLaunchTab("launch")}>
          <span>Novo lancamento</span>
        </button>
        <button type="button" role="tab" aria-selected={launchTab === "import"} className={launchTab === "import" ? "active" : ""} onClick={() => setLaunchTab("import")}>
          <span>Importar fatura</span>
        </button>
        <button type="button" role="tab" aria-selected={launchTab === "review"} className={launchTab === "review" ? "active" : ""} onClick={() => setLaunchTab("review")}>
          <span>Revisar pendencias</span>
          <strong>{number.format(pendingTransactions.length)}</strong>
        </button>
      </div>

      {launchTab === "launch" && (
      <>
      <Panel title="Novo lancamento" icon={<Plus size={18} />} wide>
        <div className="form-grid">
          <DateField
            label={manualEntry.isRecurring ? "Inicio" : manualEntry.isInstallment ? "Data da primeira parcela" : "Data"}
            value={manualEntry.date}
            onChange={(date) => setManualEntry((current) => ({ ...current, date }))}
          />
          <TextField label="Descricao" value={manualEntry.merchant} onChange={(merchant) => setManualEntry((current) => ({ ...current, merchant }))} />
          <MoneyField label="Valor" value={manualEntry.amount} onChange={(amount) => setManualEntry((current) => ({ ...current, amount }))} />
          <SelectField label="Quem gastou" value={manualEntry.spentByPersonId} options={spenderOptions} onChange={updateManualSpender} />
          <SelectField
            label="Tipo"
            value={manualEntry.type}
            options={
              manualEntry.isRecurring || manualEntry.isInstallment
                ? [
                    { value: "expense", label: "Conta/gasto" },
                    { value: "investment", label: "Aporte" },
                    { value: "debt_payment", label: "Pagamento/parcelamento" }
                  ]
                : [
                    { value: "income", label: "Renda avulsa" },
                    { value: "expense", label: "Gasto" },
                    { value: "investment", label: "Aporte" },
                    { value: "debt_payment", label: "Pagamento/parcelamento" }
                  ]
            }
            onChange={(type) => updateManualType(type as FinancialTransaction["type"])}
          />
          <SelectField label="Categoria" value={manualEntry.category} options={categoryOptions} onChange={(category) => setManualEntry((current) => ({ ...current, category: category as ExpenseCategory }))} />
          <ToggleField label="Parcelamento finito" checked={manualEntry.isInstallment} onChange={updateManualInstallment} />
          {manualEntry.isInstallment && (
            <>
              <NumberField label="Parcela inicial" value={manualEntry.installmentStart} onChange={(installmentStart) => setManualEntry((current) => ({ ...current, installmentStart }))} />
              <NumberField label="Total de parcelas" value={manualEntry.installmentTotal} onChange={(installmentTotal) => setManualEntry((current) => ({ ...current, installmentTotal }))} />
            </>
          )}
          <ToggleField label="Conta recorrente" checked={manualEntry.isRecurring} onChange={updateManualRecurring} />
          {manualEntry.isRecurring && (
            <SelectField label="Frequencia" value={manualEntry.frequency} options={recurringFrequencyOptions} onChange={(frequency) => setManualEntry((current) => ({ ...current, frequency: frequency as RecurringTransaction["frequency"] }))} />
          )}
        </div>
        <div className="manual-entry-actions">
          <button className="primary-button" onClick={addManualTransaction}>
            <Save size={16} /> {manualEntry.isRecurring ? "Salvar recorrencia" : manualEntry.isInstallment ? "Salvar parcelas" : "Salvar lancamento"}
          </button>
        </div>
        {status && <p className="form-note">{status}</p>}
      </Panel>

      <Panel title="Contas recorrentes" icon={<CalendarClock size={18} />} wide>
        <div className="item-list">
          {recurringTransactions.length === 0 && <EmptyState title="Nenhuma conta recorrente cadastrada" />}
          {recurringTransactions.map((transaction) => (
            <div className="editable-item" key={transaction.id}>
              <div className="item-form">
                <TextField
                  label="Nome"
                  value={transaction.name}
                  onChange={(name) => patchRecurringTransaction(transaction.id, { name })}
                />
                <MoneyField
                  label="Valor"
                  value={transaction.amount}
                  onChange={(amount) => patchRecurringTransaction(transaction.id, { amount })}
                />
                <SelectField
                  label="Categoria"
                  value={transaction.category}
                  options={categoryOptions}
                  onChange={(category) => patchRecurringTransaction(transaction.id, { category: category as ExpenseCategory })}
                />
                <SelectField
                  label="Frequencia"
                  value={transaction.frequency}
                  options={recurringFrequencyOptions}
                  onChange={(frequency) =>
                    patchRecurringTransaction(transaction.id, { frequency: frequency as RecurringTransaction["frequency"] })
                  }
                />
                <SelectField
                  label="Tipo"
                  value={transaction.type}
                  options={[
                    { value: "expense", label: "Conta/gasto" },
                    { value: "investment", label: "Aporte" },
                    { value: "debt_payment", label: "Pagamento/parcelamento" }
                  ]}
                  onChange={(type) =>
                    patchRecurringTransaction(transaction.id, { type: type as RecurringTransaction["type"] })
                  }
                />
                <DateField
                  label="Inicio"
                  value={transaction.startDate}
                  onChange={(startDate) => patchRecurringTransaction(transaction.id, { startDate })}
                />
              </div>
              <button className="icon-button danger" aria-label={`Remover ${transaction.name}`} onClick={() => removeRecurringTransaction(transaction.id)}>
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      </Panel>
      </>
      )}

      {launchTab === "import" && (
      <section className="import-panel">
        <div className="file-drop">
          <Mascot mood={busy ? "work" : file ? "celebrate" : "idle"} size="md" />
          <label>
            <strong>{file ? file.name : "CSV ou PDF de fatura/extrato"}</strong>
            <span>Nubank, bancos e cartoes. Depois da importacao, revise as pendencias na aba Revisar.</span>
            <input type="file" accept=".csv,.pdf,text/csv,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
        </div>
        <button className="primary-button" disabled={!file || busy} onClick={importFile}>
          {busy ? <Loader2 className="spin" size={16} /> : <FileUp size={16} />}
          Importar fatura
        </button>
        {status && <p className="form-note">{status}</p>}
        {lastStatement && (
          <div className="statement-summary">
            <strong>{lastStatement.sourceFile ?? file?.name ?? "Fatura importada"}</strong>
            <span>{statementRelativeLabels[lastStatement.relativeMonth]}</span>
            <span>Competencia {formatReferenceMonth(lastStatement.referenceMonth)}</span>
            {lastStatement.dueDate && <span>Vencimento {formatDateDisplay(lastStatement.dueDate)}</span>}
            {lastStatement.periodStart && lastStatement.periodEnd && (
              <span>
                Periodo {formatDateDisplay(lastStatement.periodStart)} a {formatDateDisplay(lastStatement.periodEnd)}
              </span>
            )}
          </div>
        )}
      </section>
      )}

      {launchTab === "review" && (
      <Panel title="Revisar pendencias" icon={<WalletCards size={18} />} wide>
        <div className="table-toolbar">
          <span>{number.format(pendingTransactions.length)} pendencia(s)</span>
          {pendingTransactions.length > 0 && (
            <button className="primary-button" type="button" onClick={approveAllPending}>
              <Check size={16} /> Aprovar todas
            </button>
          )}
        </div>
        {status && launchTab === "review" && <p className="form-note">{status}</p>}
        <TransactionReviewTable
          plan={plan}
          setPlan={setPlan}
          transactions={pendingTransactions}
          emptyTitle="Nenhuma pendencia para revisar"
          setStatus={setStatus}
        />
      </Panel>
      )}
    </div>
  );
}

const transactionTypeFilterOptions = [
  { value: "", label: "Todos os tipos" },
  ...Object.entries(transactionTypeLabels).map(([value, label]) => ({ value, label }))
];

function TransactionsView({ plan, setPlan }: { plan: FinancePlan; setPlan: Dispatch<SetStateAction<FinancePlan | null>> }) {
  const [reviewFilter, setReviewFilter] = useState<"all" | "reviewed" | "pending">("all");
  const [monthFilter, setMonthFilter] = useState<string[]>(() => [currentTransactionMonthKey()]);
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const currentMonth = currentTransactionMonthKey();
  const recurringTransactions = plan.recurringTransactions ?? [];
  const typeOptions = transactionTypeFilterOptions;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm), 180);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const categoryFilterOptions = useMemo(() => expenseCategoryOptions(plan), [plan.expenseCategories]);
  const monthOptions = useMemo(() => {
    const forecastMonths = recurringTransactions.length > 0 ? nextMonthKeys(currentMonth, 12) : [];
    return [
      ...Array.from(new Set([currentMonth, ...forecastMonths, ...plan.transactions.map(transactionMonthKey).filter(Boolean)]))
        .sort((a, b) => b.localeCompare(a))
        .map((month) => ({ value: month, label: formatTransactionMonth(month) }))
    ];
  }, [currentMonth, plan.transactions, recurringTransactions.length]);
  const hasDateFilter = Boolean(startDateFilter || endDateFilter);
  const periodLabel = hasDateFilter
    ? `${startDateFilter ? formatDateDisplay(startDateFilter) : "Inicio"} a ${endDateFilter ? formatDateDisplay(endDateFilter) : "Hoje"}`
    : monthFilter.length === 0
    ? "Todos os meses"
    : monthFilter.length === 1
    ? formatTransactionMonth(monthFilter[0] ?? "")
    : `${monthFilter.length} meses selecionados`;
  const recurringPeriodMonths = useMemo(() => {
    if (hasDateFilter) {
      return monthKeysBetween((startDateFilter || `${currentMonth}-01`).slice(0, 7), (endDateFilter || `${currentMonth}-01`).slice(0, 7));
    }
    if (monthFilter.length === 0) return monthOptions.map((option) => option.value);
    return monthFilter;
  }, [currentMonth, endDateFilter, hasDateFilter, monthFilter, monthOptions, startDateFilter]);
  const periodTransactions = useMemo(() => {
    const normalizedSearch = debouncedSearch.trim().toLowerCase();
    return plan.transactions.filter((transaction) => {
      const transactionDate = toDateInput(transaction.date);
      const matchesMonth = hasDateFilter || monthFilter.length === 0 || monthFilter.includes(transactionMonthKey(transaction));
      const matchesStartDate = !startDateFilter || transactionDate >= startDateFilter;
      const matchesEndDate = !endDateFilter || transactionDate <= endDateFilter;
      const matchesCategory = categoryFilter.length === 0 || categoryFilter.includes(transaction.category);
      const matchesType = !typeFilter || transaction.type === typeFilter;
      const matchesSearch =
        !normalizedSearch ||
        transaction.merchant.toLowerCase().includes(normalizedSearch) ||
        (transaction.description ?? "").toLowerCase().includes(normalizedSearch);

      return matchesMonth && matchesStartDate && matchesEndDate && matchesCategory && matchesType && matchesSearch;
    });
  }, [categoryFilter, debouncedSearch, endDateFilter, hasDateFilter, monthFilter, plan.transactions, startDateFilter, typeFilter]);
  const periodRecurringOccurrences = useMemo(() => {
    const normalizedSearch = debouncedSearch.trim().toLowerCase();
    return buildRecurringOccurrences(recurringTransactions, recurringPeriodMonths).filter((occurrence) => {
      const occurrenceDate = toDateInput(occurrence.date);
      const matchesStartDate = !startDateFilter || occurrenceDate >= startDateFilter;
      const matchesEndDate = !endDateFilter || occurrenceDate <= endDateFilter;
      const matchesCategory = categoryFilter.length === 0 || categoryFilter.includes(occurrence.category);
      const matchesType = !typeFilter || occurrence.type === typeFilter;
      const matchesSearch =
        !normalizedSearch ||
        occurrence.merchant.toLowerCase().includes(normalizedSearch) ||
        labels.frequency[occurrence.recurringTransaction.frequency].toLowerCase().includes(normalizedSearch);

      return matchesStartDate && matchesEndDate && matchesCategory && matchesType && matchesSearch;
    });
  }, [categoryFilter, debouncedSearch, endDateFilter, recurringPeriodMonths, recurringTransactions, startDateFilter, typeFilter]);
  const pendingTransactions = useMemo(() => periodTransactions.filter((transaction) => !transaction.reviewed), [periodTransactions]);
  const reviewedTransactions = useMemo(() => periodTransactions.filter((transaction) => transaction.reviewed), [periodTransactions]);
  const visibleTransactions = useMemo(
    () =>
      periodTransactions.filter(
        (transaction) =>
          reviewFilter === "all" || (reviewFilter === "pending" && !transaction.reviewed) || (reviewFilter === "reviewed" && transaction.reviewed)
      ),
    [periodTransactions, reviewFilter]
  );
  const visibleRecurringOccurrences = reviewFilter === "pending" ? [] : periodRecurringOccurrences;
  const visibleItems: TransactionAnalyticsItem[] = useMemo(
    () => [
      ...visibleTransactions.map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        merchant: transaction.merchant,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category
      })),
      ...visibleRecurringOccurrences
    ],
    [visibleRecurringOccurrences, visibleTransactions]
  );
  const expenseItems = useMemo(() => visibleItems.filter(isExpenseLikeItem), [visibleItems]);
  const categoryRows = useMemo(
    () =>
      Array.from(
        expenseItems
          .reduce((map, item) => {
            const current = map.get(item.category) ?? {
              id: item.category,
              name: expenseCategoryName(plan, item.category),
              value: 0,
              count: 0,
              color: expenseCategoryColor(plan, item.category)
            };
            current.value += item.amount;
            current.count += 1;
            map.set(item.category, current);
            return map;
          }, new Map<ExpenseCategory, { id: ExpenseCategory; name: string; value: number; count: number; color: string }>())
          .values()
      ).sort((a, b) => b.value - a.value),
    [expenseItems, plan]
  );
  const timelineByMonth = !hasDateFilter && new Set(expenseItems.map((item) => toDateInput(item.date).slice(0, 7))).size > 1;
  const timelineRows = useMemo(
    () =>
      Array.from(
        expenseItems
          .reduce((map, item) => {
            const day = toDateInput(item.date);
            const key = timelineByMonth ? day.slice(0, 7) : day;
            if (!key) return map;
            const current = map.get(key) ?? {
              key,
              label: timelineByMonth ? formatTransactionMonth(key) : formatDateDisplay(item.date).slice(0, 5),
              value: 0
            };
            current.value += item.amount;
            map.set(key, current);
            return map;
          }, new Map<string, { key: string; label: string; value: number }>())
          .values()
      ).sort((a, b) => a.key.localeCompare(b.key)),
    [expenseItems, timelineByMonth]
  );
  const totalSpend = useMemo(() => expenseItems.reduce((sum, item) => sum + item.amount, 0), [expenseItems]);
  const averageTicket = expenseItems.length ? totalSpend / expenseItems.length : 0;
  const reviewOptions = [
    { value: "all", label: "Todas", count: periodTransactions.length + periodRecurringOccurrences.length },
    { value: "reviewed", label: "Aprovadas", count: reviewedTransactions.length + periodRecurringOccurrences.length },
    { value: "pending", label: "Pendentes", count: pendingTransactions.length }
  ] as const;
  const updateMonthFilter = (months: string[]) => {
    setMonthFilter(months);
    setStartDateFilter("");
    setEndDateFilter("");
  };
  const updateStartDateFilter = (date: string) => {
    setStartDateFilter(date);
    if (date) setMonthFilter([]);
  };
  const updateEndDateFilter = (date: string) => {
    setEndDateFilter(date);
    if (date) setMonthFilter([]);
  };
  const clearFilters = () => {
    setReviewFilter("all");
    setMonthFilter([currentTransactionMonthKey()]);
    setStartDateFilter("");
    setEndDateFilter("");
    setCategoryFilter([]);
    setTypeFilter("");
    setSearchTerm("");
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Zelo / Financeiro"
        title="Transacoes"
        subtitle="Consulte o que ja foi aprovado e acompanhe o que ainda segue pendente. Exporte o periodo filtrado quando precisar."
      />

      <div className="metric-grid transaction-summary-grid">
        <MetricCard icon={<WalletCards />} label="Gastos filtrados" value={preciseCurrency.format(totalSpend)} />
        <MetricCard icon={<ClipboardList />} label="Itens exibidos" value={number.format(visibleItems.length)} />
        <MetricCard icon={<BadgeDollarSign />} label="Ticket medio" value={preciseCurrency.format(averageTicket)} />
        <MetricCard icon={<CalendarClock />} label="Periodo" value={periodLabel} />
      </div>

      <Panel title="Filtros" icon={<SlidersHorizontal size={18} />} wide>
        <div className="transaction-filter-panel">
          <div className="transaction-filter-status">
            <div className="filter-tabs" role="tablist" aria-label="Filtro de transacoes">
              {reviewOptions.map((option) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={reviewFilter === option.value}
                  className={reviewFilter === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => setReviewFilter(option.value)}
                >
                  <span>{option.label}</span>
                  <strong>{number.format(option.count)}</strong>
                </button>
              ))}
            </div>
            <span className="transaction-filter-period">{periodLabel}</span>
          </div>
          <div className="transaction-filter-grid primary">
            <MultiSelectField label="Meses" values={monthFilter} options={monthOptions} emptyLabel="Todos os meses" onChange={updateMonthFilter} />
            <DateField label="Data inicial" value={startDateFilter} onChange={updateStartDateFilter} />
            <DateField label="Data final" value={endDateFilter} onChange={updateEndDateFilter} />
          </div>
          <div className="transaction-filter-grid secondary">
            <MultiSelectField label="Categorias" values={categoryFilter} options={categoryFilterOptions} onChange={setCategoryFilter} />
            <SelectField label="Tipo" value={typeFilter} options={typeOptions} onChange={setTypeFilter} />
            <TextField label="Buscar" value={searchTerm} onChange={setSearchTerm} />
            <button className="secondary-button" type="button" onClick={clearFilters}>
              Mes atual
            </button>
          </div>
        </div>
      </Panel>

      <section className="transaction-analytics-grid">
        <Panel title="Gastos por categoria" icon={<Palette size={18} />}>
          {categoryRows.length > 0 ? (
            <ChartFrame compact>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryRows.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#d9ded8" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={132} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => preciseCurrency.format(Number(value))} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {categoryRows.slice(0, 8).map((item) => (
                      <Cell key={item.id} fill={item.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          ) : (
            <EmptyState title="Sem gastos neste filtro" />
          )}
        </Panel>

        <Panel title="Evolucao do periodo" icon={<LineChart size={18} />}>
          {timelineRows.length > 0 ? (
            <ChartFrame compact>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineRows} margin={{ left: 8, right: 16 }}>
                  <defs>
                    <linearGradient id="transactionSpendFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d9ded8" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => currency.format(Number(value))} width={82} />
                  <Tooltip formatter={(value) => preciseCurrency.format(Number(value))} />
                  <Area type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2.5} fill="url(#transactionSpendFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartFrame>
          ) : (
            <EmptyState title="Sem evolucao para exibir" />
          )}
        </Panel>
      </section>

      <Panel title="Recorrentes do periodo" icon={<CalendarClock size={18} />} wide>
        <RecurringOccurrencesList plan={plan} occurrences={visibleRecurringOccurrences} />
      </Panel>

      <Panel title="Extrato" icon={<WalletCards size={18} />} wide>
        <div className="table-toolbar">
          <span>{number.format(visibleTransactions.length)} lancamento(s) exibido(s)</span>
          <div className="table-toolbar-actions">
            {status && <p className="form-note">{status}</p>}
            <button
              className="secondary-button"
              type="button"
              disabled={visibleTransactions.length === 0}
              onClick={() => {
                exportTransactionsCsv(plan, visibleTransactions);
                setStatus("Extrato exportado em CSV.");
              }}
            >
              <Download size={16} /> Exportar CSV
            </button>
          </div>
        </div>
        <TransactionReviewTable
          plan={plan}
          setPlan={setPlan}
          transactions={visibleTransactions}
          emptyTitle="Nenhuma transacao neste filtro"
          setStatus={setStatus}
        />
      </Panel>
    </div>
  );
}

function RecurringOccurrencesList({ plan, occurrences }: { plan: FinancePlan; occurrences: RecurringOccurrence[] }) {
  const sortedOccurrences = useMemo(
    () =>
      occurrences.slice().sort((a, b) => {
        const monthOrder = b.month.localeCompare(a.month);
        return monthOrder || a.merchant.localeCompare(b.merchant);
      }),
    [occurrences]
  );

  if (sortedOccurrences.length === 0) {
    return <EmptyState title="Nenhum recorrente neste filtro" />;
  }

  return (
    <div className="recurring-occurrence-list">
      {sortedOccurrences.map((occurrence) => (
        <div className="recurring-occurrence-row" key={occurrence.id}>
          <span className={`type-pill ${occurrence.type}`}>{transactionTypeLabels[occurrence.type]}</span>
          <div>
            <strong>{occurrence.merchant}</strong>
            <span>
              {formatTransactionMonth(occurrence.month)} · {labels.frequency[occurrence.recurringTransaction.frequency]}
            </span>
          </div>
          <CategoryPill plan={plan} id={occurrence.category} />
          <strong>{preciseCurrency.format(occurrence.amount)}</strong>
        </div>
      ))}
    </div>
  );
}

function HistoryView({
  plan,
  setPlan,
  analysis
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  analysis: FinancialAnalysis;
}) {
  const [status, setStatus] = useState("");
  const snapshots = useMemo(
    () => plan.monthlySnapshots.slice().sort((a, b) => b.month.localeCompare(a.month)),
    [plan.monthlySnapshots]
  );
  const snapshot = async () => {
    try {
      const response = await apiRequest(`/plans/${plan.id}/snapshots`, {
        method: "POST"
      });
      const result = (await response.json()) as { plan?: FinancePlan };
      if (!result.plan) throw new Error("Falha no snapshot");
      setPlan(result.plan);
      setStatus("Snapshot mensal atualizado.");
    } catch {
      const currentSnapshot = buildMonthlySnapshot(plan);
      setPlan((current) =>
        current
          ? {
              ...current,
              monthlySnapshots: [...current.monthlySnapshots.filter((item) => item.month !== currentSnapshot.month), currentSnapshot]
            }
          : current
      );
      setStatus("Snapshot salvo localmente.");
    }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Zelo / Financeiro" title="Evolucao" subtitle="Snapshots mensais mostram renda, gastos, aportes e patrimonio ao longo do tempo." />
      <section className="history-actions">
        <button className="primary-button" onClick={snapshot}>
          <Save size={16} /> Registrar mes atual
        </button>
        {status && <span>{status}</span>}
      </section>
      <section className="metric-grid compact">
        <MetricCard icon={<WalletCards />} label="Patrimonio liquido" value={currency.format(analysis.patrimony.netWorth)} />
        <MetricCard icon={<Banknote />} label="Renda recorrente" value={currency.format(analysis.income.recurringMonthly)} />
        <MetricCard icon={<Activity />} label="Aporte realizado" value={currency.format(analysis.capacity.actualInvestment)} />
        <MetricCard icon={<CircleDollarSign />} label="Gasto observado" value={currency.format(analysis.spending.currentMonthSpend)} />
      </section>
      <Panel title="Snapshots" icon={<CalendarClock size={18} />} wide>
        <div className="snapshot-table">
          <div className="transaction-head">
            <span>Mes</span>
            <span>Patrimonio</span>
            <span>Renda</span>
            <span>Gastos</span>
            <span>Aportes</span>
            <span>Taxa</span>
          </div>
          {snapshots.length === 0 && <EmptyState title="Nenhum snapshot registrado" />}
          {snapshots.map((item) => (
              <div className="transaction-row" key={item.id}>
                <span>{item.month}</span>
                <strong>{currency.format(item.totalNetWorth)}</strong>
                <span>{currency.format(item.recurringIncome)}</span>
                <span>{currency.format(item.observedSpend)}</span>
                <span>{currency.format(item.investedAmount)}</span>
                <span>{percent.format(item.savingsRate)}</span>
              </div>
            ))}
        </div>
      </Panel>
    </div>
  );
}

function EditorSection({
  title,
  icon,
  action,
  children,
  compact
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`editor-section ${compact ? "compact" : ""}`}>
      <header>
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ownerOptions(plan: FinancePlan) {
  const acceptedInvitePersonIds = new Set(acceptedLinkedPeople(plan).map((person) => person.id));
  const selectablePeople = plan.profile.people.filter(
    (person) => person.role === "primary" || person.accountStatus === "linked" || acceptedInvitePersonIds.has(person.id)
  );

  return [
    { value: "", label: "Sem responsavel" },
    ...selectablePeople.map((person) => ({
      value: person.id,
      label: person.name || (person.role === "primary" ? "Pessoa principal" : "Conta vinculada")
    }))
  ];
}

function spenderSelectOptions(plan: FinancePlan) {
  return [
    { value: "", label: "Quem gastou?" },
    ...ownerOptions(plan)
      .filter((option) => option.value)
      .map((option) => ({ ...option, label: option.label })),
    { value: thirdPartySpenderValue, label: "Terceiro" }
  ];
}

function spenderValueForTransaction(transaction: FinancialTransaction) {
  if (transaction.audience === "thirdParty" || transaction.nature === "thirdParty" || transaction.category === "thirdParty") {
    return thirdPartySpenderValue;
  }

  return transaction.spentByPersonId ?? "";
}

function spenderPatch(value: string, transaction?: FinancialTransaction): Partial<FinancialTransaction> {
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
    nature: transaction?.nature === "thirdParty" ? "variable" : transaction?.nature,
    category: transaction?.category === "thirdParty" ? "other" : transaction?.category
  };
}

function acceptedLinkedPeople(plan: FinancePlan) {
  const acceptedInvitePersonIds = new Set(
    (plan.profile.accountLinks ?? [])
      .filter((link) => link.status === "accepted" && link.inviteePersonId)
      .map((link) => link.inviteePersonId)
  );

  return plan.profile.people.filter((person) => person.role !== "primary" && (person.accountStatus === "linked" || acceptedInvitePersonIds.has(person.id)));
}

function ShareAssetField({
  people,
  values,
  onChange
}: {
  people: Person[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="asset-share-field">
      <span>Compartilhar patrimonio com</span>
      <div>
        {people.map((person) => {
          const active = values.includes(person.id);
          return (
            <button
              key={person.id}
              className={active ? "active" : ""}
              onClick={() => onChange(active ? values.filter((value) => value !== person.id) : [...values, person.id])}
            >
              {person.name || "Conta vinculada"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && visible ? "text" : type;

  return (
    <label className="field">
      {label && <span>{label}</span>}
      {isPassword ? (
        <div className="field-input-wrap">
          <input
            type={inputType}
            autoComplete={autoComplete}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            type="button"
            className="field-reveal"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={visible}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      ) : (
        <input type={type} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label?: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field color-field">
      {label && <span>{label}</span>}
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

const wholeNumber = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0
});

const decimalPercent = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2
});

function maskDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return [day, month, year].filter(Boolean).join("/");
}

function formatDateDisplay(value?: string) {
  const dateInput = toDateInput(value);
  if (!dateInput) return "";
  const [year, month, day] = dateInput.split("-");
  return `${day}/${month}/${year}`;
}

function parseDateDisplay(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function formatNumberDisplay(value: number) {
  return value ? wholeNumber.format(value) : "";
}

function formatPercentDisplay(value: number) {
  return value ? `${decimalPercent.format(value * 100)}%` : "";
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [displayValue, setDisplayValue] = useState(() => formatNumberDisplay(value));

  useEffect(() => {
    setDisplayValue(formatNumberDisplay(value));
  }, [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="numeric"
        value={displayValue}
        onBlur={() => setDisplayValue(formatNumberDisplay(value))}
        onChange={(event) => {
          const nextValue = event.target.value.replace(/[^\d]/g, "");
          setDisplayValue(nextValue);
          onChange(emptyToZero(nextValue));
        }}
        onFocus={(event) => event.currentTarget.select()}
      />
    </label>
  );
}

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [displayValue, setDisplayValue] = useState(() => formatPercentDisplay(value));

  useEffect(() => {
    setDisplayValue(formatPercentDisplay(value));
  }, [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={displayValue}
        onBlur={() => setDisplayValue(formatPercentDisplay(value))}
        onChange={(event) => {
          setDisplayValue(event.target.value);
          onChange(emptyToZero(event.target.value) / 100);
        }}
        onFocus={(event) => event.currentTarget.select()}
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} readOnly />
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  const [displayValue, setDisplayValue] = useState(() => formatDateDisplay(value));

  useEffect(() => {
    setDisplayValue(formatDateDisplay(value));
  }, [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        value={displayValue}
        onBlur={() => setDisplayValue(formatDateDisplay(value))}
        onChange={(event) => {
          const maskedValue = maskDate(event.target.value);
          const parsedDate = parseDateDisplay(maskedValue);
          setDisplayValue(maskedValue);
          if (parsedDate || !maskedValue) onChange(parsedDate ?? "");
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const trigger = fieldRef.current?.querySelector(".select-trigger");
      if (!trigger) {
        setOpen(false);
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const viewportPadding = 14;
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const estimatedOptionHeight = 41;
      const desiredHeight = Math.min(320, options.length * estimatedOptionHeight + 12);
      const opensAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
      const availableSpace = opensAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(96, Math.min(desiredHeight, availableSpace - gap));
      const desiredWidth = Math.min(Math.max(rect.width, 320), viewportWidth - viewportPadding * 2);
      const left = Math.min(Math.max(viewportPadding, rect.left), viewportWidth - desiredWidth - viewportPadding);

      setMenuRect({
        top: opensAbove ? Math.max(viewportPadding, rect.top - maxHeight - gap) : rect.bottom + gap,
        left,
        width: desiredWidth,
        maxHeight
      });
    };

    updateMenuPosition();

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!fieldRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  const selectOption = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
  };

  return (
    <div className={`field select-field ${open ? "open" : ""}`} ref={fieldRef}>
      {label && <span>{label}</span>}
      <button
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="select-value">
          {selectedOption?.color && <span className="select-swatch" style={{ backgroundColor: selectedOption.color }} />}
          <span className="select-text">{selectedOption?.label ?? "Selecionar"}</span>
        </span>
        <ChevronDown className="select-chevron" size={18} />
      </button>
      {open &&
        createPortal(
          <div
            className="select-menu floating"
            ref={menuRef}
            role="listbox"
            style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width, maxHeight: menuRect.maxHeight }}
          >
            {options.map((option) => (
              <button
                type="button"
                className={`select-option ${option.value === value ? "selected" : ""}`}
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onClick={() => selectOption(option)}
              >
                <span className="select-value">
                  {option.color && <span className="select-swatch" style={{ backgroundColor: option.color }} />}
                  <span className="select-text">{option.label}</span>
                </span>
                {option.value === value && <Check size={16} />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

function MultiSelectField({
  label,
  values,
  options,
  emptyLabel = "Todas as categorias",
  onChange
}: {
  label?: string;
  values: string[];
  options: SelectOption[];
  emptyLabel?: string;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedOptions = options.filter((option) => values.includes(option.value));

  useLayoutEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const trigger = fieldRef.current?.querySelector(".select-trigger");
      if (!trigger) {
        setOpen(false);
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const viewportPadding = 14;
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const estimatedOptionHeight = 41;
      const desiredHeight = Math.min(320, options.length * estimatedOptionHeight + 56);
      const opensAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
      const availableSpace = opensAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(120, Math.min(desiredHeight, availableSpace - gap));
      const desiredWidth = Math.min(Math.max(rect.width, 340), viewportWidth - viewportPadding * 2);
      const left = Math.min(Math.max(viewportPadding, rect.left), viewportWidth - desiredWidth - viewportPadding);

      setMenuRect({
        top: opensAbove ? Math.max(viewportPadding, rect.top - maxHeight - gap) : rect.bottom + gap,
        left,
        width: desiredWidth,
        maxHeight
      });
    };

    updateMenuPosition();

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!fieldRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, options.length]);

  const toggleOption = (option: SelectOption) => {
    onChange(values.includes(option.value) ? values.filter((value) => value !== option.value) : [...values, option.value]);
  };

  return (
    <div className={`field select-field ${open ? "open" : ""}`} ref={fieldRef}>
      {label && <span>{label}</span>}
      <button
        type="button"
        className="select-trigger multi"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="select-value">
          {selectedOptions.length === 0 ? (
            <span className="select-text muted">{emptyLabel}</span>
          ) : (
            <span className="select-chip-list">
              {selectedOptions.slice(0, 2).map((option) => (
                <span className="select-chip" key={option.value}>
                  {option.color && <span className="select-swatch" style={{ backgroundColor: option.color }} />}
                  {option.label}
                </span>
              ))}
              {selectedOptions.length > 2 && <span className="select-count">+{selectedOptions.length - 2}</span>}
            </span>
          )}
        </span>
        <ChevronDown className="select-chevron" size={18} />
      </button>
      {open &&
        createPortal(
          <div
            className="select-menu floating"
            ref={menuRef}
            role="listbox"
            aria-multiselectable="true"
            style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width, maxHeight: menuRect.maxHeight }}
          >
            <button type="button" className={`select-option ${values.length === 0 ? "selected" : ""}`} onClick={() => onChange([])}>
              <span className="select-value">
                <span className="select-text">{emptyLabel}</span>
              </span>
              {values.length === 0 && <Check size={16} />}
            </button>
            {options.map((option) => {
              const selected = values.includes(option.value);
              return (
                <button
                  type="button"
                  className={`select-option ${selected ? "selected" : ""}`}
                  key={option.value}
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggleOption(option)}
                >
                  <span className="select-value">
                    {option.color && <span className="select-swatch" style={{ backgroundColor: option.color }} />}
                    <span className="select-text">{option.label}</span>
                  </span>
                  {selected && <Check size={16} />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`toggle-field${hint ? " has-hint" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}

function SegmentedField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented-field">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button key={option.value} className={option.value === value ? "active" : ""} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RangeField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="range-field">
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <input type="range" min={0} max={5} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function patchIncome(setPlan: Dispatch<SetStateAction<FinancePlan | null>>, id: string, patch: Partial<IncomeSource>) {
  setPlan((current) => (current ? { ...current, incomeSources: updateById(current.incomeSources, id, patch) } : current));
}

function removeIncome(setPlan: Dispatch<SetStateAction<FinancePlan | null>>, id: string) {
  setPlan((current) => (current ? { ...current, incomeSources: removeById(current.incomeSources, id) } : current));
}

function patchAsset(setPlan: Dispatch<SetStateAction<FinancePlan | null>>, id: string, patch: Partial<Asset>) {
  setPlan((current) => (current ? { ...current, assets: updateById(current.assets, id, patch) } : current));
}

function removeAsset(setPlan: Dispatch<SetStateAction<FinancePlan | null>>, id: string) {
  setPlan((current) => (current ? { ...current, assets: removeById(current.assets, id) } : current));
}

function patchDebt(setPlan: Dispatch<SetStateAction<FinancePlan | null>>, id: string, patch: Partial<Debt>) {
  setPlan((current) => (current ? { ...current, debts: updateById(current.debts, id, patch) } : current));
}

function removeDebt(setPlan: Dispatch<SetStateAction<FinancePlan | null>>, id: string) {
  setPlan((current) => (current ? { ...current, debts: removeById(current.debts, id) } : current));
}

function patchRisk(setPlan: Dispatch<SetStateAction<FinancePlan | null>>, patch: Partial<FinancePlan["risk"]>) {
  setPlan((current) => (current ? { ...current, risk: { ...current.risk, ...patch } } : current));
}

function patchRiskAnswer(setPlan: Dispatch<SetStateAction<FinancePlan | null>>, patch: Partial<FinancePlan["risk"]["answers"]>) {
  setPlan((current) =>
    current
      ? {
          ...current,
          risk: {
            ...current.risk,
            answers: {
              ...current.risk.answers,
              ...patch
            }
          }
        }
      : current
  );
}
