import { describe, expect, it } from "vitest";
import { applyScreen, PRESETS } from "@/lib/screener";
import type { UniverseRow } from "@/lib/universe";

function row(over: Partial<UniverseRow>): UniverseRow {
  return {
    symbol: "X", companyName: "X", sector: "Technology", industry: null, rating: 7, action: "HOLD",
    fcfVerdict: "healthy", fcfMarginPct: 25, revenueGrowthPct: 20, grossMarginPct: 60, operatingMarginPct: 30,
    trailingPE: 25, forwardPE: 20, priceToFcf: 25, priceToSales: 6, evToEbitda: 18, marketCap: 100e9,
    netCash: 10e9, debtToEquity: null, price: 100, currency: "USD", searchCount: 0, analyzedAt: "2026-09-16T00:00:00Z",
    shareToken: null, nextEarnings: null, headlineRisk: false, stale: false, ...over,
  };
}

describe("screener filters", () => {
  const rows = [
    row({ symbol: "CASH", fcfMarginPct: 30, fcfVerdict: "healthy" }),
    row({ symbol: "THIN", fcfMarginPct: 5, fcfVerdict: "thin", rating: 5 }),
    row({ symbol: "GROWTH", revenueGrowthPct: 40, forwardPE: 25 }),
    row({ symbol: "PRICEY", revenueGrowthPct: 40, forwardPE: 60 }),
    row({ symbol: "ELITE", rating: 9 }),
    row({ symbol: "SMALL", marketCap: 2e9, rating: 8 }),
    row({ symbol: "ENERGY", sector: "Energy" }),
  ];

  it("filters by minimums and maximums, passing nulls only when not constrained", () => {
    expect(applyScreen(rows, { minFcfMargin: 20 }).map((r) => r.symbol)).toContain("CASH");
    expect(applyScreen(rows, { minFcfMargin: 20 }).map((r) => r.symbol)).not.toContain("THIN");
    expect(applyScreen(rows, { maxForwardPE: 30, minRevGrowth: 15 }).map((r) => r.symbol)).toContain("GROWTH");
    expect(applyScreen(rows, { maxForwardPE: 30, minRevGrowth: 15 }).map((r) => r.symbol)).not.toContain("PRICEY");
    expect(applyScreen(rows, { minMarketCap: 10 }).map((r) => r.symbol)).not.toContain("SMALL");
    expect(applyScreen(rows, { sector: "Energy" }).map((r) => r.symbol)).toEqual(["ENERGY"]);
    const nullGrowth = [row({ symbol: "NG", revenueGrowthPct: null })];
    expect(applyScreen(nullGrowth, { minRevGrowth: 5 })).toHaveLength(0); // null excluded when constrained
    expect(applyScreen(nullGrowth, {})).toHaveLength(1); // passes when not constrained
  });

  it("preset 'Cash machines' keeps only healthy-FCF names above 20% margin", () => {
    const cash = PRESETS.find((p) => p.id === "cash-machines")!;
    const out = applyScreen(rows, cash.filters).map((r) => r.symbol);
    expect(out).toContain("CASH");
    expect(out).not.toContain("THIN");
  });

  it("preset 'Rated 8+' keeps only high ratings", () => {
    const r8 = PRESETS.find((p) => p.id === "rated-8")!;
    expect(applyScreen(rows, r8.filters).every((r) => r.rating >= 8)).toBe(true);
  });
});
