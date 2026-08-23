import { describe, expect, it } from "vitest";
import {
  analyzePlan,
  calculateCategoryBudgetProgress,
  listCategoryExpensesInMonth,
  calculateEmergencyFundMonths,
  calculateFinancialIndependenceNumber,
  calculateGoalCurrentValue,
  calculateGoalProjection,
  calculateIncomeCommitment,
  calculateIncomeMetrics,
  calculateMonthlyCashFlow,
  calculateMonthlyCashFlowSeries,
  calculateNominalReturn,
  calculatePatrimonyMetrics,
  calculateSavingsRate,
  interpolateScore,
  withGoalAssetProgress,
  scoreBand,
  createEmptyPlan,
  simulatePurchaseImpact,
  unifyShoppingCategories,
  type FinancePlan
} from "../src/index.js";

const basePlan = (): FinancePlan => ({
  ...createEmptyPlan("test"),
  expenseProfile: {
    estimatedMonthlySpend: 4000,
    currentMonthlyInvestments: 1000,
    monthlyProvisions: 500,
    emergencyFundTargetMonths: 6
  }
});

describe("financial domain calculations", () => {
  it("monthlyizes recurring income and keeps extraordinary income separate", () => {
    const plan = {
      ...basePlan(),
      incomeSources: [
        {
          id: "salary",
          name: "Salary",
          type: "clt",
          netAmount: 10000,
          frequency: "monthly",
          isRecurring: true,
          stabilityScore: 8
        },
        {
          id: "bonus",
          name: "Bonus",
          type: "freelance",
          netAmount: 6000,
          frequency: "single",
          isRecurring: false,
          stabilityScore: 4
        }
      ],
      transactions: [
        {
          id: "freela",
          date: "2026-08-10T00:00:00.000Z",
          merchant: "Freela landing page",
          amount: 2500,
          type: "income",
          audience: "personal",
          nature: "extraordinary",
          category: "other",
          confidence: 1,
          source: "manual",
          reviewed: true
        }
      ]
    } satisfies FinancePlan;

    const metrics = calculateIncomeMetrics(plan, new Date("2026-08-18T12:00:00.000Z"));

    expect(metrics.recurringMonthly).toBe(10000);
    expect(metrics.extraordinary).toBe(8500);
    expect(metrics.annualEstimated).toBe(128500);
  });

  it("calculates total, liquid, financial and investable patrimony", () => {
    const metrics = calculatePatrimonyMetrics(
      [
        {
          id: "reserve",
          name: "Reserve",
          category: "emergencyReserve",
          value: 30000,
          liquidity: "immediate",
          includeInIndependence: true
        },
        {
          id: "home",
          name: "Home",
          category: "realEstate",
          value: 500000,
          liquidity: "illiquid",
          includeInIndependence: false
        }
      ],
      [
        {
          id: "mortgage",
          name: "Mortgage",
          type: "mortgage",
          balance: 200000,
          monthlyPayment: 2500
        }
      ]
    );

    expect(metrics.totalAssets).toBe(530000);
    expect(metrics.totalLiabilities).toBe(200000);
    expect(metrics.netWorth).toBe(330000);
    expect(metrics.financialAssets).toBe(30000);
    expect(metrics.investableAssets).toBe(30000);
    expect(metrics.illiquidAssets).toBe(500000);
  });

  it("calculates savings rate from contributions and recurring income", () => {
    const plan = {
      ...basePlan(),
      incomeSources: [
        {
          id: "salary",
          name: "Salary",
          type: "clt",
          netAmount: 10000,
          frequency: "monthly",
          isRecurring: true,
          stabilityScore: 8
        }
      ]
    } satisfies FinancePlan;

    expect(calculateSavingsRate(plan)).toBe(0.1);
  });

  it("uses immediate-liquidity financial assets as reserve coverage", () => {
    const plan = {
      ...basePlan(),
      assets: [
        {
          id: "cdb",
          name: "CDB liquidity",
          category: "cdb",
          value: 65000,
          liquidity: "immediate",
          includeInIndependence: false
        }
      ]
    } satisfies FinancePlan;

    expect(calculateEmergencyFundMonths(plan)).toBe(16.25);
  });

  it("includes recurring direct entries in monthly spending metrics", () => {
    const plan = {
      ...basePlan(),
      expenseProfile: {
        ...basePlan().expenseProfile,
        estimatedMonthlySpend: 0
      },
      recurringTransactions: [
        {
          id: "car-insurance",
          name: "Car insurance",
          amount: 320,
          type: "expense",
          audience: "personal",
          nature: "recurring",
          category: "transport",
          frequency: "monthly",
          startDate: "2026-08-01T12:00:00.000Z",
          reviewed: true
        }
      ]
    } satisfies FinancePlan;

    const analysis = analyzePlan(plan, new Date("2026-08-18T12:00:00.000Z"));

    expect(analysis.spending.currentMonthSpend).toBe(320);
    expect(analysis.spending.observedMonthlyAverage).toBe(320);
    expect(analysis.spending.observedMonthlyMedian).toBe(320);
    expect(analysis.budgetSuggestion.monthlyExpenseTarget).toBe(320);
  });

  it("does not double count imported card charges linked to recurring entries", () => {
    const plan = {
      ...basePlan(),
      expenseProfile: {
        ...basePlan().expenseProfile,
        estimatedMonthlySpend: 0
      },
      recurringTransactions: [
        {
          id: "car-insurance",
          name: "Car insurance",
          amount: 320,
          type: "expense",
          audience: "personal",
          nature: "recurring",
          category: "transport",
          frequency: "monthly",
          startDate: "2026-08-01T12:00:00.000Z",
          reviewed: true
        }
      ],
      transactions: [
        {
          id: "tx-insurance",
          date: "2026-08-05T12:00:00.000Z",
          merchant: "Insurance card charge",
          amount: 320,
          type: "expense",
          audience: "personal",
          nature: "recurring",
          category: "transport",
          recurringTransactionId: "car-insurance",
          confidence: 1,
          source: "pdf",
          reviewed: true
        }
      ]
    } satisfies FinancePlan;

    const analysis = analyzePlan(plan, new Date("2026-08-18T12:00:00.000Z"));

    expect(analysis.spending.currentMonthSpend).toBe(320);
    expect(analysis.spending.observedMonthlyAverage).toBe(320);
    expect(analysis.spending.observedMonthlyMedian).toBe(320);
  });

  it("uses card statement reference month for observed spending", () => {
    const plan = {
      ...basePlan(),
      expenseProfile: {
        ...basePlan().expenseProfile,
        estimatedMonthlySpend: 0
      },
      assets: [
        {
          id: "reserve",
          name: "Reserve",
          category: "cdb",
          value: 3000,
          liquidity: "immediate",
          includeInIndependence: false
        }
      ],
      transactions: [
        {
          id: "may-purchase-june-bill",
          date: "2026-05-20T12:00:00.000Z",
          merchant: "Card purchase",
          amount: 1000,
          type: "expense",
          audience: "personal",
          nature: "variable",
          category: "food",
          confidence: 1,
          source: "pdf",
          reviewed: true,
          statement: {
            issuer: "nubank",
            referenceMonth: "2026-06",
            relativeMonth: "previous",
            importedAt: "2026-08-18T12:00:00.000Z"
          }
        }
      ]
    } satisfies FinancePlan;

    const analysis = analyzePlan(plan, new Date("2026-08-18T12:00:00.000Z"));

    expect(analysis.spending.observedMonthlyAverage).toBe(1000);
    expect(analysis.spending.observedMonthlyMedian).toBe(1000);
    expect(analysis.emergencyFundMonths).toBe(3);
  });

  it("uses median monthly spending as the planning living cost", () => {
    const plan = {
      ...basePlan(),
      expenseProfile: {
        ...basePlan().expenseProfile,
        estimatedMonthlySpend: 0
      },
      transactions: [
        {
          id: "june-regular",
          date: "2026-06-05T12:00:00.000Z",
          merchant: "Regular June",
          amount: 1000,
          type: "expense",
          audience: "personal",
          nature: "variable",
          category: "food",
          confidence: 1,
          source: "csv",
          reviewed: true,
          statement: {
            issuer: "nubank",
            referenceMonth: "2026-06",
            relativeMonth: "previous",
            importedAt: "2026-08-18T12:00:00.000Z"
          }
        },
        {
          id: "july-outlier",
          date: "2026-07-05T12:00:00.000Z",
          merchant: "Outlier July",
          amount: 9000,
          type: "expense",
          audience: "personal",
          nature: "variable",
          category: "travel",
          confidence: 1,
          source: "csv",
          reviewed: true,
          statement: {
            issuer: "nubank",
            referenceMonth: "2026-07",
            relativeMonth: "previous",
            importedAt: "2026-08-18T12:00:00.000Z"
          }
        },
        {
          id: "august-regular",
          date: "2026-08-05T12:00:00.000Z",
          merchant: "Regular August",
          amount: 1100,
          type: "expense",
          audience: "personal",
          nature: "variable",
          category: "food",
          confidence: 1,
          source: "csv",
          reviewed: true,
          statement: {
            issuer: "nubank",
            referenceMonth: "2026-08",
            relativeMonth: "current",
            importedAt: "2026-08-18T12:00:00.000Z"
          }
        }
      ]
    } satisfies FinancePlan;

    const analysis = analyzePlan(plan, new Date("2026-08-18T12:00:00.000Z"));

    expect(analysis.spending.observedMonthlyAverage).toBe(3700);
    expect(analysis.spending.observedMonthlyMedian).toBe(1100);
    expect(analysis.spending.livingCostUsed).toBe(1100);
  });

  it("projects a goal without mixing nominal and current purchasing power", () => {
    const projection = calculateGoalProjection(
      {
        id: "goal",
        name: "Goal",
        targetValue: 12000,
        currentValue: 0,
        priority: 5,
        inflationAdjusted: true,
        eligibleAssetCategories: [],
        isPrimary: true
      },
      1000,
      calculateNominalReturn(0, 0),
      0,
      new Date("2026-01-01T00:00:00.000Z")
    );

    expect(projection.monthsToGoal).toBe(12);
    expect(projection.targetTodayValue).toBe(12000);
    expect(projection.targetNominalValue).toBe(12000);
  });

  it("calculates independence number only when configurable assumptions are present", () => {
    const plan = {
      ...basePlan(),
      profile: {
        ...basePlan().profile,
        people: [{ id: "primary", name: "Person", age: 40, role: "primary" }]
      },
      independence: {
        desiredMonthlySpend: 10000,
        targetAge: 60,
        assumptions: {
          inflationRate: 0,
          taxRate: 0,
          sustainableWithdrawalRate: 0.04,
          conservativeRealReturn: 0,
          baseRealReturn: 0,
          optimisticRealReturn: 0,
          contributionGrowthRate: 0,
          preservePrincipal: false
        }
      }
    } satisfies FinancePlan;

    const [base] = calculateFinancialIndependenceNumber(plan);

    expect(base?.requiredTodayValue).toBe(3000000);
    expect(base?.yearsUntilTargetAge).toBe(20);
  });

  it("explains financial health score and purchase impact", () => {
    const plan = {
      ...basePlan(),
      incomeSources: [
        {
          id: "salary",
          name: "Salary",
          type: "clt",
          netAmount: 10000,
          frequency: "monthly",
          isRecurring: true,
          stabilityScore: 8
        }
      ],
      assets: [
        {
          id: "reserve",
          name: "Reserve",
          category: "emergencyReserve",
          value: 30000,
          liquidity: "immediate",
          includeInIndependence: true
        }
      ],
      goals: [
        {
          id: "goal",
          name: "Goal",
          targetValue: 50000,
          currentValue: 10000,
          priority: 5,
          inflationAdjusted: false,
          eligibleAssetCategories: ["emergencyReserve"],
          isPrimary: true
        }
      ]
    } satisfies FinancePlan;

    const analysis = analyzePlan(plan);
    const purchase = simulatePurchaseImpact(plan, 5000, "goal");

    expect(analysis.score.components.length).toBe(7);
    expect(analysis.score.band).toBe(scoreBand(analysis.score.value));
    expect(analysis.score.value).toBeGreaterThanOrEqual(6);
    expect(analysis.score.components.find((item) => item.key === "emergencyReserve")?.score).toBeGreaterThanOrEqual(7);
    expect(analysis.commitment.committedPercent).toBe(0);
    expect(purchase.canPay).toBe(true);
    expect(purchase.liquidityAfterPurchase).toBe(25000);
  });

  it("interpolates score breakpoints linearly", () => {
    expect(interpolateScore(0.2, [
      [0, 10],
      [0.4, 6]
    ])).toBe(8);
    expect(interpolateScore(-1, [
      [0, 3],
      [1, 10]
    ])).toBe(3);
    expect(interpolateScore(2, [
      [0, 3],
      [1, 10]
    ])).toBe(10);
  });

  it("measures income commitment from recurring charges and future installments", () => {
    const plan = {
      ...basePlan(),
      expenseProfile: {
        ...basePlan().expenseProfile,
        estimatedMonthlySpend: 0
      },
      incomeSources: [
        {
          id: "salary",
          name: "Salary",
          type: "clt",
          netAmount: 10000,
          frequency: "monthly",
          isRecurring: true,
          stabilityScore: 8
        }
      ],
      recurringTransactions: [
        {
          id: "rent",
          name: "Rent",
          amount: 2000,
          type: "expense",
          audience: "personal",
          nature: "recurring",
          category: "housing",
          frequency: "monthly",
          startDate: "2026-01-01T12:00:00.000Z",
          reviewed: true
        }
      ],
      transactions: [
        {
          id: "tx-forecast-phone",
          date: "2026-09-10T12:00:00.000Z",
          merchant: "Phone - Parcela 4/10",
          amount: 1500,
          type: "expense",
          audience: "personal",
          nature: "variable",
          category: "shopping",
          confidence: 1,
          source: "manual",
          reviewed: true,
          installment: { current: 4, total: 10 },
          forecast: { kind: "installment" },
          statement: {
            issuer: "nubank",
            referenceMonth: "2026-09",
            relativeMonth: "next",
            importedAt: "2026-08-18T12:00:00.000Z"
          }
        }
      ]
    } satisfies FinancePlan;

    const asOf = new Date("2026-08-18T12:00:00.000Z");
    const commitment = calculateIncomeCommitment(plan, asOf);
    const analysis = analyzePlan(plan, asOf);

    expect(commitment.thisMonth.recurring).toBe(2000);
    expect(commitment.nextMonth.installments).toBe(1500);
    expect(commitment.nextMonth.total).toBe(3500);
    expect(commitment.committedPercent).toBe(0.35);
    expect(commitment.freePercent).toBe(0.65);
    expect(commitment.status).toBe("moderate");
    expect(commitment.remainingInstallmentBalance).toBe(1500);
    expect(analysis.spending.currentMonthSpend).toBe(2000);
    expect(analysis.score.components.find((item) => item.key === "incomeCommitment")?.score).toBeLessThan(10);
    expect(analysis.score.components.find((item) => item.key === "futureBurden")?.score).toBeLessThan(10);
  });

  it("includes registered debts in net worth and income commitment", () => {
    const plan = {
      ...basePlan(),
      incomeSources: [
        {
          id: "salary",
          name: "Salary",
          type: "clt",
          netAmount: 10000,
          frequency: "monthly",
          isRecurring: true,
          stabilityScore: 8
        }
      ],
      assets: [
        {
          id: "cash",
          name: "Conta",
          category: "checking",
          value: 20000,
          liquidity: "immediate",
          includeInIndependence: false
        }
      ],
      debts: [
        {
          id: "car",
          name: "Financiamento do carro",
          type: "vehicle",
          balance: 18000,
          monthlyPayment: 1200,
          remainingMonths: 15
        }
      ]
    } satisfies FinancePlan;

    const asOf = new Date("2026-08-18T12:00:00.000Z");
    const patrimony = calculatePatrimonyMetrics(plan.assets, plan.debts);
    const commitment = calculateIncomeCommitment(plan, asOf);

    expect(patrimony.totalLiabilities).toBe(18000);
    expect(patrimony.netWorth).toBe(2000);
    expect(commitment.nextMonth.debts).toBe(1200);
    expect(commitment.nextMonth.total).toBe(1200);
  });

  it("does not count installment forecasts as observed spending", () => {
    const plan = {
      ...basePlan(),
      expenseProfile: {
        ...basePlan().expenseProfile,
        estimatedMonthlySpend: 0
      },
      transactions: [
        {
          id: "tx-forecast-now",
          date: "2026-08-20T12:00:00.000Z",
          merchant: "TV - Parcela 2/6",
          amount: 800,
          type: "expense",
          audience: "personal",
          nature: "variable",
          category: "shopping",
          confidence: 1,
          source: "manual",
          reviewed: true,
          installment: { current: 2, total: 6 },
          forecast: { kind: "installment" },
          statement: {
            issuer: "nubank",
            referenceMonth: "2026-08",
            relativeMonth: "current",
            importedAt: "2026-08-18T12:00:00.000Z"
          }
        }
      ]
    } satisfies FinancePlan;

    const analysis = analyzePlan(plan, new Date("2026-08-18T12:00:00.000Z"));

    expect(analysis.spending.currentMonthSpend).toBe(0);
    expect(analysis.spending.observedMonthlyAverage).toBeNull();
    expect(analysis.cashFlow.installments).toBe(800);
    expect(analysis.commitment.thisMonth.installments).toBe(800);
  });

  it("still scores emergency reserve when the configured target is zero", () => {
    const plan = {
      ...basePlan(),
      expenseProfile: {
        estimatedMonthlySpend: 4000,
        currentMonthlyInvestments: 0,
        monthlyProvisions: 0,
        emergencyFundTargetMonths: 0
      },
      incomeSources: [
        {
          id: "salary",
          name: "Salary",
          type: "clt",
          netAmount: 10000,
          frequency: "monthly",
          isRecurring: true,
          stabilityScore: 9
        }
      ],
      assets: [
        {
          id: "reserve",
          name: "Reserve",
          category: "emergencyReserve",
          value: 24000,
          liquidity: "immediate",
          includeInIndependence: false
        }
      ]
    } satisfies FinancePlan;

    const analysis = analyzePlan(plan);
    const reserve = analysis.score.components.find((item) => item.key === "emergencyReserve");

    expect(analysis.emergencyFundMonths).toBe(6);
    expect(reserve?.score).toBeGreaterThanOrEqual(8);
    expect(analysis.score.value).toBeGreaterThan(0);
  });

  it("counts invested assets like CDB toward the primary goal when currentValue is empty", () => {
    const plan = {
      ...basePlan(),
      assets: [
        {
          id: "cdb",
          name: "CDB",
          category: "cdb",
          value: 80000,
          liquidity: "immediate",
          includeInIndependence: false
        },
        {
          id: "house",
          name: "House",
          category: "realEstate",
          value: 500000,
          liquidity: "illiquid",
          includeInIndependence: false
        }
      ],
      goals: [
        {
          id: "million",
          name: "Milhao",
          targetValue: 1000000,
          currentValue: 0,
          priority: 5,
          inflationAdjusted: false,
          eligibleAssetCategories: [],
          isPrimary: true
        }
      ]
    } satisfies FinancePlan;

    const analysis = analyzePlan(plan);
    const fromZero = calculateGoalProjection(plan.goals[0]!, 5000, 0, 0);
    const fromAssets = calculateGoalProjection(withGoalAssetProgress(plan.goals[0]!, plan.assets), 5000, 0, 0);

    expect(calculateGoalCurrentValue(plan.goals[0]!, plan.assets)).toBe(80000);
    expect(analysis.primaryGoalProjection?.targetTodayValue).toBe(1000000);
    expect(fromAssets.monthsToGoal).toBeLessThan(fromZero.monthsToGoal ?? Number.POSITIVE_INFINITY);
  });

  it("tracks remaining category budget from history and the current month", () => {
    const expense = (
      id: string,
      month: string,
      amount: number
    ): FinancePlan["transactions"][number] => ({
      id,
      date: `${month}-05T12:00:00.000Z`,
      merchant: "Market",
      amount,
      type: "expense",
      audience: "personal",
      nature: "variable",
      category: "food",
      confidence: 1,
      source: "manual",
      reviewed: true,
      statement: {
        issuer: "nubank",
        referenceMonth: month,
        relativeMonth: month === "2026-08" ? "current" : "previous",
        importedAt: "2026-08-18T12:00:00.000Z"
      }
    });

    const plan = {
      ...basePlan(),
      transactions: [expense("june", "2026-06", 400), expense("july", "2026-07", 600), expense("august", "2026-08", 200)]
    } satisfies FinancePlan;

    const [food] = calculateCategoryBudgetProgress(plan, new Date("2026-08-18T12:00:00.000Z"));

    expect(food?.category).toBe("food");
    expect(food?.spent).toBe(200);
    expect(food?.limit).toBe(500);
    expect(food?.remaining).toBe(300);
    expect(food?.source).toBe("history");
    expect(food?.status).toBe("comfortable");
  });

  it("lists the current-month expenses that make up a category total", () => {
    const plan = {
      ...basePlan(),
      transactions: [
        {
          id: "padaria",
          date: "2026-08-10T00:00:00.000Z",
          merchant: "Padaria Central",
          amount: 42.5,
          type: "expense",
          audience: "personal",
          nature: "variable",
          category: "food",
          confidence: 1,
          source: "manual",
          reviewed: true
        },
        {
          id: "uber",
          date: "2026-08-12T00:00:00.000Z",
          merchant: "Uber",
          amount: 28,
          type: "expense",
          audience: "personal",
          nature: "variable",
          category: "transport",
          confidence: 1,
          source: "manual",
          reviewed: true
        }
      ],
      recurringTransactions: [
        {
          id: "ifood",
          name: "Ifood clube",
          amount: 14.9,
          type: "expense",
          audience: "personal",
          nature: "recurring",
          category: "food",
          frequency: "monthly",
          startDate: "2026-01-05",
          reviewed: true
        }
      ]
    } satisfies FinancePlan;

    const items = listCategoryExpensesInMonth(plan, "2026-08", "food");

    expect(items.map((item) => item.name)).toEqual(["Padaria Central", "Ifood clube"]);
    expect(items.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(57.4);
  });

  it("suggests category ceilings from income minus the planned contribution", () => {
    const plan = {
      ...basePlan(),
      expenseProfile: {
        ...basePlan().expenseProfile,
        currentMonthlyInvestments: 0
      },
      budget: {
        ...basePlan().budget,
        monthlyInvestmentTarget: 2000
      },
      incomeSources: [
        {
          id: "salary",
          name: "Salary",
          type: "clt",
          netAmount: 10000,
          frequency: "monthly",
          isRecurring: true,
          stabilityScore: 8
        }
      ]
    } satisfies FinancePlan;

    const analysis = analyzePlan(plan);
    const food = analysis.categoryBudgets.find((item) => item.category === "food");

    expect(analysis.categoryBudgetPlan.expenseEnvelope).toBe(8000);
    expect(food?.source).toBe("suggested");
    expect(food?.share).toBe(0.15);
    expect(food?.limit).toBe(1200);
  });

  it("merges shopping, leisure and online shopping into one category", () => {
    const expense = (
      id: string,
      category: FinancePlan["transactions"][number]["category"],
      amount: number
    ): FinancePlan["transactions"][number] => ({
      id,
      date: "2026-08-05T12:00:00.000Z",
      merchant: id,
      amount,
      type: "expense",
      audience: "personal",
      nature: "variable",
      category,
      confidence: 1,
      source: "manual",
      reviewed: true
    });

    const plan = {
      ...basePlan(),
      expenseCategories: [
        ...basePlan().expenseCategories,
        { id: "custom-compras-online", name: "Compras Online", color: "#db2777", isDefault: false, isActive: true }
      ],
      budget: {
        ...basePlan().budget,
        monthlyInvestmentTarget: 2000,
        categoryTargets: [
          { category: "leisure", monthlyTarget: 0, share: 0.04 },
          { category: "shopping", monthlyTarget: 0, share: 0.05 }
        ]
      },
      incomeSources: [
        {
          id: "salary",
          name: "Salary",
          type: "clt",
          netAmount: 10000,
          frequency: "monthly",
          isRecurring: true,
          stabilityScore: 8
        }
      ],
      transactions: [
        expense("mall", "shopping", 80),
        expense("cinema", "leisure", 40),
        expense("amazon", "custom-compras-online", 30)
      ]
    } satisfies FinancePlan;

    const unified = unifyShoppingCategories(plan);
    const analysis = analyzePlan(plan, new Date("2026-08-18T12:00:00.000Z"));
    const shopping = analysis.categoryBudgets.find((item) => item.category === "shopping");
    const leftover = analysis.categoryBudgets.filter(
      (item) => item.category === "leisure" || item.category === "custom-compras-online"
    );

    expect(unified.expenseCategories.some((category) => category.id === "leisure")).toBe(false);
    expect(unified.expenseCategories.some((category) => category.id === "custom-compras-online")).toBe(false);
    expect(unified.expenseCategories.find((category) => category.id === "shopping")?.name).toBe("Compras e Lazer");
    expect(unified.transactions.every((transaction) => transaction.category === "shopping")).toBe(true);
    expect(unified.budget.categoryTargets).toEqual([{ category: "shopping", monthlyTarget: 0, share: 0.09 }]);
    expect(leftover).toEqual([]);
    expect(shopping?.name).toBe("Compras e Lazer");
    expect(shopping?.spent).toBe(150);
    expect(shopping?.share).toBe(0.09);
  });

  it("builds a monthly cash flow series with income, outflow and net", () => {
    const plan = {
      ...basePlan(),
      incomeSources: [
        {
          id: "salary",
          name: "Salary",
          type: "clt",
          netAmount: 10000,
          frequency: "monthly",
          isRecurring: true,
          stabilityScore: 8
        }
      ],
      transactions: [
        {
          id: "rent",
          date: "2026-08-05",
          merchant: "Aluguel",
          amount: 2500,
          type: "expense",
          audience: "personal",
          nature: "essential",
          category: "housing",
          confidence: 1,
          source: "manual",
          reviewed: true
        }
      ]
    } satisfies FinancePlan;

    const flow = calculateMonthlyCashFlow(plan, "2026-08");
    expect(flow.income).toBe(10000);
    expect(flow.outflow).toBeGreaterThanOrEqual(2500);
    expect(flow.net).toBe(flow.income - flow.outflow);

    const series = calculateMonthlyCashFlowSeries(plan, new Date("2026-08-15T12:00:00.000Z"), 1, 1);
    expect(series.map((item) => item.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });
});
