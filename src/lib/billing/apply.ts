import { db } from "@/lib/db";
import { getPlan } from "@/lib/plans";
import { ACTIVE_STATUSES, LAPSED_STATUSES, hasActiveSubscription, type SubscriptionInfo } from "@/lib/billing/stripe";

type PlanExtra = { customerId?: string | null; renewsAt?: Date | null };

function planData(planId: string, extra?: PlanExtra) {
  const plan = getPlan(planId);
  return {
    plan: plan.id,
    planRenewsAt: extra?.renewsAt ?? new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
    ...(extra?.customerId ? { stripeCustomerId: extra.customerId } : {}),
  };
}

/** Set a user's plan after a confirmed payment. Idempotent; safe to call from success + webhook. */
export async function applyPlan(userId: string, planId: string, extra?: PlanExtra): Promise<void> {
  await db().user.update({ where: { id: userId }, data: planData(planId, extra) });
}

/** Drop a user back to Free (subscription canceled / expired). */
export async function downgradeCustomer(customerId: string): Promise<void> {
  await db().user.updateMany({ where: { stripeCustomerId: customerId }, data: { plan: "free", planRenewsAt: null } });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/**
 * Turn a Checkout Session into a plan exactly once. Records the session id and sets the plan in one
 * transaction; returns false (and changes nothing) when the session was already processed, so an
 * old /billing/success link can never re-grant a plan after a downgrade.
 */
export async function activateCheckoutOnce(sessionId: string, userId: string, planId: string, extra?: PlanExtra): Promise<boolean> {
  try {
    await db().$transaction([
      db().processedCheckout.create({ data: { sessionId, userId } }),
      db().user.update({ where: { id: userId }, data: planData(planId, extra) }),
    ]);
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/**
 * Make the user's plan match a subscription's live state: active/trialing → its plan through the
 * period end; lapsed → Free, unless the customer still has another active subscription. Targets the
 * userId stamped in subscription metadata at checkout, else whoever owns the Stripe customer.
 */
export async function syncSubscription(sub: SubscriptionInfo): Promise<"applied" | "downgraded" | "ignored"> {
  if (ACTIVE_STATUSES.includes(sub.status)) {
    if (!sub.planId) return "ignored";
    const data = planData(sub.planId, { customerId: sub.customerId, renewsAt: sub.periodEnd });
    if (sub.userId) {
      const res = await db().user.updateMany({ where: { id: sub.userId }, data });
      if (res.count > 0) return "applied";
    }
    if (!sub.customerId) return "ignored";
    const res = await db().user.updateMany({ where: { stripeCustomerId: sub.customerId }, data: { plan: data.plan, planRenewsAt: data.planRenewsAt } });
    return res.count > 0 ? "applied" : "ignored";
  }
  if (LAPSED_STATUSES.includes(sub.status) && sub.customerId) {
    if (await hasActiveSubscription(sub.customerId)) return "ignored";
    await downgradeCustomer(sub.customerId);
    return "downgraded";
  }
  return "ignored";
}
