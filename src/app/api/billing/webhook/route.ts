import { env } from "@/lib/env";
import { verifyWebhook } from "@/lib/billing/stripe";
import { handleStripeEvent, type StripeEventPayload } from "@/lib/billing/webhook";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook — the durable plan sync (activation, renewal, plan change, failed payment,
 * cancellation). No-ops safely when STRIPE_WEBHOOK_SECRET isn't set. Returns 500 when applying an
 * event fails so Stripe retries it; handling is idempotent per event id, so retries are safe.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  const payload = await req.text();
  if (!secret) return new Response("ok", { status: 200 });
  if (!verifyWebhook(payload, req.headers.get("stripe-signature"), secret)) {
    return new Response("bad signature", { status: 400 });
  }

  let event: StripeEventPayload;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    console.error(`[billing] webhook ${event.type ?? "?"} ${event.id ?? "?"} failed:`, err);
    return new Response("error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
