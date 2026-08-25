import { describe, expect, it } from "vitest";
import { expoPushMessagesForJob, pushTokensForPlan, stripSecretaryMarkup } from "./expo-push.js";

describe("expo push", () => {
  it("keeps one token per device on the plan", () => {
    const tokens = pushTokensForPlan(
      [
        {
          id: "owner",
          email: "thiago@email.com",
          name: "Thiago",
          passwordSalt: "",
          passwordHash: "",
          personalPlanId: "plan-1",
          activePlanId: "plan-1",
          createdAt: "",
          updatedAt: "",
          pushTokens: [
            { token: "ExponentPushToken[aaa]", platform: "ios", updatedAt: "" },
            { token: "ExponentPushToken[bbb]", platform: "android", updatedAt: "" }
          ]
        },
        {
          id: "other",
          email: "outra@email.com",
          name: "Outra",
          passwordSalt: "",
          passwordHash: "",
          personalPlanId: "plan-2",
          activePlanId: "plan-2",
          createdAt: "",
          updatedAt: "",
          pushTokens: [{ token: "ExponentPushToken[ccc]", platform: "ios", updatedAt: "" }]
        }
      ],
      "plan-1"
    );

    expect(tokens.map((item) => item.token)).toEqual(["ExponentPushToken[aaa]", "ExponentPushToken[bbb]"]);
  });

  it("turns a WhatsApp reminder into a phone notification", () => {
    const messages = expoPushMessagesForJob(
      [{ token: "ExponentPushToken[aaa]", platform: "ios", updatedAt: "" }],
      {
        title: "consulta do joelho · Thiago Dutra",
        text: "Oi, Thiago. *Em 1 hora* voce tem *consulta do joelho · Thiago Dutra*, as *13:15*.",
        alertId: "alert-appt-1-1h"
      }
    );

    expect(stripSecretaryMarkup(messages[0]?.body ?? "")).toContain("Em 1 hora");
    expect(messages[0]).toMatchObject({
      to: "ExponentPushToken[aaa]",
      title: "consulta do joelho · Thiago Dutra",
      data: { screen: "reminders", alertId: "alert-appt-1-1h" }
    });
  });
});
