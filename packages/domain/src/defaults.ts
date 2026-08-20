import { defaultHealthModuleState } from "./health.js";
import { defaultHomeModuleState } from "./home.js";
import { defaultRoutineModuleState } from "./routine.js";
import { defaultSecretaryModuleState } from "./secretary.js";
import type {
  BudgetCategoryTarget,
  ExpenseCategory,
  ExpenseCategoryConfig,
  FinanceModuleScope,
  FinancePlan,
  HealthModuleScope,
  HomeModuleScope,
  IndependenceAssumptions,
  LifeWorkspace,
  ModuleAccessPermission,
  ModuleAccessRole,
  RiskAnswers,
  RoutineModuleScope,
  SecretaryModuleScope,
  WorkspaceModule
} from "./types.js";

const nowIso = () => new Date().toISOString();

export const defaultRiskAnswers = (): RiskAnswers => ({
  investmentHorizon: 0,
  financialKnowledge: 0,
  volatilityTolerance: 0,
  liquidityNeed: 0,
  reactionToDrawdown: 0,
  incomeStability: 0,
  dependentsPressure: 0,
  nearTermGoalsPressure: 0
});

export const defaultIndependenceAssumptions = (): IndependenceAssumptions => ({
  inflationRate: 0,
  taxRate: 0,
  sustainableWithdrawalRate: 0,
  conservativeRealReturn: 0,
  baseRealReturn: 0,
  optimisticRealReturn: 0,
  contributionGrowthRate: 0,
  preservePrincipal: false
});

export const defaultWorkspaceModules = (): WorkspaceModule[] => [
  {
    id: "finance",
    name: "Financeiro",
    description: "Planejamento, gastos, patrimonio e metas.",
    status: "active"
  },
  {
    id: "secretary",
    name: "Secretaria",
    description: "WhatsApp, lembretes, contas e confirmacoes.",
    status: "active"
  },
  {
    id: "routine",
    name: "Rotina",
    description: "Briefing do dia, tarefas e agenda unificada.",
    status: "active"
  },
  {
    id: "health",
    name: "Saude",
    description: "Consultas, exames, medicamentos e carteira da familia.",
    status: "active"
  },
  {
    id: "home",
    name: "Casa",
    description: "Lista de mercado compartilhada no WhatsApp.",
    status: "active"
  },
  {
    id: "projects",
    name: "Projetos",
    description: "Objetivos pessoais, estudos, viagens e iniciativas.",
    status: "planned"
  }
];

export const defaultLifeWorkspace = (id = "primary", ownerPersonId = "primary"): LifeWorkspace => ({
  id,
  name: "MyLyfe",
  ownerPersonId,
  modules: defaultWorkspaceModules()
});

export const mergeWorkspaceModules = (current?: WorkspaceModule[]): WorkspaceModule[] => {
  const existing = new Map((current ?? []).map((module) => [module.id, module]));
  return defaultWorkspaceModules().map((catalog) => {
    const previous = existing.get(catalog.id);
    return previous ? { ...previous, ...catalog } : catalog;
  });
};

export const defaultFinanceModuleScopes = (): FinanceModuleScope[] => [
  "dashboard",
  "plan",
  "transactions",
  "categories",
  "history",
  "sharing"
];

export const defaultSecretaryModuleScopes = (): SecretaryModuleScope[] => ["home", "alerts", "whatsapp", "settings"];

export const defaultRoutineModuleScopes = (): RoutineModuleScope[] => ["home", "agenda", "tasks", "contexts", "calendars"];

export const defaultHealthModuleScopes = (): HealthModuleScope[] => ["home", "wallet", "appointments", "meds"];

export const defaultHomeModuleScopes = (): HomeModuleScope[] => ["list", "group"];

export const defaultHomeModuleAccess = (
  role: ModuleAccessRole = "editor",
  scopes: HomeModuleScope[] = defaultHomeModuleScopes()
): ModuleAccessPermission => ({
  moduleId: "home",
  role,
  scopes
});

