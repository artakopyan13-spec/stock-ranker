/**
 * Minimal Stripe REST client (no SDK). We only need Checkout Sessions and a webhook signature
 * check, so we call the API directly with fetch and form-encoded bodies. All functions are no-ops
 * or throw a clear error when STRIPE_SECRET_KEY is missing; callers gate on billingConfigured().
 */
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { isPaidPlan, planForPriceId, type PlanId } from "@/lib/plans";

const API = "https://api.stripe.com/v1";
/**
 * Pinned so REST response shapes don't drift with the account default. 2025-02-24.acacia is the
 * last version before "basil" moved invoice.subscription_details under invoice.parent and
 * subscription.current_period_end onto the subscription items — the shapes this code was written
 * for. Webhook payloads use the *endpoint's* API version instead, so parsers below read both shapes.
 */
export const STRIPE_API_VERSION = "2025-02-24.acacia";
/** Reject webhook signatures whose timestamp is further than this from now (replay protection). */
const WEBHOOK_TOLERANCE_SEC = 300;

function key(): string {
  const k = env().STRIPE_SECRET_KEY;
  if (!k) throw new Error("Stripe is not configured");
  return k;
}

async function stripe(path: string, method: "GET" | "POST", form?: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key()}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form,
    signal: AbortSignal.timeout(15_000), // stay well inside the 60s function cap
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(err?.message ?? `Stripe ${res.status}`);
  }
  return json;
}

export interface CheckoutInput {
  priceId: string;
  planId: string;
  userId: string;
  email?: string | null;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

/** Create a subscription Checkout Session and return its hosted URL. */
export async function createCheckoutSession(input: CheckoutInput): Promise<string> {
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", input.priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", input.successUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("client_reference_id", input.userId);
  form.set("metadata[plan]", input.planId);
  form.set("metadata[userId]", input.userId);
  form.set("subscription_data[metadata][plan]", input.planId);
  form.set("subscription_data[metadata][userId]", input.userId);
  form.set("allow_promotion_codes", "true");
  if (input.customerId) form.set("customer", input.customerId);
  else if (input.email) form.set("customer_email", input.email);
  const session = await stripe("/checkout/sessions", "POST", form);
  return String(session.url);
}

export interface RetrievedSession {
  complete: boolean;
  userId: string | null;
  planId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
}

/**
 * Fetch a Checkout Session to read back who/what it was for. `complete` stays true forever once
 * paid, so it is NOT proof the plan is still active — check the subscription (retrieveSubscription).
 */
export async function retrieveSession(id: string): Promise<RetrievedSession> {
  const s = await stripe(`/checkout/sessions/${encodeURIComponent(id)}`, "GET");
  const meta = (s.metadata as Record<string, string> | undefined) ?? {};
  return {
    complete: s.status === "complete",
    userId: (s.client_reference_id as string) ?? meta.userId ?? null,
    planId: meta.plan ?? null,
    customerId: idOf(s.customer),
    subscriptionId: idOf(s.subscription),
  };
}

/** Subscription statuses that keep a paid plan on. */
export const ACTIVE_STATUSES = ["active", "trialing"];
/** Statuses that mean the user is no longer paying → drop to Free. (`incomplete` is left alone.) */
export const LAPSED_STATUSES = ["past_due", "unpaid", "canceled", "incomplete_expired", "paused"];

export interface SubscriptionInfo {
  id: string;
  status: string;
  customerId: string | null;
  userId: string | null;
  planId: PlanId | null;
  periodEnd: Date | null;
}

/** An expandable Stripe field is either an id string or the expanded object. */
function idOf(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") return (v as { id: string }).id;
  return null;
}

function dateOf(sec: unknown): Date | null {
  return typeof sec === "number" && Number.isFinite(sec) ? new Date(sec * 1000) : null;
}

/**
 * Normalize a subscription object (REST response or webhook payload, pre- or post-basil). The plan
 * comes from the live price id — so a plan change made in the Billing Portal is honored — and only
 * falls back to the metadata we stamped at checkout.
 */
export function parseSubscription(obj: Record<string, unknown>): SubscriptionInfo {
  const meta = (obj.metadata as Record<string, string> | undefined) ?? {};
  const item = ((obj.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [])[0];
  const priceId = idOf(item?.price);
  const metaPlan = isPaidPlan(meta.plan) ? (meta.plan as PlanId) : null;
  return {
    id: String(obj.id ?? ""),
    status: String(obj.status ?? ""),
    customerId: idOf(obj.customer),
    userId: meta.userId ?? null,
    planId: planForPriceId(priceId) ?? metaPlan,
    periodEnd: dateOf(obj.current_period_end) ?? dateOf(item?.current_period_end),
  };
}

export async function retrieveSubscription(id: string): Promise<SubscriptionInfo> {
  return parseSubscription(await stripe(`/subscriptions/${encodeURIComponent(id)}`, "GET"));
}

/** True when the customer has any active/trialing subscription (blocks a second, double-billed one). */
export async function hasActiveSubscription(customerId: string): Promise<boolean> {
  const q = new URLSearchParams({ customer: customerId, status: "all", limit: "20" });
  const res = await stripe(`/subscriptions?${q}`, "GET");
  const data = (res.data as Array<{ status?: string }> | undefined) ?? [];
  return data.some((s) => ACTIVE_STATUSES.includes(String(s.status)));
}

/** Subscription id an invoice belongs to — top-level pre-basil, under parent.subscription_details after. */
export function invoiceSubscriptionId(obj: Record<string, unknown>): string | null {
  const parent = obj.parent as { subscription_details?: { subscription?: unknown } } | undefined;
  return idOf(obj.subscription) ?? idOf(parent?.subscription_details?.subscription);
}

/** Create a Billing Portal session (manage/cancel/switch plan) and return its URL. */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const form = new URLSearchParams();
  form.set("customer", customerId);
  form.set("return_url", returnUrl);
  const session = await stripe("/billing_portal/sessions", "POST", form);
  return String(session.url);
}

/**
 * Verify a Stripe webhook signature (`t=timestamp,v1=hmac(${t}.${payload}),v1=…`). Accepts a match
 * on ANY v1 (Stripe sends several while a secret is being rolled) and rejects stale timestamps.
 */
export function verifyWebhook(payload: string, sigHeader: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!sigHeader) return false;
  let t: string | undefined;
  const sigs: string[] = [];
  for (const part of sigHeader.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") sigs.push(v);
  }
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false;
  if (Math.abs(nowSec - Number(t)) > WEBHOOK_TOLERANCE_SEC) return false;
  const expected = Buffer.from(crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"));
  let ok = false;
  for (const sig of sigs) {
    const got = Buffer.from(sig);
    if (got.length === expected.length && crypto.timingSafeEqual(expected, got)) ok = true;
  }
  return ok;
}
