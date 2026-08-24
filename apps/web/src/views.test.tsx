import { createEmptyPlan } from "@mylyfe/domain";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HealthView } from "./HealthView";
import { HomeView } from "./HomeView";
import { RoutineView } from "./RoutineView";
import { SecretaryView } from "./SecretaryView";

const apiRequest = vi.fn();

vi.mock("./lib", async () => {
  const actual = await vi.importActual<typeof import("./lib")>("./lib");
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args)
  };
});

const jsonResponse = (payload: unknown, ok = true) =>
  ({
    ok,
    json: async () => payload
  }) as Response;

describe("module views", () => {
  let plan = createEmptyPlan("test");
  let setPlan = vi.fn();

  beforeEach(() => {
    plan = createEmptyPlan("test");
    setPlan = vi.fn();
    apiRequest.mockReset();
    apiRequest.mockImplementation((path: string) => {
      if (path === "/secretary/status") {
        return Promise.resolve(jsonResponse({ state: "connected", phone: "5511999990000" }));
      }
      if (path === "/secretary/groups") {
        return Promise.resolve(jsonResponse({ groups: [] }));
      }
      if (path.endsWith("/secretary")) {
        return Promise.resolve(
          jsonResponse({
            phone: "",
            personName: "Test",
            settings: plan.secretary?.settings,
            alerts: [],
            pendingJobs: 0
          })
        );
      }
      if (path.endsWith("/routine")) {
        return Promise.resolve(
          jsonResponse({
            ...plan.routine,
            connections: [],
            events: []
          })
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  describe("HealthView", () => {
    it('renders home and wallet headings', () => {
      const { rerender } = render(<HealthView plan={plan} setPlan={setPlan} section="home" />);
      expect(screen.getByRole("heading", { name: "Painel" })).toBeInTheDocument();

      rerender(<HealthView plan={plan} setPlan={setPlan} section="wallet" />);
      expect(screen.getByRole("heading", { name: "Carteira" })).toBeInTheDocument();
    });
  });

  describe("HomeView", () => {
    it("shows empty mercado list and can add an item", async () => {
      const user = userEvent.setup();
      render(<HomeView plan={plan} setPlan={setPlan} />);

      expect(screen.getByRole("heading", { name: "Mercado" })).toBeInTheDocument();
      expect(screen.getByText(/nada pendente/i)).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText(/maionese, 2 leite/i), "maionese");
      await user.click(screen.getByRole("button", { name: /adicionar/i }));

      await waitFor(() => {
        expect(setPlan).toHaveBeenCalled();
      });
    });
  });

  describe("RoutineView", () => {
    it('renders agenda and tasks sections', async () => {
      const { rerender } = render(<RoutineView plan={plan} setPlan={setPlan} section="agenda" />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
      });

      rerender(<RoutineView plan={plan} setPlan={setPlan} section="tasks" />);
      expect(screen.getByRole("heading", { name: "Tarefas" })).toBeInTheDocument();
    });
  });

  describe("SecretaryView", () => {
    it("renders home panel with secretary status", async () => {
      render(<SecretaryView plan={plan} setPlan={setPlan} section="home" />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Painel" })).toBeInTheDocument();
      });

      expect(screen.getByText(/conectada/i)).toBeInTheDocument();
    });
  });
});
