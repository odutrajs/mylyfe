import { describe, expect, it } from "vitest";
import {
  applyInbox,
  applyReplyToAlert,
  buildCycle,
  completeAlertOccurrence,
  completePlanAlertOccurrence,
  createEmptyPlan,
  createLifeAlert,
  isAgendaLinkedAlert,
  relatedSecretaryAlertIds,
  defaultSecretaryModuleState,
  defaultSecretarySettings,
  extractVerificationCode,
  inQuietHours,
  isValidWhatsappPhone,
  nextOccurrence,
  normalizePhone,
  parseReply,
  phonesMatch,
  pickSecretaryModuleState,
  tickAlert,
  zonedDate
} from "../src/index.js";

const zone = "America/Sao_Paulo";
const settings = defaultSecretarySettings();

describe("phone normalization", () => {
  it("adds Brazil country code to local mobiles", () => {
    expect(normalizePhone("11 99999-1234")).toBe("5511999991234");
    expect(normalizePhone("+55 (11) 99999-1234")).toBe("5511999991234");
    expect(phonesMatch("11999991234", "55 11 99999-1234")).toBe(true);
    expect(isValidWhatsappPhone("41 98415-276")).toBe(true);
    expect(isValidWhatsappPhone("123")).toBe(false);
    expect(extractVerificationCode("meu codigo e 123456")).toBe("123456");
    expect(extractVerificationCode("oi")).toBe("");
  });
});

describe("reply parsing", () => {
  it("recognizes paid answers in Portuguese", () => {
    expect(parseReply("Sim, já paguei").intent).toBe("paid");
    expect(parseReply("fui").intent).toBe("paid");
    expect(parseReply("tomei").intent).toBe("paid");
    expect(parseReply("paguei 129,90").amount).toBe(129.9);
    expect(parseReply("recebi").intent).toBe("paid");
  });

  it("recognizes not paid, snooze and skip", () => {
    expect(parseReply("ainda não").intent).toBe("not_paid");
    expect(parseReply("me lembra amanhã").intent).toBe("snooze");
    expect(parseReply("me lembra amanhã").snoozeHours).toBe(24);
    expect(parseReply("semana que vem").snoozeHours).toBe(168);
    expect(parseReply("pula esse").intent).toBe("skip");
  });

  it("asks again when the reply is unclear", () => {
    expect(parseReply("quanto e mesmo?").intent).toBe("unknown");
  });
});

describe("scheduling", () => {
  it("schedules a daily habit for the next preferred hour", () => {
    const from = zonedDate(zone, 2026, 8, 18, 10);
    const due = nextOccurrence({ frequency: "daily", preferredHour: 8 }, from, zone);
    expect(due.toISOString().startsWith("2026-08-19")).toBe(true);
  });

  it("schedules the next monthly due day after the current one", () => {
    const from = zonedDate(zone, 2026, 8, 18, 10);
    const due = nextOccurrence({ frequency: "monthly", dueDay: 10, preferredHour: 9 }, from, zone);
    const remind = buildCycle({ frequency: "monthly", dueDay: 10, remindDaysBefore: 2, confirmAfterHours: 8, preferredHour: 9 }, from, zone);
    expect(due.toISOString().startsWith("2026-09-10")).toBe(true);
    expect(remind.dueAt.startsWith("2026-09-10")).toBe(true);
    expect(remind.remindAt.startsWith("2026-09-08")).toBe(true);
  });
});

