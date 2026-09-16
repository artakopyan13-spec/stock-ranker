import YahooFinance from "yahoo-finance2";
import {
  type DataAdapter,
  type NewsItem,
  type QuarterRow,
  type StockData,
  type SymbolMatch,
  SymbolNotFoundError,
  ProviderError,
  isoDate,
  num,
  pct,
  recentNews,
  sourced,
  todayIso,
} from "@/lib/data/types";

type Rec = Record<string, unknown>;

const SRC = "Yahoo Finance";
const yfUrl = (symbol: string, tab = "") =>
  `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/${tab}`;

function asRec(v: unknown): Rec {
  return typeof v === "object" && v !== null ? (v as Rec) : {};
}
function asRecArray(v: unknown): Rec[] {
  return Array.isArray(v) ? v.map(asRec) : [];
}
function dateOf(v: unknown): string | null {
  if (v instanceof Date) return isoDate(v);
  if (typeof v === "number" || typeof v === "string") return isoDate(v);
  return null;
}

/** Raw responses the normalizer consumes — also the shape of tests/fixtures/yahoo_*.json. */
export interface YahooRaw {
  capturedAt: string;
  quote: Rec;
  summary: Rec;
  fin: Rec[];
  cf: Rec[];
  bs: Rec[];
  ttm: Rec[];
  search: Rec;
}

