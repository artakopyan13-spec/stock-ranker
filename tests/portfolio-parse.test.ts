import { describe, expect, it } from "vitest";
import { parseHoldings, parseLine } from "@/lib/portfolio/parse";

describe("portfolio paste parser", () => {
  it("parses shares", () => {
    expect(parseLine("NVDA 10")).toEqual({ symbol: "NVDA", shares: 10, avgCost: null, valueUsd: null });
  });

  it("parses shares with @ average cost", () => {
    expect(parseLine("AAPL 25 @ 150")).toEqual({ symbol: "AAPL", shares: 25, avgCost: 150, valueUsd: null });
    expect(parseLine("AAPL 25 @ $150.50")).toEqual({ symbol: "AAPL", shares: 25, avgCost: 150.5, valueUsd: null });
  });

  it("parses a $ dollar-value position (comma thousands) as value, not shares", () => {
    expect(parseLine("MSFT $15,000")).toEqual({ symbol: "MSFT", shares: null, avgCost: null, valueUsd: 15000 });
    expect(parseLine("$8,000 TSLA")).toEqual({ symbol: "TSLA", shares: null, avgCost: null, valueUsd: 8000 });
  });

  it("parses CSV-style symbol, shares, cost", () => {
    expect(parseLine("GOOGL, 12, 120")).toEqual({ symbol: "GOOGL", shares: 12, avgCost: 120, valueUsd: null });
  });

  it("ignores header rows and comments", () => {
    expect(parseLine("Symbol Quantity Cost")).toBeNull();
    expect(parseLine("# my portfolio")).toBeNull();
    expect(parseLine("")).toBeNull();
  });

  it("dedupes and caps a multi-line paste", () => {
    const holdings = parseHoldings("NVDA 10\nAMD 5 @ 200\nNVDA 99\nMSFT $1,000");
    expect(holdings.map((h) => h.symbol)).toEqual(["NVDA", "AMD", "MSFT"]);
    expect(holdings[0].shares).toBe(10); // first NVDA wins
    expect(holdings[2].valueUsd).toBe(1000);
  });

  it("splits a single comma-separated line", () => {
    const holdings = parseHoldings("AAPL 10, MSFT 5, NVDA 2");
    expect(holdings.map((h) => h.symbol)).toEqual(["AAPL", "MSFT", "NVDA"]);
  });
});
