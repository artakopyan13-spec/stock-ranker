import { describe, expect, it } from "vitest";
import { detectChanges } from "@/lib/alerts/detect";
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

describe("change detection", () => {
  const prev = build();

  it("is silent when nothing changed", () => {
    expect(detectChanges(prev, build())).toEqual([]);
  });

  it("alerts on a rating change with the one-line justification", () => {
    const changes = detectChanges(prev, build((m) => { m.rating.score = 6; m.rating.action = "HOLD"; }));
    expect(changes.map((c) => c.type)).toEqual(["rating_change", "verdict_flip"]);
    expect(changes[0].message).toContain("8 → 6");
  });

  it("alerts when a tripwire triggers", () => {
    const cur = build((m) => { m.previousTripwire = { triggered: true, reason: "Two sequential declines." }; });
    cur.previousTripwire = { description: "Two declines", triggered: true, reason: "Two sequential declines." };
    expect(detectChanges(prev, cur).some((c) => c.type === "tripwire")).toBe(true);
  });

  it("alerts once when FCF turns negative, not again while it stays negative", () => {
    const burning = { ...data, fundamentals: { ...data.fundamentals, fcfTTM: { ...data.fundamentals.fcfTTM, value: -2e9 } } };
    const first = build((m) => { m.thesis.bear += " Cash flow is now negative."; m.rating.score = 4; m.rating.action = "HOLD"; }, burning);
    expect(detectChanges(prev, first).some((c) => c.type === "fcf_negative")).toBe(true);
    const second = build((m) => { m.thesis.bear += " Cash flow is now negative."; m.rating.score = 4; m.rating.action = "HOLD"; }, burning);
    expect(detectChanges(first, second).some((c) => c.type === "fcf_negative")).toBe(false);
  });

  it("treats the first analysis as a baseline (no alerts)", () => {
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