/** Pure: turns raw Yahoo responses into StockData. Exported so tests run it on fixtures. */
export function normalizeYahoo(symbol: string, raw: YahooRaw, now: Date = new Date()): StockData {
  const q = raw.quote;
  const s = raw.summary;
  const profile = asRec(s.assetProfile);
  const fd = asRec(s.financialData);
  const ks = asRec(s.defaultKeyStatistics);
  const sd = asRec(s.summaryDetail);
  const cal = asRec(asRec(s.calendarEvents).earnings);

  const fetchedAt = now.toISOString();
  const today = todayIso(now);
  const quoteDate = dateOf(q.regularMarketTime) ?? today;
  const quoteUrl = yfUrl(symbol);

  // ---- quarterly statements (ascending by date) ----
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
  for (const r of raw.fin) {
    const p = dateOf(r.date);
    if (!p) continue;
    const row = ensure(p);
    row.revenue = num(r.totalRevenue);
    row.grossProfit = num(r.grossProfit);
    row.operatingIncome = num(r.operatingIncome);
    row.netIncome = num(r.netIncome);
    if (row.sharesOutstanding === null) row.sharesOutstanding = num(r.dilutedAverageShares);
  }
  for (const r of raw.cf) {
    const p = dateOf(r.date);
    if (!p) continue;
    const row = ensure(p);
    row.operatingCashFlow = num(r.operatingCashFlow);
    row.capex = num(r.capitalExpenditure);
    row.fcf = num(r.freeCashFlow);
  }
  for (const r of raw.bs) {
    const p = dateOf(r.date);
    if (!p) continue;
    const row = ensure(p);
    row.cash = num(r.cashCashEquivalentsAndShortTermInvestments) ?? num(r.cashAndCashEquivalents);
    row.totalDebt = num(r.totalDebt);
    const shares = num(r.ordinarySharesNumber);
    if (shares !== null) row.sharesOutstanding = shares;
  }
  const quarters = [...byPeriod.values()]
    .filter((r) => r.revenue !== null || r.fcf !== null || r.cash !== null)
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-8);
  const latestQ = quarters[quarters.length - 1];
  const latestPeriod = latestQ?.period ?? today;

  // ---- TTM cash flow ----
  const ttmRow = raw.ttm.length ? raw.ttm[raw.ttm.length - 1] : {};
  const ttmDate = dateOf(ttmRow.date) ?? latestPeriod;
  const ttmFcf = num(ttmRow.freeCashFlow) ?? num(fd.freeCashflow);
  const ttmOcf = num(ttmRow.operatingCashFlow) ?? num(fd.operatingCashflow);
  const repurchase = num(ttmRow.repurchaseOfCapitalStock);
  const issuance = num(ttmRow.netCommonStockIssuance);
  const ttmSource = raw.ttm.length ? `${SRC} (TTM cash flow)` : `${SRC} (financialData)`;
  const ttmAsOf = raw.ttm.length ? ttmDate : today;

  // ---- revenue growth: prefer statement math, fall back to Yahoo's revenueGrowth ----
  let revenueGrowth: number | null = null;
  let revenueGrowthSource = `${SRC} (financialData revenueGrowth)`;
  let revenueGrowthAsOf = today;
  if (latestQ?.revenue !== null && latestQ?.revenue !== undefined) {
    const yearAgo = quarters.find(
      (r) => r.period.slice(0, 4) === String(Number(latestQ.period.slice(0, 4)) - 1) && r.period.slice(5, 7) === latestQ.period.slice(5, 7),
    );
    if (yearAgo?.revenue && yearAgo.revenue !== 0) {
      revenueGrowth = ((latestQ.revenue - yearAgo.revenue) / Math.abs(yearAgo.revenue)) * 100;
      revenueGrowthSource = `${SRC} (quarterly statements, ${latestQ.period} vs ${yearAgo.period})`;
      revenueGrowthAsOf = latestQ.period;
    }
  }
  if (revenueGrowth === null) revenueGrowth = pct(num(fd.revenueGrowth));

  const marketCap = num(q.marketCap);
  const priceToFcf = marketCap !== null && ttmFcf !== null && ttmFcf > 0 ? marketCap / ttmFcf : null;

  // ---- news (Yahoo search returns related news; keep the 7-day window) ----
  const newsRaw = asRecArray(asRec(raw.search).news);
  const news: NewsItem[] = newsRaw
    .map((n, i): NewsItem | null => {
      const date = dateOf(n.providerPublishTime);
      const headline = typeof n.title === "string" ? n.title : null;
      if (!date || !headline) return null;
      return {
        id: typeof n.uuid === "string" ? n.uuid : `yahoo-${i}`,
        date,
        headline,
        source: typeof n.publisher === "string" ? n.publisher : "Yahoo Finance",
        url: typeof n.link === "string" ? n.link : null,
        summary: null,
      };
    })
    .filter((n): n is NewsItem => n !== null);
  const recent = recentNews(news, now);

  const earningsDates = Array.isArray(cal.earningsDate) ? cal.earningsDate : [];
  const nextEarnings = earningsDates.map(dateOf).find((d): d is string => d !== null && d >= today) ?? null;

  const name =
    (typeof q.longName === "string" && q.longName) ||
    (typeof q.shortName === "string" && q.shortName) ||
    symbol;

  const finUrl = yfUrl(symbol, "financials/");
  const statsUrl = yfUrl(symbol, "key-statistics/");

  return {
    symbol,
    companyName: name,
    exchange: typeof q.fullExchangeName === "string" ? q.fullExchangeName : null,
    currency: typeof q.currency === "string" ? q.currency : "USD",
    sector: typeof profile.sector === "string" ? profile.sector : null,
    industry: typeof profile.industry === "string" ? profile.industry : null,
    description: typeof profile.longBusinessSummary === "string" ? profile.longBusinessSummary : null,
    provider: "yahoo",
    fetchedAt,
    quote: {
      price: sourced(num(q.regularMarketPrice), `${SRC} quote`, quoteDate, quoteUrl),
      dayChangePct: sourced(num(q.regularMarketChangePercent), `${SRC} quote`, quoteDate, quoteUrl),
      week52Low: sourced(num(q.fiftyTwoWeekLow), `${SRC} quote`, quoteDate, quoteUrl),
      week52High: sourced(num(q.fiftyTwoWeekHigh), `${SRC} quote`, quoteDate, quoteUrl),
      marketCap: sourced(marketCap, `${SRC} quote`, quoteDate, quoteUrl),
      sharesOutstanding: sourced(
        num(q.sharesOutstanding) ?? num(ks.sharesOutstanding),
        `${SRC} key statistics`,
        quoteDate,
        statsUrl,
      ),
    },
    valuation: {
      trailingPE: sourced(num(q.trailingPE), `${SRC} quote`, quoteDate, quoteUrl),
      forwardPE: sourced(num(q.forwardPE), `${SRC} quote`, quoteDate, quoteUrl),
      evToEbitda: sourced(num(ks.enterpriseToEbitda), `${SRC} key statistics`, quoteDate, statsUrl),
      priceToSales: sourced(num(sd.priceToSalesTrailing12Months), `${SRC} key statistics`, quoteDate, statsUrl),
      priceToFcf: sourced(priceToFcf, `Derived: market cap ÷ TTM FCF (${SRC})`, quoteDate, statsUrl),
      priceToBook: sourced(num(ks.priceToBook), `${SRC} key statistics`, quoteDate, statsUrl),
    },
    fundamentals: {
      revenueTTM: sourced(num(fd.totalRevenue), `${SRC} (financialData, TTM)`, today, finUrl),
      revenueGrowthYoYPct: sourced(revenueGrowth, revenueGrowthSource, revenueGrowthAsOf, finUrl),
      grossMarginPct: sourced(pct(num(fd.grossMargins)), `${SRC} (financialData, TTM)`, today, finUrl),
      operatingMarginPct: sourced(pct(num(fd.operatingMargins)), `${SRC} (financialData, TTM)`, today, finUrl),
      fcfTTM: sourced(ttmFcf, ttmSource, ttmAsOf, finUrl),
      operatingCashFlowTTM: sourced(ttmOcf, ttmSource, ttmAsOf, finUrl),
      cash: sourced(
        latestQ?.cash ?? num(fd.totalCash),
        latestQ?.cash !== null && latestQ?.cash !== undefined ? `${SRC} (balance sheet ${latestPeriod})` : `${SRC} (financialData)`,
        latestQ?.cash !== null && latestQ?.cash !== undefined ? latestPeriod : today,
        finUrl,
      ),
      totalDebt: sourced(
        latestQ?.totalDebt ?? num(fd.totalDebt),
        latestQ?.totalDebt !== null && latestQ?.totalDebt !== undefined ? `${SRC} (balance sheet ${latestPeriod})` : `${SRC} (financialData)`,
        latestQ?.totalDebt !== null && latestQ?.totalDebt !== undefined ? latestPeriod : today,
        finUrl,
      ),
      buybacksTTM: sourced(repurchase !== null ? Math.abs(repurchase) : null, ttmSource, ttmAsOf, finUrl),
      netShareIssuanceTTM: sourced(issuance, ttmSource, ttmAsOf, finUrl),
    },
    quarters,
    nextEarningsDate: nextEarnings,
    news: recent,
    newsSource: recent.length ? "provider" : "none",
  };
}

