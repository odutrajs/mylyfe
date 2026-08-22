import {
  createEmptyPlan,
  defaultExpenseCategories,
  defaultFinanceModuleAccess,
  mergeRoutineLocalEvents,
  mergeWorkspaceModules,
  pickHealthModuleState,
  pickHomeModuleState,
  pickRoutineModuleState,
  pickSecretaryModuleState,
  syncRoutineWithHealthAppointments,
  unifyShoppingCategories,
  type AccountLinkPermissions,
  type FinancePlan,
  type StatementRelativeMonth
} from "@mylyfe/domain";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconcileInstallmentForecasts } from "./installments.js";

export interface PlanRepository {
  get(id: string): Promise<FinancePlan>;
  save(plan: FinancePlan): Promise<FinancePlan>;
  remove(id: string): Promise<void>;
  listIds(): Promise<string[]>;
}

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(appRoot, "data", "plans");
const visibleFinanceScopes = new Set<string>(defaultFinanceModuleAccess().scopes);

const monthKeyFromIso = (value?: string) => {
  const match = value?.match(/^(\d{4})-(\d{2})/);
  return match?.[1] && match[2] ? `${match[1]}-${match[2]}` : "";
};

const currentMonthKey = (asOf = new Date()) => `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}`;

const isFutureMonthKey = (monthKey: string, asOf = new Date()) => monthKey > currentMonthKey(asOf);

const statementRelativeMonth = (referenceMonth: string, asOf = new Date()): StatementRelativeMonth => {
  const [yearRaw, monthRaw] = referenceMonth.split("-");
  const referenceIndex = Number(yearRaw) * 12 + Number(monthRaw);
  const currentIndex = asOf.getFullYear() * 12 + asOf.getMonth() + 1;
  const diff = referenceIndex - currentIndex;

  if (diff === 0) return "current";
  if (diff === -1) return "previous";
  if (diff === 1) return "next";
  return diff < 0 ? "past" : "future";
};

const isIgnoredImportedReceipt = (merchant: string) => /pagamento recebido|cr[eé]dito de|estorno|iof de volta/i.test(merchant);

const normalizeImportedTransactions = (transactions: FinancePlan["transactions"]): FinancePlan["transactions"] =>
  transactions.flatMap((transaction) => {
    const importedStatement = transaction.source === "csv" || transaction.source === "pdf";
    if (importedStatement && isIgnoredImportedReceipt(transaction.merchant)) return [];

    let next = transaction;

    const dueMonth = monthKeyFromIso(next.statement?.dueDate);
    const periodEndMonth = monthKeyFromIso(next.statement?.periodEnd);
    if (next.statement && dueMonth && periodEndMonth && isFutureMonthKey(dueMonth) && dueMonth !== periodEndMonth) {
      const { dueDate: _dueDate, ...statement } = next.statement;
      next = {
        ...next,
        statement: {
          ...statement,
          referenceMonth: periodEndMonth,
          relativeMonth: statementRelativeMonth(periodEndMonth)
        }
      };
    }

    return [next];
  });

const withFreshTimestamp = (plan: FinancePlan): FinancePlan => {
  const unified = unifyShoppingCategories(plan);

  return {
    ...unified,
    transactions: reconcileInstallmentForecasts(normalizeImportedTransactions(unified.transactions ?? [])),
    updatedAt: new Date().toISOString()
  };
};

const clearSharingMetadata = <T extends object>(item: T): T => {
  const { visibility: _visibility, linkedOwnerIds: _linkedOwnerIds, ...cleanItem } = item as T & {
    visibility?: string;
    linkedOwnerIds?: string[];
  };

  return cleanItem as T;
};

