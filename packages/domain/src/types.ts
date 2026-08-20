export type PlanningMode = "individual" | "family";
export type MaritalStatus = "single" | "married" | "stable_union" | "divorced" | "widowed" | "other";
export type OwnerId = string;
export type LifeModuleId = "finance" | "secretary" | "routine" | "health" | "home" | "projects";
export type ModuleStatus = "active" | "planned";
export type ModuleAccessRole = "viewer" | "editor" | "admin";
export type FinanceModuleScope = "dashboard" | "plan" | "transactions" | "categories" | "history" | "sharing";
export type SecretaryModuleScope = "home" | "alerts" | "whatsapp" | "settings";
export type RoutineModuleScope = "home" | "agenda" | "tasks" | "contexts" | "calendars";
export type HealthModuleScope = "home" | "wallet" | "appointments" | "meds";
export type HomeModuleScope = "list" | "group";
export type ShoppingItemStatus = "open" | "bought";
export type RoutineContextKind = "work" | "project" | "personal" | "other";
export type RoutineLocalEventSource = "health" | "manual";
export type HealthCareKind = "checkup" | "dentist" | "vaccine" | "ophthalmology" | "gynecology" | "urology" | "other";
export type HealthCareStatus = "on_track" | "due_soon" | "overdue";
export type HealthAppointmentKind = "consult" | "exam" | "follow_up" | "vaccine" | "other";
export type RoutineTaskStatus = "inbox" | "todo" | "doing" | "done" | "waiting";
export type RoutineTaskPriority = "none" | "low" | "medium" | "high";

export interface WorkspaceModule {
  id: LifeModuleId;
  name: string;
  description: string;
  status: ModuleStatus;
}

export interface LifeWorkspace {
  id: string;
  name: string;
  ownerPersonId: OwnerId;
  modules: WorkspaceModule[];
}

export interface ModuleAccessPermission {
  moduleId: LifeModuleId;
  role: ModuleAccessRole;
  scopes: string[];
}

export type Frequency = "monthly" | "weekly" | "biweekly" | "quarterly" | "annual" | "single";

export const assetCategories = [
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
  "fgts",
  "realEstate",
  "vehicles",
  "companies",
  "other"
] as const;

export type AssetCategory = (typeof assetCategories)[number];
export type Liquidity = "immediate" | "short" | "medium" | "long" | "illiquid";
export type DebtType = "financing" | "loan" | "installment" | "family" | "mortgage" | "vehicle" | "card" | "other";
export type IncomeType = "clt" | "pj" | "freelance" | "company" | "rent" | "dividends" | "pension" | "other";

export type TransactionAudience = "personal" | "business" | "thirdParty" | "reimbursable";
export type TransactionNature =
  | "essential"
  | "recurring"
  | "variable"
  | "extraordinary"
  | "business"
  | "thirdParty"
  | "investment"
  | "debtPayment"
  | "transfer"
  | "other";

export type BuiltInExpenseCategory =
  | "housing"
  | "food"
  | "transport"
  | "health"
  | "travel"
  | "shopping"
  | "subscriptions"
  | "education"
  | "company"
  | "thirdParty"
  | "taxes"
  | "investments"
  | "debt"
  | "other";

export type ExpenseCategory = BuiltInExpenseCategory | (string & {});
export type TransactionType = "expense" | "income" | "investment" | "debt_payment" | "transfer";
export type StatementRelativeMonth = "past" | "previous" | "current" | "next" | "future";
export type BudgetMode = "manual" | "suggested";
export type RiskProfileName = "conservative" | "balanced" | "growth" | "aggressive" | "undefined";
export type ScenarioName = "conservative" | "base" | "optimistic";
export type AccountLinkStatus = "pending" | "accepted" | "revoked";
export type StressScenarioType =
  | "incomeLoss"
  | "incomeReduction"
  | "unemployment"
  | "unexpectedExpense"
  | "marketDrop"
  | "realEstatePurchase"
  | "costOfLivingIncrease";

export interface Person {
  id: OwnerId;
  name: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  age?: number;
  role: "primary" | "partner" | "dependent";
  accountStatus?: "local" | "invited" | "linked";
  onboardingCompleted?: boolean;
}

