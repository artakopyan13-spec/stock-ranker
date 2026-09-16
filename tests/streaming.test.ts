import { describe, expect, it } from "vitest";
import { SectionStreamer } from "@/lib/ai/analyze";
import { MODEL_OUTPUT_KEYS } from "@/lib/analysis/schema";
import { renderDigestMarkdown, renderDigestText, renderDigestHtml, type DigestPayload } from "@/lib/digest/build";
import { DISCLAIMER } from "@/lib/analysis/schema";
import { usdFor, estimatePerAnalysisUsd } from "@/lib/ai/pricing";
import { loadYahooFixture, sampleModelOutput } from "./helpers";

describe("SectionStreamer", () => {
  it("emits every top-level section exactly once, in schema order, from chunked JSON", () => {
    const { data } = loadYahooFixture();
    const text = JSON.stringify(sampleModelOutput(data));
    const seen: string[] = [];
    const s = new SectionStreamer((key) => seen.push(key));
    for (let i = 0; i < text.length; i += 17) s.push(text.slice(i, i + 17));
    s.finish();
    expect(seen).toEqual([...MODEL_OUTPUT_KEYS]);
  });

  it("emits a section only after its content is complete", () => {
    const { data } = loadYahooFixture();
    const m = sampleModelOutput(data);
    const text = JSON.stringify(m);
    const values: Record<string, unknown> = {};
    const s = new SectionStreamer((key, value) => { values[key] = value; });
    const cut = text.indexOf('"fcfVerdictReason"') + '"fcfVerdictReason"'.length + 4;
    s.push(text.slice(0, cut));
    expect(values.valuation).toEqual(m.valuation);
    expect(values.fcfVerdictReason).toBeUndefined();
    s.push(text.slice(cut));
    s.finish();
    expect(values.thesis).toEqual(m.thesis);
  });
});

describe("digest template", () => {
  const payload: DigestPayload = {
    date: "2026-09-16",
    watchlist: { slug: "main", name: "Main" },
    generatedAt: "2026-09-16T11:00:00.000Z",
    ranked: [
      { rank: 1, symbol: "NVDA", companyName: "NVIDIA", rating: 8, action: "BUY", fcfVerdict: "healthy", fcfMarginPct: 41.9, revenueGrowthPct: 105.9, primaryMultiple: "forwardPE", primaryMultipleValue: 13.6, price: 212.17, currency: "USD", analyzedAt: "2026-09-16T02:00:00.000Z", url: "http://test.local/s/nvda-abc" },
      { rank: 2, symbol: "XYZ", companyName: "XYZ", rating: null, action: null, fcfVerdict: null, fcfMarginPct: null, revenueGrowthPct: null, primaryMultiple: null, primaryMultipleValue: null, price: null, currency: "USD", analyzedAt: null, url: "http://test.local/t/XYZ" },
    ],
    movers: [{ symbol: "NVDA", from: 7, to: 8, reason: "FCF accelerated." }],
    newRisks: [{ symbol: "NVDA", risk: "Export controls widened." }],
    catalystsThisWeek: [{ symbol: "NVDA", date: "2026-09-18", event: "GTC keynote" }],
    unanalyzed: ["XYZ"],
    staleTickers: [],
    disclaimer: DISCLAIMER,
  };

  it("renders text, markdown and html with the ranking, movers, risks, catalysts and footer", () => {
    for (const out of [renderDigestText(payload), renderDigestMarkdown(payload), renderDigestHtml(payload)]) {
      expect(out).toContain("NVDA");
      expect(out).toContain("8/10");
      expect(out).toContain("FCF accelerated.");
      expect(out).toContain("Export controls widened.");
      expect(out).toContain("GTC keynote");
      expect(out).toContain("not financial advice");
      expect(out).toContain("http://test.local/s/nvda-abc");
    }
    expect(renderDigestMarkdown(payload)).toContain("| 1 | [NVDA]");
    expect(renderDigestText(payload)).toContain("Not analyzed yet: XYZ");
  });
});

describe("pricing", () => {
  it("prices Opus 5 and Sonnet 5 per the rate card, halves batch usage, and adds web searches", () => {
    const u = { inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
    expect(usdFor("claude-opus-5", u)).toBe(5);
    expect(usdFor("claude-sonnet-5", u)).toBe(2);
    expect(usdFor("claude-opus-5", u, { batch: true })).toBe(2.5);
    expect(usdFor("claude-haiku-4-5", { ...u, inputTokens: 0 }, { webSearches: 3 })).toBeCloseTo(0.03);
    expect(estimatePerAnalysisUsd("claude-opus-5")).toBeGreaterThan(0.1);
    expect(estimatePerAnalysisUsd("claude-opus-5")).toBeLessThan(0.2);
  });
});
