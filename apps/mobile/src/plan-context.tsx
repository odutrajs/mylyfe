import type { FinancePlan, LifeAlert, RoutineCalendarEvent, SecretaryModuleState } from "@mylyfe/domain";
import { mergeAgendaEvents } from "@mylyfe/domain";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiRequest } from "./api";
import { useAuth } from "./auth-context";

type PlanContextValue = {
  plan: FinancePlan | null;
  loading: boolean;
  saving: boolean;
  error: string;
  events: RoutineCalendarEvent[];
  refresh: () => Promise<void>;
  savePlan: (next: FinancePlan) => Promise<FinancePlan>;
  updatePlan: (mutator: (current: FinancePlan) => FinancePlan) => Promise<void>;
  upsertAlert: (input: Partial<LifeAlert> & { title: string }) => Promise<void>;
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
  planRef.current = plan;

  const refresh = useCallback(async () => {
    if (!session?.planId) {
      setPlan(null);
      setEvents([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const routinePlanId =
        session.personalPlanId && session.personalPlanId !== session.planId ? session.personalPlanId : session.planId;
      const [planResponse, routineResponse] = await Promise.all([
        apiRequest(`/plans/${session.planId}`),
        apiRequest(`/plans/${routinePlanId}/routine`).catch(() => null)
      ]);
      const nextPlan = (await planResponse.json()) as FinancePlan;
      setPlan(nextPlan);
      if (routineResponse) {
        const routine = (await routineResponse.json()) as {
          localEvents?: FinancePlan["routine"]["localEvents"];
          events?: RoutineCalendarEvent[];
        };
        setEvents(mergeAgendaEvents(routine.events ?? [], routine.localEvents ?? []));
      } else {
        setEvents(mergeAgendaEvents([], []));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel carregar seus dados.");
    } finally {
      setLoading(false);
    }
  }, [session?.planId, session?.personalPlanId]);

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
      savePlan,
      updatePlan,
      upsertAlert,
      setAlertStatus,
      deleteAlert
    }),
    [deleteAlert, error, events, loading, plan, refresh, savePlan, saving, setAlertStatus, updatePlan, upsertAlert]
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export const usePlan = () => {
  const context = useContext(PlanContext);
  if (!context) throw new Error("usePlan precisa estar dentro de PlanProvider");
  return context;
};
