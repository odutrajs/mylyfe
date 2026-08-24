import type { CategoryBudgetProgress, LifeAlert } from "@mylyfe/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  categoryStatusCopy,
  firstName,
  formatWhatsappDisplay,
  frequencyLabel,
  initialsFrom,
  maskWhatsapp,
  monthShort,
  monthTitle,
  parseMoney,
  reminderWhen,
  shortDate,
  todayKey
} from "./format.js";

describe("firstName", () => {
  it("returns the first name or a friendly fallback", () => {
    expect(firstName("Ana Paula Silva")).toBe("Ana");
    expect(firstName("")).toBe("por ai");
  });
});

describe("initialsFrom", () => {
  it("builds initials from one or more names", () => {
    expect(initialsFrom("Ana Paula Silva")).toBe("AS");
    expect(initialsFrom("Ana")).toBe("AN");
    expect(initialsFrom("")).toBe("?");
  });
});

describe("maskWhatsapp", () => {
  it("masks partial and full phone numbers", () => {
    expect(maskWhatsapp("41")).toBe("41");
    expect(maskWhatsapp("41999")).toBe("41 999");
    expect(maskWhatsapp("4199990000")).toBe("41 9999-0000");
    expect(maskWhatsapp("5541999990000")).toBe("41 99999-0000");
  });
});

describe("formatWhatsappDisplay", () => {
  it("formats stored phone numbers for display", () => {
    expect(formatWhatsappDisplay("5541999990000")).toBe("41 99999-0000");
    expect(formatWhatsappDisplay("4199990000")).toBe("41 9999-0000");
    expect(formatWhatsappDisplay("")).toBe("");
  });
});

describe("parseMoney", () => {
  it("parses Brazilian currency strings", () => {
    expect(parseMoney("12,50")).toBe(12.5);
    expect(parseMoney("R$ 1.234,56")).toBe(1234.56);
    expect(parseMoney("invalid")).toBe(0);
  });
});

describe("todayKey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the current date as YYYY-MM-DD", () => {
    expect(todayKey()).toBe("2026-08-23");
  });
});

describe("shortDate", () => {
  it("formats ISO dates as DD/MM/YYYY", () => {
    expect(shortDate("2026-07-10T12:00:00.000Z")).toBe("10/07/2026");
    expect(shortDate("")).toBe("");
  });
});

describe("monthTitle", () => {
  it("formats month keys as long Portuguese labels", () => {
    expect(monthTitle("2026-07")).toMatch(/julho de 2026/i);
  });
});

describe("monthShort", () => {
  it("formats month keys as short labels", () => {
    expect(monthShort("2026-07")).toBe("JUL 26");
  });
});

describe("categoryStatusCopy", () => {
  const baseItem = (overrides: Partial<CategoryBudgetProgress>): CategoryBudgetProgress => ({
    category: "food",
    name: "Alimentacao",
    color: "#000000",
    spent: 0,
    limit: 1000,
    remaining: 500,
    usedPercent: 50,
    share: 1,
    status: "comfortable",
    source: "budget",
    ...overrides
  });

  it("describes over-budget and remaining amounts", () => {
    expect(categoryStatusCopy(baseItem({ status: "over", remaining: -120 }))).toContain("acima do orcamento");
    expect(categoryStatusCopy(baseItem({ remaining: 50, limit: 1000 }))).toContain("restando");
    expect(categoryStatusCopy(baseItem({ remaining: 500 }))).toContain("disponivel");
    expect(categoryStatusCopy(baseItem({ remaining: null, spent: 0 }))).toBe("Sem gastos neste mes");
  });
});

describe("reminderWhen", () => {
  const baseAlert = (overrides: Partial<LifeAlert>): LifeAlert => ({
    id: "alert-1",
    title: "Lembrete",
    kind: "bill",
    frequency: "monthly",
    remindDaysBefore: 1,
    askIfPaid: false,
    confirmAfterHours: 24,
    snoozeHours: 24,
    preferredHour: 9,
    ...overrides
  });

  it("formats one-time, recurring, and weekday reminders", () => {
    expect(reminderWhen(baseAlert({ frequency: "once", dueDate: "2026-08-10" }))).toBe("10/08/2026");
    expect(reminderWhen(baseAlert({ frequency: "daily" }))).toBe("Todo dia");
    expect(reminderWhen(baseAlert({ frequency: "weekly", weekday: 1 }))).toContain("Semanal");
    expect(reminderWhen(baseAlert({ frequency: "monthly", dueDay: 10 }))).toBe("Todo dia 10");
  });
});

describe("frequencyLabel", () => {
  it("maps alert frequencies to Portuguese labels", () => {
    expect(frequencyLabel.once).toBe("Uma vez");
    expect(frequencyLabel.monthly).toBe("Mensal");
    expect(frequencyLabel.annual).toBe("Anual");
  });
});
