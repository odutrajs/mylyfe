import { createEmptyPlan, type FinancialTransaction, type RecurringTransaction } from "@mylyfe/domain";
import { describe, expect, it } from "vitest";
import {
  addMonthKey,
  addMonthsToDateInput,
  buildRecurringOccurrences,
  categoryBudgetCaption,
  commitmentTone,
  currentTransactionMonthKey,
  displayNameFromEmail,
  escapeCsvCell,
  expenseCategoryColor,
  expenseCategoryName,
  expenseCategoryOptions,
  financeScopeLabels,
  formatReferenceMonth,
  formatStatementLabel,
  formatTransactionMonth,
  isEmptyPlan,
  isExpenseLikeTransaction,
  isInstallmentForecast,
  legacyPlanStorageKey,
  monthKeysBetween,
  nextMonthKeys,
  normalizeAccountLink,
  normalizeEmail,
  normalizePlanForClient,
  optionsFrom,
  parseDateDisplay,
  parseInstallmentFromMerchant,
  pickFreshestPlan,
  planIdFromEmail,
  planStorageKey,
  readInitialView,
  reconcileInstallmentForecastsForClient,
  recurringOccursInMonth,
  removeById,
  scoreBarTone,
  slugifyCategoryId,
  snapShare,
  spenderPatch,
  spenderValueForTransaction,
  statementRelativeMonthForClient,
  thirdPartySpenderValue,
  transactionMonthKey,
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

  describe("plan and month helpers", () => {
    it("builds storage keys and finance labels", () => {
      expect(planStorageKey("abc")).toBe("mylyfe-finance-plan:abc");
      expect(legacyPlanStorageKey("abc")).toBe("tfinance-plan:abc");
      expect(financeScopeLabels(["dashboard", "transactions"])).toBe("Dashboard, Transacoes");
    });

    it("walks month keys and date inputs", () => {
      expect(addMonthKey("2025-01", 1)).toBe("2025-02");
      expect(addMonthsToDateInput("2025-01-31", 1)).toBe("2025-02-28");
      expect(monthKeysBetween("2025-01", "2025-03")).toEqual(["2025-01", "2025-02", "2025-03"]);
      expect(nextMonthKeys("2025-01", 2)).toEqual(["2025-01", "2025-02"]);
      expect(currentTransactionMonthKey(new Date(2025, 2, 10))).toBe("2025-03");
      expect(formatTransactionMonth("2025-03")).toMatch(/mar/i);
      expect(formatTransactionMonth("")).toBe("Sem mes");
      expect(transactionMonthKey(baseTransaction({ date: "2025-04-02T12:00:00.000Z" }))).toBe("2025-04");
      expect(isExpenseLikeTransaction(baseTransaction({ type: "income" }))).toBe(false);
      expect(isExpenseLikeTransaction(baseTransaction({ type: "expense" }))).toBe(true);
      expect(snapShare(0.1234)).toBeCloseTo(0.123);
    });

    it("normalizes account links and picks the freshest plan", () => {
      const link = normalizeAccountLink({
        id: "link-1",
        token: "tok",
        inviterPersonId: "primary",
        inviteeEmail: "a@b.com",
        inviteeName: "A",
        status: "accepted",
        sharedAccounts: false,
        sharedHome: true,
        expenseSplit: { primaryPercent: 50, partnerPercent: 50 },
        permissions: {
          canViewSharedPlan: true,
          canEditOwnData: true,
          canEditSharedData: false,
          canSeePartnerPrivateData: false,
          modules: []
        },
        createdAt: "2025-01-01T00:00:00.000Z"
      });
      expect(link.sharedHome).toBe(true);
      expect(link.permissions.canViewSharedPlan).toBe(true);

      const remote = createEmptyPlan("test");
      const stored = {
        ...createEmptyPlan("test"),
        onboardingCompleted: true,
        updatedAt: "2026-01-01T00:00:00.000Z"
      };
      expect(pickFreshestPlan(remote, stored).onboardingCompleted).toBe(true);
      expect(pickFreshestPlan(remote, null)).toBe(remote);
    });

    it("builds recurring occurrences and budget captions", () => {
      const occurrences = buildRecurringOccurrences(
        [
          {
            id: "rec-1",
            name: "Netflix",
            amount: 50,
            type: "expense",
            audience: "personal",
            nature: "recurring",
            category: "subscriptions",
            frequency: "monthly",
            startDate: "2025-01-10T00:00:00.000Z",
            reviewed: true
          }
        ],
        ["2025-02", "2025-03"]
      );
      expect(occurrences).toHaveLength(2);
      expect(occurrences[0]?.merchant).toBe("Netflix");
      expect(formatStatementLabel({ issuer: "nubank", referenceMonth: "2025-03", relativeMonth: "current", importedAt: "2025-03-01" })).toMatch(/mar/i);
      expect(isInstallmentForecast(baseTransaction({ forecast: { kind: "installment", generatedFromTransactionId: "tx-1" } }))).toBe(true);
      expect(categoryBudgetCaption({ status: "over" } as never)).toBe("Acima do orcamento");
      expect(categoryBudgetCaption({ status: "tight" } as never)).toBe("Perto do limite");
      expect(categoryBudgetCaption({ status: "ok", remaining: 10 } as never)).toBe("Dentro do limite");
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
