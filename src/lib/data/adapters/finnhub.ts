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
const SRC = "Finnhub";
const BASE = "https://finnhub.io/api/v1";

function asRec(v: unknown): Rec {
  return typeof v === "object" && v !== null ? (v as Rec) : {};
}
function asRecArray(v: unknown): Rec[] {
  return Array.isArray(v) ? v.map(asRec) : [];
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : null;
}

/** Raw Finnhub responses. */
export interface FinnhubRaw {
  capturedAt: string;
  quote: Rec; // /quote
  profile: Rec; // /stock/profile2
  metric: Rec; // /stock/metric?metric=all -> .metric
  reported: Rec[]; // /stock/financials-reported?freq=quarterly -> .data
  news: Rec[]; // /company-news
  earnings: Rec[]; // /calendar/earnings -> .earningsCalendar
}

/** us-gaap concepts Finnhub reports, by statement. First match wins. */
const CONCEPTS = {
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  ocf: ["NetCashProvidedByUsedInOperatingActivities"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  cash: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "CashAndCashEquivalentsAtCarryingValue"],
  debt: ["LongTermDebt", "LongTermDebtNoncurrent", "DebtCurrent"],
  shares: ["WeightedAverageNumberOfDilutedSharesOutstanding", "CommonStockSharesOutstanding"],
} as const;

function pick(items: Rec[], concepts: readonly string[]): number | null {
  for (const c of concepts) {
    const hit = items.find((i) => i.concept === c);
    const v = hit ? num(hit.value) : null;
    if (v !== null) return v;
  }
  return null;
}

export function normalizeFinnhub(symbol: string, raw: FinnhubRaw, now: Date = new Date()): StockData {
  const today = todayIso(now);
  const q = raw.quote;
  const p = raw.profile;
  const m = raw.metric;
  const quoteDate = isoDate(typeof q.t === "number" ? q.t : null) ?? today;
  const url = `https://finnhub.io/quote/${encodeURIComponent(symbol)}`;

  const quarters: QuarterRow[] = raw.reported
    .map((rep): QuarterRow | null => {
      const period = isoDate(str(rep.endDate) ?? str(rep.filedDate));
      if (!period) return null;
      const report = asRec(rep.report);
      const ic = asRecArray(report.ic);
      const cf = asRecArray(report.cf);
      const bs = asRecArray(report.bs);
      const ocf = pick(cf, CONCEPTS.ocf);
      const capexPaid = pick(cf, CONCEPTS.capex);
      const capex = capexPaid !== null ? -Math.abs(capexPaid) : null;
      const debtLong = pick(bs, ["LongTermDebtNoncurrent", "LongTermDebt"]);
      const debtCur = pick(bs, ["DebtCurrent", "LongTermDebtCurrent"]);
      return {
        period,
        revenue: pick(ic, CONCEPTS.revenue),
        grossProfit: pick(ic, CONCEPTS.grossProfit),
        operatingIncome: pick(ic, CONCEPTS.operatingIncome),
        netIncome: pick(ic, CONCEPTS.netIncome),
        operatingCashFlow: ocf,
        capex,
        fcf: ocf !== null && capex !== null ? ocf + capex : null,
        cash: pick(bs, CONCEPTS.cash),
        totalDebt: debtLong !== null || debtCur !== null ? (debtLong ?? 0) + (debtCur ?? 0) : null,
        sharesOutstanding: pick(ic, CONCEPTS.shares) ?? pick(bs, CONCEPTS.shares),
        source: `${SRC} (SEC financials-reported)`,
        asOf: period,
      };
    })
    .filter((r): r is QuarterRow => r !== null)
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-8);
  const latest = quarters[quarters.length - 1];
  const latestPeriod = latest?.period ?? today;
  const last4 = quarters.slice(-4);
  const sumOrNull = (f: (r: QuarterRow) => number | null): number | null => {
    if (last4.length < 4) return null;
    let t = 0;
    for (const r of last4) {
      const v = f(r);
      if (v === null) return null;
      t += v;
    }
    return t;
  };

  const marketCapMillions = num(p.marketCapitalization);
  const sharesMillions = num(p.shareOutstanding);
  const marketCap = marketCapMillions !== null ? marketCapMillions * 1e6 : null;
  const fcfTTM = sumOrNull((r) => r.fcf);
  const priceToFcf = marketCap !== null && fcfTTM !== null && fcfTTM > 0 ? marketCap / fcfTTM : null;

  const news: NewsItem[] = raw.news
    .map((n): NewsItem | null => {
      const date = isoDate(typeof n.datetime === "number" ? n.datetime : null);
      const headline = str(n.headline);
      if (!date || !headline) return null;
      return {
        id: `finnhub-${String(n.id ?? date)}`,
        date,
        headline,
        source: str(n.source) ?? SRC,
        url: str(n.url),
        summary: str(n.summary),
      };
    })
    .filter((n): n is NewsItem => n !== null);
  const recent = recentNews(news, now);
  const nextEarnings =
    raw.earnings
      .map((e) => isoDate(str(e.date)))
      .filter((d): d is string => d !== null && d >= today)
      .sort()[0] ?? null;

  return {
    symbol,
    companyName: str(p.name) ?? symbol,
    exchange: str(p.exchange),
    currency: str(p.currency) ?? "USD",
    sector: null,
    industry: str(p.finnhubIndustry),
    description: null,
    provider: "finnhub",
    fetchedAt: now.toISOString(),
    quote: {
      price: sourced(num(q.c), `${SRC} quote`, quoteDate, url),
      dayChangePct: sourced(num(q.dp), `${SRC} quote`, quoteDate, url),
      week52Low: sourced(num(m["52WeekLow"]), `${SRC} basic financials`, quoteDate, url),
      week52High: sourced(num(m["52WeekHigh"]), `${SRC} basic financials`, quoteDate, url),
      marketCap: sourced(marketCap, `${SRC} profile`, quoteDate, url),
      sharesOutstanding: sourced(sharesMillions !== null ? sharesMillions * 1e6 : null, `${SRC} profile`, quoteDate, url),
    },
    valuation: {
      trailingPE: sourced(num(m.peTTM) ?? num(m.peBasicExclExtraTTM), `${SRC} basic financials`, quoteDate, url),
      forwardPE: sourced(null, `${SRC} does not provide forward P/E`, quoteDate, url),
      evToEbitda: sourced(num(m["currentEv/ebitdaTTM"]), `${SRC} basic financials`, quoteDate, url),
      priceToSales: sourced(num(m.psTTM), `${SRC} basic financials`, quoteDate, url),
      priceToFcf: sourced(priceToFcf, `Derived: market cap ÷ TTM FCF (${SRC})`, quoteDate, url),
      priceToBook: sourced(num(m.pbQuarterly) ?? num(m.pbAnnual), `${SRC} basic financials`, quoteDate, url),
    },
    fundamentals: {
      revenueTTM: sourced(sumOrNull((r) => r.revenue), `${SRC} (sum of last 4 quarters)`, latestPeriod, url),
      revenueGrowthYoYPct: sourced(num(m.revenueGrowthQuarterlyYoy), `${SRC} basic financials`, quoteDate, url),
      grossMarginPct: sourced(num(m.grossMarginTTM), `${SRC} basic financials`, quoteDate, url),
      operatingMarginPct: sourced(num(m.operatingMarginTTM), `${SRC} basic financials`, quoteDate, url),
      fcfTTM: sourced(fcfTTM, `${SRC} (OCF − capex, last 4 quarters)`, latestPeriod, url),
      operatingCashFlowTTM: sourced(sumOrNull((r) => r.operatingCashFlow), `${SRC} (sum of last 4 quarters)`, latestPeriod, url),
      cash: sourced(latest?.cash ?? null, `${SRC} (balance sheet ${latestPeriod})`, latestPeriod, url),
      totalDebt: sourced(latest?.totalDebt ?? null, `${SRC} (balance sheet ${latestPeriod})`, latestPeriod, url),
      buybacksTTM: sourced(null, `${SRC} (not provided)`, latestPeriod, url),
      netShareIssuanceTTM: sourced(null, `${SRC} (not provided)`, latestPeriod, url),
    },
    quarters,
    nextEarningsDate: nextEarnings,
    news: recent,
    newsSource: recent.length ? "provider" : "none",
  };
}

