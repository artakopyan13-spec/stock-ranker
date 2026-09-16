import { describe, expect, it } from "vitest";
import { StockData, daysBetween } from "@/lib/data/types";
import { normalizeFmp } from "@/lib/data/adapters/fmp";
import { normalizeFinnhub } from "@/lib/data/adapters/finnhub";
import { loadYahooFixture } from "./helpers";

describe("Yahoo adapter normalization (real captured NVDA responses)", () => {
  const { data, capturedAt } = loadYahooFixture();

  it("produces a valid StockData document", () => {
    expect(() => StockData.parse(data)).not.toThrow();
    expect(data.symbol).toBe("NVDA");
    expect(data.companyName).toContain("NVIDIA");
    expect(data.currency).toBe("USD");
  });

  it("carries source + date on every figure (skill rule 2)", () => {
    for (const group of [data.quote, data.valuation, data.fundamentals]) {
      for (const [key, s] of Object.entries(group)) {
        expect(s.source, key).toBeTruthy();
        expect(s.asOf, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("surfaces price, market cap, multiples, growth and FCF", () => {
    expect(data.quote.price.value).toBeGreaterThan(0);
    expect(data.quote.marketCap.value).toBeGreaterThan(1e11);
    expect(data.valuation.forwardPE.value).toBeGreaterThan(0);
    expect(data.fundamentals.revenueGrowthYoYPct.value).not.toBeNull();
    expect(data.fundamentals.fcfTTM.value).toBeGreaterThan(0);
    expect(data.fundamentals.revenueGrowthYoYPct.source).toContain("quarterly statements");
  });

  it("orders quarters ascending with revenue and FCF filled", () => {
    expect(data.quarters.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < data.quarters.length; i++) expect(data.quarters[i].period > data.quarters[i - 1].period).toBe(true);
    expect(data.quarters.at(-1)?.revenue).toBeGreaterThan(0);
    expect(data.quarters.at(-1)?.fcf).not.toBeNull();
  });

  it("keeps only news from the last 7 days, newest first", () => {
    const today = capturedAt.toISOString().slice(0, 10);
    expect(data.news.length).toBeGreaterThan(0);
    for (const n of data.news) expect(daysBetween(n.date, today)).toBeLessThanOrEqual(7);
    for (let i = 1; i < data.news.length; i++) expect(data.news[i - 1].date >= data.news[i].date).toBe(true);
    expect(data.newsSource).toBe("provider");
  });

  it("finds the next earnings date", () => {
    expect(data.nextEarningsDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("marks missing figures as null instead of inventing them", () => {
    const stripped = { ...data };
    const raw = loadYahooFixture().raw;
    const noStats = normalizeFmp("X", { capturedAt: raw.capturedAt, quote: { price: 10 }, profile: {}, ratiosTtm: {}, income: [], cashflow: [], balance: [], news: [], earnings: [] });
    expect(noStats.valuation.forwardPE.value).toBeNull();
    expect(noStats.fundamentals.fcfTTM.value).toBeNull();
    expect(stripped.symbol).toBe("NVDA");
  });
});

describe("FMP adapter normalization (documented response shapes)", () => {
  const raw = {
    capturedAt: "2026-09-16T00:00:00.000Z",
    quote: { symbol: "ACME", name: "Acme Corp", price: 100, changePercentage: 1.5, yearLow: 60, yearHigh: 120, marketCap: 50e9, timestamp: 1789000000, exchange: "NASDAQ" },
    profile: { companyName: "Acme Corp", sector: "Technology", industry: "Software", currency: "USD", description: "Makes things." },
    ratiosTtm: { priceToEarningsRatioTTM: 25, enterpriseValueMultipleTTM: 18, priceToSalesRatioTTM: 6, priceToFreeCashFlowRatioTTM: 30, priceToBookRatioTTM: 8, grossProfitMarginTTM: 0.7, operatingProfitMarginTTM: 0.25 },
    income: [5, 4, 3, 2, 1, 0].map((i) => ({ date: `2025-${String(12 - i * 2).padStart(2, "0")}-30`, revenue: 1000 - i * 50, grossProfit: 700, operatingIncome: 250, netIncome: 200, weightedAverageShsOutDil: 100 })),
    cashflow: [5, 4, 3, 2, 1, 0].map((i) => ({ date: `2025-${String(12 - i * 2).padStart(2, "0")}-30`, operatingCashFlow: 300, capitalExpenditure: -50, freeCashFlow: 250, commonStockRepurchased: -20 })),
    balance: [5, 4, 3, 2, 1, 0].map((i) => ({ date: `2025-${String(12 - i * 2).padStart(2, "0")}-30`, cashAndShortTermInvestments: 400, totalDebt: 100 })),
    news: [{ publishedDate: "2026-09-15 10:00:00", title: "Acme beats", site: "Reuters", url: "https://example.com/a", text: "Beat." }],
    earnings: [{ date: "2026-10-20" }],
  };
  const data = normalizeFmp("ACME", raw, new Date("2026-09-16T00:00:00.000Z"));

  it("validates and sums TTM figures from four quarters", () => {
    expect(() => StockData.parse(data)).not.toThrow();
    expect(data.fundamentals.fcfTTM.value).toBe(1000);
    expect(data.fundamentals.revenueTTM.value).toBe(1000 + 950 + 900 + 850);
    expect(data.fundamentals.grossMarginPct.value).toBeCloseTo(70);
    expect(data.fundamentals.buybacksTTM.value).toBe(80);
  });

  it("computes revenue growth from statements and keeps news + earnings", () => {
    expect(data.fundamentals.revenueGrowthYoYPct.value).toBeCloseTo(((1000 - 800) / 800) * 100);
    expect(data.news).toHaveLength(1);
    expect(data.news[0].source).toBe("Reuters");
    expect(data.nextEarningsDate).toBe("2026-10-20");
    expect(data.valuation.forwardPE.value).toBeNull();
  });
});

describe("Finnhub adapter normalization (documented response shapes)", () => {
  const report = (endDate: string, rev: number) => ({
    endDate: `${endDate} 00:00:00`,
    report: {
      ic: [{ concept: "Revenues", value: rev }, { concept: "GrossProfit", value: rev * 0.6 }, { concept: "OperatingIncomeLoss", value: rev * 0.2 }, { concept: "NetIncomeLoss", value: rev * 0.15 }],
      cf: [{ concept: "NetCashProvidedByUsedInOperatingActivities", value: rev * 0.3 }, { concept: "PaymentsToAcquirePropertyPlantAndEquipment", value: rev * 0.05 }],
      bs: [{ concept: "CashAndCashEquivalentsAtCarryingValue", value: 500 }, { concept: "LongTermDebtNoncurrent", value: 200 }, { concept: "CommonStockSharesOutstanding", value: 1000 }],
    },
  });
  const raw = {
    capturedAt: "2026-09-16T00:00:00.000Z",
    quote: { c: 50, dp: -0.5, t: 1789000000 },
    profile: { name: "Beta Inc", exchange: "NYSE", finnhubIndustry: "Retail", currency: "USD", marketCapitalization: 50000, shareOutstanding: 1000 },
    metric: { "52WeekHigh": 70, "52WeekLow": 30, peTTM: 20, psTTM: 2, pbAnnual: 3, grossMarginTTM: 60, operatingMarginTTM: 20, revenueGrowthQuarterlyYoy: 12.5, "currentEv/ebitdaTTM": 11 },
    reported: [report("2025-03-31", 1000), report("2025-06-30", 1100), report("2025-09-30", 1200), report("2025-12-31", 1300), report("2026-03-31", 1400)],
    news: [{ id: 1, datetime: 1789000000, headline: "Beta expands", source: "Bloomberg", url: "https://example.com/b", summary: "Expansion." }],
    earnings: [{ date: "2026-10-30" }],
  };
  const data = normalizeFinnhub("BETA", raw, new Date("2026-09-16T00:00:00.000Z"));

  it("maps GAAP concepts to quarters and derives FCF = OCF − capex", () => {
    expect(() => StockData.parse(data)).not.toThrow();
    expect(data.quarters).toHaveLength(5);
    expect(data.quarters.at(-1)?.fcf).toBeCloseTo(1400 * 0.3 - 1400 * 0.05);
    expect(data.fundamentals.fcfTTM.value).toBeCloseTo((1100 + 1200 + 1300 + 1400) * 0.25);
    expect(data.quote.marketCap.value).toBe(50000 * 1e6);
    expect(data.valuation.evToEbitda.value).toBe(11);
  });
});
