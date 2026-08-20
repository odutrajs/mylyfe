import {
  classifyTransaction,
  inferTransactionType,
  type FinancePlan,
  type FinancialTransaction,
  type StatementRelativeMonth
} from "@mylyfe/domain";
import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import pdfParse from "pdf-parse";
import { installmentOccurrenceKey, isInstallmentForecast, parseInstallmentFromMerchant } from "./installments.js";

type CsvRecord = Record<string, string | number | undefined>;
type StatementSource = "csv" | "pdf";

export interface ParsedStatement {
  transactions: FinancialTransaction[];
  metadata: StatementMetadata;
}

export interface StatementMetadata {
  issuer: "nubank" | "unknown";
  source: StatementSource;
  sourceFile: string;
  referenceMonth: string;
  relativeMonth: StatementRelativeMonth;
  dueDate?: string;
  periodStart?: string;
  periodEnd?: string;
  importedAt: string;
}

export interface DuplicateStatementMatch {
  reason: "metadata" | "file" | "content";
  sourceFile?: string;
  referenceMonth?: string;
  dueDate?: string;
  periodStart?: string;
  periodEnd?: string;
  importedAt?: string;
  matchedTransactions: number;
}

const monthNames: Record<string, number> = {
  JAN: 0,
  FEV: 1,
  MAR: 2,
  ABR: 3,
  MAI: 4,
  JUN: 5,
  JUL: 6,
  AGO: 7,
  SET: 8,
  OUT: 9,
  NOV: 10,
  DEZ: 11
};

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const toIsoAtNoon = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).toISOString();

const isoDay = (value?: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : parsed.toISOString().slice(0, 10);
};

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const fullMonthNames: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11
};

const transactionFingerprint = (transaction: FinancialTransaction) =>
  [isoDay(transaction.date), normalizeText(transaction.merchant), Math.round(transaction.amount * 100)].join("|");

const isIgnoredReceipt = (merchant: string) => /pagamento recebido|cr[eé]dito de|estorno|iof de volta/i.test(merchant);

const isCardAdjustment = (merchant: string, amount: number) =>
  /pagamento|estorno|cr[eé]dito|iof de volta/i.test(merchant) && !isIgnoredReceipt(merchant) && amount < 0;

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

