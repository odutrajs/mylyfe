import { createLifeAlert } from "@mylyfe/domain";
import { describe, expect, it } from "vitest";
import { fireAtFor, upcomingNotificationTriggers } from "./reminder-schedule";

const zone = "America/Sao_Paulo";

describe("upcomingNotificationTriggers", () => {
  it("keeps one local notification per reminder and ignores agenda slots", () => {
    const now = Date.parse("2026-08-20T12:00:00.000Z");
    const bill = createLifeAlert(
      { id: "alert-luz", title: "Conta de luz", kind: "bill", dueDate: "2026-08-22", frequency: "once" },
      new Date("2026-08-20T12:00:00.000Z"),
      zone
    );
    const twin = {
      ...bill,
      id: "alert-luz-copy",
      cycle: { ...bill.cycle, remindAt: bill.cycle.remindAt, dueAt: bill.cycle.dueAt }
    };
    const appointment = createLifeAlert(
      {
        id: "alert-appt-1-3h",
        title: "Dentista",
        kind: "one_off",
        frequency: "once",
        dueDate: "2026-08-21",
        notes: "slot:3h"
      },
      new Date("2026-08-20T12:00:00.000Z"),
      zone
    );

    const triggers = upcomingNotificationTriggers([bill, twin, appointment], now);
    expect(triggers.map((item) => item.alert.id)).toEqual(["alert-luz"]);
  });

  it("schedules only the next appointment slot, not every leftover one", () => {
    const now = Date.parse("2026-08-20T12:00:00.000Z");
    const vespera = createLifeAlert(
      { id: "alert-appt-2", title: "Fisio", kind: "one_off", frequency: "once", notes: "slot:vespera" },
      new Date(now),
      zone
    );
    const threeHours = createLifeAlert(
      { id: "alert-appt-2-3h", title: "Fisio", kind: "one_off", frequency: "once", notes: "slot:3h" },
      new Date(now),
      zone
    );
    const slots = [
      {
        ...vespera,
        cycle: { ...vespera.cycle, dueAt: "2026-08-21T17:00:00.000Z", remindAt: "2026-08-20T17:00:00.000Z" }
      },
      {
        ...threeHours,
        cycle: { ...threeHours.cycle, dueAt: "2026-08-21T17:00:00.000Z", remindAt: "2026-08-21T14:00:00.000Z" }
      }
    ];

    expect(upcomingNotificationTriggers(slots, now).map((item) => item.alert.id)).toEqual(["alert-appt-2"]);
  });

  it("does not collapse leftover appointment slots onto the same due time", () => {
    const now = Date.parse("2026-08-21T16:30:00.000Z");
    const dueAt = "2026-08-21T17:00:00.000Z";
    const vespera = createLifeAlert(
      { id: "alert-appt-1", title: "Dentista", kind: "one_off", frequency: "once", notes: "slot:vespera" },
      new Date(now),
      zone
    );
    const hour = createLifeAlert(
      { id: "alert-appt-1-1h", title: "Dentista", kind: "one_off", frequency: "once", notes: "slot:1h" },
      new Date(now),
      zone
    );
    const pastSlots = [vespera, hour].map((alert) => ({
      ...alert,
      cycle: {
        ...alert.cycle,
        dueAt,
        remindAt: "2026-08-21T15:00:00.000Z"
      }
    }));

    expect(pastSlots.every((alert) => fireAtFor(alert, now) === null)).toBe(true);
    expect(upcomingNotificationTriggers(pastSlots, now)).toEqual([]);
  });
});
