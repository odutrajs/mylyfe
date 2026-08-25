import type Stripe from "stripe";
import { applyCheckoutSession, applyStripeSubscriptionObject, getStripe } from "./billing-service.js";
import { hasProcessedStripeEvent, markStripeEventProcessed } from "./billing-store.js";

const subscriptionIdFromInvoice = (invoice: Stripe.Invoice) => {
  const legacy = (invoice as { subscription?: string | { id: string } }).subscription;
  if (typeof legacy === "string" && legacy) return legacy;
  if (legacy && typeof legacy === "object" && legacy.id) return legacy.id;
  const parent = (
    invoice as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }
  ).parent?.subscription_details?.subscription;
  if (typeof parent === "string") return parent;
  if (parent && typeof parent === "object") return parent.id;
  return undefined;
};

const customerIdFromInvoice = (invoice: Stripe.Invoice) =>
  typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

export const processStripeEvent = async (event: Stripe.Event) => {
  if (await hasProcessedStripeEvent(event.id)) {
    return { ok: true, duplicate: true };
  }

  switch (event.type) {
    case "checkout.session.completed":
      await applyCheckoutSession(event.data.object as Stripe.Checkout.Session);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applyStripeSubscriptionObject(event.data.object as Stripe.Subscription);
      break;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = subscriptionIdFromInvoice(invoice);
      if (subscriptionId) {
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        await applyStripeSubscriptionObject(subscription);
        break;
      }
      const customerId = customerIdFromInvoice(invoice);
      if (customerId && event.type === "invoice.payment_failed") {
        const { findCustomerByStripeId, upsertCustomer } = await import("./billing-store.js");
        const existing = await findCustomerByStripeId(customerId);
        if (existing && existing.status !== "allowlisted") {
          await upsertCustomer({ ...existing, status: "past_due" });
        }
      }
      break;
    }
    default:
      break;
  }

  await markStripeEventProcessed(event.id, event.type);
  return { ok: true, duplicate: false };
};

export const handleStripeWebhook = async (rawBody: Buffer, signature: string) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Webhook Stripe nao configurado.");
  if (!signature) throw new Error("Assinatura Stripe ausente.");

  const event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  return processStripeEvent(event);
};
