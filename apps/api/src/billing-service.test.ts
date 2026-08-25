import { afterEach, describe, expect, it } from "vitest";
import {
  AuthError,
  loginUser,
  registerUser,
  requirePaidSession,
  sessionFromToken
} from "./auth-service.js";
import { applyStripeSubscriptionObject, subscriptionForUser } from "./billing-service.js";
import { hasAppAccess, upsertCustomer } from "./billing-store.js";
import { processStripeEvent } from "./stripe-webhook.js";
import { createMemoryRepository } from "./test/memory-repository.js";
import { createEmptyPlan } from "@mylyfe/domain";
import { planIdFromEmail } from "./auth-service.js";
import type Stripe from "stripe";

const futureUnix = () => Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;

describe("hasAppAccess", () => {
  it("grants allowlisted, trialing, active, and canceled-until-period-end", () => {
    expect(hasAppAccess({ status: "allowlisted" })).toBe(true);
    expect(hasAppAccess({ status: "active" })).toBe(true);
    expect(hasAppAccess({ status: "trialing", trialEnd: new Date(Date.now() + 1000).toISOString() })).toBe(true);
    expect(
      hasAppAccess({
        status: "canceled",
        currentPeriodEnd: new Date(Date.now() + 60_000).toISOString()
      })
    ).toBe(true);
  });

  it("blocks incomplete, past_due, expired trial, and lapsed cancel", () => {
    expect(hasAppAccess({ status: "incomplete" })).toBe(false);
    expect(hasAppAccess({ status: "none" })).toBe(false);
    expect(hasAppAccess({ status: "past_due" })).toBe(false);
    expect(hasAppAccess({ status: "unpaid" })).toBe(false);
    expect(hasAppAccess({ status: "trialing", trialEnd: new Date(Date.now() - 1000).toISOString() })).toBe(false);
    expect(
      hasAppAccess({
        status: "canceled",
        currentPeriodEnd: new Date(Date.now() - 1000).toISOString()
      })
    ).toBe(false);
  });
});

describe("subscriptionForUser", () => {
  const previousAllowlist = process.env.BILLING_ALLOWLIST_EMAILS;

  afterEach(() => {
    if (previousAllowlist === undefined) delete process.env.BILLING_ALLOWLIST_EMAILS;
    else process.env.BILLING_ALLOWLIST_EMAILS = previousAllowlist;
  });

  it("marks allowlisted emails as granted", async () => {
    process.env.BILLING_ALLOWLIST_EMAILS = "owner@example.com, other@x.com";
    const subscription = await subscriptionForUser({ id: "user-owner", email: "Owner@Example.com" });
    expect(subscription).toMatchObject({ status: "allowlisted", accessGranted: true });
  });

  it("returns incomplete when there is no billing record", async () => {
    delete process.env.BILLING_ALLOWLIST_EMAILS;
    const subscription = await subscriptionForUser({ id: "user-new", email: "new@example.com" });
    expect(subscription).toEqual({ status: "incomplete", accessGranted: false });
  });
});

describe("register and paid gate", () => {
  const previousAllowlist = process.env.BILLING_ALLOWLIST_EMAILS;

  afterEach(() => {
    if (previousAllowlist === undefined) delete process.env.BILLING_ALLOWLIST_EMAILS;
    else process.env.BILLING_ALLOWLIST_EMAILS = previousAllowlist;
  });

  it("registers a normal user without access", async () => {
    delete process.env.BILLING_ALLOWLIST_EMAILS;
    const repository = createMemoryRepository();
    const email = "payer@example.com";
    await repository.save(createEmptyPlan(planIdFromEmail(email)));

    const registered = await registerUser(repository, {
      name: "Payer",
      email,
      password: "secret123"
    });

    expect(registered.session.subscription).toMatchObject({
      status: "incomplete",
      accessGranted: false
    });

    await expect(requirePaidSession(`Bearer ${registered.token}`)).rejects.toMatchObject({
      message: "Assine para liberar o aplicativo.",
      status: 402
    });
  });

  it("registers an allowlisted user with access", async () => {
    process.env.BILLING_ALLOWLIST_EMAILS = "vip@example.com";
    const repository = createMemoryRepository();
    const email = "vip@example.com";
    await repository.save(createEmptyPlan(planIdFromEmail(email)));

    const registered = await registerUser(repository, {
      name: "Vip",
      email,
      password: "secret123"
    });

    expect(registered.session.subscription.accessGranted).toBe(true);
    const paid = await requirePaidSession(`Bearer ${registered.token}`);
    expect(paid.session.email).toBe(email);
  });
});

describe("processStripeEvent", () => {
  it("applies a subscription and ignores duplicates", async () => {
    await upsertCustomer({
      userId: "user-stripe",
      email: "stripe@example.com",
      stripeCustomerId: "cus_123",
      status: "incomplete",
      cancelAtPeriodEnd: false
    });

    const subscription = {
      id: "sub_123",
      customer: "cus_123",
      status: "trialing",
      trial_end: futureUnix(),
      current_period_end: futureUnix(),
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_monthly" } }] },
      metadata: { userId: "user-stripe" }
    } as unknown as Stripe.Subscription;

    const event = {
      id: "evt_unique_1",
      type: "customer.subscription.updated",
      data: { object: subscription }
    } as Stripe.Event;

    const first = await processStripeEvent(event);
    const second = await processStripeEvent(event);
    expect(first).toEqual({ ok: true, duplicate: false });
    expect(second).toEqual({ ok: true, duplicate: true });

    const applied = await applyStripeSubscriptionObject(subscription);
    expect(applied?.status).toBe("trialing");
    expect(applied?.stripeSubscriptionId).toBe("sub_123");

    const publicSub = await subscriptionForUser({ id: "user-stripe", email: "stripe@example.com" });
    expect(publicSub.accessGranted).toBe(true);
  });
});

describe("sessionFromToken includes subscription", () => {
  it("keeps the subscription snapshot on login", async () => {
    const repository = createMemoryRepository();
    const email = "snap@example.com";
    await repository.save(createEmptyPlan(planIdFromEmail(email)));
    const registered = await registerUser(repository, { name: "Snap", email, password: "secret123" });
    const loggedIn = await loginUser({ email, password: "secret123" });
    const current = await sessionFromToken(`Bearer ${loggedIn.token}`);
    expect(current.session.subscription.accessGranted).toBe(false);
    expect(registered.session.subscription.status).toBe("incomplete");
  });
});

describe("requirePaidSession", () => {
  it("rejects missing tokens", async () => {
    await expect(requirePaidSession("Bearer missing")).rejects.toBeInstanceOf(AuthError);
  });
});
