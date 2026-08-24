import { createEmptyPlan, type FinancialTransaction, type RecurringTransaction } from "@mylyfe/domain";
import { describe, expect, it } from "vitest";
import {
  commitmentTone,
  displayNameFromEmail,
  escapeCsvCell,
  expenseCategoryColor,
  expenseCategoryName,
  expenseCategoryOptions,
  formatReferenceMonth,
  isEmptyPlan,
  normalizeEmail,
  normalizePlanForClient,
  optionsFrom,
  parseDateDisplay,
  parseInstallmentFromMerchant,
  planIdFromEmail,
  readInitialView,
  reconcileInstallmentForecastsForClient,
  recurringOccursInMonth,
  removeById,
  scoreBarTone,
  slugifyCategoryId,
  spenderPatch,
  spenderValueForTransaction,
  statementRelativeMonthForClient,
  thirdPartySpenderValue,
  updateById,
  formatDateDisplay,
  maskDate
} from "./app-logic";

const baseTransaction = (patch: Partial<FinancialTransaction> = {}): FinancialTransaction => ({
  id: "tx-1",
  date: "2025-03-10T12:00:00.000Z",
  merchant: "Loja",
  amount: -300,
  type: "expense",
  audience: "personal",
  nature: "variable",
  category: "shopping",
  confidence: 1,
  source: "manual",
  reviewed: true,
  ...patch
});

