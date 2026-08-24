import { createEmptyPlan, type FinancePlan } from "@mylyfe/domain";
import type { PlanRepository } from "../repository.js";

export const createMemoryRepository = (initial: Record<string, FinancePlan> = {}): PlanRepository => {
  const plans = new Map<string, FinancePlan>(Object.entries(initial));

  return {
    async get(id) {
      if (!plans.has(id)) {
        const empty = createEmptyPlan(id);
        plans.set(id, empty);
        return empty;
      }
      return plans.get(id)!;
    },
    async save(plan) {
      plans.set(plan.id, plan);
      return plan;
    },
    async remove(id) {
      plans.delete(id);
    },
    async listIds() {
      return [...plans.keys()];
    }
  };
};
