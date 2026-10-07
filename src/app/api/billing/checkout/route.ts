import { z } from "zod";
import { currentUser } from "@/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { billingConfigured, effectivePlanId, isPaidPlan, priceIdFor, type PlanId } from "@/lib/plans";
import { createCheckoutSession, hasActiveSubscription } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

const Body = z.object({ plan: z.enum(["investor", "pro", "elite"]) });

const ALREADY_SUBSCRIBED = "You already have an active subscription. Use “Manage subscription” to switch plans or cancel.";

/**
 * Start a Stripe Checkout Session for the chosen plan; returns the hosted checkout URL. Refuses
 * (409) when the user already pays — a second subscription would double-bill them, and cancelling
 * either one would drop them to Free. Plan changes go through the Billing Portal instead.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to upgrade." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isPaidPlan(parsed.data.plan)) return Response.json({ error: "Pick a valid plan." }, { status: 400 });

  if (!billingConfigured()) {
    return Response.json({ error: "Payments aren't switched on yet. Check back soon." }, { status: 503 });
  }
  const planId = parsed.data.plan as PlanId;
  const priceId = priceIdFor(planId);
  if (!priceId) return Response.json({ error: "That plan isn't available yet." }, { status: 503 });

  const row = await db().user.findUnique({
    where: { id: user.id },
    select: { email: true, stripeCustomerId: true, plan: true, planRenewsAt: true },
  });
  if (row && isPaidPlan(effectivePlanId(row))) {
    return Response.json({ error: ALREADY_SUBSCRIBED, manage: true }, { status: 409 });
  }
  const base = env().APP_URL.replace(/\/$/, "");
  try {
    // Our plan column can lag Stripe (webhook delay); ask Stripe directly before opening a second one.
    if (row?.stripeCustomerId && (await hasActiveSubscription(row.stripeCustomerId))) {
      return Response.json({ error: ALREADY_SUBSCRIBED, manage: true }, { status: 409 });
    }
    const url = await createCheckoutSession({
      priceId,
      planId,
      userId: user.id,
      email: row?.email,
      customerId: row?.stripeCustomerId,
      successUrl: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/pricing?canceled=1`,
    });
    return Response.json({ url });
  } catch (err) {
    console.error("[billing] checkout failed:", err);
    return Response.json({ error: "Could not start checkout. Please try again in a moment." }, { status: 500 });
  }
}
