import { describe, expect, it } from "vitest";
import {
  expandAgendaDates,
  looksLikeAgendaCommand,
  looksLikeIncompleteAgendaCommand,
  parseAgendaCommand
} from "../src/index.js";

const zone = "America/Sao_Paulo";
const now = new Date("2026-08-18T12:00:00-03:00");

describe("agenda command parsing", () => {
  it("parses recurring physiotherapy on Monday and Wednesday at 10h", () => {
    const parsed = parseAgendaCommand("marcar fisioterapia segunda e quarta as 10h", now, zone);

    expect(parsed).toMatchObject({
      title: "Fisioterapia",
      kind: "other",
      destination: "health",
      contextId: "context-health",
      time: "10:00",
      weekdays: [1, 3]
    });
    expect(parsed?.dates).toEqual([
      "2026-08-19",
      "2026-08-24",
      "2026-08-26",
      "2026-08-31",
      "2026-09-02",
      "2026-09-07",
      "2026-09-09",
      "2026-09-14"
    ]);
    expect(looksLikeAgendaCommand("marcar fisioterapia segunda e quarta as 10h")).toBe(true);
  });

  it("parses a tomorrow meeting with a person at 15:00", () => {
    const parsed = parseAgendaCommand("reuniao com ana amanha as 15:00", now, zone);

    expect(parsed).toMatchObject({
      title: "Reunião com Ana",
      destination: "routine",
      contextId: "context-work",
      time: "15:00",
      dates: ["2026-08-19"],
      weekdays: []
    });
  });

  it("flags incomplete agenda phrases without a time", () => {
    expect(looksLikeIncompleteAgendaCommand("tenho reuniao com pedro")).toBe(true);
    expect(looksLikeAgendaCommand("tenho reuniao com pedro")).toBe(false);
    expect(parseAgendaCommand("tenho reuniao com pedro", now, zone)).toBeNull();
  });

  it("does not treat bill replies or passive consulta phrases as agenda commands", () => {
    expect(looksLikeAgendaCommand("ainda nao paguei")).toBe(false);
    expect(looksLikeIncompleteAgendaCommand("ainda nao paguei")).toBe(false);
    expect(parseAgendaCommand("ainda nao paguei", now, zone)).toBeNull();

    expect(looksLikeAgendaCommand("consulta agendada")).toBe(false);
    expect(looksLikeIncompleteAgendaCommand("consulta agendada")).toBe(false);
  });

  it("expands agenda dates within weekday and span constraints", () => {
    const start = new Date("2026-08-18T12:00:00-03:00");
    const dates = expandAgendaDates(
      {
        time: "10:00",
        weekdays: [1, 3],
        calendarDays: 14,
        start
      },
      now,
      zone
    );

    expect(dates).toEqual(["2026-08-19", "2026-08-24", "2026-08-26", "2026-08-31"]);
  });
});
