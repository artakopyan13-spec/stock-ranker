import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, resetDb } from "@/lib/db";
import { setAnthropicClient, analysesToday } from "@/lib/ai/client";
import { setAdapter } from "@/lib/data";
import { FixtureAdapter } from "@/lib/data/adapters/fixture";
import { getLatestAnalysis, getOrCreateAnalysis, type AnalysisEvent } from "@/lib/analysis/service";
import { createWatchlist } from "@/lib/watchlists";
import { getRankings, sortRows } from "@/lib/rankings";
import { buildDigest } from "@/lib/digest/build";
import { sendPendingAlerts } from "@/lib/alerts/send";
import { sendDailyDigest } from "@/lib/digest/send";
import { checkApiKey, checkCronAuth } from "@/lib/auth";
import { fakeAnthropic, loadYahooFixture, sampleModelOutput } from "./helpers";

const { data } = loadYahooFixture();

describe("end-to-end NVDA pipeline (fixture data + fake model)", () => {
  beforeAll(async () => {
    await resetDb();
    setAdapter(new FixtureAdapter());
  });
  afterAll(async () => {
    setAnthropicClient(null);
    await resetDb();
  });

  it("streams data → sections → done, verifies, stores and logs cost", async () => {
    setAnthropicClient(fakeAnthropic(sampleModelOutput(data)).client);
    const events: AnalysisEvent[] = [];
    const stored = await getOrCreateAnalysis("NVDA", { force: true, onEvent: (e) => events.push(e) });

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("status");
    expect(types).toContain("data");
    expect(types.filter((t) => t === "section").length).toBeGreaterThanOrEqual(12);
    expect(types.at(-1)).toBe("done");
    expect(types.indexOf("data")).toBeLessThan(types.indexOf("section"));

    expect(stored.verified).toBe(true);
    expect(stored.analysis.meta.verification.passed).toBe(true);
    expect(stored.analysis.rating.score).toBe(8);
    expect(stored.analysis.fcf.verdict).toBe("healthy");
    expect(stored.analysis.meta.usage.usd).toBeGreaterThan(0);
    expect(await analysesToday()).toBe(1);
    const row = await db().analysis.findUnique({ where: { id: stored.id } });
    expect(row?.rating).toBe(8);
    expect(row?.source).toBe("ondemand");
  });

  it("serves the cached analysis without a model call while fresh", async () => {
    const { client, calls } = fakeAnthropic(sampleModelOutput(data));
    setAnthropicClient(client);
    const stored = await getOrCreateAnalysis("NVDA");
    expect(calls).toHaveLength(0);
    expect(stored.version).toBe(1);
  });

  it("retries once with feedback when verification fails, then refuses to publish", async () => {
    const bad = sampleModelOutput(data);
    bad.thesis.bull = "TODO fill this in later with the actual bull thesis text";
    const { client, calls } = fakeAnthropic(bad);
    setAnthropicClient(client);
    await expect(getOrCreateAnalysis("NVDA", { force: true })).rejects.toThrow(/verification/i);
    expect(calls).toHaveLength(2);
    const second = calls[1].messages[0].content;
    expect(typeof second === "string" ? second : "").toContain("no_placeholders");
    const latest = await getLatestAnalysis("NVDA");
    expect(latest?.version).toBe(1); // unverified rows are never served
    const unverified = await db().analysis.count({ where: { symbol: "NVDA", verified: false } });
    expect(unverified).toBe(2);
  });

  it("queues alerts on a rating change and never duplicates them", async () => {
    const downgraded = sampleModelOutput(data);
    downgraded.rating.score = 6;
    downgraded.rating.action = "HOLD";
    setAnthropicClient(fakeAnthropic(downgraded).client);
    const stored = await getOrCreateAnalysis("NVDA", { force: true });
    const alerts = await db().alert.findMany({ where: { analysisId: stored.id } });
    expect(alerts.map((a) => a.type).sort()).toEqual(["rating_change", "verdict_flip"]);
    const first = await sendPendingAlerts();
    expect(first).toEqual({ sent: 2, failed: 0 });
    const again = await sendPendingAlerts();
    expect(again).toEqual({ sent: 0, failed: 0 });
  });

  it("ranks a watchlist, sorts columns and builds the digest", async () => {
    const w = await createWatchlist("Main", ["NVDA", "aapl", "nvda"]);
    expect(w.symbols).toEqual(["NVDA", "AAPL"]);
    const r = await getRankings(w.slug);
    expect(r?.rows.map((x) => x.symbol)).toEqual(["NVDA", "AAPL"]);
    expect(r?.rows[0].rating).toBe(6);
    expect(r?.rows[0].ratingDelta).toBe(-2);
    expect(r?.rows[1].rating).toBeNull();
    expect(sortRows(r!.rows, "symbol", "asc")[0].symbol).toBe("AAPL");
    expect(r?.bestRiskAdjusted).toBe("NVDA");

    const digest = await buildDigest(w.slug);
    expect(digest?.movers[0]).toMatchObject({ symbol: "NVDA", from: 8, to: 6 });
    expect(digest?.unanalyzed).toEqual(["AAPL"]);
    expect(digest?.ranked[0].url).toMatch(/^http:\/\/test.local\/s\/nvda-/);

    expect((await sendDailyDigest(w.slug)).status).toBe("sent");
    expect((await sendDailyDigest(w.slug)).status).toBe("already_sent");
  });

  it("protects the JSON API and cron with keys", () => {
    const ok = checkApiKey(new Request("http://x/api/analysis/NVDA", { headers: { "x-api-key": "test-api-key" } }));
    expect(ok.ok).toBe(true);
    expect(checkApiKey(new Request("http://x/api/analysis/NVDA?api_key=test-api-key")).ok).toBe(true);
    expect(checkApiKey(new Request("http://x/api/analysis/NVDA", { headers: { "x-api-key": "wrong" } })).ok).toBe(false);
    expect(checkCronAuth(new Request("http://x/api/cron/refresh", { headers: { authorization: "Bearer test-cron-secret" } })).ok).toBe(true);
    expect(checkCronAuth(new Request("http://x/api/cron/refresh")).ok).toBe(false);
  });

  it("surfaces a model refusal instead of publishing anything", async () => {
    setAnthropicClient(fakeAnthropic(sampleModelOutput(data), { stopReason: "refusal" }).client);
    await expect(getOrCreateAnalysis("NVDA", { force: true })).rejects.toThrow(/declined/);
  });
});