export const defaultHealthModuleAccess = (
  role: ModuleAccessRole = "editor",
  scopes: HealthModuleScope[] = defaultHealthModuleScopes()
): ModuleAccessPermission => ({
  moduleId: "health",
  role,
  scopes
});

export const defaultRoutineModuleAccess = (
  role: ModuleAccessRole = "editor",
  scopes: RoutineModuleScope[] = defaultRoutineModuleScopes()
): ModuleAccessPermission => ({
  moduleId: "routine",
  role,
  scopes
});

export const defaultSecretaryModuleAccess = (
  role: ModuleAccessRole = "editor",
  scopes: SecretaryModuleScope[] = defaultSecretaryModuleScopes()
): ModuleAccessPermission => ({
  moduleId: "secretary",
  role,
  scopes
});

export const defaultFinanceModuleAccess = (
  role: ModuleAccessRole = "editor",
  scopes: FinanceModuleScope[] = defaultFinanceModuleScopes()
): ModuleAccessPermission => ({
  moduleId: "finance",
  role,
  scopes
});

export const defaultExpenseCategories = (): ExpenseCategoryConfig[] => [
  { id: "housing", name: "Moradia", color: "#2563eb", isDefault: true, isActive: true },
  { id: "food", name: "Alimentacao", color: "#16a34a", isDefault: true, isActive: true },
  { id: "transport", name: "Transporte", color: "#f59e0b", isDefault: true, isActive: true },
  { id: "health", name: "Saude", color: "#dc2626", isDefault: true, isActive: true },
  { id: "travel", name: "Viagens", color: "#0891b2", isDefault: true, isActive: true },
  { id: "shopping", name: "Compras e Lazer", color: "#db2777", isDefault: true, isActive: true },
  { id: "subscriptions", name: "Assinaturas", color: "#475569", isDefault: true, isActive: true },
  { id: "education", name: "Educacao", color: "#9333ea", isDefault: true, isActive: true },
  { id: "company", name: "Empresa", color: "#0f766e", isDefault: true, isActive: true },
  { id: "thirdParty", name: "Terceiros", color: "#64748b", isDefault: true, isActive: true },
  { id: "taxes", name: "Impostos", color: "#b45309", isDefault: true, isActive: true },
  { id: "investments", name: "Investimentos", color: "#15803d", isDefault: true, isActive: true },
  { id: "debt", name: "Parcelas e credito", color: "#be123c", isDefault: true, isActive: true },
  { id: "other", name: "Outros", color: "#6b7280", isDefault: true, isActive: true }
];

export const UNIFIED_SHOPPING_CATEGORY_ID = "shopping";

const normalizeCategoryLabel = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const unifiedShoppingLabels = new Set([
  "compras",
  "lazer",
  "compras online",
  "compras onnline",
  "compras e lazer",
  "shopping",
  "leisure"
]);

export const isUnifiedShoppingCategory = (id: string, name?: string) => {
  if (id === UNIFIED_SHOPPING_CATEGORY_ID || id === "leisure") return true;

  const slug = id.replace(/^custom-/, "").replace(/-/g, " ");
  const labels = [name, slug, id].filter(Boolean).map((value) => normalizeCategoryLabel(String(value)));

  return labels.some((label) => unifiedShoppingLabels.has(label) || /compras\s+onn?line/.test(label));
};

export const canonicalizeExpenseCategory = (id: ExpenseCategory, name?: string): ExpenseCategory =>
  isUnifiedShoppingCategory(id, name) ? UNIFIED_SHOPPING_CATEGORY_ID : id;

const mergeShoppingTargets = (targets: BudgetCategoryTarget[]) => {
  const merged = new Map<string, BudgetCategoryTarget>();

  for (const target of targets) {
    const category = canonicalizeExpenseCategory(target.category);
    const current = merged.get(category);

    if (!current) {
      merged.set(category, { ...target, category });
      continue;
    }

    merged.set(category, {
      category,
      monthlyTarget: current.monthlyTarget + target.monthlyTarget,
      share: (current.share ?? 0) + (target.share ?? 0) || undefined
    });
  }

  return [...merged.values()];
};