export class FinnhubAdapter implements DataAdapter {
  readonly name = "finnhub";
  constructor(private readonly apiKey: string) {}

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const u = new URL(`${BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const res = await fetch(u, { headers: { "X-Finnhub-Token": this.apiKey, accept: "application/json" } });
    if (res.status === 429) throw new ProviderError("finnhub", "rate limited (429)");
    if (res.status === 403) throw new ProviderError("finnhub", `${path} requires a paid plan`);
    if (!res.ok) throw new ProviderError("finnhub", `${path} -> HTTP ${res.status}`);
    return res.json();
  }

  private async optional(path: string, params: Record<string, string>): Promise<unknown> {
    try {
      return await this.get(path, params);
    } catch {
      return null;
    }
  }

  async search(query: string): Promise<SymbolMatch[]> {
    const res = asRec(await this.get("search", { q: query }));
    return asRecArray(res.result)
      .filter((x) => typeof x.symbol === "string")
      .slice(0, 8)
      .map((x) => ({
        symbol: String(x.symbol),
        name: String(x.description ?? x.symbol),
        exchange: null,
        type: str(x.type) ?? "UNKNOWN",
      }));
  }

  async fetch(symbol: string): Promise<StockData> {
    const quote = asRec(await this.get("quote", { symbol }));
    if (num(quote.c) === null || quote.c === 0) throw new SymbolNotFoundError(symbol);
    const today = todayIso();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const to = new Date();
    to.setDate(to.getDate() + 120);
    const [profile, metric, reported, news, earnings] = await Promise.all([
      this.optional("stock/profile2", { symbol }),
      this.optional("stock/metric", { symbol, metric: "all" }),
      this.optional("stock/financials-reported", { symbol, freq: "quarterly" }),
      this.optional("company-news", { symbol, from: from.toISOString().slice(0, 10), to: today }),
      this.optional("calendar/earnings", { symbol, from: today, to: to.toISOString().slice(0, 10) }),
    ]);
    return normalizeFinnhub(symbol, {
      capturedAt: new Date().toISOString(),
      quote,
      profile: asRec(profile),
      metric: asRec(asRec(metric).metric),
      reported: asRecArray(asRec(reported).data),
      news: asRecArray(news),
      earnings: asRecArray(asRec(earnings).earningsCalendar),
    });
  }
}
