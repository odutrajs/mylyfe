import { describe, expect, it } from "vitest";
import {
  addRoutineStepChild,
  backlogTasks,
  buildDailyBriefing,
  computeDayCapacity,
  defaultRoutineModuleState,
  eventsForDay,
  isTaskForDay,
  mergeAgendaEvents,
  monthGridKeys,
  normalizeRoutineModuleState,
  pickRoutineModuleState,
  removeRoutineStepChild,
  taskSubtaskProgress,
  toggleRoutineStepChild,
  toggleRoutineStepDone,
  upcomingTasks,
  shiftWeekKey,
  weekDayKeys,
  zonedDayKey,
  type RoutineCalendarEvent,
  type RoutineTask
} from "../src/index.js";

const zone = "America/Sao_Paulo";
const noon = new Date("2026-08-18T15:00:00.000Z");

const task = (partial: Partial<RoutineTask> & { title: string }): RoutineTask => ({
  id: partial.id ?? partial.title.toLowerCase().replace(/\s+/g, "-"),
  title: partial.title,
  status: partial.status ?? "todo",
  priority: partial.priority ?? "none",
  focusToday: Boolean(partial.focusToday),
  subtasks: partial.subtasks ?? [],
  createdAt: "2026-08-18T12:00:00.000Z",
  updatedAt: "2026-08-18T12:00:00.000Z",
  ...partial
});

const event = (partial: Partial<RoutineCalendarEvent> & { title: string; start: string; end: string }): RoutineCalendarEvent => ({
  id: partial.id ?? partial.title,
  connectionId: partial.connectionId ?? "conn-1",
  calendarId: partial.calendarId ?? "cal-1",
  allDay: Boolean(partial.allDay),
  ...partial
});

describe("routine normalization", () => {
  it("fills default contexts and settings when empty", () => {
    const state = normalizeRoutineModuleState({});
    expect(state.contexts.map((context) => context.id)).toEqual([
      "context-work",
      "context-projects",
      "context-personal",
      "context-health"
    ]);
    expect(state.settings.timezone).toBe(zone);
    expect(state.settings.dayStartHour).toBe(8);
    expect(state.tasks).toEqual([]);
    expect(state.localEvents).toEqual([]);
  });

  it("keeps the newer module state", () => {
    const older = { ...defaultRoutineModuleState(), updatedAt: "2026-08-01T00:00:00.000Z", tasks: [task({ title: "Antiga" })] };
    const newer = { ...defaultRoutineModuleState(), updatedAt: "2026-08-18T00:00:00.000Z", tasks: [task({ title: "Nova" })] };
    expect(pickRoutineModuleState(older, newer).tasks[0]?.title).toBe("Nova");
    expect(pickRoutineModuleState(newer, older).tasks[0]?.title).toBe("Nova");
  });
});

