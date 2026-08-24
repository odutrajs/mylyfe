import { createEmptyPlan } from "@mylyfe/domain";
import { describe, expect, it } from "vitest";
import {
  AuthError,
  loginUser,
  logoutUser,
  planIdFromEmail,
  registerUser,
  sessionFromToken,
  startPasswordReset
} from "./auth-service.js";
import { createMemoryRepository } from "./test/memory-repository.js";

describe("planIdFromEmail", () => {
  it("builds a stable plan id from email", () => {
    expect(planIdFromEmail("Thiago.Dutra@Example.com")).toBe("user-thiago-dutra-example-com");
  });
});

describe("registerUser", () => {
  it("rejects short name, invalid email, and short password", async () => {
    const repository = createMemoryRepository();

    await expect(registerUser(repository, { name: "A", email: "a@b.com", password: "123456" })).rejects.toMatchObject({
      message: "Informe seu nome para criar a conta."
    });
    await expect(registerUser(repository, { name: "Ana", email: "invalid", password: "123456" })).rejects.toMatchObject({
      message: "Informe um e-mail valido."
    });
    await expect(registerUser(repository, { name: "Ana", email: "ana@example.com", password: "12345" })).rejects.toMatchObject({
      message: "A senha precisa ter pelo menos 6 caracteres."
    });
  });

  it("registers and logs in successfully", async () => {
    const repository = createMemoryRepository();
    const email = "ana@example.com";
    const planId = planIdFromEmail(email);
    await repository.save(createEmptyPlan(planId));

    const registered = await registerUser(repository, {
      name: "Ana Silva",
      email,
      password: "secret123"
    });

    expect(registered.token).toBeTruthy();
    expect(registered.session).toMatchObject({
      planId,
      personalPlanId: planId,
      name: "Ana Silva",
      email
    });

    const loggedIn = await loginUser({ email, password: "secret123" });
    expect(loggedIn.session.email).toBe(email);
    expect(loggedIn.token).toBeTruthy();
  });
});

describe("loginUser", () => {
  it("rejects wrong password", async () => {
    const repository = createMemoryRepository();
    const email = "bruno@example.com";
    await repository.save(createEmptyPlan(planIdFromEmail(email)));
    await registerUser(repository, { name: "Bruno", email, password: "secret123" });

    await expect(loginUser({ email, password: "wrong-password" })).rejects.toMatchObject({
      message: "Senha incorreta para este e-mail.",
      status: 401
    });
  });
});

describe("sessionFromToken", () => {
  it("returns the session for a valid bearer token", async () => {
    const repository = createMemoryRepository();
    const email = "carla@example.com";
    await repository.save(createEmptyPlan(planIdFromEmail(email)));
    const registered = await registerUser(repository, { name: "Carla", email, password: "secret123" });

    const current = await sessionFromToken(`Bearer ${registered.token}`);
    expect(current.session.email).toBe(email);
    expect(current.token).toBe(registered.token);
  });

  it("rejects missing or invalid tokens", async () => {
    await expect(sessionFromToken("Bearer invalid-token")).rejects.toBeInstanceOf(AuthError);
  });
});

describe("logoutUser", () => {
  it("invalidates the active session token", async () => {
    const repository = createMemoryRepository();
    const email = "diana@example.com";
    await repository.save(createEmptyPlan(planIdFromEmail(email)));
    const registered = await registerUser(repository, { name: "Diana", email, password: "secret123" });

    await logoutUser(`Bearer ${registered.token}`);
    await expect(sessionFromToken(`Bearer ${registered.token}`)).rejects.toMatchObject({
      message: "Sessao expirada. Entre novamente.",
      status: 401
    });
  });
});

describe("startPasswordReset", () => {
  it("returns a generic ok response for unknown emails", async () => {
    const repository = createMemoryRepository();
    const result = await startPasswordReset(repository, { email: "missing@example.com" });
    expect(result).toEqual({ ok: true, phoneHint: "" });
  });
});
