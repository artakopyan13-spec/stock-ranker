import { describe, expect, it } from "vitest";
import { heuristicIntent, intentToResult, type Intent } from "@/lib/nl/parse";

const universe = new Set(["NVDA", "AMD", "AAPL"]);

describe("command-bar heuristic (zero-cost fast path)", () => {
  it("jumps to a known ticker", () => {
    expect(heuristicIntent("NVDA", universe)?.kind).toBe("analyze");
    expect(heuristicIntent("nvda", universe)?.ticker).toBe("NVDA"); // known even if lowercase
  });

  it("jumps to an un-analyzed ticker when written like a symbol", () => {
    const i = heuristicIntent("TSLA", universe);
    expect(i).toEqual({ kind: "analyze", ticker: "TSLA", tickers: [], filters: null, reply: null });
    expect(heuristicIntent("$tsla", universe)?.ticker).toBe("TSLA");
  });

  it("does NOT fire on lowercase words or natural language", () => {
    expect(heuristicIntent("cash machines under 20x FCF", universe)).toBeNull();
    expect(heuristicIntent("the next nvidia", universe)).toBeNull();
    expect(heuristicIntent("compare NVDA and AMD", universe)).toBeNull(); // 'compare'/'and' aren't tickers -> LLM
  });

  it("compares multiple ticker tokens", () => {
    expect(heuristicIntent("NVDA AMD", universe)).toEqual({ kind: "compare", ticker: null, tickers: ["NVDA", "AMD"], filters: null, reply: null });
  });

  it("maps intents to navigation", () => {
    const analyze: Intent = { kind: "analyze", ticker: "nvda", tickers: [], filters: null, reply: null };
    expect(intentToResult(analyze)).toMatchObject({ action: "navigate", href: "/t/NVDA" });
    const screen: Intent = { kind: "screen", ticker: null, tickers: [], filters: { sector: null, minMarketCapB: null, minRevGrowthPct: null, minFcfMarginPct: 20, maxTrailingPE: null, maxForwardPE: null, maxPriceToFcf: null, minRating: null, actions: [], fcfVerdicts: ["healthy"] }, reply: null };
    expect(intentToResult(screen)).toMatchObject({ action: "navigate", href: "/screener?minFcfMargin=20&fcfVerdicts=healthy" });
  });
});