describe("task helpers", () => {
  it("computes subtask progress", () => {
    expect(
      taskSubtaskProgress(
        task({
          title: "Entrega",
          subtasks: [
            { id: "1", title: "Rascunho", done: true, children: [] },
            { id: "2", title: "Revisao", done: false, children: [] }
          ]
        })
      )
    ).toEqual({ total: 2, done: 1, ratio: 0.5, nested: false });
  });

  it("counts nested tarefinhas as leaves and syncs the passo", () => {
    const normalized = normalizeRoutineModuleState({
      tasks: [
        task({
          title: "Pixel moments",
          subtasks: [
            {
              id: "totem",
              title: "Fabricar o totem",
              done: false,
              children: [
                { id: "wood", title: "Comprar madeira", done: true, children: [{ id: "ignored", title: "Neto", done: false, children: [] }] },
                { id: "cut", title: "Cortar pecas", done: false, children: [] }
              ]
            }
          ]
        })
      ]
    });
    const step = normalized.tasks[0]?.subtasks[0];
    expect(step?.children.map((child) => child.title)).toEqual(["Comprar madeira", "Cortar pecas"]);
    expect(step?.children[0]?.children).toEqual([]);
    expect(taskSubtaskProgress(normalized.tasks[0]!)).toEqual({ total: 2, done: 1, ratio: 0.5, nested: true });

    const completed = toggleRoutineStepChild(step!, "cut");
    expect(completed.done).toBe(true);
    expect(completed.children.every((child) => child.done)).toBe(true);

    const reopened = toggleRoutineStepChild(completed, "wood");
    expect(reopened.done).toBe(false);

    const allDone = toggleRoutineStepDone(reopened, true);
    expect(allDone.done).toBe(true);
    expect(allDone.children.every((child) => child.done)).toBe(true);

    const withChild = addRoutineStepChild(allDone, "Montar estrutura", "assemble");
    expect(withChild.done).toBe(false);
    expect(withChild.children.map((child) => child.title)).toEqual(["Comprar madeira", "Cortar pecas", "Montar estrutura"]);
    expect(removeRoutineStepChild(withChild, "assemble").children).toHaveLength(2);
  });

  it("treats scheduled, due and focus tasks as today", () => {
    expect(isTaskForDay(task({ title: "Hoje", scheduledDate: "2026-08-18" }), "2026-08-18")).toBe(true);
    expect(isTaskForDay(task({ title: "Prazo", dueDate: "2026-08-18" }), "2026-08-18")).toBe(true);
    expect(isTaskForDay(task({ title: "Foco", focusToday: true }), "2026-08-18")).toBe(true);
    expect(isTaskForDay(task({ title: "Amanha", scheduledDate: "2026-08-19" }), "2026-08-18")).toBe(false);
  });

  it("splits upcoming and backlog", () => {
    const tasks = [
      task({ title: "Depois", dueDate: "2026-08-20" }),
      task({ title: "Sem data" }),
      task({ title: "Hoje", scheduledDate: "2026-08-18" })
    ];
    expect(upcomingTasks(tasks, "2026-08-18").map((item) => item.title)).toEqual(["Depois"]);
    expect(backlogTasks(tasks, "2026-08-18").map((item) => item.title)).toEqual(["Sem data"]);
  });
});

