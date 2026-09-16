import { describe, expect, it } from "vitest";
import { SectionStreamer } from "@/lib/ai/analyze";
import { MODEL_OUTPUT_KEYS } from "@/lib/analysis/schema";
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
