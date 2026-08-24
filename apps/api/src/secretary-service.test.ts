import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./test/memory-repository.js";
import { deletePlanAlert, secretarySnapshot, setAlertStatus, upsertPlanAlert } from "./secretary-service.js";

describe("secretary-service", () => {
  it("creates, updates status, snapshots and deletes an alert", async () => {
    const repository = createMemoryRepository();

    const created = await upsertPlanAlert(repository, "test", {
      title: "Conta de luz",
      kind: "bill",
      frequency: "monthly",
      dueDay: 10
    });

    expect(created.alert.title).toBe("Conta de luz");
    expect(created.state.alerts).toHaveLength(1);

    const paused = await setAlertStatus(repository, "test", created.alert.id, "paused");
    expect(paused.alerts.find((alert) => alert.id === created.alert.id)?.status).toBe("paused");

    const snapshot = await secretarySnapshot(repository, "test");
    expect(snapshot.alerts).toHaveLength(1);
    expect(snapshot.settings.timezone).toBeTruthy();

    const remaining = await deletePlanAlert(repository, "test", created.alert.id);
    expect(remaining.alerts).toHaveLength(0);
  });
});
