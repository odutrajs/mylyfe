import type {
  AssetCategory,
  DebtType,
  BuiltInExpenseCategory,
  Frequency,
  IncomeType,
  Liquidity,
  MaritalStatus,
  RiskProfileName,
  TransactionAudience,
  TransactionNature
} from "@mylyfe/domain";

export const apiUrl = (import.meta.env.VITE_API_URL ?? "https://feedeo.com.br/api").replace(/\/$/, "");
export const planId = "primary";
export const authTokenStorageKey = "mylyfe-auth-token";

export const readAuthToken = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(authTokenStorageKey) ?? "";
};

export const writeAuthToken = (token: string) => {
  localStorage.setItem(authTokenStorageKey, token);
};

export const clearAuthToken = () => {
  localStorage.removeItem(authTokenStorageKey);
};

export const apiRequest = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  const token = readAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${apiUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers
  });
};

export const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});

export const preciseCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2
});

export const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1
});

export const number = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1
});

export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export const emptyToZero = (value: string) => {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatMoneyDisplay = (value: number) => (value ? preciseCurrency.format(value) : "");

export const parseMoneyInput = (raw: string) => {
  const sanitized = raw.replace(/[^\d,]/g, "");
  if (!sanitized) return { display: "", value: 0 };

  const commaIndex = sanitized.indexOf(",");
  const hasComma = commaIndex !== -1;
  const integerDigits = (hasComma ? sanitized.slice(0, commaIndex) : sanitized).replace(/\D/g, "");
  const decimalDigits = hasComma ? sanitized.slice(commaIndex + 1).replace(/\D/g, "").slice(0, 2) : "";

  if (!integerDigits && !hasComma) return { display: "", value: 0 };

  const integerNumber = integerDigits ? Number(integerDigits) : 0;
  const value = decimalDigits ? Number.parseFloat(`${integerNumber}.${decimalDigits}`) : integerNumber;
  const formattedInteger = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(integerNumber);
  const display = hasComma ? `R$ ${formattedInteger},${decimalDigits}` : `R$ ${formattedInteger}`;

  return { display, value };
};

export const labels = {
  maritalStatus: {
    single: "Solteiro(a)",
    married: "Casado(a)",
    stable_union: "Uniao estavel",
    divorced: "Divorciado(a)",
    widowed: "Viuvo(a)",
    other: "Outro"
  } satisfies Record<MaritalStatus, string>,
  frequency: {
    monthly: "Mensal",
    weekly: "Semanal",
    biweekly: "Quinzenal",
    quarterly: "Trimestral",
    annual: "Anual",
    single: "Unico"
  } satisfies Record<Frequency, string>,
  incomeType: {
    clt: "CLT",
    pj: "PJ",
    freelance: "Freelance",
    company: "Empresa",
    rent: "Aluguel",
    dividends: "Dividendos",
    pension: "Pensao",
    other: "Outros"
  } satisfies Record<IncomeType, string>,
  assetCategory: {
    cash: "Caixa",
    checking: "Conta corrente",
    emergencyReserve: "Reserva",
    cdb: "CDB",
    treasury: "Tesouro",
    fixedIncome: "Renda fixa",
    stocks: "Acoes",
    etfs: "ETFs",
    funds: "Fundos",
    internationalInvestments: "Internacional",
    crypto: "Cripto",
    privatePension: "Previdencia",
    fgts: "FGTS",
    realEstate: "Imoveis",
    vehicles: "Veiculos",
    companies: "Empresas",
    other: "Outros"
  } satisfies Record<AssetCategory, string>,
  liquidity: {
    immediate: "Imediata",
    short: "Curta",
    medium: "Media",
    long: "Longa",
    illiquid: "Iliquido"
  } satisfies Record<Liquidity, string>,
  debtType: {
    financing: "Financiamento",
    loan: "Emprestimo",
    installment: "Parcelamento",
    family: "Divida familiar",
    mortgage: "Imobiliario",
    vehicle: "Veiculo",
    card: "Cartao",
    other: "Outros"
  } satisfies Record<DebtType, string>,
  audience: {
    personal: "Pessoal",
    business: "Empresa",
    thirdParty: "Terceiros",
    reimbursable: "Reembolsavel"
  } satisfies Record<TransactionAudience, string>,
  nature: {
    essential: "Essencial",
    recurring: "Recorrente",
    variable: "Variavel",
    extraordinary: "Extraordinario",
    business: "Empresarial",
    thirdParty: "Terceiros",
    investment: "Investimento",
    debtPayment: "Pagamento/parcelamento",
    transfer: "Transferencia",
    other: "Outros"
  } satisfies Record<TransactionNature, string>,
  category: {
    housing: "Moradia",
    food: "Alimentacao",
    transport: "Transporte",
    health: "Saude",
    travel: "Viagens",
    shopping: "Compras e Lazer",
    subscriptions: "Assinaturas",
    education: "Educacao",
    company: "Empresa",
    thirdParty: "Terceiros",
    taxes: "Impostos",
    investments: "Investimentos",
    debt: "Parcelas e credito",
    other: "Outros"
  } satisfies Record<BuiltInExpenseCategory, string>,
  risk: {
    conservative: "Conservador",
    balanced: "Equilibrado",
    growth: "Crescimento",
    aggressive: "Agressivo",
    undefined: "A definir"
  } satisfies Record<RiskProfileName, string>
};

export const monthsLabel = (months: number | null) => {
  if (months === null) return "Sem prazo estimado";
  if (months <= 0) return "Alcancada";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} mes${rest === 1 ? "" : "es"}`;
  if (rest === 0) return `${years} ano${years === 1 ? "" : "s"}`;
  return `${years} ano${years === 1 ? "" : "s"} e ${rest} mes${rest === 1 ? "" : "es"}`;
};

export const toDateInput = (iso?: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};