const ensureAccountLinkPermissions = (permissions?: Partial<AccountLinkPermissions>): AccountLinkPermissions => {
  const modules = permissions?.modules?.length
    ? permissions.modules.map((module) => {
        if (module.moduleId !== "finance") return module;
        const scopes = module.scopes.filter((scope) => visibleFinanceScopes.has(scope));
        return {
          ...module,
          scopes: scopes.length ? scopes : ["dashboard"]
        };
      })
    : [defaultFinanceModuleAccess()];

  return {
    canViewSharedPlan: permissions?.canViewSharedPlan ?? true,
    canEditOwnData: permissions?.canEditOwnData ?? true,
    canEditSharedData: permissions?.canEditSharedData ?? false,
    canSeePartnerPrivateData: permissions?.canSeePartnerPrivateData ?? false,
    modules
  };
};

const ensurePlanShape = (plan: Partial<FinancePlan>, id: string): FinancePlan => {
  const base = createEmptyPlan(id);
  const accountLinks = (plan.profile?.accountLinks ?? []).map((link) => ({
    ...link,
    sharedAccounts: link.sharedAccounts ?? base.profile.sharing.sharedAccounts,
    sharedHome: link.sharedHome !== false,
    expenseSplit: {
      ...base.profile.sharing.expenseSplit,
      ...link.expenseSplit
    },
    permissions: ensureAccountLinkPermissions(link.permissions)
  }));
  const linkedPersonIds = new Set(
    accountLinks.filter((link) => link.status === "accepted" && link.inviteePersonId).map((link) => link.inviteePersonId)
  );
  const people = plan.profile?.people?.length
    ? plan.profile.people.filter((person) => person.role === "primary" || person.accountStatus === "linked" || linkedPersonIds.has(person.id))
    : base.profile.people;
  const workspaceModules = mergeWorkspaceModules(plan.workspace?.modules);

  return syncRoutineWithHealthAppointments(unifyShoppingCategories({
    ...base,
    ...plan,
    id,
    workspace: {
      ...base.workspace,
      ...plan.workspace,
      modules: workspaceModules
    },
    profile: {
      ...base.profile,
      ...plan.profile,
      people,
      accountLinks,
      sharing: {
        ...base.profile.sharing,
        ...plan.profile?.sharing,
        expenseSplit: {
          ...base.profile.sharing.expenseSplit,
          ...plan.profile?.sharing?.expenseSplit
        }
      }
    },
    incomeSources: (plan.incomeSources ?? []).map(clearSharingMetadata),
    assets: (plan.assets ?? []).map((asset) => {
      const { ownerId: _ownerId, ...cleanAsset } = asset as typeof asset & { ownerId?: string };
      return {
        ...clearSharingMetadata(cleanAsset),
        sharedWithPersonIds: cleanAsset.sharedWithPersonIds ?? [],
        includeInIndependence: false
      };
    }),
    debts: (plan.debts ?? []).map(clearSharingMetadata),
    expenseProfile: {
      ...base.expenseProfile,
      ...plan.expenseProfile
    },
    goals: plan.goals ?? [],
    budget: {
      ...base.budget,
      ...plan.budget,
      mode: plan.budget?.mode ?? base.budget.mode,
      monthlyExpenseTarget: plan.budget?.monthlyExpenseTarget,
      monthlyInvestmentTarget: plan.budget?.monthlyInvestmentTarget,
      monthlyProvisionTarget: plan.budget?.monthlyProvisionTarget,
      categoryTargets: plan.budget?.categoryTargets ?? []
    },
    independence: {
      ...base.independence,
      ...plan.independence,
      assumptions: {
        ...base.independence.assumptions,
        ...plan.independence?.assumptions
      }
    },
    risk: {
      ...base.risk,
      ...plan.risk,
      answers: {
        ...base.risk.answers,
        ...plan.risk?.answers
      }
    },
    transactions: plan.transactions ?? [],
    recurringTransactions: plan.recurringTransactions ?? [],
    expenseCategories: plan.expenseCategories?.length ? plan.expenseCategories : defaultExpenseCategories(),
    classificationRules: plan.classificationRules ?? [],
    monthlySnapshots: plan.monthlySnapshots ?? [],
    secretary: pickSecretaryModuleState(plan.secretary, base.secretary),
    routine: pickRoutineModuleState(plan.routine, base.routine),
    health: pickHealthModuleState(plan.health, base.health),
    home: pickHomeModuleState(plan.home, base.home)
  }));
};

