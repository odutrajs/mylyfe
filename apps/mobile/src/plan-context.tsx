import type { FinancePlan, LifeAlert, RoutineCalendarEvent, SecretaryModuleState } from "@mylyfe/domain";
import { completePlanAlertOccurrence, mergeAgendaEvents } from "@mylyfe/domain";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiRequest } from "./api";
import { useAuth } from "./auth-context";

type RefreshOptions = {
  calendars?: boolean;
};

type PlanContextValue = {
  plan: FinancePlan | null;
  loading: boolean;
  saving: boolean;
  error: string;
  events: RoutineCalendarEvent[];
  refresh: (options?: RefreshOptions) => Promise<void>;
  syncCalendars: () => Promise<void>;
  savePlan: (next: FinancePlan) => Promise<FinancePlan>;
  updatePlan: (mutator: (current: FinancePlan) => FinancePlan) => Promise<void>;
  upsertAlert: (input: Partial<LifeAlert> & { title: string }) => Promise<void>;
  completeAlert: (alertId: string) => Promise<void>;
  setAlertStatus: (alertId: string, status: LifeAlert["status"]) => Promise<void>;
  deleteAlert: (alertId: string) => Promise<void>;
};

const PlanContext = createContext<PlanContextValue | null>(null);

const applySecretary = (plan: FinancePlan, state: Pick<SecretaryModuleState, "alerts" | "settings" | "updatedAt">): FinancePlan => ({
  ...plan,
  secretary: {
    settings: state.settings ?? plan.secretary.settings,
    alerts: state.alerts,
    updatedAt: state.updatedAt ?? new Date().toISOString()
  }
});

