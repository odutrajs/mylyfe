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

export const isWorkspaceAdmin = (plan: FinancePlan, email?: string, personalPlanId?: string) => {
  if (email && isLinkedInvitee(plan, email)) return false;
  if (email && findPersonByEmail(plan, email)?.role === "primary") return true;
  return Boolean(personalPlanId && personalPlanId === plan.id);
};

export const sessionDisplayName = (plan: FinancePlan, email?: string, fallback?: string) => {
  const person = findPersonByEmail(plan, email);
  return person?.name?.trim() || fallback?.trim() || "Espaco pessoal";
};

export const lifeModulePlanId = (plan: FinancePlan, email?: string, personalPlanId?: string) => {
  if (personalPlanId && personalPlanId !== plan.id && isLinkedInvitee(plan, email)) {
    return personalPlanId;
  }
  return plan.id;
};

const defaultRoutineContextIds = new Set(["context-work", "context-projects", "context-personal", "context-health"]);

export const stripHostLifeFromPersonal = (personal: FinancePlan, shared: FinancePlan): FinancePlan => {
  const hostLinkIds = new Set((shared.routine?.calendarLinks ?? []).map((link) => link.id));
  const hostConnectionIds = new Set((shared.routine?.calendarLinks ?? []).map((link) => link.connectionId));
  const hostLocalIds = new Set((shared.routine?.localEvents ?? []).map((event) => event.id));
  const hostTaskIds = new Set((shared.routine?.tasks ?? []).map((task) => task.id));
  const hostCustomContextIds = new Set(
    (shared.routine?.contexts ?? []).filter((context) => !defaultRoutineContextIds.has(context.id)).map((context) => context.id)
  );
  const personalAppointmentIds = new Set((personal.health?.appointments ?? []).map((appointment) => appointment.id));

  const calendarLinks = (personal.routine?.calendarLinks ?? []).filter(
    (link) => !hostLinkIds.has(link.id) && !hostConnectionIds.has(link.connectionId)
  );
  const localEvents = (personal.routine?.localEvents ?? []).filter((event) => {
    if (hostLocalIds.has(event.id)) return false;
    return !(event.healthAppointmentId && !personalAppointmentIds.has(event.healthAppointmentId));
  });
  const tasks = (personal.routine?.tasks ?? []).filter((task) => !hostTaskIds.has(task.id));
  const contexts = (personal.routine?.contexts ?? []).filter((context) => !hostCustomContextIds.has(context.id));

  const unchanged =
    calendarLinks.length === (personal.routine?.calendarLinks ?? []).length &&
    localEvents.length === (personal.routine?.localEvents ?? []).length &&
    tasks.length === (personal.routine?.tasks ?? []).length &&
    contexts.length === (personal.routine?.contexts ?? []).length;
  if (unchanged) return personal;

  return {
    ...personal,
    routine: {
      ...personal.routine,
      calendarLinks,
      localEvents,
      tasks,
      contexts
    }
  };
};

export const overlayPersonalLifeModules = (shared: FinancePlan, personal: FinancePlan, email?: string): FinancePlan => {
  const cleanPersonal = stripHostLifeFromPersonal(personal, shared);
  return {
    ...shared,
    secretary: cleanPersonal.secretary,
    routine: cleanPersonal.routine,
    health: cleanPersonal.health,
    home: canAccessSharedHome(shared, email) ? shared.home : cleanPersonal.home
  };
};

export const personalLifeModulesFromComposed = (
  composed: FinancePlan,
  personalBase: FinancePlan,
  email?: string,
  sharedBase?: FinancePlan
): FinancePlan => {
  const next: FinancePlan = {
    ...personalBase,
    secretary: composed.secretary,
    routine: composed.routine,
    health: composed.health,
    home: canAccessSharedHome(composed, email) ? personalBase.home : composed.home
  };
  return sharedBase ? stripHostLifeFromPersonal(next, sharedBase) : next;
};

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
