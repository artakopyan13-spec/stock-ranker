import { db } from "@/lib/db";
import { activateCheckoutOnce, syncSubscription } from "@/lib/billing/apply";
import { ACTIVE_STATUSES, invoiceSubscriptionId, retrieveSubscription } from "@/lib/billing/stripe";

export interface StripeEventPayload {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
}

function prismaCode(err: unknown): unknown {
  return typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
}

/**
 * Apply one verified Stripe event. Subscription state is always re-read from the API rather than
 * trusted from the payload, so out-of-order or replayed deliveries converge on the live truth.
 * Idempotent per event.id (StripeEvent table). Throws on transient failures (DB, Stripe API) so the
 * route returns 500 and Stripe retries; the event is only recorded once it was fully applied.
 */
export async function handleStripeEvent(event: StripeEventPayload): Promise<"processed" | "duplicate" | "ignored"> {
  if (!event.id || !event.type) return "ignored";
  if (await db().stripeEvent.findUnique({ where: { id: event.id } })) return "duplicate";
  const obj = event.data?.object ?? {};

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const meta = (obj.metadata as Record<string, string> | undefined) ?? {};
        const userId = (obj.client_reference_id as string | null) ?? meta.userId;
        const subId = typeof obj.subscription === "string" ? obj.subscription : null;
        if (!userId || !subId || typeof obj.id !== "string") break;
        const sub = await retrieveSubscription(subId);
        if (ACTIVE_STATUSES.includes(sub.status) && sub.planId) {
          await activateCheckoutOnce(obj.id, userId, sub.planId, { customerId: sub.customerId, renewsAt: sub.periodEnd });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        if (typeof obj.id === "string") await syncSubscription(await retrieveSubscription(obj.id));
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        // Renewal extends the period; a failed payment moves the subscription to past_due/unpaid.
        const subId = invoiceSubscriptionId(obj);
        if (subId) await syncSubscription(await retrieveSubscription(subId));
        break;
      }
    }
  } catch (err) {
    // The user row is gone (account deleted) — nothing to update, and retrying can't help.
    if (prismaCode(err) !== "P2025") throw err;
  }

  try {
    await db().stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    if (prismaCode(err) !== "P2002") throw err; // a concurrent delivery recorded it first
  }
  return "processed";
}