export function PlanProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [plan, setPlan] = useState<FinancePlan | null>(null);
  const [events, setEvents] = useState<RoutineCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const planRef = useRef<FinancePlan | null>(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const lastCalendarSyncAt = useRef(0);
  planRef.current = plan;

  const routinePlanId = session?.personalPlanId && session.personalPlanId !== session.planId ? session.personalPlanId : session?.planId;

  const applyAgendaEvents = useCallback((remote: RoutineCalendarEvent[], local?: FinancePlan["routine"]["localEvents"]) => {
    setEvents(mergeAgendaEvents(remote, local ?? planRef.current?.routine.localEvents ?? []));
  }, []);

  const syncCalendars = useCallback(
    async (options?: { force?: boolean; reportError?: boolean }) => {
      if (!routinePlanId) return;
      if (syncPromiseRef.current) {
        await syncPromiseRef.current;
        if (!options?.force) return;
      }
      if (!options?.force && Date.now() - lastCalendarSyncAt.current < 30_000) return;

      const run = (async () => {
        lastCalendarSyncAt.current = Date.now();
        try {
          const response = await apiRequest("/routine/sync", {
            method: "POST",
            body: JSON.stringify({ planId: routinePlanId })
          });
          const payload = (await response.json()) as { events?: RoutineCalendarEvent[]; errors?: string[] };
          applyAgendaEvents(payload.events ?? []);
          if (options?.reportError && payload.errors?.length) {
            setError(payload.errors.join(" "));
          }
        } catch (caught) {
          lastCalendarSyncAt.current = 0;
          if (options?.reportError) {
            setError(caught instanceof Error ? caught.message : "Nao foi possivel atualizar a agenda do e-mail.");
          }
        }
      })();

      syncPromiseRef.current = run;
      try {
        await run;
      } finally {
        if (syncPromiseRef.current === run) syncPromiseRef.current = null;
      }
    },
    [applyAgendaEvents, routinePlanId]
  );

  const refresh = useCallback(
    async (options?: RefreshOptions) => {
      if (!session?.planId || !routinePlanId) {
        setPlan(null);
        setEvents([]);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const [planResponse, routineResponse] = await Promise.all([
          apiRequest(`/plans/${session.planId}`),
          apiRequest(`/plans/${routinePlanId}/routine`).catch(() => null)
        ]);
        const nextPlan = (await planResponse.json()) as FinancePlan;
        planRef.current = nextPlan;
        setPlan(nextPlan);
        if (routineResponse) {
          const routine = (await routineResponse.json()) as {
            localEvents?: FinancePlan["routine"]["localEvents"];
            events?: RoutineCalendarEvent[];
            syncedAt?: string;
          };
          applyAgendaEvents(routine.events ?? [], routine.localEvents ?? []);
          const syncedAtMs = routine.syncedAt ? Date.parse(routine.syncedAt) : Number.NaN;
          if (Number.isFinite(syncedAtMs) && Date.now() - syncedAtMs < 30_000) {
            lastCalendarSyncAt.current = syncedAtMs;
          }
        } else {
          applyAgendaEvents([]);
        }
        if (options?.calendars) {
          await syncCalendars({ force: true, reportError: true });
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Nao foi possivel carregar seus dados.");
      } finally {
        setLoading(false);
      }
    },
    [applyAgendaEvents, routinePlanId, session?.planId, syncCalendars]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persistPlan = useCallback(
    async (next: FinancePlan) => {
      if (!session?.planId) throw new Error("Sessao sem plano.");
      const response = await apiRequest(`/plans/${session.planId}`, {
        method: "PUT",
        body: JSON.stringify({ ...next, id: session.planId })
      });
      return (await response.json()) as FinancePlan;
    },
    [session?.planId]
  );

  const flushPlan = useCallback(async () => {
    if (savingRef.current) {
      dirtyRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      do {
        dirtyRef.current = false;
        const snapshot = planRef.current;
        if (!snapshot) break;
        const saved = await persistPlan(snapshot);
        if (!dirtyRef.current) {
          planRef.current = saved;
          setPlan(saved);
        }
      } while (dirtyRef.current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel salvar.");
      await refresh();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [persistPlan, refresh]);

  const savePlan = useCallback(
    async (next: FinancePlan) => {
      planRef.current = next;
      setPlan(next);
      const saved = await persistPlan(next);
      if (!dirtyRef.current) {
        planRef.current = saved;
        setPlan(saved);
      }
      return planRef.current ?? saved;
    },
    [persistPlan]
  );

  const updatePlan = useCallback(
    async (mutator: (current: FinancePlan) => FinancePlan) => {
      const current = planRef.current;
      if (!current) return;
      const optimistic = mutator(current);
      planRef.current = optimistic;
      setPlan(optimistic);
      await flushPlan();
    },
    [flushPlan]
  );

  const upsertAlert = useCallback(
    async (input: Partial<LifeAlert> & { title: string }) => {
      if (!session?.planId || !plan) return;
      const path = input.id ? `/plans/${session.planId}/alerts/${input.id}` : `/plans/${session.planId}/alerts`;
      const response = await apiRequest(path, {
        method: input.id ? "PUT" : "POST",
        body: JSON.stringify(input)
      });
      const payload = (await response.json()) as { state: SecretaryModuleState };
      setPlan(applySecretary(plan, payload.state));
    },
    [plan, session?.planId]
  );

  const completeAlert = useCallback(
    async (alertId: string) => {
      await updatePlan((current) => completePlanAlertOccurrence(current, alertId));
    },
    [updatePlan]
  );

  const setAlertStatus = useCallback(
    async (alertId: string, status: LifeAlert["status"]) => {
      if (!session?.planId || !plan) return;
      const response = await apiRequest(`/plans/${session.planId}/alerts/${alertId}/status`, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      const state = (await response.json()) as SecretaryModuleState;
      setPlan(applySecretary(plan, state));
    },
    [plan, session?.planId]
  );

  const deleteAlert = useCallback(
    async (alertId: string) => {
      if (!session?.planId || !plan) return;
      const response = await apiRequest(`/plans/${session.planId}/alerts/${alertId}`, { method: "DELETE" });
      const state = (await response.json()) as SecretaryModuleState;
      setPlan(applySecretary(plan, state));
    },
    [plan, session?.planId]
  );

  const value = useMemo<PlanContextValue>(
    () => ({
      plan,
      loading,
      saving,
      error,
      events,
      refresh,
      syncCalendars,
      savePlan,
      updatePlan,
      upsertAlert,
      completeAlert,
      setAlertStatus,
      deleteAlert
    }),
    [completeAlert, deleteAlert, error, events, loading, plan, refresh, savePlan, saving, setAlertStatus, syncCalendars, updatePlan, upsertAlert]
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export const usePlan = () => {
  const context = useContext(PlanContext);
  if (!context) throw new Error("usePlan precisa estar dentro de PlanProvider");
  return context;
};