const parseDateFromFileName = (fileName: string) => {
  const match = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseIsoDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isFutureMonth = (date: Date, asOf = new Date()) =>
  date.getFullYear() > asOf.getFullYear() || (date.getFullYear() === asOf.getFullYear() && date.getMonth() > asOf.getMonth());

const resolveReferenceYear = (month: number, fallbackDate: Date | null) => {
  if (!fallbackDate) return new Date().getFullYear();
  return month > fallbackDate.getMonth() ? fallbackDate.getFullYear() - 1 : fallbackDate.getFullYear();
};

const parseBrMonthDate = (raw: string, dueDate: Date | null) => {
  const match = raw.trim().toUpperCase().match(/^(\d{1,2})\s+([A-ZÇ]{3})$/);
  if (!match || !dueDate) return null;

  const dayRaw = match[1];
  const monthRaw = match[2];
  if (!dayRaw || !monthRaw) return null;
  const month = monthNames[monthRaw];
  if (month === undefined) return null;

  const year = month > dueDate.getMonth() ? dueDate.getFullYear() - 1 : dueDate.getFullYear();
  return new Date(year, month, Number(dayRaw), 12);
};

const parsePdfDueDate = (text: string, fileName: string) => {
  const match = text.match(/Data de vencimento:\s*(\d{1,2})\s+([A-ZÇ]{3})\s+(\d{4})/i);
  if (!match) return parseDateFromFileName(fileName);

  const dayRaw = match[1];
  const monthRaw = match[2];
  const yearRaw = match[3];
  if (!dayRaw || !monthRaw || !yearRaw) return parseDateFromFileName(fileName);
  const month = monthNames[monthRaw.toUpperCase()];
  if (month === undefined) return parseDateFromFileName(fileName);

  const date = new Date(Number(yearRaw), month, Number(dayRaw), 12);
  return Number.isNaN(date.getTime()) ? parseDateFromFileName(fileName) : date;
};

const parsePdfInvoiceMonth = (text: string, fallbackDate: Date | null) => {
  const match = text.match(/fatura de\s+([a-zç]+)/i);
  if (!match?.[1]) return null;

  const month = fullMonthNames[normalizeText(match[1])];
  if (month === undefined) return null;

  const year = resolveReferenceYear(month, fallbackDate);
  const date = new Date(year, month, 1, 12);
  return Number.isNaN(date.getTime()) ? null : date;
};

const resolveReferenceDate = ({
  explicitReferenceDate,
  dueDate,
  periodEnd
}: {
  explicitReferenceDate?: Date | null;
  dueDate: Date | null;
  periodEnd?: string;
}) => {
  if (explicitReferenceDate) return explicitReferenceDate;

  const periodEndDate = parseIsoDate(periodEnd);
  if (dueDate && periodEndDate && isFutureMonth(dueDate) && monthKey(dueDate) !== monthKey(periodEndDate)) {
    return periodEndDate;
  }

  return dueDate ?? periodEndDate ?? new Date();
};

const shouldOmitFutureDueDate = (dueDate: Date | null, periodEnd?: string) => {
  const periodEndDate = parseIsoDate(periodEnd);
  return Boolean(dueDate && periodEndDate && isFutureMonth(dueDate) && monthKey(dueDate) !== monthKey(periodEndDate));
};

const createMetadata = ({
  source,
  sourceFile,
  referenceDate,
  dueDate,
  periodStart,
  periodEnd
}: {
  source: StatementSource;
  sourceFile: string;
  referenceDate?: Date | null;
  dueDate: Date | null;
  periodStart?: string;
  periodEnd?: string;
}): StatementMetadata => {
  const resolvedReferenceDate = resolveReferenceDate({
    explicitReferenceDate: referenceDate,
    dueDate,
    periodEnd
  });
  const referenceMonth = monthKey(resolvedReferenceDate);
  const resolvedDueDate = shouldOmitFutureDueDate(dueDate, periodEnd) ? null : dueDate;

  return {
    issuer: sourceFile.toLowerCase().includes("nubank") ? "nubank" : "unknown",
    source,
    sourceFile,
    referenceMonth,
    relativeMonth: statementRelativeMonth(referenceMonth),
    dueDate: resolvedDueDate ? toIsoAtNoon(resolvedDueDate) : undefined,
    periodStart,
    periodEnd,
    importedAt: new Date().toISOString()
  };
};

const pick = (record: CsvRecord, candidates: string[]) => {
  const entries = Object.entries(record);
  const normalized = entries.map(([key, value]) => [normalizeHeader(key), value] as const);

  for (const candidate of candidates) {
    const match = normalized.find(([key]) => key === normalizeHeader(candidate));
    if (match) return String(match[1] ?? "").trim();
  }

  return "";
};

const normalizeHeader = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const parseMoney = (raw: string | number | undefined) => {
  if (typeof raw === "number") return raw;
  if (!raw) return 0;

  const cleaned = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (raw: string) => {
  const value = raw.trim();
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (br) {
    const [, day, month, year] = br;
    const fullYear = String(year).length === 2 ? `20${year}` : year;
    return new Date(Number(fullYear), Number(month) - 1, Number(day)).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const parsePeriodFromCsvDates = (dates: string[]) => {
  const parsedDates = dates
    .map((date) => new Date(parseDate(date)))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    periodStart: parsedDates[0] ? toIsoAtNoon(parsedDates[0]) : undefined,
    periodEnd: parsedDates.at(-1) ? toIsoAtNoon(parsedDates.at(-1) as Date) : undefined
  };
};

const transactionId = (parts: string[]) =>
  `tx-${createHash("sha1")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 16)}`;

const createTransaction = (
  input: {
    date: string;
    merchant: string;
    description?: string;
    amount: number;
    source: StatementSource;
    sourceFile: string;
    index: number;
  },
  plan: FinancePlan,
  metadata: StatementMetadata
): FinancialTransaction | null => {
  if (isIgnoredReceipt(input.merchant)) return null;

  const cardAdjustment = isCardAdjustment(input.merchant, input.amount);
  let classification: ReturnType<typeof classifyTransaction>;
  let type: FinancialTransaction["type"];

  if (cardAdjustment) {
    classification = {
      audience: "personal",
      nature: "transfer",
      category: "other",
      confidence: 0.95,
      reviewed: false
    };
    type = "transfer";
  } else {
    classification = classifyTransaction(input, plan.classificationRules, plan.transactions);
    type = inferTransactionType(input.amount, classification.category, classification.nature);
  }

  const installment = parseInstallmentFromMerchant(input.merchant);

  return {
    id: transactionId([input.date, input.merchant, String(input.amount), input.sourceFile, String(input.index)]),
    date: input.date,
    merchant: input.merchant || "Lancamento sem descricao",
    description: input.description,
    amount: Math.abs(input.amount),
    type,
    audience: classification.audience,
    nature: classification.nature,
    category: classification.category,
    confidence: classification.confidence,
    source: input.source,
    sourceFile: input.sourceFile,
    statement: {
      issuer: metadata.issuer,
      referenceMonth: metadata.referenceMonth,
      relativeMonth: metadata.relativeMonth,
      dueDate: metadata.dueDate,
      periodStart: metadata.periodStart,
      periodEnd: metadata.periodEnd,
      importedAt: metadata.importedAt
    },
    ...(installment
      ? {
          installment: {
            current: installment.current,
            total: installment.total
          }
        }
      : {}),
    reviewed: classification.reviewed
  };
};

export const parseCsvStatement = (buffer: Buffer, fileName: string, plan: FinancePlan): ParsedStatement => {
  const content = buffer.toString("utf8");
  const firstLine = content.split(/\r?\n/)[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter,
    trim: true
  }) as CsvRecord[];

  const recordDates = records
    .map((record) => pick(record, ["date", "data", "data da compra", "data de lancamento", "data de lançamento"]))
    .filter(Boolean);
  const metadata = createMetadata({
    source: "csv",
    sourceFile: fileName,
    dueDate: parseDateFromFileName(fileName),
    ...parsePeriodFromCsvDates(recordDates)
  });

  const transactions = records
    .map((record, index) => {
      const date = pick(record, ["date", "data", "data da compra", "data de lancamento", "data de lançamento"]);
      const merchant = pick(record, ["title", "descricao", "descrição", "description", "estabelecimento", "merchant", "nome"]);
      const amount = parseMoney(pick(record, ["amount", "valor", "valor brl", "preco", "preço"]));

      if (!date || !merchant || amount === 0) return null;

      const transaction = createTransaction(
        {
          date: parseDate(date),
          merchant,
          description: merchant,
          amount,
          source: "csv",
          sourceFile: fileName,
          index
        },
        plan,
        metadata
      );
      return transaction;
    })
    .filter((transaction): transaction is FinancialTransaction => Boolean(transaction));

  return { metadata, transactions };
};

const cleanPdfMerchant = (value: string) =>
  value
    .replace(/^••••\s*\d{4}/, "")
    .replace(/\s+/g, " ")
    .trim();

const isPdfNoiseLine = (line: string) =>
  /^(TRANSAÇÕES|DE \d{2} [A-ZÇ]{3} A \d{2} [A-ZÇ]{3}|TAINÁ|TAINA|FATURA|EMISSÃO|EMISSAO|\d+ de \d+|USD |BRL |Conversão|Conversao|Em cumprimento|Como assegurado|login com|Nu Pagamentos|CNPJ|SAC|Ouvidoria|As informações|informações atualizadas|análises)/i.test(line);

export const parsePdfStatement = async (buffer: Buffer, fileName: string, plan: FinancePlan): Promise<ParsedStatement> => {
  const parsed = await pdfParse(buffer);
  const dueDate = parsePdfDueDate(parsed.text, fileName);
  const invoiceMonth = parsePdfInvoiceMonth(parsed.text, dueDate);
  const periodMatch = parsed.text.match(/Período vigente:\s*(\d{2}\s+[A-ZÇ]{3})\s+a\s+(\d{2}\s+[A-ZÇ]{3})/i);
  const metadata = createMetadata({
    source: "pdf",
    sourceFile: fileName,
    referenceDate: invoiceMonth,
    dueDate,
    periodStart: periodMatch?.[1] ? toIsoAtNoon(parseBrMonthDate(periodMatch[1], dueDate) ?? dueDate ?? new Date()) : undefined,
    periodEnd: periodMatch?.[2] ? toIsoAtNoon(parseBrMonthDate(periodMatch[2], dueDate) ?? dueDate ?? new Date()) : undefined
  });
  const lines = parsed.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const transactions: FinancialTransaction[] = [];
  let currentDate = "";
  let pendingMerchant = "";
  let inTransactions = false;

  lines.forEach((line, index) => {
    if (line === "TRANSAÇÕES") {
      inTransactions = true;
      return;
    }

    if (!inTransactions) return;
    if (/^(Pagamentos|Pagamentos e Financiamentos)/i.test(line)) {
      inTransactions = false;
      return;
    }

    const date = parseBrMonthDate(line, dueDate);
    if (date) {
      currentDate = toIsoAtNoon(date);
      pendingMerchant = "";
      return;
    }

    if (!currentDate || isPdfNoiseLine(line)) return;

    const amountMatch = line.match(/(−|-)?\s*R\$\s*([\d.]+,\d{2})$/);
    if (!amountMatch) {
      if (!pendingMerchant) pendingMerchant = cleanPdfMerchant(line);
      return;
    }

    const amountText = `${amountMatch[1] ? "-" : ""}${amountMatch[2]}`;
    const merchant = cleanPdfMerchant(line.slice(0, amountMatch.index).trim() || pendingMerchant);
    pendingMerchant = "";

    if (!merchant || merchant.toLowerCase().includes("zalourensi")) return;

    const transaction = createTransaction(
      {
        date: currentDate,
        merchant,
        description: line,
        amount: parseMoney(amountText),
        source: "pdf",
        sourceFile: fileName,
        index
      },
      plan,
      metadata
    );
    if (transaction) transactions.push(transaction);
  });

  return { metadata, transactions };
};

export const dedupeTransactions = (existing: FinancialTransaction[], imported: FinancialTransaction[]) => {
  const actualExisting = existing.filter((transaction) => !isInstallmentForecast(transaction));
  const ids = new Set(actualExisting.map((transaction) => transaction.id));
  const fingerprints = new Set(actualExisting.map(transactionFingerprint));
  const installmentKeys = new Set(actualExisting.map(installmentOccurrenceKey).filter(Boolean));

  return imported.filter((transaction) => {
    const installmentKey = installmentOccurrenceKey(transaction);
    return !ids.has(transaction.id) && !fingerprints.has(transactionFingerprint(transaction)) && (!installmentKey || !installmentKeys.has(installmentKey));
  });
};

const statementMetadataMatches = (
  existing: NonNullable<FinancialTransaction["statement"]> | undefined,
  metadata: StatementMetadata
) => {
  if (!existing) return false;
  if (existing.issuer !== metadata.issuer) return false;
  if (existing.referenceMonth !== metadata.referenceMonth) return false;

  const sameDueDate = Boolean(existing.dueDate && metadata.dueDate && isoDay(existing.dueDate) === isoDay(metadata.dueDate));
  const samePeriod = Boolean(
    existing.periodStart &&
      metadata.periodStart &&
      existing.periodEnd &&
      metadata.periodEnd &&
      isoDay(existing.periodStart) === isoDay(metadata.periodStart) &&
      isoDay(existing.periodEnd) === isoDay(metadata.periodEnd)
  );
  const noDetailedDates = !existing.dueDate && !metadata.dueDate && !existing.periodStart && !metadata.periodStart && !existing.periodEnd && !metadata.periodEnd;

  return sameDueDate || samePeriod || noDetailedDates;
};

const duplicateMatchFromTransaction = (
  transaction: FinancialTransaction,
  reason: DuplicateStatementMatch["reason"],
  matchedTransactions: number
): DuplicateStatementMatch => ({
  reason,
  sourceFile: transaction.sourceFile,
  referenceMonth: transaction.statement?.referenceMonth,
  dueDate: transaction.statement?.dueDate,
  periodStart: transaction.statement?.periodStart,
  periodEnd: transaction.statement?.periodEnd,
  importedAt: transaction.statement?.importedAt,
  matchedTransactions
});

export const findDuplicateStatementImport = (
  existing: FinancialTransaction[],
  parsedStatement: ParsedStatement
): DuplicateStatementMatch | null => {
  const importedTransactions = parsedStatement.transactions;
  if (importedTransactions.length === 0) return null;

  const metadataMatch = existing.find((transaction) => statementMetadataMatches(transaction.statement, parsedStatement.metadata));
  if (metadataMatch) return duplicateMatchFromTransaction(metadataMatch, "metadata", importedTransactions.length);

  const normalizedSourceFile = normalizeText(parsedStatement.metadata.sourceFile);
  const fileMatch = existing.find(
    (transaction) =>
      transaction.sourceFile &&
      normalizeText(transaction.sourceFile) === normalizedSourceFile &&
      transaction.statement?.referenceMonth === parsedStatement.metadata.referenceMonth
  );
  if (fileMatch) return duplicateMatchFromTransaction(fileMatch, "file", importedTransactions.length);

  const existingImportedFingerprints = new Set(
    existing
      .filter((transaction) => transaction.source !== "manual" && !isInstallmentForecast(transaction) && (transaction.statement || transaction.sourceFile))
      .map(transactionFingerprint)
  );
  const importedFingerprints = [...new Set(importedTransactions.map(transactionFingerprint))];
  const matchedTransactions = importedFingerprints.filter((fingerprint) => existingImportedFingerprints.has(fingerprint)).length;

  return matchedTransactions === importedFingerprints.length
    ? {
        reason: "content",
        sourceFile: parsedStatement.metadata.sourceFile,
        referenceMonth: parsedStatement.metadata.referenceMonth,
        dueDate: parsedStatement.metadata.dueDate,
        periodStart: parsedStatement.metadata.periodStart,
        periodEnd: parsedStatement.metadata.periodEnd,
        importedAt: parsedStatement.metadata.importedAt,
        matchedTransactions
      }
    : null;
};
