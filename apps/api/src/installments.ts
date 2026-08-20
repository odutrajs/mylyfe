import type { FinancialTransaction, StatementRelativeMonth } from "@mylyfe/domain";
import { createHash } from "node:crypto";

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const amountBucket = (value: number) => Math.round(Math.abs(value));

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

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

const addMonths = (value: string, amount: number) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const firstDay = new Date(parsed.getFullYear(), parsed.getMonth() + amount, 1, 12);
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();
  const day = Math.min(parsed.getDate(), lastDay);
  return new Date(firstDay.getFullYear(), firstDay.getMonth(), day, 12).toISOString();
};

const addMonthsToMonthKey = (value: string, amount: number) => {
  const [yearRaw, monthRaw] = value.split("-");
  const parsed = new Date(Number(yearRaw), Number(monthRaw) - 1 + amount, 1, 12);
  return Number.isNaN(parsed.getTime()) ? value : monthKey(parsed);
};

const forecastId = (key: string) =>
  `tx-forecast-${createHash("sha1")
    .update(key)
    .digest("hex")
    .slice(0, 16)}`;

export const parseInstallmentFromMerchant = (merchant: string) => {
  const match = merchant.match(/(?:^|\s)[-–—]?\s*parcela\s+(\d{1,3})\s*\/\s*(\d{1,3})\b/i);
  if (!match) return null;

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || total < 1 || current > total) return null;

  const baseMerchant =
    merchant
      .slice(0, match.index)
      .replace(/\s*[-–—]\s*$/, "")
      .trim() || merchant.trim();

  return {
    current,
    total,
    baseMerchant
  };
};

export const installmentBaseMerchant = (transaction: FinancialTransaction) =>
  parseInstallmentFromMerchant(transaction.merchant)?.baseMerchant ?? transaction.description ?? transaction.merchant;

export const installmentOccurrenceKey = (transaction: FinancialTransaction) => {
  if (!transaction.installment) return "";
  return [
    normalizeText(installmentBaseMerchant(transaction)),
    transaction.installment.current,
    transaction.installment.total,
    amountBucket(transaction.amount)
  ].join("|");
};

const installmentChainKey = (transaction: FinancialTransaction) => {
  if (!transaction.installment) return "";
  return [normalizeText(installmentBaseMerchant(transaction)), transaction.installment.total, amountBucket(transaction.amount)].join("|");
};

export const isInstallmentForecast = (transaction: FinancialTransaction) => transaction.forecast?.kind === "installment";

const futureInstallmentTransaction = (
  transaction: FinancialTransaction,
  installmentCurrent: number,
  offset: number,
  generatedAt: string
): FinancialTransaction => {
  const total = transaction.installment?.total ?? installmentCurrent;
  const baseMerchant = installmentBaseMerchant(transaction);
  const date = addMonths(transaction.date, offset);
  const referenceMonth = transaction.statement?.referenceMonth
    ? addMonthsToMonthKey(transaction.statement.referenceMonth, offset)
    : monthKey(new Date(date));
  const merchant = `${baseMerchant} - Parcela ${installmentCurrent}/${total}`;
  const key = [normalizeText(baseMerchant), installmentCurrent, total, amountBucket(transaction.amount)].join("|");

  return {
    ...transaction,
    id: forecastId(key),
    date,
    merchant,
    description: transaction.description ?? baseMerchant,
    source: "api",
    sourceFile: transaction.sourceFile,
    statement: {
      issuer: transaction.statement?.issuer ?? "unknown",
      referenceMonth,
      relativeMonth: statementRelativeMonth(referenceMonth),
      importedAt: generatedAt
    },
    installment: {
      current: installmentCurrent,
      total
    },
    forecast: {
      kind: "installment",
      generatedFromTransactionId: transaction.id
    },
    reviewed: true
  };
};

export const reconcileInstallmentForecasts = (transactions: FinancialTransaction[], generatedAt = new Date().toISOString()) => {
  const actualTransactions = transactions.map((transaction) => {
    if (isInstallmentForecast(transaction)) return transaction;
    const parsed = parseInstallmentFromMerchant(transaction.merchant);
    if (!parsed) return transaction;
    return {
      ...transaction,
      installment: transaction.installment ?? {
        current: parsed.current,
        total: parsed.total
      }
    };
  });
  const actuals = actualTransactions.filter((transaction) => !isInstallmentForecast(transaction));
  const occupiedKeys = new Set(actuals.map(installmentOccurrenceKey).filter(Boolean));
  const latestActualByChain = new Map<string, FinancialTransaction>();
  const forecasts: FinancialTransaction[] = [];

  for (const transaction of actuals) {
    if (!transaction.installment) continue;
    const chainKey = installmentChainKey(transaction);
    if (!chainKey) continue;

    const currentLatest = latestActualByChain.get(chainKey);
    if (
      !currentLatest ||
      (currentLatest.installment && transaction.installment.current > currentLatest.installment.current) ||
      (currentLatest.installment?.current === transaction.installment.current && transaction.date > currentLatest.date)
    ) {
      latestActualByChain.set(chainKey, transaction);
    }
  }

  for (const transaction of latestActualByChain.values()) {
    if (!transaction.installment || transaction.installment.current >= transaction.installment.total) continue;
    for (let current = transaction.installment.current + 1; current <= transaction.installment.total; current += 1) {
      const forecast = futureInstallmentTransaction(transaction, current, current - transaction.installment.current, generatedAt);
      const key = installmentOccurrenceKey(forecast);
      if (!key || occupiedKeys.has(key)) continue;
      occupiedKeys.add(key);
      forecasts.push(forecast);
    }
  }

  return [...actuals, ...forecasts];
};
