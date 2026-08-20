import type {
  ClassificationRule,
  ExpenseCategory,
  FinancialTransaction,
  TransactionAudience,
  TransactionNature,
  TransactionType
} from "./types.js";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export interface ClassificationInput {
  merchant: string;
  description?: string;
  amount: number;
  date: string;
}

export interface ClassificationResult {
  audience: TransactionAudience;
  nature: TransactionNature;
  category: ExpenseCategory;
  confidence: number;
  reviewed: boolean;
}

export const classifyTransaction = (
  input: ClassificationInput,
  rules: ClassificationRule[],
  history: FinancialTransaction[]
): ClassificationResult => {
  const merchant = normalize(input.merchant);
  const description = normalize(input.description ?? "");
  const matchingRule = rules
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .find((rule) => {
      const merchantMatches = merchant.includes(normalize(rule.merchantPattern));
      const descriptionMatches = rule.descriptionPattern ? description.includes(normalize(rule.descriptionPattern)) : true;
      return merchantMatches && descriptionMatches;
    });

  if (matchingRule) {
    return {
      audience: matchingRule.audience,
      nature: matchingRule.nature,
      category: matchingRule.category,
      confidence: matchingRule.confidence,
      reviewed: false
    };
  }

  const merchantHistory = history.filter((transaction) => normalize(transaction.merchant) === merchant && transaction.reviewed);
  if (merchantHistory.length > 0) {
    const latest = merchantHistory[merchantHistory.length - 1];
    if (latest) {
      return {
        audience: latest.audience,
        nature: latest.nature,
        category: latest.category,
        confidence: 0.8,
        reviewed: false
      };
    }
  }

  return {
    audience: "personal",
    nature: "variable",
    category: "other",
    confidence: 0.35,
    reviewed: false
  };
};

export const createRuleFromCorrection = (
  transaction: FinancialTransaction,
  correction: Pick<FinancialTransaction, "audience" | "nature" | "category">,
  now = new Date()
): ClassificationRule => ({
  id: `rule-${transaction.id}`,
  merchantPattern: transaction.merchant,
  audience: correction.audience,
  nature: correction.nature,
  category: correction.category,
  confidence: 0.98,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
});

export const inferTransactionType = (amount: number, category: ExpenseCategory, nature: TransactionNature): TransactionType => {
  if (nature === "investment" || category === "investments") return "investment";
  if (nature === "debtPayment" || category === "debt") return "debt_payment";
  if (nature === "transfer") return "transfer";
  return amount < 0 ? "income" : "expense";
};
