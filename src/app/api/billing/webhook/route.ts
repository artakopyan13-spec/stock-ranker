import { env } from "@/lib/env";
import { verifyWebhook } from "@/lib/billing/stripe";
import { applyPlan, downgradeCustomer } from "@/lib/billing/apply";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook. Durable plan sync: activates on checkout/payment, downgrades on cancellation.
 * No-ops safely when STRIPE_WEBHOOK_SECRET isn't set. Always returns 200 for handled events so
 * Stripe doesn't retry forever on our own logic errors.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  const payload = await req.text();
  if (!secret) return new Response("ok", { status: 200 });
  if (!verifyWebhook(payload, req.headers.get("stripe-signature"), secret)) {
    return new Response("bad signature", { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("bad payload", { status: 400 });
  }
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const meta = (obj.metadata as Record<string, string> | undefined) ?? {};
        const userId = (obj.client_reference_id as string) ?? meta.userId;
        if (userId && meta.plan) await applyPlan(userId, meta.plan, { customerId: (obj.customer as string) ?? null });
        break;
      }
      case "customer.subscription.deleted": {
        const customer = obj.customer as string | undefined;
        if (customer) await downgradeCustomer(customer);
        break;
      }
      case "invoice.paid": {
        // Renewal: extend the current period for whoever this customer is.
        const meta = (obj.subscription_details as { metadata?: Record<string, string> } | undefined)?.metadata ?? {};
        const customer = obj.customer as string | undefined;
        if (customer && meta.userId && meta.plan) await applyPlan(meta.userId, meta.plan, { customerId: customer });
        break;
      }
    }
  } catch {
    /* swallow — a logic error shouldn't trigger infinite Stripe retries */
  }
  return new Response("ok", { status: 200 });
}
