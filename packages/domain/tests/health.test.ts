import { describe, expect, it } from "vitest";
import {
  HEALTH_CONTEXT_ID,
  buildAppointmentDateTime,
  createEmptyPlan,
  createLifeAlert,
  healthCareStatus,
  markHealthAppointmentDone,
  mergeAgendaEvents,
  removeHealthAppointment,
  summarizeHealthFinances,
  applySecretaryInboxToPlan,
  parseAgendaCommand,
  parseAppointmentConfirmation,
  syncRoutineWithHealthAppointments,
  upsertHealthAppointment,
  upsertHealthCare,
  upsertHealthMedication
} from "../src/index.js";

const zone = "America/Sao_Paulo";

describe("health care cadence", () => {
  it("marks never-done and expired cares as overdue", () => {
    expect(healthCareStatus({ id: "1", personId: "primary", kind: "dentist", title: "Dentista", intervalMonths: 6 })).toBe("overdue");
    expect(
      healthCareStatus(
        { id: "2", personId: "primary", kind: "dentist", title: "Dentista", intervalMonths: 6, lastDoneOn: "2025-01-01" },
        new Date("2026-08-18T12:00:00.000Z")
      )
    ).toBe("overdue");
  });

  it("marks a recent care as on track", () => {
    expect(
      healthCareStatus(
        { id: "3", personId: "primary", kind: "checkup", title: "Check-up", intervalMonths: 12, lastDoneOn: "2026-03-01" },
        new Date("2026-08-18T12:00:00.000Z")
      )
    ).toBe("on_track");
  });
});

describe("health appointments land on the routine agenda", () => {
  it("creates a local routine event and a secretary reminder", () => {
    const { start, end } = buildAppointmentDateTime("2026-08-21", "14:00", zone, 60);
    const plan = upsertHealthAppointment(
      createEmptyPlan("test"),
      {
        title: "Dentista",
        kind: "consult",
        personId: "primary",
        start,
        end,
        location: "Clinica Centro"
      },
      new Date("2026-08-20T13:00:00.000Z")
    );

    expect(plan.routine.localEvents).toHaveLength(1);
    expect(plan.routine.localEvents[0]?.source).toBe("health");
    expect(plan.routine.localEvents[0]?.contextId).toBe(HEALTH_CONTEXT_ID);
    expect(plan.routine.localEvents[0]?.title).toContain("Dentista");
    expect(plan.health.appointments[0]?.routineLocalEventId).toBe(plan.routine.localEvents[0]?.id);
    const reminders = plan.secretary.alerts.filter((alert) => alert.status === "active");
    const startMs = new Date(start).getTime();
    expect(reminders).toHaveLength(4);
    expect(reminders.every((alert) => alert.kind === "one_off")).toBe(true);
    expect(reminders[0]?.category).toBe("health");
    expect(new Date(reminders.find((alert) => alert.id.endsWith("-3h"))?.cycle.remindAt ?? "").getTime()).toBe(startMs - 3 * 60 * 60 * 1000);
    expect(new Date(reminders.find((alert) => alert.id.endsWith("-1h"))?.cycle.remindAt ?? "").getTime()).toBe(startMs - 60 * 60 * 1000);
    expect(new Date(reminders.find((alert) => alert.id.endsWith("-checkin"))?.cycle.remindAt ?? "").getTime()).toBe(startMs + 2 * 60 * 60 * 1000);

    const merged = mergeAgendaEvents([], plan.routine.localEvents);
    expect(merged.map((event) => event.title)[0]).toContain("Dentista");
  });

  it("keeps only upcoming appointment reminders", () => {
    const now = new Date("2026-08-21T16:00:00.000Z");
    const start = new Date(now.getTime() + 90 * 60 * 1000).toISOString();
    const end = new Date(now.getTime() + 150 * 60 * 1000).toISOString();
    const plan = upsertHealthAppointment(
      createEmptyPlan("test"),
      {
        title: "Retorno",
        kind: "follow_up",
        start,
        end
      },
      now
    );

    const reminders = plan.secretary.alerts.filter((alert) => alert.status === "active");
    expect(reminders.some((alert) => alert.id.endsWith("-1h"))).toBe(true);
    expect(reminders.some((alert) => alert.id.endsWith("-checkin"))).toBe(true);
    expect(reminders).toHaveLength(2);
  });

  it("marks the appointment done when the secretary gets a yes after the visit", () => {
    const askedAt = new Date("2026-08-21T18:00:00.000Z");
    const { start, end } = buildAppointmentDateTime("2026-08-21", "14:00", zone);
    const booked = upsertHealthAppointment(
      createEmptyPlan("test"),
      {
        id: "appt-1",
        title: "Dentista",
        start,
        end
      },
      new Date("2026-08-20T13:00:00.000Z")
    );
    const waiting = {
      ...booked,
      secretary: {
        ...booked.secretary,
        alerts: booked.secretary.alerts.map((alert) =>
          alert.id.endsWith("-checkin")
            ? { ...alert, cycle: { ...alert.cycle, status: "awaiting_confirmation" as const, lastOutboundAt: askedAt.toISOString() } }
            : alert
        )
      }
    };
    const inbox = applySecretaryInboxToPlan(waiting, "fui", askedAt, "Thiago");
    expect(inbox.reply).toMatch(/feita/i);
    expect(inbox.plan.health.appointments[0]?.done).toBe(true);
  });

  it("removes the agenda event and cancels the reminder", () => {
    const { start, end } = buildAppointmentDateTime("2026-08-21", "14:00", zone);
    const created = upsertHealthAppointment(createEmptyPlan("test"), {
      id: "appt-1",
      title: "Exame",
      kind: "exam",
      start,
      end
    });
    const removed = removeHealthAppointment(created, "appt-1");
    expect(removed.health.appointments).toHaveLength(0);
    expect(removed.routine.localEvents).toHaveLength(0);
    expect(removed.secretary.alerts.every((alert) => alert.status === "cancelled")).toBe(true);
  });

  it("updates the linked care when the appointment is done", () => {
    const withCare = upsertHealthCare(createEmptyPlan("test"), {
      id: "care-1",
      title: "Dentista",
      kind: "dentist",
      intervalMonths: 6
    });
    const { start, end } = buildAppointmentDateTime("2026-08-21", "14:00", zone);
    const booked = upsertHealthAppointment(withCare, {
      id: "appt-1",
      title: "Dentista",
      careId: "care-1",
      start,
      end
    });
    const done = markHealthAppointmentDone(booked, "appt-1", new Date("2026-08-21T18:00:00.000Z"));
    expect(done.health.appointments[0]?.done).toBe(true);
    expect(done.health.cares[0]?.lastDoneOn).toBe("2026-08-21");
  });
});

