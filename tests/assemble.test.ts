import { describe, expect, it } from "vitest";
import { assembleAnalysis, deriveDataSections } from "@/lib/analysis/assemble";
import { verifyModelOutput } from "@/lib/analysis/verify";
import { loadYahooFixture, sampleModelOutput } from "./helpers";

const { data, capturedAt } = loadYahooFixture();
const meta = { promptVersion: "v1", model: "claude-opus-5", usage: { inputTokens: 5000, cacheReadTokens: 3500, cacheWriteTokens: 0, outputTokens: 2000, usd: 0.1 }, analyzedAt: capturedAt, demo: false, previousTripwireDescription: null };

describe("deriveDataSections", () => {
  const s = deriveDataSections(data, capturedAt);

  it("computes the FCF verdict from the data, never from the model", () => {
    expect(s.fcf.verdict).toBe("healthy");
    expect(s.fcf.marginPct.value).toBeGreaterThan(30);
    expect(s.fcf.history.length).toBeGreaterThanOrEqual(4);
  });

  it("flags negative FCF as the headline risk", () => {
    const burning = { ...data, fundamentals: { ...data.fundamentals, fcfTTM: { ...data.fundamentals.fcfTTM, value: -1e9 } } };
    const b = deriveDataSections(burning, capturedAt);
    expect(b.fcf.verdict).toBe("negative");
    expect(b.fcf.headlineRisk).toBe(true);
    expect(b.balanceSheet.selfFundsCapex).toBe(false);
  });

  it("marks unverifiable FCF as unverified", () => {
    const unknown = { ...data, fundamentals: { ...data.fundamentals, fcfTTM: { ...data.fundamentals.fcfTTM, value: null } } };
    expect(deriveDataSections(unknown, capturedAt).fcf.verdict).toBe("unverified");
  });

  it("derives 52-week position, net cash posture and margin history", () => {
    expect(s.price.positionIn52wRangePct).toBeGreaterThan(0);
    expect(s.price.positionIn52wRangePct).toBeLessThan(100);
    expect(s.balanceSheet.posture).toBe("net_cash");
    expect(s.balanceSheet.netCash).toBeGreaterThan(0);
    expect(s.growth.marginHistory.at(-1)?.grossPct).toBeGreaterThan(50);
    expect(s.growth.revenueHistory.at(-1)?.yoyPct).toBeGreaterThan(50);
  });

  it("flags stale price data older than 7 days", () => {
    const later = new Date(capturedAt.getTime() + 10 * 86_400_000);
    expect(deriveDataSections(data, later).meta.staleData).toBe(true);
    expect(s.meta.staleData).toBe(false);
  });
});

describe("assembleAnalysis", () => {
  const m = sampleModelOutput(data);
  const a = assembleAnalysis(data, m, meta, verifyModelOutput(data, m));

  it("turns forecast returns into price targets from the sourced price", () => {
    const price = data.quote.price.value ?? 0;
    expect(a.forecast12m.base.priceTarget).toBeCloseTo(Math.round(price * 1.15 * 100) / 100, 2);
    expect(a.forecast12m.bear.priceTarget).toBeLessThan(price);
    expect(a.forecast12m.isEstimate).toBe(true);
    expect(a.rating.isEstimate).toBe(true);
  });

  it("copies rating and band, keeps the disclaimer, and lists sources", () => {
    expect(a.rating.score).toBe(8);
    expect(a.rating.band).toBe("strong");
    expect(a.sources.length).toBeGreaterThan(3);
    expect(a.sources.every((src) => src.name && src.asOf)).toBe(true);
    expect(a.disclaimer).toContain("not financial advice");
  });

  it("annotates only provided news items and preserves their source + date", () => {
    expect(a.news).toHaveLength(data.news.length);
    expect(a.news[0].source).toBe(data.news[0].source);
    expect(a.news[0].date).toBe(data.news[0].date);
    expect(a.news.slice(0, 3).every((n) => n.summary?.startsWith("Coverage item"))).toBe(true);
  });

  it("records the previous tripwire verdict when one was supplied", () => {
    const withTrip = assembleAnalysis(data, { ...m, previousTripwire: { triggered: true, reason: "Sequential revenue fell twice." } }, { ...meta, previousTripwireDescription: "Two sequential declines." }, verifyModelOutput(data, m));
    expect(withTrip.previousTripwire?.triggered).toBe(true);
    expect(a.previousTripwire).toBeNull();
  });
});