export class YahooAdapter implements DataAdapter {
  readonly name = "yahoo";
  private readonly yf: InstanceType<typeof YahooFinance>;

  constructor() {
    this.yf = new YahooFinance({
      suppressNotices: ["yahooSurvey"],
      validation: { logErrors: false },
    });
  }

  async search(query: string): Promise<SymbolMatch[]> {
    try {
      const res = await this.yf.search(query, { quotesCount: 8, newsCount: 0 });
      const quotes = asRecArray(res.quotes);
      return quotes
        .filter((x) => typeof x.symbol === "string")
        .map((x) => ({
          symbol: String(x.symbol),
          name: String(x.longname ?? x.shortname ?? x.symbol),
          exchange: typeof x.exchange === "string" ? x.exchange : null,
          type: typeof x.quoteType === "string" ? x.quoteType : "UNKNOWN",
        }));
    } catch (err) {
      throw new ProviderError("yahoo", `search failed for "${query}"`, err);
    }
  }

  async fetchRaw(symbol: string): Promise<YahooRaw> {
    const yf = this.yf;
    const since = new Date();
    since.setFullYear(since.getFullYear() - 3);
    const period1 = since.toISOString().slice(0, 10);
    const ttmSince = new Date();
    ttmSince.setMonth(ttmSince.getMonth() - 15);
    const noValidate = { validateResult: false as const };

    let quote: Rec;
    try {
      quote = asRec(await yf.quote(symbol));
    } catch (err) {
      throw new ProviderError("yahoo", `quote failed for ${symbol}`, err);
    }
    if (!quote || quote.regularMarketPrice === undefined) throw new SymbolNotFoundError(symbol);

    const [summary, fin, cf, bs, ttm, search] = await Promise.all([
      yf
        .quoteSummary(symbol, {
          modules: ["assetProfile", "financialData", "defaultKeyStatistics", "summaryDetail", "calendarEvents"],
        })
        .then(asRec)
        .catch(() => ({}) as Rec),
      yf.fundamentalsTimeSeries(symbol, { period1, type: "quarterly", module: "financials" }, noValidate).then(asRecArray).catch(() => []),
      yf.fundamentalsTimeSeries(symbol, { period1, type: "quarterly", module: "cash-flow" }, noValidate).then(asRecArray).catch(() => []),
      yf.fundamentalsTimeSeries(symbol, { period1, type: "quarterly", module: "balance-sheet" }, noValidate).then(asRecArray).catch(() => []),
      yf
        .fundamentalsTimeSeries(symbol, { period1: ttmSince.toISOString().slice(0, 10), type: "trailing", module: "cash-flow" }, noValidate)
        .then(asRecArray)
        .catch(() => []),
      yf.search(symbol, { newsCount: 12, quotesCount: 1 }).then(asRec).catch(() => ({ news: [] }) as Rec),
    ]);

    return { capturedAt: new Date().toISOString(), quote, summary, fin, cf, bs, ttm, search };
  }

  async fetch(symbol: string): Promise<StockData> {
    const raw = await this.fetchRaw(symbol);
    return normalizeYahoo(symbol, raw);
  }
}
