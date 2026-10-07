import crypto from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { verifyWebhook, parseSubscription, invoiceSubscriptionId } from "@/lib/billing/stripe";
import { activateCheckoutOnce } from "@/lib/billing/apply";
import { handleStripeEvent } from "@/lib/billing/webhook";
import { capsFor, effectivePlanId, PLAN_GRACE_MS } from "@/lib/plans";
import { gateFreshAnalysis } from "@/lib/quota/gate";
import { setSetting } from "@/lib/quota/settings";
import { ipKey } from "@/lib/request";
import { rateFor, usdFor } from "@/lib/ai/pricing";
import { truncateAll } from "./helpers";

const DAY = 86_400_000;
const sign = (payload: string, secret: string, t: number) =>
  crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");

describe("verifyWebhook", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_1" });
  const now = 1_800_000_000;

  it("accepts a fresh, correctly signed payload", () => {
    expect(verifyWebhook(payload, `t=${now},v1=${sign(payload, secret, now)}`, secret, now)).toBe(true);
  });
  it("accepts a match on any v1 (secret rotation), not just the last", () => {
    const header = `t=${now},v1=${sign(payload, secret, now)},v1=${"0".repeat(64)}`;
    expect(verifyWebhook(payload, header, secret, now)).toBe(true);
  });
  it("rejects stale or future timestamps beyond the 300s tolerance", () => {
    const old = now - 301;
    expect(verifyWebhook(payload, `t=${old},v1=${sign(payload, secret, old)}`, secret, now)).toBe(false);
    const future = now + 301;
    expect(verifyWebhook(payload, `t=${future},v1=${sign(payload, secret, future)}`, secret, now)).toBe(false);
  });
  it("rejects a wrong signature, a tampered payload and a missing header", () => {
    expect(verifyWebhook(payload, `t=${now},v1=${sign(payload, "other", now)}`, secret, now)).toBe(false);
    expect(verifyWebhook(payload + " ", `t=${now},v1=${sign(payload, secret, now)}`, secret, now)).toBe(false);
    expect(verifyWebhook(payload, null, secret, now)).toBe(false);
    expect(verifyWebhook(payload, `t=${now}`, secret, now)).toBe(false);
  });
});

describe("plan expiry and caps", () => {
  const now = new Date("2026-10-07T12:00:00Z");

  it("keeps a paid plan inside the grace window and drops it to Free after", () => {
    expect(effectivePlanId({ plan: "pro", planRenewsAt: new Date(now.getTime() - DAY) }, now)).toBe("pro");
    expect(effectivePlanId({ plan: "pro", planRenewsAt: new Date(now.getTime() - PLAN_GRACE_MS - 1000) }, now)).toBe("free");
    expect(effectivePlanId({ plan: "pro", planRenewsAt: null }, now)).toBe("pro"); // no recorded period = no expiry
  });
  it("lapsed plans lose paid features; admins are unaffected", () => {
    const lapsed = { plan: "elite", planRenewsAt: new Date(now.getTime() - 10 * DAY) };
    expect(capsFor(lapsed, { now }).unlimited).toBe(false);
    expect(capsFor(lapsed, { now }).committee).toBe(false);
    expect(capsFor({ ...lapsed, role: "admin" }, { now }).unlimited).toBe(true);
  });
  it("takes the Free daily quota from the admin/env limit", () => {
    expect(capsFor({ plan: "free" }, { freeDailyFresh: 7 }).freshPerDay).toBe(7);
    expect(capsFor({ plan: "investor" }, { freeDailyFresh: 7 }).freshPerDay).toBe(25);
  });
});

describe("Stripe payload shapes", () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_PRO = "price_pro";
    process.env.STRIPE_PRICE_INVESTOR = "price_investor";
    resetEnvCache();
  });

  it("parses plan from the live price id (pre-basil) and falls back to metadata", () => {
    const sub = parseSubscription({ id: "sub_1", status: "active", customer: "cus_1", current_period_end: 1_800_000_000, metadata: { userId: "u1", plan: "investor" }, items: { data: [{ price: { id: "price_pro" } }] } });
    expect(sub).toMatchObject({ planId: "pro", userId: "u1", customerId: "cus_1" });
    expect(sub.periodEnd?.getTime()).toBe(1_800_000_000_000);
    expect(parseSubscription({ id: "s", status: "active", metadata: { plan: "investor" }, items: { data: [{ price: { id: "price_unknown" } }] } }).planId).toBe("investor");
  });
  it("reads the period end from the subscription item (basil)", () => {
    const sub = parseSubscription({ id: "s", status: "active", items: { data: [{ price: "price_pro", current_period_end: 1_900_000_000 }] } });
    expect(sub.periodEnd?.getTime()).toBe(1_900_000_000_000);
  });
  it("finds an invoice's subscription in both the old and the parent.subscription_details shape", () => {
    expect(invoiceSubscriptionId({ subscription: "sub_old" })).toBe("sub_old");
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_new" } } })).toBe("sub_new");
  });
});

