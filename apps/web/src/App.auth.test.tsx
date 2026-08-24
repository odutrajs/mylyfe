import { createEmptyPlan } from "@mylyfe/domain";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { apiUrl } from "./lib";

const fetchMock = vi.fn();

const jsonResponse = (payload: unknown, ok = true, status = ok ? 200 : 400) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });

const submitLogin = () => screen.getByRole("button", { name: /^entrar$/i });

describe("App auth", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  it("shows login without a token", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^entrar$/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Criar conta" })).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
  });

  it("can switch to signup mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^entrar$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(screen.getByLabelText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^criar conta$/i })).toBeInTheDocument();
  });

  it("shows validation error for invalid credentials format", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^entrar$/i })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.type(screen.getByLabelText("Senha"), "123");
    await user.click(submitLogin());

    await waitFor(() => {
      expect(
        screen.getByText(/informe e-mail valido e senha com pelo menos 6 caracteres/i)
      ).toBeInTheDocument();
    });
  });

  it("shows api error for invalid login", async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === `${apiUrl}/auth/login` && method === "POST") {
        return Promise.resolve(jsonResponse({ error: "Credenciais invalidas" }, false, 401));
      }

      return Promise.resolve(jsonResponse({}, false, 404));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^entrar$/i })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret123");
    await user.click(submitLogin());

    await waitFor(() => {
      expect(screen.getByText(/credenciais invalidas/i)).toBeInTheDocument();
    });
  });

  it("logs in and loads the finance workspace", async () => {
    const user = userEvent.setup();
    const session = {
      userId: "user-1",
      planId: "primary",
      name: "Test User",
      email: "test@example.com"
    };
    const plan = createEmptyPlan("primary");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === `${apiUrl}/auth/login` && method === "POST") {
        return Promise.resolve(jsonResponse({ token: "token-123", session }));
      }

      if (url === `${apiUrl}/plans/primary` && method === "GET") {
        return Promise.resolve(jsonResponse(plan));
      }

      if (url.startsWith(`${apiUrl}/plans/primary`) && method === "PUT") {
        return Promise.resolve(jsonResponse(plan));
      }

      return Promise.resolve(jsonResponse({ error: "not found" }, false, 404));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^entrar$/i })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("E-mail"), "test@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret123");
    await user.click(submitLogin());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${apiUrl}/auth/login`,
        expect.objectContaining({ method: "POST" })
      );
    });

    await waitFor(
      () => {
        const onboarding = screen.queryByText(/vamos entender sua vida financeira/i);
        const finance = screen.queryByText("Financeiro");
        expect(onboarding || finance).toBeTruthy();
      },
      { timeout: 5000 }
    );
  });

  it("shows the conversion landing on /comece", async () => {
    window.history.replaceState({}, "", "/comece");
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /preencha o cadastro para desbloquear seu acesso ao app/i })
      ).toBeInTheDocument();
    });

    expect(screen.getAllByRole("button", { name: /desbloquear meu acesso/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^entrar$/i })).toBeInTheDocument();
  });

  it("registers from /comece and unlocks the session", async () => {
    const user = userEvent.setup();
    const session = {
      userId: "user-2",
      planId: "primary",
      name: "Ana Costa",
      email: "ana@example.com"
    };
    const plan = createEmptyPlan("primary");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === `${apiUrl}/auth/register` && method === "POST") {
        return Promise.resolve(jsonResponse({ token: "token-456", session }));
      }

      if (url === `${apiUrl}/plans/primary` && method === "GET") {
        return Promise.resolve(jsonResponse(plan));
      }

      if (url.startsWith(`${apiUrl}/plans/primary`) && method === "PUT") {
        return Promise.resolve(jsonResponse(plan));
      }

      return Promise.resolve(jsonResponse({ error: "not found" }, false, 404));
    });

    window.history.replaceState({}, "", "/comece");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Nome"), "Ana Costa");
    await user.type(screen.getByLabelText("WhatsApp"), "11999998888");
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret123");
    await user.click(screen.getAllByRole("button", { name: /desbloquear meu acesso/i })[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${apiUrl}/auth/register`,
        expect.objectContaining({ method: "POST" })
      );
    });

    await waitFor(
      () => {
        const onboarding = screen.queryByText(/vamos entender sua vida financeira/i);
        const finance = screen.queryByText("Financeiro");
        expect(onboarding || finance).toBeTruthy();
      },
      { timeout: 5000 }
    );
  });
});
