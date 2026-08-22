import { describe, expect, it } from "vitest";
import {
  accountLinkSharesHome,
  applySharedHomeToAccountLink,
  canAccessSharedHome,
  createEmptyPlan,
  defaultFinanceModuleAccess,
  defaultHomeModuleAccess,
  findAcceptedAccountLinkForEmail,
  findPersonByEmail,
  isLinkedInvitee,
  isWorkspaceAdmin,
  isPlanOwnerEmail,
  overlayPersonalLifeModules,
  sessionDisplayName,
  sharedHomeMemberNames,
  sharedPlanFromComposed,
  type AccountLink
} from "../src/index.js";

const link = (patch: Partial<AccountLink> = {}): AccountLink => ({
  id: "link-1",
  token: "token-1",
  inviterPersonId: "primary",
  status: "accepted",
  sharedAccounts: true,
  sharedHome: true,
  expenseSplit: { primaryPercent: 50, partnerPercent: 50 },
  permissions: {
    canViewSharedPlan: true,
    canEditOwnData: true,
    canEditSharedData: false,
    canSeePartnerPrivateData: false,
    modules: [defaultFinanceModuleAccess("editor")]
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  ...patch
});

describe("account home sharing", () => {
  it("treats explicit false as no mercado access", () => {
    expect(accountLinkSharesHome(link({ sharedHome: false }))).toBe(false);
    expect(accountLinkSharesHome(link({ sharedHome: true }))).toBe(true);
  });

  it("keeps legacy invites shared when the flag is missing", () => {
    expect(accountLinkSharesHome(link({ sharedHome: undefined as unknown as boolean }))).toBe(true);
  });

  it("adds and removes the home module when toggling sharedHome", () => {
    const withoutHome = applySharedHomeToAccountLink(link({ sharedHome: false }), false);
    expect(withoutHome.sharedHome).toBe(false);
    expect(withoutHome.permissions.modules.some((module) => module.moduleId === "home")).toBe(false);

    const withHome = applySharedHomeToAccountLink(withoutHome, true, "viewer");
    expect(withHome.sharedHome).toBe(true);
    expect(withHome.permissions.modules.find((module) => module.moduleId === "home")).toEqual(
      defaultHomeModuleAccess("viewer")
    );
  });

  it("lets the owner always see mercado and honors the invitee flag", () => {
    const plan = createEmptyPlan("plan-1");
    plan.profile.people[0].email = "titular@email.com";
    plan.profile.people.push({
      id: "partner",
      name: "Ana",
      email: "ana@email.com",
      role: "partner",
      accountStatus: "linked"
    });
    plan.profile.accountLinks = [
      link({
        inviteePersonId: "partner",
        inviteeEmail: "ana@email.com",
        inviteeName: "Ana",
        sharedHome: false
      })
    ];

    expect(isPlanOwnerEmail(plan, "titular@email.com")).toBe(true);
    expect(canAccessSharedHome(plan, "titular@email.com")).toBe(true);
    expect(canAccessSharedHome(plan, "ana@email.com")).toBe(false);
    expect(findAcceptedAccountLinkForEmail(plan, "ANA@email.com")?.inviteeName).toBe("Ana");

    plan.profile.accountLinks[0] = applySharedHomeToAccountLink(plan.profile.accountLinks[0], true);
    expect(canAccessSharedHome(plan, "ana@email.com")).toBe(true);
    expect(sharedHomeMemberNames(plan)).toEqual(["Ana"]);
  });
});

describe("linked invitee identity", () => {
  it("shows the invitee name instead of the plan owner", () => {
    const plan = createEmptyPlan("plan-1");
    plan.profile.people[0].name = "Thiago Dutra";
    plan.profile.people[0].email = "titular@email.com";
    plan.profile.people.push({
      id: "partner",
      name: "Taina",
      email: "tainaestats@gmail.com",
      role: "partner",
      accountStatus: "linked"
    });
    plan.profile.accountLinks = [
      link({
        inviteePersonId: "partner",
        inviteeEmail: "tainaestats@gmail.com",
        inviteeName: "Taina"
      })
    ];

    expect(findPersonByEmail(plan, "tainaestats@gmail.com")?.name).toBe("Taina");
    expect(isLinkedInvitee(plan, "tainaestats@gmail.com")).toBe(true);
    expect(isLinkedInvitee(plan, "titular@email.com")).toBe(false);
    expect(isWorkspaceAdmin(plan, "titular@email.com", "plan-1")).toBe(true);
    expect(isWorkspaceAdmin(plan, "tainaestats@gmail.com", "personal-taina")).toBe(false);
    expect(sessionDisplayName(plan, "tainaestats@gmail.com", "fallback")).toBe("Taina");
  });

  it("keeps the host routine on the shared plan when overlaying a linked workspace", () => {
    const shared = createEmptyPlan("shared");
    const personal = createEmptyPlan("personal");
    shared.profile.people[0].email = "titular@email.com";
    shared.routine = { ...shared.routine, updatedAt: "2026-01-02T00:00:00.000Z" };
    personal.routine = { ...personal.routine, updatedAt: "2026-01-03T00:00:00.000Z" };

    const composed = overlayPersonalLifeModules(shared, personal, "ana@email.com");
    expect(composed.routine?.updatedAt).toBe("2026-01-03T00:00:00.000Z");

    const savedShared = sharedPlanFromComposed(composed, shared, "ana@email.com");
    expect(savedShared.routine?.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });
});
