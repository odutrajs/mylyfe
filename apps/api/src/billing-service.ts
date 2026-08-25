import Stripe from "stripe";
import {
  createCheckoutStart,
  findCheckoutStart,
  findCustomerByStripeId,
  findCustomerByUserId,
  hasAppAccess,
  isAllowlistedEmail,
  toPublicSubscription,
  upsertCustomer,
  type BillingCustomer,
  type PublicSubscription,
  type SubscriptionStatus
} from "./billing-store.js";
import { findUserById, type StoredUser } from "./auth-store.js";

export class BillingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let stripeClient: Stripe | undefined;

export const resetStripeClient = () => {
  stripeClient = undefined;
};

export const getStripe = () => {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new BillingError("Pagamento ainda nao esta configurado.", 503);
  if (!stripeClient) stripeClient = new Stripe(secret);
  return stripeClient;
};

const firstWebOrigin = () =>
  (process.env.WEB_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .find(Boolean) ?? "http://localhost:5173";

const trialDays = () => {
  const parsed = Number(process.env.STRIPE_TRIAL_DAYS ?? 7);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 7;
};

const monthlyPriceId = () => {
  const price = process.env.STRIPE_PRICE_MONTHLY?.trim();
  if (!price) throw new BillingError("Preco da assinatura nao configurado.", 503);
  return price;
};

export const subscriptionForUser = async (user: { id: string; email: string }): Promise<PublicSubscription> => {
  if (isAllowlistedEmail(user.email)) {
    const existing = await findCustomerByUserId(user.id);
    await upsertCustomer({
      userId: user.id,
      email: user.email,
      stripeCustomerId: existing?.stripeCustomerId,
      stripeSubscriptionId: existing?.stripeSubscriptionId,
      stripePriceId: existing?.stripePriceId,
      status: "allowlisted",
      trialEnd: existing?.trialEnd,
      currentPeriodEnd: existing?.currentPeriodEnd,
      cancelAtPeriodEnd: existing?.cancelAtPeriodEnd ?? false
    });
    return {
      status: "allowlisted",
      trialEnd: existing?.trialEnd,
      currentPeriodEnd: existing?.currentPeriodEnd,
      accessGranted: true
    };
  }

  const customer = await findCustomerByUserId(user.id);
  return toPublicSubscription(customer);
};

export const ensureBillingCustomer = async (user: { id: string; email: string }) => {
  const existing = await findCustomerByUserId(user.id);
  if (existing) {
    if (isAllowlistedEmail(user.email) && existing.status !== "allowlisted") {
      return upsertCustomer({ ...existing, email: user.email, status: "allowlisted" });
    }
    return existing;
  }

  return upsertCustomer({
    userId: user.id,
    email: user.email,
    status: isAllowlistedEmail(user.email) ? "allowlisted" : "incomplete",
    cancelAtPeriodEnd: false
  });
};

const unixToIso = (value?: number | null) =>
  typeof value === "number" && value > 0 ? new Date(value * 1000).toISOString() : undefined;

export const mapStripeSubscriptionStatus = (status: string): SubscriptionStatus => {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "unpaid":
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
      return status;
    case "paused":
      return "unpaid";
    default:
      return "incomplete";
  }
};

const periodEndFromSubscription = (subscription: Stripe.Subscription) => {
  const item = subscription.items?.data?.[0];
  const end =
    (subscription as { current_period_end?: number }).current_period_end ??
    (item as { current_period_end?: number } | undefined)?.current_period_end;
  return unixToIso(end);
};

export const applySubscriptionSnapshot = async (input: {
  userId: string;
  email?: string;
  stripeCustomerId?: string;
  subscription: Stripe.Subscription;
}) => {
  const existing = await findCustomerByUserId(input.userId);
  const priceId = input.subscription.items?.data?.[0]?.price?.id;
  return upsertCustomer({
    userId: input.userId,
    email: input.email ?? existing?.email ?? "",
    stripeCustomerId: input.stripeCustomerId ?? existing?.stripeCustomerId,
    stripeSubscriptionId: input.subscription.id,
    stripePriceId: priceId || existing?.stripePriceId,
    status: isAllowlistedEmail(input.email ?? existing?.email ?? "")
      ? "allowlisted"
      : mapStripeSubscriptionStatus(input.subscription.status),
    trialEnd: unixToIso(input.subscription.trial_end),
    currentPeriodEnd: periodEndFromSubscription(input.subscription),
    cancelAtPeriodEnd: Boolean(input.subscription.cancel_at_period_end)
  });
};

const resolveUserIdForStripeCustomer = async (stripeCustomerId?: string, userId?: string) => {
  if (userId) return userId;
  if (!stripeCustomerId) return undefined;
  return (await findCustomerByStripeId(stripeCustomerId))?.userId;
};

export const applyCheckoutSession = async (session: Stripe.Checkout.Session) => {
  const userId =
    session.client_reference_id?.trim() ||
    session.metadata?.userId?.trim() ||
    (await resolveUserIdForStripeCustomer(
      typeof session.customer === "string" ? session.customer : session.customer?.id,
      undefined
    ));
  if (!userId) return undefined;

  const existing = await findCustomerByUserId(userId);
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (subscriptionId) {
    const subscription =
      typeof session.subscription === "object" && session.subscription
        ? session.subscription
        : await getStripe().subscriptions.retrieve(subscriptionId);
    return applySubscriptionSnapshot({
      userId,
      email: existing?.email || session.customer_details?.email || undefined,
      stripeCustomerId,
      subscription
    });
  }

  return upsertCustomer({
    userId,
    email: existing?.email || session.customer_details?.email || "",
    stripeCustomerId,
    stripeSubscriptionId: existing?.stripeSubscriptionId,
    stripePriceId: existing?.stripePriceId,
    status: existing?.status === "allowlisted" ? "allowlisted" : "incomplete",
    trialEnd: existing?.trialEnd,
    currentPeriodEnd: existing?.currentPeriodEnd,
    cancelAtPeriodEnd: existing?.cancelAtPeriodEnd ?? false
  });
};