export const unifyShoppingCategories = (plan: FinancePlan): FinancePlan => {
  const categories = plan.expenseCategories ?? [];
  const shoppingCatalog = defaultExpenseCategories().find((category) => category.id === UNIFIED_SHOPPING_CATEGORY_ID);
  const shoppingLike = categories.filter((category) => isUnifiedShoppingCategory(category.id, category.name));
  const hasShoppingLikeUsage =
    shoppingLike.length > 0 ||
    (plan.transactions ?? []).some((transaction) => isUnifiedShoppingCategory(transaction.category)) ||
    (plan.recurringTransactions ?? []).some((transaction) => isUnifiedShoppingCategory(transaction.category)) ||
    (plan.classificationRules ?? []).some((rule) => isUnifiedShoppingCategory(rule.category)) ||
    (plan.budget.categoryTargets ?? []).some((target) => isUnifiedShoppingCategory(target.category));

  if (!hasShoppingLikeUsage || !shoppingCatalog) return plan;

  const existingShopping = categories.find((category) => category.id === UNIFIED_SHOPPING_CATEGORY_ID);
  const mergedShopping: ExpenseCategoryConfig = {
    ...shoppingCatalog,
    ...existingShopping,
    id: UNIFIED_SHOPPING_CATEGORY_ID,
    name: shoppingCatalog.name,
    color: existingShopping?.color ?? shoppingCatalog.color,
    isDefault: true,
    isActive: shoppingLike.some((category) => category.isActive) || existingShopping?.isActive !== false
  };
  let placedShopping = false;
  const nextCategories = categories.flatMap((category) => {
    if (!isUnifiedShoppingCategory(category.id, category.name)) return [category];
    if (placedShopping) return [];
    placedShopping = true;
    return [mergedShopping];
  });
  if (!placedShopping) nextCategories.push(mergedShopping);

  return {
    ...plan,
    expenseCategories: nextCategories,
    transactions: (plan.transactions ?? []).map((transaction) => ({
      ...transaction,
      category: canonicalizeExpenseCategory(transaction.category)
    })),
    recurringTransactions: (plan.recurringTransactions ?? []).map((transaction) => ({
      ...transaction,
      category: canonicalizeExpenseCategory(transaction.category)
    })),
    classificationRules: (plan.classificationRules ?? []).map((rule) => ({
      ...rule,
      category: canonicalizeExpenseCategory(rule.category)
    })),
    budget: {
      ...plan.budget,
      categoryTargets: mergeShoppingTargets(plan.budget.categoryTargets ?? [])
    }
  };
};

export const createEmptyPlan = (id = "primary"): FinancePlan => {
  const createdAt = nowIso();

  return {
    id,
    workspace: defaultLifeWorkspace(id),
    onboardingCompleted: false,
    createdAt,
    updatedAt: createdAt,
    profile: {
      people: [
        {
          id: "primary",
          name: "",
          role: "primary",
          accountStatus: "local"
        }
      ],
      maritalStatus: "single",
      planningMode: "individual",
      sharing: {
        patrimonyMode: "separate",
        sharedAccounts: false,
        expenseSplit: {
          primaryPercent: 100,
          partnerPercent: 0
        }
      },
      accountLinks: []
    },
    incomeSources: [],
    assets: [],
    debts: [],
    expenseProfile: {
      estimatedMonthlySpend: 0,
      currentMonthlyInvestments: 0,
      monthlyProvisions: 0,
      emergencyFundTargetMonths: 0
    },
    goals: [],
    budget: {
      mode: "suggested",
      categoryTargets: []
    },
    independence: {
      desiredMonthlySpend: 0,
      targetAge: 0,
      assumptions: defaultIndependenceAssumptions()
    },
    risk: {
      answers: defaultRiskAnswers(),
      suggestedProfile: "undefined"
    },
    transactions: [],
    recurringTransactions: [],
    expenseCategories: defaultExpenseCategories(),
    classificationRules: [],
    monthlySnapshots: [],
    secretary: defaultSecretaryModuleState(),
    routine: defaultRoutineModuleState(),
    health: defaultHealthModuleState(),
    home: defaultHomeModuleState()
  };
};
