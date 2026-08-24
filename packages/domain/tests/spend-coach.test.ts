import { describe, expect, it } from "vitest";
import {
  buildLocalSpendCoachAdvice,
  buildSpendCoachBrief,
  countSpendCoachQuestions,
  createEmptyPlan,
  normalizeSpendCoachTurn,
  resolveLocalSpendCoachTurn,
  type FinancePlan
} from "../src/index.js";

const plan = (): FinancePlan => ({
  ...createEmptyPlan("coach"),
  profile: {
    ...createEmptyPlan("coach").profile,
    people: [
      {
        id: "primary",
        name: "Thiago",
        email: "thiago@example.com",
        phone: "11999999999",
        role: "primary",
        age: 32
      }
    ]
  },
  incomeSources: [
    {
      id: "salary",
      name: "Salario",
      type: "clt",
      netAmount: 8000,
      frequency: "monthly",
      isRecurring: true,
      stabilityScore: 8
    }
  ],
  expenseProfile: {
    estimatedMonthlySpend: 4000,
    currentMonthlyInvestments: 800,
    monthlyProvisions: 200,
    emergencyFundTargetMonths: 6
  },
  recurringTransactions: [
    {
      id: "netflix",
      name: "Netflix",
      amount: 55.9,
      type: "expense",
      audience: "personal",
      nature: "recurring",
      category: "subscriptions",
      frequency: "monthly",
      startDate: "2026-01-01",
      reviewed: true
    }
  ],
  transactions: [
    {
      id: "ifood-1",
      date: "2026-08-10T12:00:00.000Z",
      merchant: "iFood",
      amount: 890,
      type: "expense",
      audience: "personal",
      nature: "variable",
      category: "food",
      confidence: 1,
      source: "manual",
      reviewed: true
    }
  ]
});

describe("spend coach brief", () => {
  it("sends money context without contact details", () => {
    const brief = buildSpendCoachBrief(plan(), "2026-08", new Date("2026-08-18T12:00:00.000Z"));
    const raw = JSON.stringify(brief);
    expect(brief.person.name).toBe("Thiago");
    expect(brief.person.age).toBe(32);
    expect(brief.income).toBeGreaterThan(0);
    expect(brief.expenses.some((item) => item.name === "iFood")).toBe(true);
    expect(brief.incomes.some((item) => item.name === "Salario")).toBe(true);
    expect(brief.unclear.some((item) => item.name === "iFood")).toBe(true);
    expect(raw).not.toContain("thiago@example.com");
    expect(raw).not.toContain("11999999999");
  });

  it("builds local advice from the biggest outflows", () => {
    const advice = buildLocalSpendCoachAdvice(buildSpendCoachBrief(plan(), "2026-08", new Date("2026-08-18T12:00:00.000Z")));
    expect(advice.status).toBe("advice");
    expect(advice.summary).toContain("Thiago");
    expect(advice.hotspots.length).toBeGreaterThan(0);
  });

  it("asks about an unclear bill before advising", () => {
    const brief = buildSpendCoachBrief(plan(), "2026-08", new Date("2026-08-18T12:00:00.000Z"));
    const question = resolveLocalSpendCoachTurn(brief, []);
    expect(question.status).toBe("question");
    expect(question.about?.name).toBe("iFood");
    const advice = resolveLocalSpendCoachTurn(brief, [
      { role: "assistant", content: question.question ?? "", status: "question" },
      { role: "user", content: "Pode seguir sem essa resposta." }
    ]);
    expect(advice.status).toBe("advice");
  });
});

describe("spend coach turn", () => {
  it("keeps a question when the model needs context", () => {
    const turn = normalizeSpendCoachTurn({
      status: "question",
      question: "O iFood de R$ 890 e delivery do dia a dia?",
      about: { id: "ifood-1", name: "iFood", amount: 890 }
    });
    expect(turn?.status).toBe("question");
    expect(turn?.about?.name).toBe("iFood");
  });

  it("forces advice after the question limit", () => {
    const turn = normalizeSpendCoachTurn(
      {
        status: "question",
        question: "Ainda preciso de mais um dado",
        summary: "Da para cortar delivery."
      },
      true
    );
    expect(turn?.status).toBe("advice");
    expect(countSpendCoachQuestions([{ role: "assistant", content: "q1", status: "question" }])).toBe(1);
  });
});
