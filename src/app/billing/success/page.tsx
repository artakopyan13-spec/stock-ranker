import Link from "next/link";
import { currentUser } from "@/auth";
import { retrieveSession } from "@/lib/billing/stripe";
import { applyPlan } from "@/lib/billing/apply";
import { getPlan, billingConfigured } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Post-checkout landing. Verifies the Stripe session server-side, activates the plan for the
 * signed-in user (only if the session was for them), and confirms. The webhook is the durable
 * source of truth; this just gives instant feedback and covers the common happy path.
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
      if (s.paid && s.userId === user.id && s.planId) {
        await applyPlan(user.id, s.planId, { customerId: s.customerId });
        planName = getPlan(s.planId).name;
        ok = true;
      } else if (s.paid && s.userId !== user.id) {
        msg = "This checkout belongs to a different account.";
      }
    } catch {
      /* fall through to the default message */
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