export type AlertKind = "bill" | "tax" | "subscription" | "income" | "document" | "habit" | "one_off";
export type AlertStatus = "active" | "paused" | "completed" | "cancelled";
export type AlertCycleStatus = "scheduled" | "reminded" | "awaiting_confirmation" | "paid" | "snoozed" | "skipped";
export type AlertFrequency = Exclude<Frequency, "single"> | "once" | "daily";
export type AlertReplyIntent = "paid" | "not_paid" | "snooze" | "skip" | "unknown";
export type SecretaryOutboundKind = "remind" | "confirm" | "ack" | "follow_up" | "help";

export interface AlertEvent {
  id: string;
  at: string;
  type: "reminded" | "asked" | "replied" | "paid" | "snoozed" | "skipped" | "rescheduled" | "cycled";
  message?: string;
  inboundText?: string;
  intent?: AlertReplyIntent;
}

export interface AlertCycle {
  status: AlertCycleStatus;
  dueAt: string;
  remindAt: string;
  confirmAt?: string;
  lastOutboundAt?: string;
  lastInboundAt?: string;
  lastOutboundKind?: SecretaryOutboundKind;
  paidAt?: string;
  paidAmount?: number;
  snoozeUntil?: string;
}

export interface LifeAlert {
  id: string;
  title: string;
  kind: AlertKind;
  amount?: number;
  notes?: string;
  category?: ExpenseCategory;
  frequency: AlertFrequency;
  dueDay?: number;
  dueDate?: string;
  weekday?: number;
  remindDaysBefore: number;
  askIfPaid: boolean;
  confirmAfterHours: number;
  snoozeHours: number;
  preferredHour: number;
  status: AlertStatus;
  cycle: AlertCycle;
  history: AlertEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface SecretarySettings {
  enabled: boolean;
  timezone: string;
  quietHoursStart: number;
  quietHoursEnd: number;
}

export interface SecretaryModuleState {
  settings: SecretarySettings;
  alerts: LifeAlert[];
  updatedAt: string;
}

export interface RoutineSettings {
  timezone: string;
  dayStartHour: number;
}

export interface RoutineContext {
  id: string;
  name: string;
  kind: RoutineContextKind;
  color: string;
  sortOrder: number;
  calendarIds: string[];
  parentId?: string;
}

export interface RoutineSubtask {
  id: string;
  title: string;
  done: boolean;
  children: RoutineSubtask[];
}

export interface RoutineTask {
  id: string;
  contextId?: string;
  title: string;
  notes?: string;
  status: RoutineTaskStatus;
  priority: RoutineTaskPriority;
  dueDate?: string;
  scheduledDate?: string;
  focusToday: boolean;
  waitingFor?: string;
  subtasks: RoutineSubtask[];
  createdAt: string;
  updatedAt: string;
}

export interface RoutineCalendarLink {
  id: string;
  connectionId: string;
  externalCalendarId: string;
  name: string;
  color: string;
  enabled: boolean;
  contextId?: string;
}

export interface RoutineCalendarEvent {
  id: string;
  connectionId: string;
  calendarId: string;
  contextId?: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  meetingUrl?: string;
  status?: string;
}

export interface RoutineLocalEvent {
  id: string;
  source: RoutineLocalEventSource;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  contextId?: string;
  healthAppointmentId?: string;
  status?: string;
}

export interface RoutineModuleState {
  settings: RoutineSettings;
  contexts: RoutineContext[];
  tasks: RoutineTask[];
  calendarLinks: RoutineCalendarLink[];
  localEvents: RoutineLocalEvent[];
  updatedAt: string;
}

export interface HealthProfile {
  personId: OwnerId;
  bloodType?: string;
  allergies?: string;
  emergencyContact?: string;
  doctors?: string;
}

export interface HealthInsurance {
  provider: string;
  cardNumber?: string;
  expiresOn?: string;
  monthlyCost?: number;
  holderPersonId?: OwnerId;
  dependentPersonIds?: OwnerId[];
}

export interface HealthCare {
  id: string;
  personId: OwnerId;
  kind: HealthCareKind;
  title: string;
  intervalMonths: number;
  lastDoneOn?: string;
}

export interface HealthAppointment {
  id: string;
  personId: OwnerId;
  kind: HealthAppointmentKind;
  title: string;
  professional?: string;
  location?: string;
  start: string;
  end: string;
  notes?: string;
  careId?: string;
  done?: boolean;
  remindOnWhatsApp: boolean;
  routineLocalEventId?: string;
  secretaryAlertId?: string;
  secretaryAlertIds?: string[];
}

export interface HealthMedication {
  id: string;
  personId: OwnerId;
  name: string;
  dosage?: string;
  prescriptionExpiresOn?: string;
  stockNote?: string;
  remindOnWhatsApp: boolean;
  reminderHour: number;
  takeAlertId?: string;
  prescriptionAlertId?: string;
}

export interface HealthModuleState {
  profiles: HealthProfile[];
  insurance?: HealthInsurance;
  cares: HealthCare[];
  appointments: HealthAppointment[];
  medications: HealthMedication[];
  updatedAt: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity?: number;
  addedByPersonId?: OwnerId;
  addedByPhone?: string;
  addedByName?: string;
  status: ShoppingItemStatus;
  createdAt: string;
  boughtAt?: string;
}

export interface ShoppingList {
  id: string;
  name: string;
  whatsappGroupJid?: string;
  items: ShoppingItem[];
}

export interface HomeModuleState {
  lists: ShoppingList[];
  updatedAt: string;
}

export interface AccountLinkPermissions {
  canViewSharedPlan: boolean;
  canEditOwnData: boolean;
  canEditSharedData: boolean;
  canSeePartnerPrivateData: boolean;
  modules: ModuleAccessPermission[];
}

export interface AccountLink {
  id: string;
  token: string;
  inviterPersonId: OwnerId;
  inviteePersonId?: OwnerId;
  inviteeName?: string;
  inviteeEmail?: string;
  status: AccountLinkStatus;
  sharedAccounts: boolean;
  expenseSplit: {
    primaryPercent: number;
    partnerPercent: number;
  };
  permissions: AccountLinkPermissions;
  createdAt: string;
  acceptedAt?: string;
  revokedAt?: string;
}

export interface SharingPreferences {
  patrimonyMode: "joint" | "separate" | "mixed";
  sharedAccounts: boolean;
  expenseSplit: {
    primaryPercent: number;
    partnerPercent: number;
  };
}

export interface Profile {
  people: Person[];
  maritalStatus: MaritalStatus;
  planningMode: PlanningMode;
  sharing: SharingPreferences;
  accountLinks: AccountLink[];
}

export interface IncomeSource {
  id: string;
  name: string;
  type: IncomeType;
  ownerId?: OwnerId;
  grossAmount?: number;
  netAmount: number;
  frequency: Frequency;
  isRecurring: boolean;
  stabilityScore: number;
  startDate?: string;
  endDate?: string;
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  value: number;
  liquidity: Liquidity;
  sharedWithPersonIds?: OwnerId[];
  includeInIndependence: boolean;
}

export interface Debt {
  id: string;
  name: string;
  type: DebtType;
  balance: number;
  monthlyPayment: number;
  annualInterestRate?: number;
  remainingMonths?: number;
  finalDate?: string;
  creditor?: string;
  ownerId?: OwnerId;
}

export interface ExpenseProfile {
  estimatedMonthlySpend: number;
  currentMonthlyInvestments: number;
  monthlyProvisions: number;
  emergencyFundTargetMonths: number;
}

export interface Goal {
  id: string;
  name: string;
  targetValue: number;
  currentValue: number;
  targetDate?: string;
  priority: number;
  inflationAdjusted: boolean;
  eligibleAssetCategories: AssetCategory[];
  isPrimary: boolean;
}

export interface BudgetCategoryTarget {
  category: ExpenseCategory;
  monthlyTarget: number;
  share?: number;
}

export interface Budget {
  mode: BudgetMode;
  monthlyExpenseTarget?: number;
  monthlyInvestmentTarget?: number;
  monthlyProvisionTarget?: number;
  categoryTargets: BudgetCategoryTarget[];
}

export interface ExpenseCategoryConfig {
  id: ExpenseCategory;
  name: string;
  color: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface IndependenceAssumptions {
  inflationRate: number;
  taxRate: number;
  sustainableWithdrawalRate: number;
  conservativeRealReturn: number;
  baseRealReturn: number;
  optimisticRealReturn: number;
  contributionGrowthRate: number;
  preservePrincipal: boolean;
}

export interface IndependenceSettings {
  desiredMonthlySpend: number;
  targetAge: number;
  assumptions: IndependenceAssumptions;
}

export interface RiskAnswers {
  investmentHorizon: number;
  financialKnowledge: number;
  volatilityTolerance: number;
  liquidityNeed: number;
  reactionToDrawdown: number;
  incomeStability: number;
  dependentsPressure: number;
  nearTermGoalsPressure: number;
}

export interface RiskAssessment {
  answers: RiskAnswers;
  suggestedProfile: RiskProfileName;
  reviewedProfile?: RiskProfileName;
}

export interface FinancialTransaction {
  id: string;
  date: string;
  merchant: string;
  description?: string;
  amount: number;
  type: TransactionType;
  audience: TransactionAudience;
  spentByPersonId?: OwnerId;
  nature: TransactionNature;
  category: ExpenseCategory;
  recurringTransactionId?: string;
  confidence: number;
  source: "manual" | "csv" | "pdf" | "api";
  sourceFile?: string;
  statement?: {
    issuer: "nubank" | "unknown";
    referenceMonth: string;
    relativeMonth: StatementRelativeMonth;
    dueDate?: string;
    periodStart?: string;
    periodEnd?: string;
    importedAt: string;
  };
  installment?: {
    current: number;
    total: number;
  };
  forecast?: {
    kind: "installment";
    generatedFromTransactionId?: string;
  };
  reviewed: boolean;
}

export interface RecurringTransaction {
  id: string;
  name: string;
  amount: number;
  type: Exclude<TransactionType, "income" | "transfer">;
  audience: TransactionAudience;
  nature: TransactionNature;
  category: ExpenseCategory;
  frequency: Exclude<Frequency, "single">;
  startDate: string;
  endDate?: string;
  reviewed: boolean;
}

export interface ClassificationRule {
  id: string;
  merchantPattern: string;
  descriptionPattern?: string;
  audience: TransactionAudience;
  nature: TransactionNature;
  category: ExpenseCategory;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlySnapshot {
  id: string;
  month: string;
  totalNetWorth: number;
  financialNetWorth: number;
  recurringIncome: number;
  observedSpend: number;
  investedAmount: number;
  savingsRate: number;
}

export interface FinancePlan {
  id: string;
  workspace: LifeWorkspace;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
  profile: Profile;
  incomeSources: IncomeSource[];
  assets: Asset[];
  debts: Debt[];
  expenseProfile: ExpenseProfile;
  goals: Goal[];
  budget: Budget;
  independence: IndependenceSettings;
  risk: RiskAssessment;
  transactions: FinancialTransaction[];
  recurringTransactions: RecurringTransaction[];
  expenseCategories: ExpenseCategoryConfig[];
  classificationRules: ClassificationRule[];
  monthlySnapshots: MonthlySnapshot[];
  secretary: SecretaryModuleState;
  routine: RoutineModuleState;
  health: HealthModuleState;
  home: HomeModuleState;
}

export interface IncomeMetrics {
  recurringMonthly: number;
  extraordinary: number;
  annualEstimated: number;
  byOwner: Record<string, number>;
}

export interface PatrimonyMetrics {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  financialAssets: number;
  investableAssets: number;
  illiquidAssets: number;
  liquidAssets: number;
}

export interface SpendingMetrics {
  estimatedMonthly: number;
  observedMonthlyAverage: number | null;
  observedMonthlyMedian: number | null;
  observedMonths: number;
  currentMonthSpend: number;
  livingCostUsed: number;
  source: "estimated" | "observed";
}

export interface InvestmentCapacity {
  recurringIncome: number;
  livingCost: number;
  debtPayments: number;
  provisions: number;
  potential: number;
  actualInvestment: number;
  conversionEfficiency: number | null;
}

export interface GoalProjection {
  goalId: string;
  monthsToGoal: number | null;
  estimatedDate: string | null;
  targetNominalValue: number;
  targetTodayValue: number;
  projectedValueAtTarget: number;
}

export interface ScenarioProjectionPoint {
  year: number;
  nominalValue: number;
  todayPurchasingPower: number;
}

export interface ScenarioProjection {
  scenario: ScenarioName;
  realReturn: number;
  nominalReturn: number;
  points: ScenarioProjectionPoint[];
}

export interface IndependenceScenario {
  scenario: ScenarioName;
  requiredTodayValue: number;
  requiredNominalValue: number;
  yearsUntilTargetAge: number;
}

export type ScoreBand = "critical" | "attention" | "balanced" | "healthy" | "excellent";
export type CommitmentStatus = "healthy" | "moderate" | "high" | "critical";

export interface ScoreComponent {
  key:
    | "cashFlow"
    | "incomeCommitment"
    | "emergencyReserve"
    | "savingsCapacity"
    | "spendingControl"
    | "incomeStability"
    | "futureBurden";
  label: string;
  score: number;
  weight: number;
  explanation: string;
}

export interface FinancialHealthScore {
  value: number;
  band: ScoreBand;
  summary: string;
  components: ScoreComponent[];
  strengths: string[];
  cautions: string[];
}

export interface MonthCommitment {
  month: string;
  recurring: number;
  installments: number;
  debts: number;
  total: number;
  percentOfIncome: number | null;
}

export interface IncomeCommitment {
  recurringIncome: number;
  thisMonth: MonthCommitment;
  nextMonth: MonthCommitment;
  horizon: MonthCommitment[];
  remainingInstallmentBalance: number;
  remainingInstallmentCount: number;
  lastInstallmentMonth: string | null;
  committedPercent: number | null;
  freeIncome: number;
  freePercent: number | null;
  status: CommitmentStatus;
  peakMonth: string | null;
}

export interface CashFlowSnapshot {
  income: number;
  recurring: number;
  installments: number;
  variable: number;
  investments: number;
  leftover: number;
  leftoverPercent: number | null;
}

export interface BudgetSuggestion {
  monthlyExpenseTarget: number;
  monthlyInvestmentTarget: number;
  monthlyProvisionTarget: number;
  margin: number;
}

export type CategoryBudgetStatus = "comfortable" | "watch" | "tight" | "over";
export type CategoryBudgetSource = "budget" | "suggested" | "history" | "recurring" | "none";

export interface CategoryBudgetPlan {
  income: number;
  investment: number;
  expenseEnvelope: number;
}

export interface CategoryBudgetProgress {
  category: ExpenseCategory;
  name: string;
  color: string;
  spent: number;
  limit: number;
  remaining: number | null;
  usedPercent: number | null;
  share: number;
  status: CategoryBudgetStatus;
  source: CategoryBudgetSource;
}

export interface PurchaseSimulation {
  canPay: boolean;
  amount: number;
  impactOnMonthlyInvestment: number;
  liquidityAfterPurchase: number;
  reserveAdequateAfterPurchase: boolean;
  goalDelayMonths: number | null;
}

export interface StressTestInput {
  type: StressScenarioType;
  magnitude: number;
  durationMonths?: number;
}

export interface StressTestResult {
  type: StressScenarioType;
  reserveAfterScenario: number;
  coverageMonthsAfterScenario: number;
  needsToSellInvestments: boolean;
  impactOnNetWorth: number;
  notes: string[];
}

export interface FinancialAnalysis {
  income: IncomeMetrics;
  patrimony: PatrimonyMetrics;
  spending: SpendingMetrics;
  capacity: InvestmentCapacity;
  savingsRate: number | null;
  emergencyFundMonths: number | null;
  commitment: IncomeCommitment;
  cashFlow: CashFlowSnapshot;
  budgetSuggestion: BudgetSuggestion;
  categoryBudgetPlan: CategoryBudgetPlan;
  categoryBudgets: CategoryBudgetProgress[];
  primaryGoalProjection: GoalProjection | null;
  independence: IndependenceScenario[];
  projections: ScenarioProjection[];
  riskProfile: RiskProfileName;
  score: FinancialHealthScore;
}