export const applyStripeSubscriptionObject = async (subscription: Stripe.Subscription) => {
  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const userId = await resolveUserIdForStripeCustomer(stripeCustomerId, subscription.metadata?.userId?.trim());
  if (!userId) return undefined;
  return applySubscriptionSnapshot({ userId, stripeCustomerId, subscription });
};

const findOrCreateStripeCustomer = async (user: StoredUser): Promise<BillingCustomer> => {
  const existing = await ensureBillingCustomer(user);
  if (existing.stripeCustomerId) return existing;

  const created = await getStripe().customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id }
  });

  return upsertCustomer({
    ...existing,
    stripeCustomerId: created.id
  });
};

const publishableKey = () => {
  const key = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (!key) throw new BillingError("Chave publica da Stripe nao configurada.", 503);
  return key;
};

const extractClientSecret = (subscription: Stripe.Subscription) => {
  const pending = subscription.pending_setup_intent;
  if (pending && typeof pending === "object" && pending.client_secret) {
    return { clientSecret: pending.client_secret, mode: "setup" as const };
  }
  const invoice = subscription.latest_invoice;
  const paymentIntent =
    invoice && typeof invoice === "object"
      ? (invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent }).payment_intent
      : undefined;
  if (paymentIntent && typeof paymentIntent === "object" && paymentIntent.client_secret) {
    return { clientSecret: paymentIntent.client_secret, mode: "payment" as const };
  }
  return undefined;
};

const expandSubscription = (id: string) =>
  getStripe().subscriptions.retrieve(id, {
    expand: ["latest_invoice.payment_intent", "pending_setup_intent"]
  });

export const createSubscriptionElements = async (user: StoredUser) => {
  const subscription = await subscriptionForUser(user);
  if (subscription.accessGranted) {
    throw new BillingError("Sua conta ja tem acesso liberado.", 409);
  }

  const customer = await findOrCreateStripeCustomer(user);
  const stripe = getStripe();

  if (customer.stripeSubscriptionId) {
    try {
      const current = await expandSubscription(customer.stripeSubscriptionId);
      if (current.status === "incomplete" || current.status === "trialing") {
        const secret = extractClientSecret(current);
        if (secret) {
          await applySubscriptionSnapshot({
            userId: user.id,
            email: user.email,
            stripeCustomerId: customer.stripeCustomerId,
            subscription: current
          });
          return { ...secret, publishableKey: publishableKey() };
        }
      }
      if (current.status === "incomplete" || current.status === "incomplete_expired") {
        await stripe.subscriptions.cancel(current.id);
      }
    } catch {
      // cria uma assinatura nova abaixo
    }
  }

  const created = await stripe.subscriptions.create({
    customer: customer.stripeCustomerId,
    items: [{ price: monthlyPriceId() }],
    trial_period_days: trialDays(),
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    metadata: { userId: user.id },
    expand: ["latest_invoice.payment_intent", "pending_setup_intent"]
  });

  const secret = extractClientSecret(created);
  if (!secret) throw new BillingError("Nao foi possivel iniciar o pagamento.", 502);

  await applySubscriptionSnapshot({
    userId: user.id,
    email: user.email,
    stripeCustomerId: customer.stripeCustomerId,
    subscription: created
  });

  return { ...secret, publishableKey: publishableKey() };
};

export const userFromCheckoutStart = async (startToken?: string) => {
  const start = await findCheckoutStart(startToken?.trim() ?? "");
  if (!start) throw new BillingError("Este link de pagamento expirou. Abra de novo pelo app.", 401);
  const user = await findUserById(start.userId);
  if (!user) throw new BillingError("Nao encontramos esta conta.", 401);
  return user;
};

export const createCheckoutLink = async (user: StoredUser, input?: { source?: string }) => {
  const subscription = await subscriptionForUser(user);
  if (subscription.accessGranted) {
    throw new BillingError("Sua conta ja tem acesso liberado.", 409);
  }
  const token = await createCheckoutStart(user.id);
  const origin = firstWebOrigin();
  const mobile = input?.source === "mobile" ? "&source=mobile" : "";
  return { url: `${origin}/billing/checkout?start=${token}${mobile}` };
};

export const createCheckoutSession = async (user: StoredUser, input?: { source?: string }) => {
  if (input?.source === "mobile") return createCheckoutLink(user, input);
  return createSubscriptionElements(user);
};

export const syncSubscriptionFromStripe = async (user: StoredUser) => {
  const customer = await findCustomerByUserId(user.id);
  if (!customer?.stripeSubscriptionId) {
    throw new BillingError("Nenhuma assinatura para sincronizar.", 400);
  }
  const subscription = await getStripe().subscriptions.retrieve(customer.stripeSubscriptionId);
  await applySubscriptionSnapshot({
    userId: user.id,
    email: user.email,
    stripeCustomerId: customer.stripeCustomerId,
    subscription
  });
  return subscriptionForUser(user);
};

export const createPortalSession = async (user: StoredUser) => {
  const customer = await findCustomerByUserId(user.id);
  if (!customer?.stripeCustomerId) {
    throw new BillingError("Nenhuma assinatura para gerenciar ainda.", 400);
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: `${firstWebOrigin()}/?profile=1`
  });

  if (!session.url) throw new BillingError("Nao foi possivel abrir o portal.", 502);
  return { url: session.url };
};

export { hasAppAccess };
