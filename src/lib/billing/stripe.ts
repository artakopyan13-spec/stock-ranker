/**
 * Minimal Stripe REST client (no SDK). We only need Checkout Sessions and a webhook signature
 * check, so we call the API directly with fetch and form-encoded bodies. All functions are no-ops
 * or throw a clear error when STRIPE_SECRET_KEY is missing; callers gate on billingConfigured().
 */
import crypto from "node:crypto";
import { env } from "@/lib/env";

const API = "https://api.stripe.com/v1";

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
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form,
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
  paid: boolean;
  userId: string | null;
  planId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
}

/** Fetch a Checkout Session to confirm payment and read back who/what it was for. */
export async function retrieveSession(id: string): Promise<RetrievedSession> {
  const s = await stripe(`/checkout/sessions/${encodeURIComponent(id)}`, "GET");
  const meta = (s.metadata as Record<string, string> | undefined) ?? {};
  return {
    paid: s.payment_status === "paid" || s.status === "complete",
    userId: (s.client_reference_id as string) ?? meta.userId ?? null,
    planId: meta.plan ?? null,
    customerId: (s.customer as string) ?? null,
    subscriptionId: (s.subscription as string) ?? null,
  };
}

/** Verify a Stripe webhook signature (t=timestamp,v1=hmac over `${t}.${payload}`). */
export function verifyWebhook(payload: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=")));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}
