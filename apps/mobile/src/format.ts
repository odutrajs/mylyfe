import type { AlertFrequency, CategoryBudgetProgress, ExpenseCategory, LifeAlert } from "@mylyfe/domain";

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

export const firstName = (name?: string) => {
  const value = name?.trim() ?? "";
  return value.split(/\s+/)[0] || "por ai";
};

export const monthTitle = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year ?? 1970, (monthNumber ?? 1) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
};

export const shortDate = (value?: string) => {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};

export const monthShort = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year ?? 1970, (monthNumber ?? 1) - 1, 1);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
  return `${label.slice(0, 3).toUpperCase()} ${String(year ?? "").slice(2)}`;
};

export const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

export const categoryStatusCopy = (item: CategoryBudgetProgress) => {
  if (item.status === "over" && item.remaining !== null) {
    return `${preciseCurrency.format(Math.abs(item.remaining))} acima do orcamento`;
  }
  if (item.remaining !== null && item.remaining <= 80 && item.limit > 0) {
    return `Apenas ${preciseCurrency.format(item.remaining)} restando`;
  }
  if (item.remaining !== null && item.remaining > 0) {
    return `${preciseCurrency.format(item.remaining)} disponivel`;
  }
  return item.spent > 0 ? `${preciseCurrency.format(item.spent)} gastos` : "Sem gastos neste mes";
};

export const categoryLabel = (id: ExpenseCategory, name?: string) => name || String(id);

export const frequencyLabel: Record<AlertFrequency, string> = {
  once: "Uma vez",
  daily: "Todo dia",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  annual: "Anual"
};

export const reminderWhen = (alert: LifeAlert) => {
  if (alert.frequency === "once" && alert.dueDate) {
    const [year, month, day] = alert.dueDate.split("-");
    return `${day}/${month}/${year}`;
  }
  if (alert.frequency === "daily") return "Todo dia";
  if ((alert.frequency === "weekly" || alert.frequency === "biweekly") && alert.weekday !== undefined) {
    return `${frequencyLabel[alert.frequency]} • ${weekdayLabels[(alert.weekday + 6) % 7]}`;
  }
  if (alert.dueDay) return `Todo dia ${alert.dueDay}`;
  if (alert.dueDate) {
    const [, , day] = alert.dueDate.split("-");
    return day ? `Todo dia ${Number(day)}` : frequencyLabel[alert.frequency];
  }
  return frequencyLabel[alert.frequency];
};

export const maskWhatsapp = (raw: string) => {
  const digits = raw.replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  if (digits.length <= 10) return `${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const formatWhatsappDisplay = (phone?: string) => {
  const digits = (phone ?? "").replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) return `${local.slice(0, 2)} ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `${local.slice(0, 2)} ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone?.trim() || "";
};

export const parseMoney = (raw: string) => {
  const normalized = raw.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
