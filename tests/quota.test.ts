import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { setAnthropicClient } from "@/lib/ai/client";
import { setAdapter } from "@/lib/data";
import { FixtureAdapter } from "@/lib/data/adapters/fixture";
import { gateFreshAnalysis } from "@/lib/quota/gate";
import { spendToday, analysesToday } from "@/lib/quota/spend";
import { setSetting } from "@/lib/quota/settings";
import { getOrCreateAnalysis, FreshAnalysisDeniedError } from "@/lib/analysis/service";
import { usdFor } from "@/lib/ai/pricing";
import { fakeAnthropic, loadYahooFixture, sampleModelOutput, truncateAll } from "./helpers";

const { data } = loadYahooFixture();
const PER_ANALYSIS = usdFor("claude-opus-5", { inputTokens: 5000, cacheReadTokens: 3500, cacheWriteTokens: 0, outputTokens: 2000 });

async function clean(): Promise<void> {
  await truncateAll();
}

async function makeUser(email: string, opts: { banned?: boolean; quota?: number | null } = {}): Promise<string> {
  const u = await db().user.create({ data: { email, name: email.split("@")[0], banned: opts.banned ?? false, dailyQuota: opts.quota ?? null } });
  return u.id;
}

describe("fresh-analysis gate", () => {
  beforeEach(async () => {
    resetEnvCache();
    process.env.FREE_DAILY_FRESH_ANALYSES = "3";
    process.env.DAILY_SPEND_CEILING_USD = "15";
    process.env.MAX_ANALYSES_PER_DAY = "200";
    process.env.RATE_LIMIT_PER_MIN = "20";
    resetEnvCache();
    setAdapter(new FixtureAdapter());
    setAnthropicClient(fakeAnthropic(sampleModelOutput(data)).client);
    await clean();
  });
  afterAll(async () => {
    setAnthropicClient(null);
    await resetDb();
  });

  it("requires login for a fresh analysis", async () => {
    const g = await gateFreshAnalysis({ userId: null, ip: "1.1.1.1" });
    expect(g.allow).toBe(false);
    if (!g.allow) expect(g.reason).toBe("login_required");
  });

  it("blocks banned users", async () => {
    const id = await makeUser("banned@x.com", { banned: true });
    const g = await gateFreshAnalysis({ userId: id, ip: "1.1.1.1" });
    expect(g.allow).toBe(false);
    if (!g.allow) expect(g.reason).toBe("banned");
  });

  it("allows within quota and denies past the per-user quota", async () => {
    const id = await makeUser("u@x.com");
    for (let i = 0; i < 3; i++) {
      const g = await gateFreshAnalysis({ userId: id, ip: "1.1.1.1" });
      expect(g.allow).toBe(true);
      await db().usageLog.create({ data: { kind: "analysis", model: "claude-opus-5", inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, usd: PER_ANALYSIS, userId: id } });
    }
    const denied = await gateFreshAnalysis({ userId: id, ip: "1.1.1.1" });
    expect(denied.allow).toBe(false);
    if (!denied.allow) expect(denied.reason).toBe("user_quota");
  });

  it("respects an admin per-user quota override without a redeploy", async () => {
    const id = await makeUser("vip@x.com", { quota: 1 });
    await db().usageLog.create({ data: { kind: "analysis", model: "claude-opus-5", inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, usd: PER_ANALYSIS, userId: id } });
    const g = await gateFreshAnalysis({ userId: id, ip: "1.1.1.1" });
    expect(g.allow).toBe(false);
    if (!g.allow) expect(g.reason).toBe("user_quota");
  });

  it("pauses everyone when the manual kill switch is on (admin setting)", async () => {
    const id = await makeUser("a@x.com");
    await setSetting("kill_switch_manual", "true");
    const g = await gateFreshAnalysis({ userId: id, ip: "1.1.1.1" });
    expect(g.allow).toBe(false);
    if (!g.allow) expect(g.reason).toBe("kill_switch");
  });

  it("rate-limits a single user hammering the endpoint", async () => {
    process.env.RATE_LIMIT_PER_MIN = "2";
    resetEnvCache();
    const id = await makeUser("fast@x.com", { quota: 999 });
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await gateFreshAnalysis({ userId: id, ip: "1.1.1.1" }));
    expect(results.filter((r) => !r.allow && r.reason === "rate_limit").length).toBeGreaterThan(0);
  });
});

describe("load test: 1,000 users cannot exceed the spend ceiling or the daily cap", () => {
  beforeEach(async () => {
    resetEnvCache();
    setAdapter(new FixtureAdapter());
    setAnthropicClient(fakeAnthropic(sampleModelOutput(data)).client);
    await clean();
  });
  afterAll(async () => {
    setAnthropicClient(null);
    await resetDb();
  });

  async function stampede(users: number, attemptsEach: number): Promise<{ ran: number; denied: number }> {
    let ran = 0;
    let denied = 0;
    for (let u = 0; u < users; u++) {
      const id = await makeUser(`load${u}@x.com`);
      for (let a = 0; a < attemptsEach; a++) {
        try {
          const before = await analysesToday();
          await getOrCreateAnalysis("NVDA", { force: true, userId: id, ip: `10.0.${u % 255}.${a}` });
          const after = await analysesToday();
          if (after > before) ran++;
          else denied++; // served cached (degraded) — no new paid analysis
        } catch (err) {
          if (err instanceof FreshAnalysisDeniedError) denied++;
          else throw err;
        }
      }
    }
    return { ran, denied };
  }

  it("stops at the global daily cap regardless of user count", async () => {
    process.env.MAX_ANALYSES_PER_DAY = "40";
    process.env.DAILY_SPEND_CEILING_USD = "9999";
    process.env.FREE_DAILY_FRESH_ANALYSES = "3";
    process.env.RATE_LIMIT_PER_MIN = "9999";
    resetEnvCache();

    const { ran } = await stampede(1000, 3); // 3,000 attempts from 1,000 users
    const count = await analysesToday();
    expect(count).toBe(40); // exactly the cap — never one more
    expect(ran).toBe(40);
    // No single user got more than their quota of 3.
    const perUser = await db().usageLog.groupBy({ by: ["userId"], _count: true, where: { kind: "analysis" } });
    expect(Math.max(...perUser.map((g) => g._count))).toBeLessThanOrEqual(3);
  }, 60_000);

  it("stops at the dollar spend ceiling, degrading everyone else to cached", async () => {
    process.env.MAX_ANALYSES_PER_DAY = "99999";
    process.env.DAILY_SPEND_CEILING_USD = "0.50";
    process.env.FREE_DAILY_FRESH_ANALYSES = "3";
    process.env.RATE_LIMIT_PER_MIN = "9999";
    resetEnvCache();

    const { ran, denied } = await stampede(1000, 3);
    const spend = await spendToday();
    // The ceiling is checked before each run, so spend can overshoot by at most one analysis.
    expect(spend).toBeLessThanOrEqual(0.5 + PER_ANALYSIS * 1.01);
    expect(ran).toBeLessThan(20); // ~7 analyses fit under $0.50; nowhere near 3,000
    expect(denied).toBeGreaterThan(2900); // everyone else got cached results, no error
  }, 60_000);
});