describe("webhook + checkout activation", () => {
  let subs: Record<string, Record<string, unknown>>;

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_PRICE_PRO = "price_pro";
    process.env.STRIPE_PRICE_INVESTOR = "price_investor";
    resetEnvCache();
    await truncateAll();
    await db().stripeEvent.deleteMany();
    await db().processedCheckout.deleteMany();
    subs = {};
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["Stripe-Version"]).toBeTruthy();
      const u = new URL(url);
      const m = u.pathname.match(/\/v1\/subscriptions\/(.+)$/);
      if (m) return Response.json(subs[m[1]] ?? { error: { message: "No such subscription" } }, { status: subs[m[1]] ? 200 : 404 });
      if (u.pathname === "/v1/subscriptions") {
        const customer = u.searchParams.get("customer");
        return Response.json({ data: Object.values(subs).filter((s) => s.customer === customer) });
      }
      return Response.json({ error: { message: "unexpected" } }, { status: 500 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await resetDb();
  });

  async function makeUser(plan = "free"): Promise<string> {
    return (await db().user.create({ data: { email: `${Math.random()}@x.com`, plan, stripeCustomerId: "cus_1" } })).id;
  }
  const sub = (status: string, userId: string, price = "price_pro") => ({
    id: "sub_1", status, customer: "cus_1", current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    metadata: { userId, plan: "investor" }, items: { data: [{ price: { id: price } }] },
  });

  it("subscription.updated active → plan from price; past_due → Free", async () => {
    const id = await makeUser();
    subs.sub_1 = sub("active", id);
    await handleStripeEvent({ id: "evt_a", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
    let u = await db().user.findUniqueOrThrow({ where: { id } });
    expect(u.plan).toBe("pro");
    expect(u.planRenewsAt!.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);

    subs.sub_1 = sub("past_due", id);
    await handleStripeEvent({ id: "evt_b", type: "invoice.payment_failed", data: { object: { parent: { subscription_details: { subscription: "sub_1" } } } } });
    u = await db().user.findUniqueOrThrow({ where: { id } });
    expect(u.plan).toBe("free");
  });

  it("is idempotent per event id", async () => {
    const id = await makeUser();
    subs.sub_1 = sub("active", id);
    expect(await handleStripeEvent({ id: "evt_dup", type: "invoice.paid", data: { object: { subscription: "sub_1" } } })).toBe("processed");
    await db().user.update({ where: { id }, data: { plan: "free" } });
    expect(await handleStripeEvent({ id: "evt_dup", type: "invoice.paid", data: { object: { subscription: "sub_1" } } })).toBe("duplicate");
    expect((await db().user.findUniqueOrThrow({ where: { id } })).plan).toBe("free");
  });

  it("throws (→ 500, Stripe retries) and records nothing when the subscription can't be read", async () => {
    await expect(handleStripeEvent({ id: "evt_err", type: "customer.subscription.updated", data: { object: { id: "sub_missing" } } })).rejects.toThrow();
    expect(await db().stripeEvent.findUnique({ where: { id: "evt_err" } })).toBeNull();
  });

  it("a checkout session can only grant a plan once", async () => {
    const id = await makeUser();
    expect(await activateCheckoutOnce("cs_1", id, "pro")).toBe(true);
    await db().user.update({ where: { id }, data: { plan: "free" } }); // later downgrade
    expect(await activateCheckoutOnce("cs_1", id, "pro")).toBe(false); // reloading the old success link
    expect((await db().user.findUniqueOrThrow({ where: { id } })).plan).toBe("free");
  });
});

describe("gate quota rules", () => {
  beforeEach(async () => {
    process.env.FREE_DAILY_FRESH_ANALYSES = "3";
    process.env.RATE_LIMIT_PER_MIN = "999";
    process.env.MAX_ANALYSES_PER_DAY = "999";
    process.env.DAILY_SPEND_CEILING_USD = "999";
    resetEnvCache();
    await truncateAll();
  });

  const use = (userId: string, n: number) =>
    db().usageLog.createMany({ data: Array.from({ length: n }, () => ({ kind: "analysis", model: "m", inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, usd: 0.01, userId })) });

  it("the admin Free/user/day setting changes the free quota live", async () => {
    const id = (await db().user.create({ data: { email: "f@x.com" } })).id;
    await setSetting("free_daily_fresh_analyses", "1");
    await use(id, 1);
    const g = await gateFreshAnalysis({ userId: id, ip: "1.1.1.1" });
    expect(g.allow).toBe(false);
  });

  it("a per-user override can't lower a paid plan's quota", async () => {
    const id = (await db().user.create({ data: { email: "p@x.com", plan: "investor", planRenewsAt: new Date(Date.now() + 10 * DAY), dailyQuota: 2 } })).id;
    await use(id, 5);
    const g = await gateFreshAnalysis({ userId: id, ip: "1.1.1.1" });
    expect(g.allow).toBe(true);
    if (g.allow) expect(g.remainingToday).toBe(20);
  });

  it("a lapsed paid plan gets the Free quota", async () => {
    const id = (await db().user.create({ data: { email: "l@x.com", plan: "pro", planRenewsAt: new Date(Date.now() - 10 * DAY) } })).id;
    await use(id, 3);
    const g = await gateFreshAnalysis({ userId: id, ip: "1.1.1.1" });
    expect(g.allow).toBe(false);
  });
});

describe("ipKey", () => {
  it("passes IPv4 through and groups IPv6 by /64", () => {
    expect(ipKey("203.0.113.9")).toBe("203.0.113.9");
    expect(ipKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(ipKey("2001:db8:abcd:12:1111:2222:3333:4444")).toBe("2001:db8:abcd:12::/64");
    expect(ipKey("2001:db8:abcd:0012::1")).toBe("2001:db8:abcd:12::/64");
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });
});

describe("pricing", () => {
  it("prices claude-opus-5-5 at its own rate, not the claude-opus-5 prefix", () => {
    expect(rateFor("claude-opus-5-5")).toMatchObject({ input: 4, output: 20 });
    expect(rateFor("claude-opus-5")).toMatchObject({ input: 5, output: 25 });
    expect(usdFor("claude-opus-5-5", { inputTokens: 0, cacheReadTokens: 1e6, cacheWriteTokens: 0, outputTokens: 0 })).toBeCloseTo(0.2);
  });
  it("falls back to a mid-tier rate for unknown models", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(rateFor("claude-mystery-9")).toMatchObject({ input: 2, output: 10 });
    rateFor("claude-mystery-9");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
