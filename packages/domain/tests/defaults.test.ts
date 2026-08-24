import { describe, expect, it } from "vitest";
import {
  canonicalizeExpenseCategory,
  createEmptyPlan,
  defaultExpenseCategories,
  defaultFinanceModuleAccess,
  defaultWorkspaceModules,
  isUnifiedShoppingCategory,
  mergeWorkspaceModules,
  unifyShoppingCategories,
  type FinancePlan
} from "../src/index.js";

describe("domain defaults", () => {
  it("creates an empty finance plan with default categories and modules", () => {
    const plan = createEmptyPlan("primary");

    expect(plan.id).toBe("primary");
    expect(plan.onboardingCompleted).toBe(false);
    expect(plan.transactions).toEqual([]);
    expect(plan.expenseCategories).toEqual(defaultExpenseCategories());
    expect(plan.workspace.modules).toEqual(defaultWorkspaceModules());
    expect(plan.profile.people[0]?.role).toBe("primary");
  });

  it("merges workspace modules without dropping custom fields", () => {
    const merged = mergeWorkspaceModules([
      {
        id: "finance",
        name: "Financeiro custom",
        description: "Custom finance",
        status: "active"
      },
      {
        id: "projects",
        name: "Projetos antigos",
        description: "Legado",
        status: "planned"
      }
    ]);

    expect(merged.find((module) => module.id === "finance")).toMatchObject({
      name: "Financeiro",
      description: "Planejamento, gastos, patrimonio e metas.",
      status: "active"
    });
    expect(merged.map((module) => module.id)).toEqual(defaultWorkspaceModules().map((module) => module.id));
  });

  it("detects unified shopping category aliases", () => {
    expect(isUnifiedShoppingCategory("shopping")).toBe(true);
    expect(isUnifiedShoppingCategory("leisure")).toBe(true);
    expect(isUnifiedShoppingCategory("custom-compras-online", "Compras online")).toBe(true);
    expect(isUnifiedShoppingCategory("custom-lazer", "Lazer")).toBe(true);
    expect(isUnifiedShoppingCategory("food", "Alimentacao")).toBe(false);
  });

  it("canonicalizes leisure and compras categories to shopping", () => {
    expect(canonicalizeExpenseCategory("leisure", "Lazer")).toBe("shopping");
    expect(canonicalizeExpenseCategory("custom-compras", "Compras")).toBe("shopping");
    expect(canonicalizeExpenseCategory("food", "Alimentacao")).toBe("food");
  });

  it("unifies shopping-like categories and transactions on a plan", () => {
    const plan: FinancePlan = {
      ...createEmptyPlan("test"),
      expenseCategories: [
        ...defaultExpenseCategories(),
        { id: "leisure", name: "Lazer", color: "#111111", isDefault: false, isActive: true },
        { id: "custom-compras", name: "Compras", color: "#222222", isDefault: false, isActive: true }
      ],
      transactions: [
        {
          id: "tx-leisure",
          date: "2026-08-10T00:00:00.000Z",
          merchant: "Cinema",
          amount: 45,
          type: "expense",
          audience: "personal",
          nature: "variable",
          category: "leisure",
          confidence: 1,
          source: "manual",
          reviewed: true
        },
        {
          id: "tx-compras",
          date: "2026-08-11T00:00:00.000Z",
          merchant: "Zara",
          amount: 180,
          type: "expense",
          audience: "personal",
          nature: "variable",
          category: "custom-compras",
          confidence: 1,
          source: "manual",
          reviewed: true
        }
      ],
      classificationRules: [
        {
          id: "rule-leisure",
          merchantPattern: "cinema",
          audience: "personal",
          nature: "variable",
          category: "leisure",
          confidence: 0.9,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        }
      ],
      budget: {
        mode: "suggested",
        categoryTargets: [
          { category: "leisure", monthlyTarget: 300, share: 0.2 },
          { category: "custom-compras", monthlyTarget: 500, share: 0.3 }
        ]
      }
    };

    const unified = unifyShoppingCategories(plan);

    expect(unified.expenseCategories.some((category) => category.id === "leisure")).toBe(false);
    expect(unified.expenseCategories.some((category) => category.id === "custom-compras")).toBe(false);
    expect(unified.expenseCategories.find((category) => category.id === "shopping")).toMatchObject({
      name: "Compras e Lazer",
      isActive: true
    });
    expect(unified.transactions.map((transaction) => transaction.category)).toEqual(["shopping", "shopping"]);
    expect(unified.classificationRules[0]?.category).toBe("shopping");
    expect(unified.budget.categoryTargets).toEqual([
      { category: "shopping", monthlyTarget: 800, share: 0.5 }
    ]);
  });

  it("returns default finance module access with editor role", () => {
    expect(defaultFinanceModuleAccess()).toEqual({
      moduleId: "finance",
      role: "editor",
      scopes: ["dashboard", "plan", "transactions", "categories", "history", "sharing"]
    });
  });
});
