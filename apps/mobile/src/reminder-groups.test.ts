import { createLifeAlert } from "@mylyfe/domain";
import { describe, expect, it } from "vitest";
import { groupReminderAlerts, homeReminderGroups } from "./reminder-groups";

const zone = "America/Sao_Paulo";

describe("groupReminderAlerts", () => {
  it("collapses duplicate reminders and appointment slots", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    const bill = createLifeAlert(
      { id: "alert-luz", title: "Conta de luz", kind: "bill", dueDate: "2026-08-22", frequency: "once" },
      now,
      zone
    );
    const twin = { ...bill, id: "alert-luz-copy" };
    const vespera = createLifeAlert(
      {
        id: "alert-appt-1",
        title: "Dentista",
        kind: "one_off",
        frequency: "once",
        dueDate: "2026-08-21",
        category: "health",
        notes: "slot:vespera"
      },
      now,
      zone
    );
    const hour = createLifeAlert(
      {
        id: "alert-appt-1-1h",
        title: "Dentista",
        kind: "one_off",
        frequency: "once",
        dueDate: "2026-08-21",
        category: "health",
        notes: "slot:1h"
      },
      now,
      zone
    );

    const groups = groupReminderAlerts([bill, twin, vespera, hour], zone, "2026-08-20");
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.representative.title).sort()).toEqual(["Conta de luz", "Dentista"]);
    expect(homeReminderGroups([bill, twin, vespera, hour], zone, "2026-08-20").map((group) => group.representative.title)).toEqual([
      "Conta de luz"
    ]);
  });
});
