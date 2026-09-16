import {
  type DataAdapter,
  type NewsItem,
  type QuarterRow,
  type StockData,
  type SymbolMatch,
  ProviderError,
  SymbolNotFoundError,
  isoDate,
  num,
  recentNews,
  sourced,
  todayIso,
} from "@/lib/data/types";

type Rec = Record<string, unknown>;
const SRC = "Financial Modeling Prep";
const BASE = "https://financialmodelingprep.com/stable";

function asRec(v: unknown): Rec {
  return typeof v === "object" && v !== null ? (v as Rec) : {};
}
function asRecArray(v: unknown): Rec[] {
  return Array.isArray(v) ? v.map(asRec) : [];
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : null;
}

/** Raw FMP responses (stable API). Shape documented at site.financialmodelingprep.com/developer/docs. */
export interface FmpRaw {
  capturedAt: string;
  quote: Rec; // /quote
  profile: Rec; // /profile
  ratiosTtm: Rec; // /ratios-ttm
  income: Rec[]; // /income-statement?period=quarter
  cashflow: Rec[]; // /cash-flow-statement?period=quarter
  balance: Rec[]; // /balance-sheet-statement?period=quarter
  news: Rec[]; // /news/stock (may be empty on free tier)
  earnings: Rec[]; // /earnings
}

export function normalizeFmp(symbol: string, raw: FmpRaw, now: Date = new Date()): StockData {
  const today = todayIso(now);
  const q = raw.quote;
  const p = raw.profile;
  const r = raw.ratiosTtm;
  const quoteDate = isoDate(typeof q.timestamp === "number" ? q.timestamp : null) ?? today;
  const url = `https://site.financialmodelingprep.com/financial-summary/${encodeURIComponent(symbol)}`;

  const byPeriod = new Map<string, QuarterRow>();
  const ensure = (period: string): QuarterRow => {
    let row = byPeriod.get(period);
    if (!row) {
      row = {
        period,
        revenue: null,
        grossProfit: null,
        operatingIncome: null,
        netIncome: null,
        operatingCashFlow: null,
        capex: null,
        fcf: null,
        cash: null,
        totalDebt: null,
        sharesOutstanding: null,
        source: `${SRC} (quarterly statements)`,
        asOf: period,
      };
      byPeriod.set(period, row);
    }
    return row;
  };
  for (const s of raw.income) {
    const period = str(s.date);
    if (!period) continue;
    const row = ensure(period);
    row.revenue = num(s.revenue);
    row.grossProfit = num(s.grossProfit);
    row.operatingIncome = num(s.operatingIncome);
    row.netIncome = num(s.netIncome);
    row.sharesOutstanding = num(s.weightedAverageShsOutDil) ?? num(s.weightedAverageShsOut);
  }
  for (const s of raw.cashflow) {
    const period = str(s.date);
    if (!period) continue;
    const row = ensure(period);
    row.operatingCashFlow = num(s.operatingCashFlow) ?? num(s.netCashProvidedByOperatingActivities);
    row.capex = num(s.capitalExpenditure);
    row.fcf = num(s.freeCashFlow);
  }
  for (const s of raw.balance) {
    const period = str(s.date);
    if (!period) continue;
    const row = ensure(period);
    row.cash = num(s.cashAndShortTermInvestments) ?? num(s.cashAndCashEquivalents);
    row.totalDebt = num(s.totalDebt);
  }
  const quarters = [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period)).slice(-8);
  const latest = quarters[quarters.length - 1];
  const last4 = quarters.slice(-4);
  const sumOrNull = (pick: (q: QuarterRow) => number | null): number | null => {
    if (last4.length < 4) return null;
    let total = 0;
    for (const row of last4) {
      const v = pick(row);
      if (v === null) return null;
      total += v;
    }
    return total;
  };
  const revenueTTM = sumOrNull((x) => x.revenue);
  const fcfTTM = sumOrNull((x) => x.fcf);
  const ocfTTM = sumOrNull((x) => x.operatingCashFlow);
  const buybacks = raw.cashflow.slice(0, 4).reduce<number | null>((acc, s) => {
    const v = num(s.commonStockRepurchased);
    if (v === null || acc === null) return raw.cashflow.length >= 4 ? (v === null ? null : acc) : null;
    return acc + Math.abs(v);
  }, raw.cashflow.length >= 4 ? 0 : null);

  let growth: number | null = null;
  let growthSource = `${SRC} (quarterly statements)`;
  if (latest?.revenue !== null && latest?.revenue !== undefined && quarters.length >= 5) {
    const yearAgo = quarters[quarters.length - 5];
    if (yearAgo.revenue && yearAgo.revenue !== 0) {
      growth = ((latest.revenue - yearAgo.revenue) / Math.abs(yearAgo.revenue)) * 100;
      growthSource = `${SRC} (quarterly statements, ${latest.period} vs ${yearAgo.period})`;
    }
  }

  const marketCap = num(q.marketCap);
  const news: NewsItem[] = raw.news
    .map((n, i): NewsItem | null => {
      const date = isoDate(str(n.publishedDate));
      const headline = str(n.title);
      if (!date || !headline) return null;
      return {
        id: `fmp-${i}-${date}`,
        date,
        headline,
        source: str(n.site) ?? str(n.publisher) ?? SRC,
        url: str(n.url),
        summary: str(n.text),
      };
    })
    .filter((n): n is NewsItem => n !== null);
  const recent = recentNews(news, now);
  const nextEarnings =
    raw.earnings
      .map((e) => isoDate(str(e.date)))
      .filter((d): d is string => d !== null && d >= today)
      .sort()[0] ?? null;

  const gm = num(r.grossProfitMarginTTM);
  const om = num(r.operatingProfitMarginTTM);
  const latestPeriod = latest?.period ?? today;

  return {
    symbol,
    companyName: str(p.companyName) ?? str(q.name) ?? symbol,
    exchange: str(p.exchange) ?? str(q.exchange),
    currency: str(p.currency) ?? "USD",
    sector: str(p.sector),
    industry: str(p.industry),
    description: str(p.description),
    provider: "fmp",
    fetchedAt: now.toISOString(),
    quote: {
      price: sourced(num(q.price), `${SRC} quote`, quoteDate, url),
      dayChangePct: sourced(num(q.changePercentage) ?? num(q.changesPercentage), `${SRC} quote`, quoteDate, url),
      week52Low: sourced(num(q.yearLow), `${SRC} quote`, quoteDate, url),
      week52High: sourced(num(q.yearHigh), `${SRC} quote`, quoteDate, url),
      marketCap: sourced(marketCap, `${SRC} quote`, quoteDate, url),
      sharesOutstanding: sourced(num(q.sharesOutstanding) ?? latest?.sharesOutstanding ?? null, `${SRC} quote`, quoteDate, url),
    },
    valuation: {
      trailingPE: sourced(num(r.priceToEarningsRatioTTM) ?? num(q.pe), `${SRC} ratios TTM`, today, url),
      forwardPE: sourced(null, `${SRC} does not publish forward P/E on this endpoint`, today, url),
      evToEbitda: sourced(num(r.enterpriseValueMultipleTTM), `${SRC} ratios TTM`, today, url),
      priceToSales: sourced(num(r.priceToSalesRatioTTM), `${SRC} ratios TTM`, today, url),
      priceToFcf: sourced(num(r.priceToFreeCashFlowRatioTTM), `${SRC} ratios TTM`, today, url),
      priceToBook: sourced(num(r.priceToBookRatioTTM), `${SRC} ratios TTM`, today, url),
    },
    fundamentals: {
      revenueTTM: sourced(revenueTTM, `${SRC} (sum of last 4 quarters)`, latestPeriod, url),
      revenueGrowthYoYPct: sourced(growth, growthSource, latestPeriod, url),
      grossMarginPct: sourced(gm !== null ? gm * 100 : null, `${SRC} ratios TTM`, today, url),
      operatingMarginPct: sourced(om !== null ? om * 100 : null, `${SRC} ratios TTM`, today, url),
      fcfTTM: sourced(fcfTTM, `${SRC} (sum of last 4 quarters)`, latestPeriod, url),
      operatingCashFlowTTM: sourced(ocfTTM, `${SRC} (sum of last 4 quarters)`, latestPeriod, url),
      cash: sourced(latest?.cash ?? null, `${SRC} (balance sheet ${latestPeriod})`, latestPeriod, url),
      totalDebt: sourced(latest?.totalDebt ?? null, `${SRC} (balance sheet ${latestPeriod})`, latestPeriod, url),
      buybacksTTM: sourced(buybacks, `${SRC} (sum of last 4 quarters)`, latestPeriod, url),
      netShareIssuanceTTM: sourced(null, `${SRC} (not provided)`, latestPeriod, url),
    },
    quarters,
    nextEarningsDate: nextEarnings,
    news: recent,
    newsSource: recent.length ? "provider" : "none",
  };
}

