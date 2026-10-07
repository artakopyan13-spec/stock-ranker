import { currentUser } from "@/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { billingConfigured } from "@/lib/plans";
import { createPortalSession } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

/** Open the Stripe Billing Portal (switch plan, update card, cancel) for the signed-in customer. */
export async function POST(): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to manage your subscription." }, { status: 401 });
  if (!billingConfigured()) {
    return Response.json({ error: "Payments aren't switched on yet. Check back soon." }, { status: 503 });
  }
  const row = await db().user.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true } });
  if (!row?.stripeCustomerId) return Response.json({ error: "There's no subscription on this account yet." }, { status: 400 });

  const base = env().APP_URL.replace(/\/$/, "");
  try {
    const url = await createPortalSession(row.stripeCustomerId, `${base}/pricing`);
    return Response.json({ url });
  } catch (err) {
    console.error("[billing] portal session failed:", err);
    return Response.json({ error: "Could not open subscription management. Please try again in a moment." }, { status: 500 });
  }
}