describe("daily briefing and capacity", () => {
  it("groups tasks and events by context", () => {
    const state = normalizeRoutineModuleState({
      contexts: defaultRoutineModuleState().contexts,
      calendarLinks: [
        {
          id: "link-1",
          connectionId: "conn-1",
          externalCalendarId: "work-cal",
          name: "Trabalho",
          color: "#2563eb",
          enabled: true,
          contextId: "context-work"
        }
      ],
      tasks: [
        task({ title: "Captura solta", status: "inbox" }),
        task({ id: "focus-work", title: "Enviar proposta", contextId: "context-work", focusToday: true, priority: "high" }),
        task({ title: "Dentista", contextId: "context-personal", scheduledDate: "2026-08-18" }),
        task({ title: "Esperando cliente", contextId: "context-work", status: "waiting", waitingFor: "Cliente" })
      ]
    });

    const briefing = buildDailyBriefing(
      state,
      [
        event({
          title: "Daily",
          calendarId: "work-cal",
          start: "2026-08-18T12:00:00.000Z",
          end: "2026-08-18T12:30:00.000Z"
        })
      ],
      noon
    );

    expect(briefing.dayKey).toBe("2026-08-18");
    expect(briefing.inbox.map((item) => item.title)).toEqual(["Captura solta"]);
    expect(briefing.contexts[0]?.focus[0]?.title).toBe("Enviar proposta");
    expect(briefing.contexts[0]?.events[0]?.title).toBe("Daily");
    expect(briefing.contexts[2]?.tasks[0]?.title).toBe("Dentista");
    expect(briefing.waiting[0]?.title).toBe("Esperando cliente");
  });

  it("nests work and project children under the parent", () => {
    const state = normalizeRoutineModuleState({
      contexts: [
        ...defaultRoutineModuleState().contexts,
        { id: "job-acme", name: "Acme", kind: "work", color: "#2563eb", sortOrder: 10, calendarIds: [], parentId: "context-work" },
        { id: "app-x", name: "App X", kind: "project", color: "#9333ea", sortOrder: 11, calendarIds: [], parentId: "context-projects" }
      ],
      tasks: [
        task({ title: "Daily Acme", contextId: "job-acme", scheduledDate: "2026-08-18" }),
        task({ title: "Landing", contextId: "app-x", focusToday: true })
      ]
    });
    const briefing = buildDailyBriefing(state, [], noon);
    const work = briefing.contexts.find((item) => item.context.id === "context-work");
    const projects = briefing.contexts.find((item) => item.context.id === "context-projects");
    expect(work?.children.map((item) => item.context.name)).toEqual(["Acme"]);
    expect(work?.children[0]?.tasks[0]?.title).toBe("Daily Acme");
    expect(projects?.children[0]?.focus[0]?.title).toBe("Landing");
  });

  it("merges overlapping meetings and ignores all-day events", () => {
    const capacity = computeDayCapacity(
      [
        event({ title: "A", start: "2026-08-18T12:00:00.000Z", end: "2026-08-18T13:00:00.000Z" }),
        event({ title: "B", start: "2026-08-18T12:30:00.000Z", end: "2026-08-18T14:00:00.000Z" }),
        event({ title: "Feriado", start: "2026-08-18", end: "2026-08-19", allDay: true })
      ],
      "2026-08-18",
      zone,
      8,
      22
    );

    expect(capacity.meetingMinutes).toBe(120);
    expect(capacity.meetingHours).toBe(2);
    expect(capacity.windowMinutes).toBe(14 * 60);
    expect(capacity.freeMinutes).toBe(14 * 60 - 120);
  });

  it("shows local health events in the daily briefing", () => {
    const state = normalizeRoutineModuleState({
      localEvents: [
        {
          id: "local-1",
          source: "health",
          title: "Dentista · Taina",
          start: "2026-08-18T17:00:00.000Z",
          end: "2026-08-18T18:00:00.000Z",
          allDay: false,
          contextId: "context-health"
        }
      ]
    });
    const briefing = buildDailyBriefing(state, mergeAgendaEvents([], state.localEvents), noon);
    const health = briefing.contexts.find((block) => block.context.id === "context-health");
    expect(health?.events[0]?.title).toBe("Dentista · Taina");
    expect(briefing.events[0]?.title).toBe("Dentista · Taina");
  });

  it("filters events to the requested day", () => {
    const events = eventsForDay(
      [
        event({ title: "Hoje", start: "2026-08-18T12:00:00.000Z", end: "2026-08-18T13:00:00.000Z" }),
        event({ title: "Amanha", start: "2026-08-19T12:00:00.000Z", end: "2026-08-19T13:00:00.000Z" })
      ],
      "2026-08-18",
      zone
    );
    expect(events.map((item) => item.title)).toEqual(["Hoje"]);
  });

  it("orders events by local clock even when start strings mix offsets", () => {
    const events = eventsForDay(
      [
        event({ title: "Inglês", start: "2026-08-22T13:30:00-03:00", end: "2026-08-22T14:00:00-03:00" }),
        event({ title: "Fisioterapia", start: "2026-08-22T14:00:00.000Z", end: "2026-08-22T15:00:00.000Z" }),
        event({ title: "Daily", start: "2026-08-22T09:30:00-03:00", end: "2026-08-22T10:00:00-03:00" })
      ],
      "2026-08-22",
      zone
    );
    expect(events.map((item) => item.title)).toEqual(["Daily", "Fisioterapia", "Inglês"]);
  });
});

describe("zoned day key", () => {
  it("uses the configured timezone", () => {
    expect(zonedDayKey(new Date("2026-08-19T02:00:00.000Z"), zone)).toBe("2026-08-18");
    expect(zonedDayKey(new Date("2026-08-19T04:00:00.000Z"), zone)).toBe("2026-08-19");
  });
});

describe("calendar grids", () => {
  it("builds a Monday-first week", () => {
    expect(weekDayKeys("2026-08-18")).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23"
    ]);
  });

  it("fills a 6-week month grid", () => {
    expect(monthGridKeys("2026-08-18")).toHaveLength(42);
    expect(monthGridKeys("2026-08-18")[0]).toBe("2026-07-27");
  });

  it("moves week navigation to the first day of the target week", () => {
    expect(shiftWeekKey("2026-08-23", 1)).toBe("2026-08-24");
    expect(shiftWeekKey("2026-08-18", 1)).toBe("2026-08-24");
    expect(shiftWeekKey("2026-08-23", -1)).toBe("2026-08-10");
    expect(shiftWeekKey("2026-08-17", -1)).toBe("2026-08-10");
  });
});