describe("health medications talk to the secretary", () => {
  it("creates a daily take reminder and a prescription deadline", () => {
    const plan = upsertHealthMedication(createEmptyPlan("test"), {
      name: "Losartana",
      dosage: "50mg",
      remindOnWhatsApp: true,
      reminderHour: 8,
      prescriptionExpiresOn: "2026-09-10"
    });

    expect(plan.secretary.alerts.map((alert) => alert.kind).sort()).toEqual(["document", "habit"]);
    expect(plan.secretary.alerts.find((alert) => alert.kind === "habit")?.frequency).toBe("daily");
    expect(plan.secretary.alerts.find((alert) => alert.kind === "document")?.dueDate).toBe("2026-09-10");
  });
});

describe("health finance summary", () => {
  it("sums health expenses and reimbursables for the month", () => {
    const plan = createEmptyPlan("test");
    plan.transactions = [
      {
        id: "t1",
        date: "2026-08-10",
        merchant: "Farmacia",
        amount: 80,
        type: "expense",
        audience: "personal",
        nature: "variable",
        category: "health",
        confidence: 1,
        source: "manual",
        reviewed: true
      },
      {
        id: "t2",
        date: "2026-08-12",
        merchant: "Clinica",
        amount: 200,
        type: "expense",
        audience: "reimbursable",
        nature: "variable",
        category: "health",
        confidence: 1,
        source: "manual",
        reviewed: true
      }
    ];
    const summary = summarizeHealthFinances(plan, new Date("2026-08-18T12:00:00.000Z"));
    expect(summary.monthSpend).toBe(280);
    expect(summary.reimbursablePending).toBe(200);
    expect(summary.reimbursableCount).toBe(1);
  });
});

