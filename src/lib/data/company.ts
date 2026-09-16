import { num } from "@/lib/data/types";

type Rec = Record<string, unknown>;
const asRec = (v: unknown): Rec => (typeof v === "object" && v !== null ? (v as Rec) : {});
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(asRec) : []);
const iso = (d: unknown): string | null => {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === "string") return d.slice(0, 10);
  if (typeof d === "number") return new Date(d < 1e12 ? d * 1000 : d).toISOString().slice(0, 10);
  return null;
};

export interface FinancialRow {
  period: string; // fiscal period end, YYYY-MM-DD
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  ebitda: number | null;
  eps: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  fcf: number | null;
  cash: number | null;
  totalDebt: number | null;
  totalAssets: number | null;
  equity: number | null;
  sharesOutstanding: number | null;
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface ValuationPoint {
  period: string;
  pe: number | null;
  ps: number | null;
  pfcf: number | null;
  evEbitda: number | null;
}

export interface Insider {
  date: string;
  name: string;
  relation: string;
  action: string;
  shares: number | null;
  value: number | null;
}

export interface Institution {
  organization: string;
  pctHeld: number | null;
  value: number | null;
}

export interface CompanyOverview {
  description: string | null;
  sector: string | null;
  industry: string | null;
  website: string | null;
  employees: number | null;
  country: string | null;
  keyStats: { marketCap: number | null; sharesOutstanding: number | null; beta: number | null; dividendYieldPct: number | null; profitMarginPct: number | null };
  majorHolders: { insidersPctHeld: number | null; institutionsPctHeld: number | null; institutionsCount: number | null };
  insiders: Insider[];
  institutions: Institution[];
  source: string;
  asOf: string;
}

export interface CompanyData {
  symbol: string;
  currency: string;
  annual: FinancialRow[];
  quarterly: FinancialRow[];
  overview: CompanyOverview;
  valuationHistory: ValuationPoint[];
  source: string;
  fetchedAt: string;
}

export interface CompanyRaw {
  capturedAt: string;
  annual: Rec[];
  quarterly: Rec[];
  chart5y: { quotes: Rec[] };
  summary: Rec;
}

function financialRow(r: Rec): FinancialRow {
  const rev = num(r.totalRevenue) ?? num(r.operatingRevenue);
  const capex = num(r.capitalExpenditure);
  const ocf = num(r.operatingCashFlow) ?? num(r.cashFlowFromContinuingOperatingActivities);
  return {
    period: iso(r.date) ?? "",
    revenue: rev,
    grossProfit: num(r.grossProfit),
    operatingIncome: num(r.operatingIncome) ?? num(r.totalOperatingIncomeAsReported),
    netIncome: num(r.netIncome) ?? num(r.netIncomeCommonStockholders),
    ebitda: num(r.normalizedEBITDA) ?? num(r.EBITDA),
    eps: num(r.dilutedEPS) ?? num(r.basicEPS),
    operatingCashFlow: ocf,
    capex,
    fcf: num(r.freeCashFlow) ?? (ocf !== null && capex !== null ? ocf + capex : null),
    cash: num(r.cashAndCashEquivalents) ?? num(r.cashCashEquivalentsAndShortTermInvestments),
    totalDebt: num(r.totalDebt),
    totalAssets: num(r.totalAssets),
    equity: num(r.stockholdersEquity) ?? num(r.commonStockEquity),
    sharesOutstanding: num(r.ordinarySharesNumber) ?? num(r.dilutedAverageShares) ?? num(r.basicAverageShares),
  };
}

function priceAt(prices: PricePoint[], period: string): number | null {
  // Closest monthly close on or before the fiscal period end.
  let best: PricePoint | null = null;
  for (const p of prices) if (p.date <= period && (!best || p.date > best.date)) best = p;
  return best?.close ?? null;
}

export function normalizeCompany(symbol: string, raw: CompanyRaw): CompanyData {
  const profile = asRec(raw.summary.summaryProfile);
  const ks = asRec(raw.summary.defaultKeyStatistics);
  const price = asRec(raw.summary.price);
  const fd = asRec(raw.summary.financialData);
  const mh = asRec(raw.summary.majorHoldersBreakdown);
  const currency = typeof price.currency === "string" ? price.currency : "USD";

  const annual = raw.annual.map(financialRow).filter((r) => r.period).sort((a, b) => a.period.localeCompare(b.period)).slice(-10);
  const quarterly = raw.quarterly.map(financialRow).filter((r) => r.period).sort((a, b) => a.period.localeCompare(b.period)).slice(-12);

  const prices: PricePoint[] = raw.chart5y.quotes
    .map((q) => ({ date: iso(q.date) ?? "", close: num(q.close) ?? num(q.adjclose) ?? 0 }))
    .filter((p) => p.date && p.close > 0);

  // Annual valuation history computed from year-end price × shares vs each year's fundamentals.
  const valuationHistory: ValuationPoint[] = annual.map((y) => {
    const p = priceAt(prices, y.period);
    const mcap = p !== null && y.sharesOutstanding ? p * y.sharesOutstanding : null;
    const netDebt = y.totalDebt !== null && y.cash !== null ? y.totalDebt - y.cash : null;
    const ev = mcap !== null && netDebt !== null ? mcap + netDebt : null;
    return {
      period: y.period.slice(0, 4),
      pe: mcap !== null && y.netIncome && y.netIncome > 0 ? mcap / y.netIncome : null,
      ps: mcap !== null && y.revenue && y.revenue > 0 ? mcap / y.revenue : null,
      pfcf: mcap !== null && y.fcf && y.fcf > 0 ? mcap / y.fcf : null,
      evEbitda: ev !== null && y.ebitda && y.ebitda > 0 ? ev / y.ebitda : null,
    };
  });

  const insiders: Insider[] = asArr(asRec(raw.summary.insiderTransactions).transactions)
    .map((t) => ({
      date: iso(t.startDate) ?? "",
      name: String(t.filerName ?? ""),
      relation: String(t.filerRelation ?? ""),
      action: String(t.transactionText ?? ""),
      shares: num(t.shares),
      value: num(t.value),
    }))
    .filter((t) => t.date)
    .slice(0, 15);

  const institutions: Institution[] = asArr(asRec(raw.summary.institutionOwnership).ownershipList)
    .map((o) => ({ organization: String(o.organization ?? ""), pctHeld: num(asRec(o.pctHeld).raw ?? o.pctHeld), value: num(asRec(o.value).raw ?? o.value) }))
    .slice(0, 15);

  const asOf = raw.capturedAt.slice(0, 10);
  return {
    symbol,
    currency,
    annual,
    quarterly,
    valuationHistory,
    overview: {
      description: typeof profile.longBusinessSummary === "string" ? profile.longBusinessSummary : null,
      sector: typeof profile.sector === "string" ? profile.sector : null,
      industry: typeof profile.industry === "string" ? profile.industry : null,
      website: typeof profile.website === "string" ? profile.website : null,
      employees: num(profile.fullTimeEmployees),
      country: typeof profile.country === "string" ? profile.country : null,
      keyStats: {
        marketCap: num(asRec(price.marketCap).raw ?? price.marketCap),
        sharesOutstanding: num(ks.sharesOutstanding),
        beta: num(ks.beta),
        dividendYieldPct: num(fd.dividendYield) !== null ? (num(fd.dividendYield) as number) * 100 : num(ks.lastDividendValue) !== null ? null : null,
        profitMarginPct: num(fd.profitMargins) !== null ? (num(fd.profitMargins) as number) * 100 : null,
      },
      majorHolders: { insidersPctHeld: num(mh.insidersPercentHeld) !== null ? (num(mh.insidersPercentHeld) as number) * 100 : null, institutionsPctHeld: num(mh.institutionsPercentHeld) !== null ? (num(mh.institutionsPercentHeld) as number) * 100 : null, institutionsCount: num(mh.institutionsCount) },
      insiders,
      institutions,
      source: "Yahoo Finance",
      asOf,
    },
    source: "yahoo",
    fetchedAt: raw.capturedAt,
  };
}

// ---------- price history for the chart (separate, range-based) ----------
export type PriceRange = "1M" | "6M" | "1Y" | "5Y" | "MAX";

const RANGE_CONFIG: Record<PriceRange, { years: number; interval: "1d" | "1wk" | "1mo" }> = {
  "1M": { years: 0.09, interval: "1d" },
  "6M": { years: 0.5, interval: "1d" },
  "1Y": { years: 1, interval: "1d" },
  "5Y": { years: 5, interval: "1wk" },
  MAX: { years: 25, interval: "1mo" },
};

export function normalizePrices(quotes: Rec[]): PricePoint[] {
  return quotes.map((q) => ({ date: iso(q.date) ?? "", close: num(q.close) ?? num(q.adjclose) ?? 0 })).filter((p) => p.date && p.close > 0);
}

export { RANGE_CONFIG };
