import { describe, expect, it } from "vitest";
import {
  applySecretaryInboxToPlan,
  createEmptyPlan,
  createLifeAlert,
  interpretSecretaryMessage,
  mergeRoutineLocalEvents
} from "../src/index.js";

const zone = "America/Sao_Paulo";
const morning = new Date("2026-08-20T13:37:00.000Z");

describe("secretary intent json", () => {
  it("turns a spoken interview into a routine event, not a bill reply", () => {
    const intents = interpretSecretaryMessage("Reunião entrevista às 16:30", morning, zone);
    expect(intents[0]).toMatchObject({ type: "book_event", title: "Entrevista", time: "16:30" });

    const das = createLifeAlert({ id: "alert-das", title: "Pagar Parcelamento do DAS", kind: "bill", dueDay: 25 }, morning, zone);
    const waiting = {
      ...createEmptyPlan("test"),
      secretary: {
        ...createEmptyPlan("test").secretary,
        alerts: [{ ...das, cycle: { ...das.cycle, status: "awaiting_confirmation" as const } }]
      }
    };
    const inbox = applySecretaryInboxToPlan(waiting, "Reunião entrevista às 16:30", morning, "Thiago");
    expect(inbox.plan.routine.localEvents[0]?.title).toBe("Entrevista");
    expect(inbox.plan.secretary.alerts.find((alert) => alert.id === "alert-das")?.cycle.status).toBe("awaiting_confirmation");
  });

  it("registers an iFood expense from natural language", () => {
    const intents = interpretSecretaryMessage("comprei ifood 77,90", morning, zone);
    expect(intents[0]).toMatchObject({ type: "add_expense", merchant: "iFood", amount: 77.9, category: "food", date: "2026-08-20" });

    const inbox = applySecretaryInboxToPlan(createEmptyPlan("test"), "comprei ifood 77,90", morning, "Thiago");
    expect(inbox.reply).toMatch(/iFood/i);
    expect(inbox.reply).toMatch(/20\/08/);
    expect(inbox.plan.transactions[0]?.amount).toBe(77.9);
    expect(inbox.plan.transactions[0]?.category).toBe("food");
    expect(inbox.plan.transactions[0]?.type).toBe("expense");
    expect(inbox.plan.transactions[0]?.date.startsWith("2026-08-20")).toBe(true);
  });

  it("saves yesterday when the user says ontem", () => {
    const inbox = applySecretaryInboxToPlan(createEmptyPlan("test"), "ontem comprei ifood 62,30", morning, "Thiago");
    expect(inbox.plan.transactions[0]?.date.startsWith("2026-08-19")).toBe(true);
    expect(inbox.plan.transactions[0]?.merchant).toBe("iFood");
    expect(inbox.reply).toMatch(/19\/08/);
  });

  it("saves an explicit day when the user says 18/08", () => {
    const inbox = applySecretaryInboxToPlan(createEmptyPlan("test"), "comprei no mercado 120 no dia 18/08", morning, "Thiago");
    expect(inbox.plan.transactions[0]?.date.startsWith("2026-08-18")).toBe(true);
    expect(inbox.reply).toMatch(/18\/08/);
  });

  it("registers a monthly recurring expense instead of a one-off", () => {
    const inbox = applySecretaryInboxToPlan(createEmptyPlan("test"), "todo mês pago netflix 55,90", morning, "Thiago");
    expect(inbox.plan.transactions).toHaveLength(0);
    expect(inbox.plan.recurringTransactions[0]).toMatchObject({
      name: "Netflix",
      amount: 55.9,
      category: "subscriptions",
      frequency: "monthly"
    });
    expect(inbox.plan.recurringTransactions[0]?.startDate.startsWith("2026-08-20")).toBe(true);
    expect(inbox.reply).toMatch(/recorrente todo mes/i);
  });

  it("does not confuse internet 99,90 with the 99 app", () => {
    const inbox = applySecretaryInboxToPlan(createEmptyPlan("test"), "todo mês pago internet 99,90", morning, "Thiago");
    expect(inbox.plan.recurringTransactions[0]).toMatchObject({
      name: "Internet",
      amount: 99.9,
      category: "subscriptions",
      frequency: "monthly"
    });
  });

  it("registers a weekly recurring expense", () => {
    const inbox = applySecretaryInboxToPlan(createEmptyPlan("test"), "toda semana ifood 80", morning, "Thiago");
    expect(inbox.plan.recurringTransactions[0]).toMatchObject({
      name: "iFood",
      amount: 80,
      frequency: "weekly",
      category: "food"
    });
    expect(inbox.reply).toMatch(/toda semana/i);
  });

  it("uses day 10 as the start of a monthly bill", () => {
    const inbox = applySecretaryInboxToPlan(createEmptyPlan("test"), "todo dia 10 pago o aluguel 1800", morning, "Thiago");
    expect(inbox.plan.recurringTransactions[0]).toMatchObject({
      name: "Aluguel",
      amount: 1800,
      frequency: "monthly",
      category: "housing"
    });
    expect(inbox.plan.recurringTransactions[0]?.startDate.startsWith("2026-08-10")).toBe(true);
    expect(inbox.reply).toMatch(/10\/08/);
  });

  it("does not turn a one-off purchase into a recurring bill", () => {
    const inbox = applySecretaryInboxToPlan(createEmptyPlan("test"), "ontem comprei ifood 62,30", morning, "Thiago");
    expect(inbox.plan.recurringTransactions).toHaveLength(0);
    expect(inbox.plan.transactions[0]?.merchant).toBe("iFood");
  });

  it("does not let the AI invent another expense date", () => {
    const inbox = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "comprei starbucks 22,40",
      morning,
      "Thiago",
      [{ type: "add_expense", merchant: "Starbucks", amount: 22.4, category: "food", date: "2026-07-01" }]
    );
    expect(inbox.plan.transactions[0]?.date.startsWith("2026-08-20")).toBe(true);
  });

  it("does not book a meeting when the user omitted the time", () => {
    const inbox = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "tenho uma reunião",
      morning,
      "Thiago",
      [{ type: "book_event", title: "Reunião", time: "15:36", date: "2026-08-20" }]
    );
    expect(inbox.reply).toMatch(/horario/i);
    expect(inbox.plan.routine.localEvents).toHaveLength(0);
  });

  it("does not let the AI rename gasolina to Uber", () => {
    const inbox = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "gastei 80 de gasolina",
      morning,
      "Thiago",
      [{ type: "add_expense", merchant: "Uber", amount: 80, category: "food" }]
    );
    expect(inbox.plan.transactions[0]).toMatchObject({
      merchant: "Gasolina",
      amount: 80,
      category: "transport"
    });
    expect(inbox.reply).toMatch(/Transporte/i);
  });

  it("classifies netflix as a subscription, not food", () => {
    const inbox = applySecretaryInboxToPlan(createEmptyPlan("test"), "paguei netflix 55,90", morning, "Thiago");
    expect(inbox.plan.transactions[0]).toMatchObject({ merchant: "Netflix", category: "subscriptions" });
    expect(inbox.reply).toMatch(/Assinaturas/i);
  });

  it("does not treat a pickup reminder as a bill snooze", () => {
    const das = createLifeAlert({ id: "alert-das", title: "Pagar Parcelamento do DAS", kind: "bill", dueDay: 25 }, morning, zone);
    const waiting = {
      ...createEmptyPlan("test"),
      secretary: {
        ...createEmptyPlan("test").secretary,
        alerts: [{ ...das, cycle: { ...das.cycle, status: "awaiting_confirmation" as const } }]
      }
    };
    const inbox = applySecretaryInboxToPlan(
      waiting,
      "tenho que buscar o carro amanhã às 18:00",
      morning,
      "Thiago",
      [{ type: "alert_reply" }]
    );
    expect(inbox.reply).toMatch(/Buscar/i);
    expect(inbox.reply).not.toMatch(/chamo de novo/i);
    expect(inbox.plan.routine.localEvents[0]?.title).toMatch(/Buscar/i);
    expect(inbox.plan.secretary.alerts.find((alert) => alert.id === "alert-das")?.cycle.status).toBe("awaiting_confirmation");
  });

  it("uses the local weekday date instead of an invented AI date", () => {
    const inbox = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "entrevista segunda às 11:00",
      morning,
      "Thiago",
      [{ type: "book_event", title: "Entrevista", time: "11:00", date: "2026-08-22" }]
    );
    expect(inbox.plan.routine.localEvents).toHaveLength(1);
    expect(inbox.reply).toMatch(/24\/08/);
    expect(inbox.reply).not.toMatch(/22\/08/);
  });

  it("forces Uber expenses into transport", () => {
    const inbox = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "gastei 32 no uber",
      morning,
      "Thiago",
      [{ type: "add_expense", merchant: "Uber", amount: 32, category: "food" }]
    );
    expect(inbox.plan.transactions[0]?.category).toBe("transport");
  });

  it("creates a reminder instead of an agenda event", () => {
    const inbox = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "me lembra de pagar a luz amanhã às 9h",
      morning,
      "Thiago"
    );
    expect(inbox.reply).toMatch(/lembrete/i);
    expect(inbox.reply).toMatch(/luz/i);
    expect(inbox.plan.routine.localEvents).toHaveLength(0);
    expect(inbox.plan.health.appointments).toHaveLength(0);
    expect(inbox.plan.secretary.alerts[0]).toMatchObject({
      title: expect.stringMatching(/luz/i),
      kind: "bill",
      frequency: "once"
    });
  });

  it("does not let the AI turn a reminder into an agenda event", () => {
    const inbox = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "criar lembrete de renovar a receita amanhã às 8h",
      morning,
      "Thiago",
      [{ type: "book_event", title: "Renovar a receita", time: "08:00", date: "2026-08-21" }]
    );
    expect(inbox.plan.routine.localEvents).toHaveLength(0);
    expect(inbox.plan.secretary.alerts[0]).toMatchObject({
      title: expect.stringMatching(/receita/i),
      kind: "document"
    });
    expect(inbox.reply).toMatch(/lembrete/i);
  });

  it("keeps meetings on the agenda even if the user says me lembra", () => {
    const inbox = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "me lembra da reunião com a ana amanhã às 15:00",
      morning,
      "Thiago"
    );
    expect(inbox.plan.routine.localEvents[0]?.title).toMatch(/Reunião/i);
    expect(inbox.plan.secretary.alerts.some((alert) => alert.kind === "bill")).toBe(false);
  });

  it("keeps secretary-created events when another copy of the agenda is stale", () => {
    const merged = mergeRoutineLocalEvents(
      [{ id: "old", source: "manual", title: "Daily", start: "2026-08-20T13:00:00.000Z", end: "2026-08-20T14:00:00.000Z", allDay: false }],
      [
        { id: "old", source: "manual", title: "Daily", start: "2026-08-20T13:00:00.000Z", end: "2026-08-20T14:00:00.000Z", allDay: false },
        { id: "new", source: "manual", title: "Entrevista", start: "2026-08-20T19:30:00.000Z", end: "2026-08-20T20:30:00.000Z", allDay: false }
      ]
    );
    expect(merged.map((event) => event.title).sort()).toEqual(["Daily", "Entrevista"]);
  });
});
