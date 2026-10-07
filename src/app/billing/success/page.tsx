import Link from "next/link";
import { currentUser } from "@/auth";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, retrieveSession, retrieveSubscription } from "@/lib/billing/stripe";
import { activateCheckoutOnce } from "@/lib/billing/apply";
import { getPlan, billingConfigured, effectivePlanId, isPaidPlan } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Post-checkout landing. Verifies the Stripe session server-side and activates the plan for the
 * signed-in user — only if the session was for them, its subscription is active right now, and the
 * session hasn't been used before (a completed session stays "complete" forever, so reloading an old
 * link must not re-grant a plan). The webhook is the durable source of truth; this just gives
 * instant feedback on the happy path.
 */
export default async function BillingSuccess({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  const user = await currentUser();

  let planName = "";
  let ok = false;
  let msg = "We couldn't confirm this checkout. If you were charged, your plan will activate shortly.";

  if (billingConfigured() && session_id && user) {
    try {
      const s = await retrieveSession(session_id);
      if (s.complete && s.userId !== user.id) {
        msg = "This checkout belongs to a different account.";
      } else if (s.complete && s.subscriptionId) {
        const sub = await retrieveSubscription(s.subscriptionId);
        if (ACTIVE_STATUSES.includes(sub.status) && sub.planId) {
          const applied = await activateCheckoutOnce(session_id, user.id, sub.planId, {
            customerId: sub.customerId ?? s.customerId,
            renewsAt: sub.periodEnd,
          });
          // Already processed (e.g. by the webhook): report the plan actually in force, never re-apply.
          const row = applied ? null : await db().user.findUnique({ where: { id: user.id }, select: { plan: true, planRenewsAt: true } });
          const planId = applied ? sub.planId : row ? effectivePlanId(row) : "free";
          if (isPaidPlan(planId)) {
            planName = getPlan(planId).name;
            ok = true;
          } else {
            msg = "This checkout link has already been used. Pick a plan to subscribe again.";
          }
        } else {
          msg = "This subscription is no longer active. Pick a plan to subscribe again.";
        }
      }
    } catch (err) {
      console.error("[billing] success page could not confirm checkout:", err);
    }
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4">{ok ? "🎉" : "🧾"}</div>
      <h1 className="text-2xl font-bold mb-2">{ok ? `Welcome to ${planName}!` : "Almost there"}</h1>
      <p className="text-muted">
        {ok
          ? "Your plan is active. Enjoy the higher limits, the Investment Committee, and everything else it unlocks."
          : msg}
      </p>
      <div className="mt-8 flex gap-3 justify-center">
        <Link href="/" className="btn btn-primary no-underline">Start analyzing →</Link>
        <Link href="/pricing" className="btn no-underline">View plans</Link>
      </div>
    </main>
  );
}
