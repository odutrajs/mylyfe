import { createEmptyPlan } from "@mylyfe/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmPhoneVerification,
  isSameWhatsappOwner,
  personByEmailOrPrimary,
  startPhoneVerification
} from "./phone-verify-service.js";
import { createMemoryRepository } from "./test/memory-repository.js";

const phone = "5541999990000";

const planWithPrimary = () => {
  const plan = createEmptyPlan("plan-primary");
  return {
    ...plan,
    profile: {
      ...plan.profile,
      people: [
        {
          id: "primary",
          name: "Ana",
          role: "primary" as const,
          accountStatus: "local" as const,
          email: "ana@example.com"
        }
      ]
    }
  };
};

describe("personByEmailOrPrimary", () => {
  it("finds a person by email or falls back to primary", () => {
    const plan = planWithPrimary();
    expect(personByEmailOrPrimary(plan, "ana@example.com")?.id).toBe("primary");
    expect(personByEmailOrPrimary(plan, "other@example.com")?.id).toBe("primary");
  });
});

describe("isSameWhatsappOwner", () => {
  it("matches by plan/person ids or email", () => {
    const plan = planWithPrimary();
    const holder = { plan, person: plan.profile.people[0]! };

    expect(
      isSameWhatsappOwner(holder, {
        planId: plan.id,
        personId: "primary"
      })
    ).toBe(true);
    expect(
      isSameWhatsappOwner(holder, {
        planId: "other-plan",
        personId: "other-person",
        email: "ana@example.com"
      })
    ).toBe(true);
    expect(
      isSameWhatsappOwner(holder, {
        planId: "other-plan",
        personId: "other-person",
        email: "other@example.com"
      })
    ).toBe(false);
  });
});

describe("phone verification flow", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({})
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("starts and confirms phone verification", async () => {
    const repository = createMemoryRepository();
    const plan = planWithPrimary();
    await repository.save(plan);

    const started = await startPhoneVerification(repository, {
      planId: plan.id,
      personId: "primary",
      phone: "41 99999-0000"
    });
    expect(started.phone).toBe(phone);
    expect(fetchMock).toHaveBeenCalled();

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body)) as { text?: string };
    const code = body.text?.match(/\*(\d{6})\*/)?.[1];
    expect(code).toMatch(/^\d{6}$/);

    const confirmed = await confirmPhoneVerification(repository, {
      planId: plan.id,
      phone,
      code
    });

    expect(confirmed.person?.whatsappVerifiedAt).toBeTruthy();
    expect(confirmed.person?.phone).toBe(phone);
  });
});
