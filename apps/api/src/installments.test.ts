import type { FinancialTransaction } from "@mylyfe/domain";
import { describe, expect, it } from "vitest";
import {
  isInstallmentForecast,
  parseInstallmentFromMerchant,
  reconcileInstallmentForecasts
} from "./installments.js";

const baseTransaction = (overrides: Partial<FinancialTransaction> = {}): FinancialTransaction => ({
  id: "tx-netflix-1",
  date: "2026-07-11T12:00:00.000Z",
  merchant: "Netflix - Parcela 1/3",
  amount: 30,
  type: "expense",
  audience: "personal",
  nature: "expense",
  category: "subscriptions",
  confidence: 0.8,
  source: "csv",
  reviewed: false,
  ...overrides
});

describe("parseInstallmentFromMerchant", () => {
  it("parses parcela notation from merchant text", () => {
    expect(parseInstallmentFromMerchant("Netflix - Parcela 1/3")).toEqual({
      current: 1,
      total: 3,
      baseMerchant: "Netflix"
    });
  });

  it("returns null when merchant has no installment pattern", () => {
    expect(parseInstallmentFromMerchant("Padaria")).toBeNull();
  });
});

describe("isInstallmentForecast", () => {
  it("detects installment forecast transactions", () => {
    const forecast = baseTransaction({
      forecast: { kind: "installment", generatedFromTransactionId: "tx-netflix-1" }
    });
    expect(isInstallmentForecast(forecast)).toBe(true);
    expect(isInstallmentForecast(baseTransaction())).toBe(false);
  });
});

describe("reconcileInstallmentForecasts", () => {
  it("generates remaining installment forecasts for parcela 1/3", () => {
    const generatedAt = "2026-07-11T15:00:00.000Z";
    const result = reconcileInstallmentForecasts([baseTransaction()], generatedAt);
    const forecasts = result.filter(isInstallmentForecast);

    expect(forecasts).toHaveLength(2);
    expect(forecasts.map((item) => item.installment)).toEqual(
      expect.arrayContaining([
        { current: 2, total: 3 },
        { current: 3, total: 3 }
      ])
    );
    expect(forecasts.every((item) => item.amount === 30)).toBe(true);
    expect(forecasts.every((item) => item.merchant.includes("Netflix"))).toBe(true);
  });
});
