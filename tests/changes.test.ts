import { describe, expect, it } from "vitest";
import { detectChanges } from "@/lib/changes/detect";
import { assembleAnalysis } from "@/lib/analysis/assemble";
import { verifyModelOutput } from "@/lib/analysis/verify";
import { decideRefresh } from "@/lib/cron/smart-refresh";
import { loadYahooFixture, sampleModelOutput } from "./helpers";

const { data, capturedAt } = loadYahooFixture();
const meta = { promptVersion: "v1", model: "claude-opus-5", usage: { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, usd: 0 }, analyzedAt: capturedAt, demo: false, previousTripwireDescription: null };
const build = (mutate?: (m: ReturnType<typeof sampleModelOutput>) => void, d = data) => {
  const m = sampleModelOutput(d);
  mutate?.(m);
  return assembleAnalysis(d, m, meta, verifyModelOutput(d, m));
};

describe("what-changed detection", () => {
  const prev = build();

  it("is silent when nothing changed", () => {
    expect(detectChanges(prev, build())).toEqual([]);
  });

  it("records a rating change and a verdict flip with the one-line justification", () => {
    const changes = detectChanges(prev, build((m) => { m.rating.score = 6; m.rating.action = "HOLD"; }));
    expect(changes.map((c) => c.type)).toEqual(["rating_change", "verdict_flip"]);
    expect(changes[0].message).toContain("8 → 6");
    expect(changes[1].message).toContain("BUY → HOLD");
  });

  it("records a triggered tripwire", () => {
    const cur = build();
    cur.previousTripwire = { description: "Two declines", triggered: true, reason: "Two sequential declines." };
    expect(detectChanges(prev, cur).some((c) => c.type === "tripwire")).toBe(true);
  });

  it("records FCF turning negative once, not while it stays negative", () => {
    const burning = { ...data, fundamentals: { ...data.fundamentals, fcfTTM: { ...data.fundamentals.fcfTTM, value: -2e9 } } };
    const mutate = (m: ReturnType<typeof sampleModelOutput>) => { m.thesis.bear += " Cash flow is now negative."; m.rating.score = 4; m.rating.action = "HOLD"; };
    const first = build(mutate, burning);
    expect(detectChanges(prev, first).some((c) => c.type === "fcf_negative")).toBe(true);
    expect(detectChanges(first, build(mutate, burning)).some((c) => c.type === "fcf_negative")).toBe(false);
  });

  it("treats the first analysis as a baseline (no changes)", () => {
    expect(detectChanges(null, prev)).toEqual([]);
  });
});

describe("smart refresh decision", () => {
  const prev = { analysis: build(), createdAt: capturedAt };
  const opts = { ttlHours: 24, priceMovePct: 3, smart: true, now: new Date(capturedAt.getTime() + 3_600_000) };

  it("skips when nothing material changed", () => {
    expect(decideRefresh(prev, data, opts).refresh).toBe(false);
  });

  it("refreshes on a price move above the threshold", () => {
    const moved = { ...data, quote: { ...data.quote, price: { ...data.quote.price, value: (data.quote.price.value ?? 0) * 1.05 } } };
    expect(decideRefresh(prev, moved, opts)).toMatchObject({ refresh: true });
  });

  it("refreshes on unseen news, a new quarter, or an expired analysis", () => {
    const news = { ...data, news: [{ id: "new", date: "2026-09-16", headline: "Guidance raised", source: "Reuters", url: "https://x/y", summary: null }, ...data.news] };
    expect(decideRefresh(prev, news, opts).reason).toContain("news");
    const q = { ...data, quarters: [...data.quarters, { ...data.quarters[data.quarters.length - 1], period: "2026-10-31" }] };
    expect(decideRefresh(prev, q, opts).reason).toContain("new quarter");
    expect(decideRefresh(prev, data, { ...opts, now: new Date(capturedAt.getTime() + 30 * 3_600_000) }).reason).toContain("old");
    expect(decideRefresh(null, data, opts).refresh).toBe(true);
    expect(decideRefresh(prev, data, { ...opts, smart: false }).refresh).toBe(true);
  });
});