describe("app-logic", () => {
  describe("email helpers", () => {
    it("normalizes email", () => {
      expect(normalizeEmail("  Test@Example.COM ")).toBe("test@example.com");
    });

    it("builds plan id from email", () => {
      expect(planIdFromEmail("joao.silva@example.com")).toBe("user-joao-silva-example-com");
    });

    it("builds display name from email", () => {
      expect(displayNameFromEmail("maria.clara@example.com")).toBe("Maria Clara");
      expect(displayNameFromEmail("@")).toBe("Usuario MyLyfe");
    });
  });

  describe("optionsFrom and slugifyCategoryId", () => {
    it("maps records to option objects", () => {
      expect(optionsFrom({ a: "Alpha", b: "Beta" })).toEqual([
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" }
      ]);
    });

    it("creates unique category ids", () => {
      const categories = [{ id: "custom-mercado", name: "Mercado", color: "#000", isActive: true, isDefault: false }];
      expect(slugifyCategoryId("Mercado", categories)).toBe("custom-mercado-2");
    });
  });

  describe("expense category helpers", () => {
    const plan = createEmptyPlan("test");

    it("resolves category name, color and options from plan defaults", () => {
      expect(expenseCategoryName(plan, "housing")).toBe("Moradia");
      expect(expenseCategoryColor(plan, "housing")).toMatch(/^#/);
      const options = expenseCategoryOptions(plan);
      expect(options.some((option) => option.value === "housing" && option.label === "Moradia")).toBe(true);
    });
  });

  describe("formatReferenceMonth and escapeCsvCell", () => {
    it("formats reference month in pt-BR", () => {
      expect(formatReferenceMonth("2025-03")).toMatch(/mar[cç]o de 2025/i);
      expect(formatReferenceMonth("invalid")).toBe("invalid");
    });

    it("escapes csv cells with special characters", () => {
      expect(escapeCsvCell("simple")).toBe("simple");
      expect(escapeCsvCell('value;with"quote')).toBe('"value;with""quote"');
      expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"');
    });
  });

  describe("collection helpers", () => {
    const items = [
      { id: "a", value: 1 },
      { id: "b", value: 2 }
    ];

    it("detects empty plans", () => {
      expect(isEmptyPlan(createEmptyPlan("test"))).toBe(true);
      expect(
        isEmptyPlan({
          ...createEmptyPlan("test"),
          onboardingCompleted: true
        })
      ).toBe(false);
    });

    it("updates and removes items by id", () => {
      expect(updateById(items, "b", { value: 9 })).toEqual([
        { id: "a", value: 1 },
        { id: "b", value: 9 }
      ]);
      expect(removeById(items, "a")).toEqual([{ id: "b", value: 2 }]);
    });
  });

  describe("installment forecasts", () => {
    it("parses installment info from merchant text", () => {
      expect(parseInstallmentFromMerchant("Amazon - Parcela 1/3")).toEqual({
        current: 1,
        total: 3,
        baseMerchant: "Amazon"
      });
      expect(parseInstallmentFromMerchant("Sem parcela")).toBeNull();
    });

    it("generates remaining installment forecasts for parcela 1/3", () => {
      const transactions = reconcileInstallmentForecastsForClient([
        baseTransaction({
          merchant: "Amazon - Parcela 1/3",
          amount: -150
        })
      ]);

      const forecasts = transactions.filter((transaction) => transaction.forecast?.kind === "installment");
      expect(forecasts).toHaveLength(2);
      expect(forecasts.map((transaction) => transaction.installment?.current)).toEqual([2, 3]);
    });
  });

  describe("statementRelativeMonthForClient", () => {
    it("classifies months relative to a fixed asOf date", () => {
      const asOf = new Date(2025, 2, 15);
      expect(statementRelativeMonthForClient("2025-03", asOf)).toBe("current");
      expect(statementRelativeMonthForClient("2025-02", asOf)).toBe("previous");
      expect(statementRelativeMonthForClient("2025-04", asOf)).toBe("next");
      expect(statementRelativeMonthForClient("2024-12", asOf)).toBe("past");
      expect(statementRelativeMonthForClient("2025-08", asOf)).toBe("future");
    });
  });

  describe("readInitialView", () => {
    it("maps query strings to app views", () => {
      expect(readInitialView("?routine=tasks")).toBe("routine-tasks");
      expect(readInitialView("?health=meds")).toBe("health-meds");
      expect(readInitialView("?home=mercado")).toBe("home-list");
      expect(readInitialView("?profile=1")).toBe("profile");
      expect(readInitialView("")).toBe("dashboard");
    });
  });

  describe("recurringOccursInMonth", () => {
    const recurring = (patch: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
      id: "rec-1",
      name: "Assinatura",
      amount: 50,
      type: "expense",
      audience: "personal",
      nature: "recurring",
      category: "subscriptions",
      frequency: "monthly",
      startDate: "2025-01-15T00:00:00.000Z",
      reviewed: true,
      ...patch
    });

    it("matches monthly, quarterly and annual recurrences", () => {
      expect(recurringOccursInMonth(recurring({ frequency: "monthly" }), "2025-03")).toBe(true);
      expect(recurringOccursInMonth(recurring({ frequency: "quarterly" }), "2025-04")).toBe(true);
      expect(recurringOccursInMonth(recurring({ frequency: "quarterly" }), "2025-02")).toBe(false);
      expect(recurringOccursInMonth(recurring({ frequency: "annual" }), "2026-01")).toBe(true);
      expect(recurringOccursInMonth(recurring({ frequency: "annual" }), "2025-06")).toBe(false);
    });
  });

  describe("date helpers", () => {
    it("masks, formats and parses display dates", () => {
      expect(maskDate("15032025")).toBe("15/03/2025");
      expect(formatDateDisplay("2025-03-15T00:00:00.000Z")).toBe("15/03/2025");
      expect(parseDateDisplay("31/02/2025")).toBeNull();
      expect(parseDateDisplay("15/03/2025")).toBe("2025-03-15");
    });
  });

  describe("spender helpers", () => {
    it("maps third-party transactions and patches spender selection", () => {
      const thirdParty = baseTransaction({
        audience: "thirdParty",
        nature: "thirdParty",
        category: "thirdParty"
      });
      expect(spenderValueForTransaction(thirdParty)).toBe(thirdPartySpenderValue);
      expect(spenderPatch(thirdPartySpenderValue)).toEqual({
        spentByPersonId: undefined,
        audience: "thirdParty",
        nature: "thirdParty",
        category: "thirdParty"
      });
      expect(spenderPatch("primary", thirdParty)).toEqual({
        spentByPersonId: "primary",
        audience: "personal",
        nature: "variable"
      });
    });
  });

  describe("tone helpers", () => {
    it("maps commitment and score tones", () => {
      expect(commitmentTone("healthy")).toBe("good");
      expect(commitmentTone("stretched")).toBe("warn");
      expect(commitmentTone("critical")).toBe("bad");
      expect(scoreBarTone(8)).toBe("good");
      expect(scoreBarTone(6)).toBe("warn");
      expect(scoreBarTone(3)).toBe("bad");
    });
  });

  describe("normalizePlanForClient", () => {
    it("strips ignored imported receipts", () => {
      const plan = createEmptyPlan("test");
      const ignored = baseTransaction({
        id: "ignored",
        merchant: "Pagamento recebido",
        source: "csv"
      });
      const kept = baseTransaction({ id: "kept", merchant: "Supermercado" });

      const normalized = normalizePlanForClient({
        ...plan,
        transactions: [ignored, kept]
      });

      expect(normalized.transactions.some((transaction) => transaction.id === "ignored")).toBe(false);
      expect(normalized.transactions.some((transaction) => transaction.id === "kept")).toBe(true);
    });
  });
});