describe("alert tick and conversation", () => {
  it("reminds first and later asks if it was paid", () => {
    const created = zonedDate(zone, 2026, 8, 8, 9);
    const alert = createLifeAlert(
      {
        id: "internet",
        title: "Internet",
        kind: "bill",
        amount: 129.9,
        dueDay: 10,
        remindDaysBefore: 2,
        confirmAfterHours: 8,
        preferredHour: 9
      },
      created,
      zone
    );

    const reminded = tickAlert(alert, zonedDate(zone, 2026, 8, 8, 9, 5), settings, "Thiago");
    expect(reminded.jobs[0]?.kind).toBe("remind");
    expect(reminded.alert.cycle.status).toBe("reminded");
    expect(reminded.jobs[0]?.text).toContain("Internet");

    const asked = tickAlert(reminded.alert, zonedDate(zone, 2026, 8, 10, 18), settings, "Thiago");
    expect(asked.jobs[0]?.kind).toBe("confirm");
    expect(asked.alert.cycle.status).toBe("awaiting_confirmation");
  });

  it("reschedules when the user says it was not paid", () => {
    const now = zonedDate(zone, 2026, 8, 10, 18);
    const alert = createLifeAlert({ id: "iptu", title: "IPTU", kind: "tax", dueDay: 10 }, zonedDate(zone, 2026, 8, 8, 9), zone);
    alert.cycle.status = "awaiting_confirmation";

    const result = applyReplyToAlert(alert, "ainda nao", now, settings, "Thiago");
    expect(result.alert.cycle.status).toBe("snoozed");
    expect(result.reply).toMatch(/lembro/i);
    expect(result.alert.cycle.snoozeUntil).toBeTruthy();
  });

  it("treats appointment slots as one reminder family", () => {
    const now = zonedDate(zone, 2026, 8, 20, 10);
    const dueAt = zonedDate(zone, 2026, 8, 21, 14).toISOString();
    const vespera = createLifeAlert(
      { id: "alert-appt-1", title: "Dentista", kind: "one_off", frequency: "once", dueDate: "2026-08-21", notes: "slot:vespera" },
      now,
      zone
    );
    const threeHours = createLifeAlert(
      { id: "alert-appt-1-3h", title: "Dentista", kind: "one_off", frequency: "once", dueDate: "2026-08-21", notes: "slot:3h" },
      now,
      zone
    );
    const vesperaDue = { ...vespera, cycle: { ...vespera.cycle, dueAt } };
    const threeHoursDue = { ...threeHours, cycle: { ...threeHours.cycle, dueAt } };
    expect(isAgendaLinkedAlert(vesperaDue)).toBe(true);
    expect(relatedSecretaryAlertIds([vesperaDue, threeHoursDue], vesperaDue.id).sort()).toEqual([
      "alert-appt-1",
      "alert-appt-1-3h"
    ]);

    const plan = completePlanAlertOccurrence(
      {
        ...createEmptyPlan("test"),
        secretary: {
          ...defaultSecretaryModuleState(),
          alerts: [vesperaDue, threeHoursDue]
        }
      },
      vesperaDue.id,
      now
    );
    expect(plan.secretary.alerts.every((alert) => alert.status === "completed")).toBe(true);
  });

  it("completes a one-off reminder and advances a daily one", () => {
    const now = zonedDate(zone, 2026, 8, 18, 10);
    const once = createLifeAlert({ title: "Mercado", kind: "one_off", frequency: "once", dueDate: "2026-08-18" }, now, zone);
    expect(completeAlertOccurrence(once, now, zone).status).toBe("completed");

    const daily = createLifeAlert({ title: "Remedio", kind: "habit", frequency: "daily", preferredHour: 8 }, zonedDate(zone, 2026, 8, 18, 7), zone);
    const next = completeAlertOccurrence(daily, now, zone);
    expect(next.status).toBe("active");
    expect(next.cycle.status).toBe("scheduled");
    expect(next.cycle.dueAt.startsWith("2026-08-19")).toBe(true);
  });

  it("marks as paid and opens the next monthly cycle", () => {
    const now = zonedDate(zone, 2026, 8, 10, 19);
    const alert = createLifeAlert({ id: "luz", title: "Conta de luz", kind: "bill", dueDay: 10 }, zonedDate(zone, 2026, 8, 8, 9), zone);
    alert.cycle.status = "awaiting_confirmation";

    const result = applyReplyToAlert(alert, "sim, paguei", now, settings, "Thiago");
    expect(result.reply).toMatch(/Marquei \*?Conta de luz\*?/);
    expect(result.alert.status).toBe("active");
    expect(result.alert.cycle.status).toBe("scheduled");
    expect(result.alert.cycle.dueAt.startsWith("2026-09-10")).toBe(true);
  });

  it("does not send during quiet hours", () => {
    const alert = createLifeAlert({ id: "net", title: "Internet", dueDay: 10 }, zonedDate(zone, 2026, 8, 8, 9), zone);
    const late = zonedDate(zone, 2026, 8, 8, 23);
    expect(inQuietHours(late, settings)).toBe(true);
    expect(tickAlert(alert, late, settings).jobs).toHaveLength(0);
  });

  it("matches an incoming reply to the waiting alert", () => {
    const internet = createLifeAlert({ id: "net", title: "Internet", dueDay: 21 }, zonedDate(zone, 2026, 8, 18, 9), zone);
    const tax = createLifeAlert({ id: "ir", title: "Imposto de renda", kind: "tax", dueDay: 10 }, zonedDate(zone, 2026, 8, 1, 9), zone);
    internet.cycle.status = "awaiting_confirmation";
    internet.cycle.lastOutboundAt = zonedDate(zone, 2026, 8, 18, 18).toISOString();

    const inbox = applyInbox([internet, tax], "sim", zonedDate(zone, 2026, 8, 18, 19), settings, "Thiago");
    expect(inbox.matchedAlertId).toBe("net");
    expect(inbox.alerts.find((item) => item.id === "net")?.cycle.status).toBe("scheduled");
  });
});

describe("secretary persistence merge", () => {
  it("keeps the stored secretary when the incoming payload omits it", () => {
    const existing = {
      ...defaultSecretaryModuleState(),
      updatedAt: "2026-08-18T20:00:00.000Z",
      alerts: [createLifeAlert({ id: "net", title: "Internet", dueDay: 10 }, zonedDate(zone, 2026, 8, 1, 9), zone)]
    };

    expect(pickSecretaryModuleState(undefined, existing).alerts[0]?.title).toBe("Internet");
  });

  it("prefers the newer secretary snapshot", () => {
    const older = { ...defaultSecretaryModuleState(), updatedAt: "2026-08-18T10:00:00.000Z", settings: { ...settings, enabled: false } };
    const newer = { ...defaultSecretaryModuleState(), updatedAt: "2026-08-18T12:00:00.000Z", settings: { ...settings, enabled: true } };
    expect(pickSecretaryModuleState(older, newer).settings.enabled).toBe(true);
    expect(pickSecretaryModuleState(newer, older).settings.enabled).toBe(true);
  });
});
