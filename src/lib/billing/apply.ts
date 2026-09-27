import { db } from "@/lib/db";
import { getPlan } from "@/lib/plans";

/** Set a user's plan after a confirmed payment. Idempotent; safe to call from success + webhook. */
export async function applyPlan(
  userId: string,
  planId: string,
  extra?: { customerId?: string | null; renewsAt?: Date | null },
): Promise<void> {
  const plan = getPlan(planId);
  const renews = extra?.renewsAt ?? new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
  await db().user.update({
    where: { id: userId },
    data: {
      plan: plan.id,
      planRenewsAt: renews,
      ...(extra?.customerId ? { stripeCustomerId: extra.customerId } : {}),
    },
  });
}

/** Drop a user back to Free (subscription canceled / expired). */
export async function downgradeCustomer(customerId: string): Promise<void> {
  await db().user.updateMany({ where: { stripeCustomerId: customerId }, data: { plan: "free", planRenewsAt: null } });
}
