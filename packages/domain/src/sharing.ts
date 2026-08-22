import { defaultHomeModuleAccess } from "./defaults.js";
import type { AccountLink, FinancePlan, ModuleAccessRole } from "./types.js";

const foldEmail = (email: string) => email.trim().toLowerCase();

export const accountLinkSharesHome = (link: Pick<AccountLink, "sharedHome">) => link.sharedHome !== false;

export const applySharedHomeToAccountLink = (
  link: AccountLink,
  sharedHome: boolean,
  role: ModuleAccessRole = "editor"
): AccountLink => {
  const modules = (link.permissions?.modules ?? []).filter((module) => module.moduleId !== "home");
  if (sharedHome) modules.push(defaultHomeModuleAccess(role));

  return {
    ...link,
    sharedHome,
    permissions: {
      ...link.permissions,
      modules
    }
  };
};

export const findAcceptedAccountLinkForEmail = (plan: FinancePlan, email: string) => {
  const normalized = foldEmail(email);
  return (plan.profile.accountLinks ?? []).find(
    (link) => link.status === "accepted" && foldEmail(link.inviteeEmail ?? "") === normalized
  );
};

export const isPlanOwnerEmail = (plan: FinancePlan, email?: string) => {
  if (!email) return true;
  const normalized = foldEmail(email);
  const person = plan.profile.people.find((entry) => foldEmail(entry.email ?? "") === normalized);
  if (person?.role === "primary") return true;
  return !findAcceptedAccountLinkForEmail(plan, email);
};

export const canAccessSharedHome = (plan: FinancePlan, email?: string) => {
  if (!email || isPlanOwnerEmail(plan, email)) return true;
  const link = findAcceptedAccountLinkForEmail(plan, email);
  return link ? accountLinkSharesHome(link) : true;
};

export const findPersonByEmail = (plan: FinancePlan, email?: string) => {
  if (!email) return undefined;
  const normalized = foldEmail(email);
  const byEmail = plan.profile.people.find((person) => foldEmail(person.email ?? "") === normalized);
  if (byEmail) return byEmail;
  const link = findAcceptedAccountLinkForEmail(plan, email);
  if (!link?.inviteePersonId) return undefined;
  return plan.profile.people.find((person) => person.id === link.inviteePersonId);
};

export const isLinkedInvitee = (plan: FinancePlan, email?: string) => {
  if (!email) return false;
  const person = findPersonByEmail(plan, email);
  if (person?.role === "primary") return false;
  return Boolean(findAcceptedAccountLinkForEmail(plan, email) || person?.accountStatus === "linked");
};

export const sessionDisplayName = (plan: FinancePlan, email?: string, fallback?: string) => {
  const person = findPersonByEmail(plan, email);
  return person?.name?.trim() || fallback?.trim() || "Espaco pessoal";
};

export const overlayPersonalLifeModules = (shared: FinancePlan, personal: FinancePlan, email?: string): FinancePlan => ({
  ...shared,
  secretary: personal.secretary,
  routine: personal.routine,
  health: personal.health,
  home: canAccessSharedHome(shared, email) ? shared.home : personal.home
});

export const personalLifeModulesFromComposed = (
  composed: FinancePlan,
  personalBase: FinancePlan,
  email?: string
): FinancePlan => ({
  ...personalBase,
  secretary: composed.secretary,
  routine: composed.routine,
  health: composed.health,
  home: canAccessSharedHome(composed, email) ? personalBase.home : composed.home
});

export const sharedPlanFromComposed = (composed: FinancePlan, sharedBase: FinancePlan, email?: string): FinancePlan => ({
  ...composed,
  secretary: sharedBase.secretary,
  routine: sharedBase.routine,
  health: sharedBase.health,
  home: canAccessSharedHome(composed, email) ? composed.home : sharedBase.home
});

export const sharedHomeMemberNames = (plan: FinancePlan) => {
  const names: string[] = [];
  for (const link of plan.profile.accountLinks ?? []) {
    if (link.status !== "accepted" || !accountLinkSharesHome(link)) continue;
    const person = plan.profile.people.find((entry) => entry.id === link.inviteePersonId);
    const name = link.inviteeName || person?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
};
