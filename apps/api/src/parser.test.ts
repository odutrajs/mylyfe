import { createEmptyPlan, type FinancialTransaction } from "@mylyfe/domain";
import { describe, expect, it } from "vitest";
import { dedupeTransactions, findDuplicateStatementImport, parseCsvStatement } from "./parser.js";

const csvExample = `date;title;amount
2026-07-10;Padaria;12,50
2026-07-11;Netflix - Parcela 1/3;30,00
2026-07-12;Pagamento recebido;-100,00`;

const plan = createEmptyPlan("test-plan");

describe("parseCsvStatement", () => {
  it("parses semicolon-separated Nubank-like CSV and ignores payment receipts", () => {
    const parsed = parseCsvStatement(Buffer.from(csvExample, "utf8"), "nubank-fatura.csv", plan);

    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions.map((item) => item.merchant)).toEqual(
      expect.arrayContaining(["Padaria", "Netflix - Parcela 1/3"])
    );
    expect(parsed.transactions.some((item) => /pagamento recebido/i.test(item.merchant))).toBe(false);

    const netflix = parsed.transactions.find((item) => item.merchant.includes("Netflix"));
    expect(netflix?.amount).toBe(30);
    expect(netflix?.installment).toEqual({ current: 1, total: 3 });
  });
});

describe("dedupeTransactions", () => {
  it("drops imported transactions that match existing fingerprints", () => {
    const parsed = parseCsvStatement(Buffer.from(csvExample, "utf8"), "nubank-fatura.csv", plan);
    const existing = parsed.transactions.slice(0, 1);
    const imported = parsed.transactions;

    const deduped = dedupeTransactions(existing, imported);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.merchant).toBe("Netflix - Parcela 1/3");
  });
});

describe("findDuplicateStatementImport", () => {
  it("detects duplicate imports by matching statement metadata", () => {
    const parsed = parseCsvStatement(Buffer.from(csvExample, "utf8"), "nubank-fatura.csv", plan);
    const existing: FinancialTransaction[] = parsed.transactions.map((transaction) => ({
      ...transaction,
      id: "existing-tx"
    }));

    const duplicate = findDuplicateStatementImport(existing, parsed);
    expect(duplicate).not.toBeNull();
    expect(duplicate?.reason).toBe("metadata");
    expect(duplicate?.matchedTransactions).toBe(parsed.transactions.length);
  });
});
