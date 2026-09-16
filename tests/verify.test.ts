import { describe, expect, it } from "vitest";
import { failureSummary, verifyAssembled, verifyModelOutput } from "@/lib/analysis/verify";
import { assembleAnalysis } from "@/lib/analysis/assemble";
import { DISCLAIMER } from "@/lib/analysis/schema";
import { loadYahooFixture, sampleModelOutput } from "./helpers";

const { data } = loadYahooFixture();
const failed = (ids: string[]) => ids;

describe("verification (skill step 6)", () => {
  it("passes a consistent output whose numbers come from the data", () => {
    const v = verifyModelOutput(data, sampleModelOutput(data));
    expect(v.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([]);
    expect(v.passed).toBe(true);
  });

  it("fails on placeholder text", () => {
    const m = sampleModelOutput(data);
    m.thesis.bull = "TODO write the bull thesis for this company later on";
    const v = verifyModelOutput(data, m);
    expect(v.passed).toBe(false);
    expect(v.checks.find((c) => c.id === "no_placeholders")?.ok).toBe(false);
  });

  it("lets thresholds and approximations through ('above 70%', 'north of $100B')", () => {
    const m = sampleModelOutput(data);
    m.thesis.bull = "Margins hold above 70% and cash generation runs north of $100B a year, comfortably funding buybacks.";
    expect(verifyModelOutput(data, m).checks.find((c) => c.id === "numbers_reconcile")?.ok).toBe(true);
  });

  it("fails when prose cites a figure the data does not contain", () => {
    const m = sampleModelOutput(data);
    m.fcfVerdictReason = "Free cash flow of $999.9B last year makes this a compounder.";
    const v = verifyModelOutput(data, m);
    expect(v.checks.find((c) => c.id === "numbers_reconcile")?.ok).toBe(false);
    expect(failureSummary(v)).toContain("$999.9B");
  });

  it("accepts figures that round to data values (e.g. $127.0B FCF, 105.9% growth)", () => {
    const m = sampleModelOutput(data);
    m.thesis.bull = "Free cash flow of $127.0B and revenue growth of 105.9% support the thesis.";
    const v = verifyModelOutput(data, m);
    expect(v.checks.find((c) => c.id === "numbers_reconcile")?.ok).toBe(true);
  });

  it("enforces rating/action consistency and the 1–10 range", () => {
    const m = sampleModelOutput(data);
    m.rating.score = 8;
    m.rating.action = "SELL";
    expect(verifyModelOutput(data, m).checks.find((c) => c.id === "rating_action_consistent")?.ok).toBe(false);
    m.rating.score = 11;
    expect(verifyModelOutput(data, m).checks.find((c) => c.id === "rating_range")?.ok).toBe(false);
    m.rating.score = 2;
    m.rating.action = "HOLD";
    expect(verifyModelOutput(data, m).checks.find((c) => c.id === "rating_action_consistent")?.ok).toBe(false);
  });

  it("requires the bear case to be as loud as the bull case", () => {
    const m = sampleModelOutput(data);
    m.thesis.bear = "Could go down a bit.";
    expect(verifyModelOutput(data, m).checks.find((c) => c.id === "bear_as_loud_as_bull")?.ok).toBe(false);
  });

  it("requires bear ≤ base ≤ bull and dated catalysts", () => {
    const m = sampleModelOutput(data);
    m.forecast12m.bear.returnPct = 50;
    expect(verifyModelOutput(data, m).checks.find((c) => c.id === "forecast_ordered")?.ok).toBe(false);
    const m2 = sampleModelOutput(data);
    m2.catalysts = [{ date: "soon", dateSource: null, event: "Product launch event", type: "product", expectedDirection: "up" }];
    expect(verifyModelOutput(data, m2).checks.find((c) => c.id === "catalysts_dated")?.ok).toBe(false);
  });

  it("rejects news annotations for items that were not provided", () => {
    const m = sampleModelOutput(data);
    m.news.push({ id: "made-up", category: "earnings", thesisImpact: "positive", summary: "Invented item that never existed." });
    expect(verifyModelOutput(data, m).checks.find((c) => c.id === "news_ids_known")?.ok).toBe(false);
  });

  it("demands the bear case name cash flow when FCF is negative", () => {
    const burning = { ...data, fundamentals: { ...data.fundamentals, fcfTTM: { ...data.fundamentals.fcfTTM, value: -5e9 } } };
    const m = sampleModelOutput(burning);
    m.thesis.bear = "Competition is intensifying and pricing power is fading across every product line that matters to the growth story here.";
    m.thesis.primaryFailureMode = "Losing share to rivals.";
    m.fcfVerdictReason = "Margins are under pressure.";
    const v = verifyModelOutput(burning, m);
    expect(v.checks.find((c) => c.id === "fcf_headline_risk")?.ok).toBe(false);
    expect(failed(v.checks.filter((c) => !c.ok).map((c) => c.id))).toContain("fcf_headline_risk");
  });

  it("checks the assembled document for sources and the footer", () => {
    const m = sampleModelOutput(data);
    const v = verifyModelOutput(data, m);
    const a = assembleAnalysis(data, m, { promptVersion: "v1", model: "claude-opus-5", usage: { inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, usd: 0 }, analyzedAt: new Date(), demo: false, previousTripwireDescription: null }, v);
    expect(verifyAssembled(a).every((c) => c.ok)).toBe(true);
    expect(a.disclaimer).toBe(DISCLAIMER);
    expect(verifyAssembled({ ...a, disclaimer: "trust me" }).find((c) => c.id === "disclaimer_present")?.ok).toBe(false);
    expect(verifyAssembled({ ...a, sources: [] }).find((c) => c.id === "sources_present")?.ok).toBe(false);
  });
});