export class FilePlanRepository implements PlanRepository {
  async get(id: string) {
    const existing = await this.peek(id);
    if (existing) return existing;

    const empty = createEmptyPlan(id);
    await this.write(empty);
    return empty;
  }

  async save(plan: FinancePlan) {
    const existing = await this.peek(plan.id);
    const routine = pickRoutineModuleState(plan.routine, existing?.routine);
    return this.write(
      syncRoutineWithHealthAppointments({
        ...plan,
        secretary: pickSecretaryModuleState(plan.secretary, existing?.secretary),
        routine: {
          ...routine,
          localEvents: mergeRoutineLocalEvents(routine.localEvents, existing?.routine?.localEvents)
        },
        health: pickHealthModuleState(plan.health, existing?.health),
        home: pickHomeModuleState(plan.home, existing?.home)
      })
    );
  }

  async listIds() {
    try {
      const files = await readdir(dataRoot);
      return files.filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, ""));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async remove(id: string) {
    await unlink(this.filePath(id)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }

  private async peek(id: string) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const raw = await readFile(this.filePath(id), "utf8");
        if (!raw.trim()) throw new SyntaxError("empty plan file");
        return ensurePlanShape(JSON.parse(raw) as Partial<FinancePlan>, id);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        if (error instanceof SyntaxError && attempt < 5) {
          await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }
    return null;
  }

  private async write(plan: FinancePlan) {
    await mkdir(dataRoot, { recursive: true });
    const next = withFreshTimestamp(plan);
    const target = this.filePath(plan.id);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(next, null, 2), "utf8");
    try {
      await rename(temp, target);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
    return next;
  }

  private filePath(id: string) {
    const safeId = id.replace(/[^a-zA-Z0-9-_]/g, "_");
    return path.resolve(dataRoot, `${safeId}.json`);
  }
}

class PrismaPlanRepository implements PlanRepository {
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  async get(id: string) {
    const existing = await this.peek(id);
    if (existing) return existing;

    const empty = createEmptyPlan(id);
    return this.write(empty);
  }

  async save(plan: FinancePlan) {
    const existing = await this.peek(plan.id);
    const routine = pickRoutineModuleState(plan.routine, existing?.routine);
    return this.write(
      syncRoutineWithHealthAppointments({
        ...plan,
        secretary: pickSecretaryModuleState(plan.secretary, existing?.secretary),
        routine: {
          ...routine,
          localEvents: mergeRoutineLocalEvents(routine.localEvents, existing?.routine?.localEvents)
        },
        health: pickHealthModuleState(plan.health, existing?.health),
        home: pickHomeModuleState(plan.home, existing?.home)
      })
    );
  }

  async listIds() {
    const rows = (await this.client.financialPlan.findMany({ select: { id: true } })) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  async remove(id: string) {
    await this.client.financialPlan.delete({ where: { id } }).catch(() => undefined);
  }

  private async peek(id: string) {
    const existing = await this.client.financialPlan.findUnique({ where: { id } });
    return existing ? ensurePlanShape(existing.data as Partial<FinancePlan>, id) : null;
  }

  private async write(plan: FinancePlan) {
    const next = withFreshTimestamp(plan);
    await this.client.financialPlan.upsert({
      where: { id: plan.id },
      create: {
        id: plan.id,
        data: next
      },
      update: {
        data: next
      }
    });
    return next;
  }
}

export const createRepository = async (): Promise<PlanRepository> => {
  if (process.env.USE_PRISMA === "true" && process.env.DATABASE_URL) {
    const { PrismaClient } = await import("@prisma/client");
    return new PrismaPlanRepository(new PrismaClient());
  }

  return new FilePlanRepository();
};