describe("appointment confirmation from WhatsApp", () => {
  it("parses the clinic confirmation with tomorrow and street", () => {
    const parsed = parseAppointmentConfirmation(
      `✅ Consulta agendada
Amanhã, quinta-feira, 20/08
• às 14:15h
Clínica Orthofit
R: Itupava, 1767.`,
      new Date("2026-08-19T15:00:00.000Z"),
      zone
    );
    expect(parsed).toMatchObject({
      date: "2026-08-20",
      time: "14:15",
      location: "Clínica Orthofit · Itupava, 1767."
    });
  });

  it("books the appointment when the confirmation is forwarded to the secretary", () => {
    const inbox = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      `✅ Consulta agendada
Terça-feira, 25/08
• às 14:00h
Hospital Marcelino Champagnat
9º andar.`,
      new Date("2026-08-19T15:00:00.000Z"),
      "Thiago"
    );
    expect(inbox.reply).toMatch(/Cadastrei/i);
    expect(inbox.plan.health.appointments).toHaveLength(1);
    expect(inbox.plan.health.appointments[0]?.location).toContain("Marcelino");
    expect(inbox.plan.secretary.alerts.some((alert) => alert.status === "active")).toBe(true);
  });
});

describe("natural language agenda command", () => {
  const afternoon = new Date("2026-08-19T18:00:00.000Z");

  it("parses physiotherapy every weekday at 11 for 15 days", () => {
    const parsed = parseAgendaCommand(
      "adicione de segunda a sexta todos os dias na minha agenda fisioterapia às 11:00 da manhã por 15 dias.",
      afternoon,
      zone
    );
    expect(parsed?.title).toBe("Fisioterapia");
    expect(parsed?.time).toBe("11:00");
    expect(parsed?.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(parsed?.dates[0]).toBe("2026-08-20");
    expect(parsed?.dates.at(-1)).toBe("2026-09-03");
    expect(parsed?.dates).toHaveLength(11);
  });

  it("books the series on the health agenda without flooding WhatsApp", () => {
    const inbox = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "adicione de segunda a sexta todos os dias na minha agenda fisioterapia às 11:00 da manhã por 15 dias.",
      afternoon,
      "Thiago"
    );
    expect(inbox.reply).toMatch(/Fisioterapia/i);
    expect(inbox.reply).toMatch(/11 horarios/i);
    expect(inbox.plan.health.appointments).toHaveLength(11);
    expect(inbox.plan.routine.localEvents).toHaveLength(11);
    expect(inbox.plan.health.appointments.every((appointment) => appointment.remindOnWhatsApp === false)).toBe(true);
    expect(inbox.plan.secretary.alerts.filter((alert) => alert.status === "active")).toHaveLength(0);
  });

  it("books a work meeting from a spoken sentence without hitting a bill alert", () => {
    const morning = new Date("2026-08-20T13:37:00.000Z");
    const das = createLifeAlert(
      {
        id: "alert-das",
        title: "Pagar Parcelamento do DAS",
        kind: "bill",
        amount: 330,
        dueDay: 25,
        frequency: "monthly"
      },
      morning,
      zone
    );
    const waiting = {
      ...createEmptyPlan("test"),
      secretary: {
        ...createEmptyPlan("test").secretary,
        alerts: [{ ...das, cycle: { ...das.cycle, status: "awaiting_confirmation" as const, lastOutboundAt: morning.toISOString() } }]
      }
    };
    const parsed = parseAgendaCommand("Tenho uma reunião com a juliana às 13:00", morning, zone);
    expect(parsed).toMatchObject({
      title: "Reunião com Juliana",
      time: "13:00",
      dates: ["2026-08-20"],
      destination: "routine"
    });
    const inbox = applySecretaryInboxToPlan(waiting, "Tenho uma reunião com a juliana às 13:00", morning, "Thiago");
    expect(inbox.reply).toMatch(/Reunião com Juliana/i);
    expect(inbox.reply).not.toMatch(/Parcelamento/i);
    expect(inbox.plan.health.appointments).toHaveLength(0);
    expect(inbox.plan.routine.localEvents[0]?.title).toBe("Reunião com Juliana");
    expect(inbox.plan.routine.localEvents[0]?.contextId).toBe("context-work");
    expect(inbox.plan.secretary.alerts.find((alert) => alert.id === "alert-das")?.cycle.status).toBe("awaiting_confirmation");
    expect(inbox.plan.secretary.alerts.some((alert) => alert.status === "active" && alert.id.endsWith("-15m"))).toBe(true);
  });

  it("books a named weekday as the next occurrence, not a series", () => {
    const parsed = parseAgendaCommand("entrevista segunda às 11:00", afternoon, zone);
    expect(parsed).toMatchObject({
      title: "Entrevista",
      time: "11:00",
      dates: ["2026-08-24"],
      destination: "routine"
    });
    expect(parsed?.dates).toHaveLength(1);

    const lunch = parseAgendaCommand("almoço com a mãe domingo às 13:00", afternoon, zone);
    expect(lunch).toMatchObject({
      title: "Almoço com Mae",
      time: "13:00",
      dates: ["2026-08-23"]
    });

    const coffee = parseAgendaCommand(
      "café com o João quinta às 16:00",
      new Date("2026-08-20T15:00:00.000Z"),
      zone
    );
    expect(coffee).toMatchObject({
      title: "Café com Joao",
      dates: ["2026-08-20"]
    });
  });

  it("books a single appointment from a short phrase", () => {
    const inbox = applySecretaryInboxToPlan(createEmptyPlan("test"), "marca fisioterapia amanha as 11", afternoon, "Thiago");
    expect(inbox.plan.health.appointments).toHaveLength(1);
    expect(inbox.plan.health.appointments[0]?.title).toBe("Fisioterapia");
    expect(inbox.plan.secretary.alerts.filter((alert) => alert.status === "active").length).toBeGreaterThan(0);
  });

  it("books a same-day consult when the user asks for a reminder", () => {
    const now = new Date("2026-08-25T14:16:00.000Z");
    const inbox = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "Lembrete para consulta do joelho às 13:15",
      now,
      "Thiago"
    );
    expect(inbox.reply).toMatch(/consulta.*joelho/i);
    expect(inbox.reply).toMatch(/13:15/);
    expect(inbox.plan.health.appointments).toHaveLength(1);
    expect(inbox.plan.health.appointments[0]?.title).toMatch(/consulta.*joelho/i);
    expect(inbox.plan.routine.localEvents.some((event) => /joelho/i.test(event.title))).toBe(true);
    expect(inbox.plan.secretary.alerts.some((alert) => alert.notes?.includes("slot:1h"))).toBe(true);
  });

  it("puts health appointments back on the agenda when local events were dropped", () => {
    const booked = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "adicione de segunda a sexta todos os dias na minha agenda fisioterapia às 11:00 da manhã por 15 dias.",
      afternoon,
      "Thiago"
    ).plan;
    const stripped = {
      ...booked,
      routine: {
        ...booked.routine,
        localEvents: booked.routine.localEvents.filter((event) => event.source !== "health")
      }
    };
    const synced = syncRoutineWithHealthAppointments(stripped);
    expect(synced.routine.localEvents.filter((event) => event.title.includes("Fisioterapia"))).toHaveLength(11);
  });

  it("turns on WhatsApp reminders when the user asks for aviso", () => {
    const booked = applySecretaryInboxToPlan(
      createEmptyPlan("test"),
      "adicione de segunda a sexta todos os dias na minha agenda fisioterapia às 11:00 da manhã por 15 dias.",
      afternoon,
      "Thiago"
    ).plan;
    const das = createLifeAlert(
      {
        id: "alert-das",
        title: "Pagar Parcelamento do DAS",
        kind: "bill",
        amount: 330,
        dueDay: 25,
        frequency: "monthly"
      },
      afternoon,
      zone
    );
    const waiting = {
      ...booked,
      secretary: {
        ...booked.secretary,
        alerts: [{ ...das, cycle: { ...das.cycle, status: "awaiting_confirmation" as const, lastOutboundAt: afternoon.toISOString() } }]
      }
    };
    const inbox = applySecretaryInboxToPlan(waiting, "quero aviso", afternoon, "Thiago");
    expect(inbox.reply).toMatch(/15 minutos antes/i);
    expect(inbox.reply).toMatch(/Fisioterapia/i);
    expect(inbox.reply).not.toMatch(/DAS/i);
    expect(inbox.plan.health.appointments.every((appointment) => appointment.remindOnWhatsApp)).toBe(true);
    expect(inbox.plan.secretary.alerts.find((alert) => alert.id === "alert-das")?.cycle.status).toBe("awaiting_confirmation");
    const seriesAlerts = inbox.plan.secretary.alerts.filter((alert) => alert.status === "active" && alert.id.endsWith("-15m"));
    expect(seriesAlerts).toHaveLength(11);
    const first = inbox.plan.health.appointments[0];
    expect(new Date(seriesAlerts[0]?.cycle.remindAt ?? "").getTime()).toBe(new Date(first?.start ?? "").getTime() - 15 * 60 * 1000);
  });
});
