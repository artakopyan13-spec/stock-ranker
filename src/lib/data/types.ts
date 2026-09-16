import { z } from "zod";

/**
 * A number (or string) with provenance. `value: null` means the provider could not
 * supply it — it renders as "unverified" and is never guessed (skill rule 1 & 2).
 */
export const SourcedNumber = z.object({
  value: z.number().nullable(),
  source: z.string(),
  url: z.string().nullable(),
  asOf: z.string(), // ISO date (YYYY-MM-DD) the figure was published/observed
});
export type SourcedNumber = z.infer<typeof SourcedNumber>;

export const QuarterRow = z.object({
  period: z.string(), // fiscal quarter end date, YYYY-MM-DD
  revenue: z.number().nullable(),
  grossProfit: z.number().nullable(),
  operatingIncome: z.number().nullable(),
  netIncome: z.number().nullable(),
  operatingCashFlow: z.number().nullable(),
  capex: z.number().nullable(), // negative number = cash out
  fcf: z.number().nullable(),
  cash: z.number().nullable(),
  totalDebt: z.number().nullable(),
  sharesOutstanding: z.number().nullable(),
  source: z.string(),
  asOf: z.string(),
});
export type QuarterRow = z.infer<typeof QuarterRow>;

export const NewsItem = z.object({
  id: z.string(),
  date: z.string(), // ISO date
  headline: z.string(),
  source: z.string(),
  url: z.string().nullable(),
  summary: z.string().nullable(),
});
export type NewsItem = z.infer<typeof NewsItem>;

/** Normalized market data. Every adapter produces exactly this shape. */
export const StockData = z.object({
  symbol: z.string(),
  companyName: z.string(),
  exchange: z.string().nullable(),
  currency: z.string(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  description: z.string().nullable(),
  provider: z.string(),
  fetchedAt: z.string(), // ISO datetime

  quote: z.object({
    price: SourcedNumber,
    dayChangePct: SourcedNumber,
    week52Low: SourcedNumber,
    week52High: SourcedNumber,
    marketCap: SourcedNumber,
    sharesOutstanding: SourcedNumber,
  }),

  valuation: z.object({
    trailingPE: SourcedNumber,
    forwardPE: SourcedNumber,
    evToEbitda: SourcedNumber,
    priceToSales: SourcedNumber,
    priceToFcf: SourcedNumber,
    priceToBook: SourcedNumber,
  }),

  fundamentals: z.object({
    revenueTTM: SourcedNumber,
    revenueGrowthYoYPct: SourcedNumber, // latest quarter YoY, percent
    grossMarginPct: SourcedNumber,
    operatingMarginPct: SourcedNumber,
    fcfTTM: SourcedNumber,
    operatingCashFlowTTM: SourcedNumber,
    cash: SourcedNumber,
    totalDebt: SourcedNumber,
    buybacksTTM: SourcedNumber, // positive = cash spent on repurchases
    netShareIssuanceTTM: SourcedNumber, // positive = net issuance (dilution)
  }),

  /** Ascending by period. Up to 8 quarters. */
  quarters: z.array(QuarterRow),

  nextEarningsDate: z.string().nullable(),

  /** Items from the last 7 days only. */
  news: z.array(NewsItem),
  newsSource: z.enum(["provider", "web_search", "none"]),
});
export type StockData = z.infer<typeof StockData>;

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string; // EQUITY, ETF, ...
}

/** Every provider implements this. */
export interface DataAdapter {
  readonly name: string;
  /** Resolve a free-text query (ticker or company name) to candidate symbols. */
  search(query: string): Promise<SymbolMatch[]>;
  /** Fetch and normalize everything the skill needs for one symbol. */
  fetch(symbol: string): Promise<StockData>;
}

export class SymbolNotFoundError extends Error {
  constructor(public readonly symbol: string) {
    super(`Symbol not found: ${symbol}`);
    this.name = "SymbolNotFoundError";
  }
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}

// ---------- helpers shared by adapters ----------

export function isoDate(d: Date | string | number | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  const date = typeof d === "number" ? new Date(d < 1e12 ? d * 1000 : d) : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function sourced(
  value: number | null | undefined,
  source: string,
  asOf: string,
  url: string | null = null,
): SourcedNumber {
  return {
    value: typeof value === "number" && Number.isFinite(value) ? value : null,
    source,
    url,
    asOf,
  };
}

export function pct(fraction: number | null | undefined): number | null {
  return typeof fraction === "number" && Number.isFinite(fraction) ? fraction * 100 : null;
}

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Keep only news from the last `days` days, newest first, capped at `max`. */
export function recentNews(items: NewsItem[], now: Date, days = 7, max = 12): NewsItem[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return items
    .filter((n) => new Date(n.date).getTime() >= cutoff)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, max);
}