export class FmpAdapter implements DataAdapter {
  readonly name = "fmp";
  constructor(private readonly apiKey: string) {}

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const u = new URL(`${BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("apikey", this.apiKey);
    const res = await fetch(u, { headers: { accept: "application/json" } });
    if (res.status === 401 || res.status === 403) throw new ProviderError("fmp", `endpoint ${path} not allowed on this plan (${res.status})`);
    if (res.status === 429) throw new ProviderError("fmp", "rate limited (429)");
    if (!res.ok) throw new ProviderError("fmp", `${path} -> HTTP ${res.status}`);
    return res.json();
  }

  private async optional(path: string, params: Record<string, string>): Promise<Rec[]> {
    try {
      return asRecArray(await this.get(path, params));
    } catch {
      return [];
    }
  }

  async search(query: string): Promise<SymbolMatch[]> {
    const rows = asRecArray(await this.get("search-symbol", { query, limit: "8" }));
    return rows
      .filter((x) => typeof x.symbol === "string")
      .map((x) => ({
        symbol: String(x.symbol),
        name: String(x.name ?? x.symbol),
        exchange: str(x.exchange) ?? str(x.exchangeFullName),
        type: "EQUITY",
      }));
  }

  async fetch(symbol: string): Promise<StockData> {
    const quoteRows = asRecArray(await this.get("quote", { symbol }));
    if (!quoteRows.length) throw new SymbolNotFoundError(symbol);
    const [profile, ratios, income, cashflow, balance, news, earnings] = await Promise.all([
      this.optional("profile", { symbol }),
      this.optional("ratios-ttm", { symbol }),
      this.optional("income-statement", { symbol, period: "quarter", limit: "8" }),
      this.optional("cash-flow-statement", { symbol, period: "quarter", limit: "8" }),
      this.optional("balance-sheet-statement", { symbol, period: "quarter", limit: "8" }),
      this.optional("news/stock", { symbols: symbol, limit: "20" }),
      this.optional("earnings", { symbol, limit: "8" }),
    ]);
    return normalizeFmp(symbol, {
      capturedAt: new Date().toISOString(),
      quote: quoteRows[0],
      profile: profile[0] ?? {},
      ratiosTtm: ratios[0] ?? {},
      income,
      cashflow,
      balance,
      news,
      earnings,
    });
  }
}
