/**
 * Subscription plans. One source of truth for pricing, per-plan limits, and which of the app's
 * best features each tier unlocks. The gate (src/lib/quota/gate.ts) enforces the numeric limits;
 * the pricing page renders these definitions; billing maps a plan to its Stripe price id at runtime.
 *
 * Design: Free is a real taste of the product; each paid step up removes a limit and unlocks a
 * flagship feature (Investment Committee → deep analysis → truly unlimited), so there is a clear
 * reason to climb. Admins are always unlimited regardless of plan (handled in the gate).
 */
import { env } from "@/lib/env";

export type PlanId = "free" | "investor" | "pro" | "elite";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number; // USD/mo (0 = free)
  highlight?: boolean; // "Most popular" badge
  anchor?: boolean; // premium anchor tier
  freshPerDay: number; // fresh AI analyses / day
  chatPerDay: number; // Wall Street Einstein + copilot messages / day
  unlimited: boolean; // truly unlimited AI (still bounded by the global safety ceiling)
  committee: boolean; // Investment Committee (5 AI analysts) unlocked
  deepAnalysis: boolean; // highest-effort analysis model
  perks: string[]; // bullets shown on the pricing card
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Starter",
    tagline: "Kick the tires. Free forever.",
    priceMonthly: 0,
    freshPerDay: 3,
    chatPerDay: 25,
    unlimited: false,
    committee: false,
    deepAnalysis: false,
    perks: [
      "3 fresh AI analyses / day",
      "25 Wall Street Einstein messages / day",
      "Full Scorecard on any stock",
      "1 watchlist",
      "Screener (view only)",
    ],
  },
  {
    id: "investor",
    name: "Investor",
    tagline: "For people who check before they buy.",
    priceMonthly: 9,
    freshPerDay: 25,
    chatPerDay: 200,
    unlimited: false,
    committee: true,
    deepAnalysis: false,
    perks: [
      "Everything in Starter, plus:",
      "25 fresh analyses / day",
      "200 Einstein messages / day",
      "🧠 Investment Committee — 5 AI analysts debate every stock",
      "Unlimited watchlists",
      "Portfolio X-ray",
      "Price & earnings alerts",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "The serious researcher's toolkit.",
    priceMonthly: 19,
    highlight: true,
    freshPerDay: 100,
    chatPerDay: 1000,
    unlimited: false,
    committee: true,
    deepAnalysis: true,
    perks: [
      "Everything in Investor, plus:",
      "100 fresh analyses / day",
      "Unlimited Einstein chat*",
      "Deep analysis — highest-effort model",
      "Compare stocks side-by-side",
      "CSV / data export",
      "Priority in the analysis queue",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    tagline: "No limits. No waiting. Everything.",
    priceMonthly: 49,
    anchor: true,
    freshPerDay: 100000,
    chatPerDay: 100000,
    unlimited: true,
    committee: true,
    deepAnalysis: true,
    perks: [
      "Everything in Pro, plus:",
      "Truly unlimited analyses & chat",
      "Fastest, deepest analysis",
      "Early access to new features",
      "Priority support",
      "Founding-member badge",
    ],
  },
];

const BY_ID = new Map(PLANS.map((p) => [p.id, p]));

export function getPlan(id: string | null | undefined): Plan {
  return (id && BY_ID.get(id as PlanId)) || PLANS[0];
}

export const PAID_PLAN_IDS: PlanId[] = ["investor", "pro", "elite"];

export function isPaidPlan(id: string | null | undefined): boolean {
  return PAID_PLAN_IDS.includes(id as PlanId);
}

/** How long a paid plan survives past its recorded period end (renewal webhook lag, dunning retries). */
export const PLAN_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The plan actually in force: a paid plan whose period ended more than PLAN_GRACE_MS ago counts as
 * Free (missed/failed renewal). A null planRenewsAt means "no expiry" (e.g. a manually granted plan).
 */
export function effectivePlanId(user: { plan?: string | null; planRenewsAt?: Date | null }, now = new Date()): PlanId {
  const p = getPlan(user.plan);
  if (p.id !== "free" && user.planRenewsAt && user.planRenewsAt.getTime() + PLAN_GRACE_MS < now.getTime()) return "free";
  return p.id;
}

/**
 * Effective capabilities for a user, with admins always unlimited. Pass planRenewsAt so lapsed plans
 * expire, and freeDailyFresh (effectiveLimits().freeDailyFresh) so the admin/env Free quota applies.
 */
export function capsFor(
  user: { role?: string | null; plan?: string | null; planRenewsAt?: Date | null },
  opts: { freeDailyFresh?: number; now?: Date } = {},
): {
  planId: PlanId;
  freshPerDay: number;
  chatPerDay: number;
  unlimited: boolean;
  committee: boolean;
  deepAnalysis: boolean;
} {
  if (user.role === "admin") {
    return { planId: "elite", freshPerDay: Infinity, chatPerDay: Infinity, unlimited: true, committee: true, deepAnalysis: true };
  }
  const p = getPlan(effectivePlanId(user, opts.now));
  const fresh = p.id === "free" && opts.freeDailyFresh !== undefined ? opts.freeDailyFresh : p.freshPerDay;
  return {
    planId: p.id,
    freshPerDay: p.unlimited ? Infinity : fresh,
    chatPerDay: p.unlimited ? Infinity : p.chatPerDay,
    unlimited: p.unlimited,
    committee: p.committee,
    deepAnalysis: p.deepAnalysis,
  };
}

/** Stripe price id for a paid plan, from env. Returns undefined if billing isn't configured. */
export function priceIdFor(id: PlanId): string | undefined {
  const e = env();
  return id === "investor" ? e.STRIPE_PRICE_INVESTOR : id === "pro" ? e.STRIPE_PRICE_PRO : id === "elite" ? e.STRIPE_PRICE_ELITE : undefined;
}

/** Reverse of priceIdFor: which paid plan a Stripe price id belongs to (null if it isn't ours). */
export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  return PAID_PLAN_IDS.find((id) => priceIdFor(id) === priceId) ?? null;
}

/** Billing is live only when a secret key and at least one price id are configured. */
export function billingConfigured(): boolean {
  const e = env();
  return Boolean(e.STRIPE_SECRET_KEY && (e.STRIPE_PRICE_INVESTOR || e.STRIPE_PRICE_PRO || e.STRIPE_PRICE_ELITE));
}
