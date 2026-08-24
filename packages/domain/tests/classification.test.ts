import { describe, expect, it } from "vitest";
import {
  classifyTransaction,
  createRuleFromCorrection,
  inferTransactionType,
  createEmptyPlan,
  type ClassificationRule,
  type FinancialTransaction
} from "../src/index.js";

const fixedNow = new Date("2026-08-18T12:00:00.000Z");

const transaction = (
  patch: Partial<FinancialTransaction> & Pick<FinancialTransaction, "id" | "merchant">
): FinancialTransaction => ({
  id: patch.id,
  date: patch.date ?? "2026-08-10T00:00:00.000Z",
  merchant: patch.merchant,
  amount: patch.amount ?? 120,
  type: patch.type ?? "expense",
  audience: patch.audience ?? "personal",
  nature: patch.nature ?? "variable",
  category: patch.category ?? "other",
  confidence: patch.confidence ?? 1,
  source: patch.source ?? "manual",
  reviewed: patch.reviewed ?? false,
  description: patch.description
});

describe("transaction classification", () => {
  it("matches rules by merchant and description patterns", () => {
    const rules: ClassificationRule[] = [
      {
        id: "rule-uber",
        merchantPattern: "uber",
        audience: "personal",
        nature: "variable",
        category: "transport",
        confidence: 0.9,
        createdAt: fixedNow.toISOString(),
        updatedAt: fixedNow.toISOString()
      },
      {
        id: "rule-uber-work",
        merchantPattern: "uber",
        descriptionPattern: "cliente",
        audience: "company",
        nature: "variable",
        category: "company",
        confidence: 0.95,
        createdAt: fixedNow.toISOString(),
        updatedAt: fixedNow.toISOString()
      }
    ];

    expect(
      classifyTransaction(
        { merchant: "Uber Trip", description: "corrida para cliente", amount: 32, date: "2026-08-18" },
        rules,
        []
      )
    ).toMatchObject({
      audience: "company",
      nature: "variable",
      category: "company",
      confidence: 0.95,
      reviewed: false
    });

    expect(
      classifyTransaction({ merchant: "Uber Trip", description: "corrida casa", amount: 22, date: "2026-08-18" }, rules, [])
    ).toMatchObject({
      audience: "personal",
      category: "transport",
      confidence: 0.9
    });
  });

  it("falls back to reviewed merchant history when no rule matches", () => {
    const history = [
      transaction({
        id: "old",
        merchant: "Padaria Central",
        audience: "personal",
        nature: "variable",
        category: "food",
        reviewed: false
      }),
      transaction({
        id: "reviewed",
        merchant: "Padaria Central",
        audience: "company",
        nature: "variable",
        category: "company",
        reviewed: true
      })
    ];

    expect(
      classifyTransaction({ merchant: "Padaria Central", amount: 18, date: "2026-08-18" }, [], history)
    ).toMatchObject({
      audience: "company",
      nature: "variable",
      category: "company",
      confidence: 0.8,
      reviewed: false
    });
  });

  it("defaults to personal variable other when nothing matches", () => {
    expect(
      classifyTransaction({ merchant: "Loja Desconhecida", amount: 45, date: "2026-08-18" }, [], [])
    ).toEqual({
      audience: "personal",
      nature: "variable",
      category: "other",
      confidence: 0.35,
      reviewed: false
    });
  });

  it("creates a high-confidence rule from a user correction", () => {
    const source = transaction({
      id: "tx-1",
      merchant: "iFood",
      category: "food"
    });

    expect(
      createRuleFromCorrection(source, { audience: "company", nature: "variable", category: "company" }, fixedNow)
    ).toEqual({
      id: "rule-tx-1",
      merchantPattern: "iFood",
      audience: "company",
      nature: "variable",
      category: "company",
      confidence: 0.98,
      createdAt: fixedNow.toISOString(),
      updatedAt: fixedNow.toISOString()
    });
  });

  it("infers transaction types from amount, category and nature", () => {
    expect(inferTransactionType(100, "other", "variable")).toBe("expense");
    expect(inferTransactionType(-2500, "other", "variable")).toBe("income");
    expect(inferTransactionType(500, "investments", "variable")).toBe("investment");
    expect(inferTransactionType(500, "other", "investment")).toBe("investment");
    expect(inferTransactionType(800, "debt", "variable")).toBe("debt_payment");
    expect(inferTransactionType(800, "other", "debtPayment")).toBe("debt_payment");
    expect(inferTransactionType(300, "other", "transfer")).toBe("transfer");
  });
});
