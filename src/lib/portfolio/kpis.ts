import type { Analysis } from "@/lib/analysis/schema";
import type { CompanyData } from "@/lib/data/company";
import type { StockData } from "@/lib/data/types";
import { compact, money, multiple, pct } from "@/lib/format";

export type Flag = "good" | "warn" | "bad" | "none";
export interface Kpi {
  label: string;
  value: string;
  info?: string; // glossary id for the (?) tooltip
  flag: Flag;
}
export interface KpiGroup {
  name: string;
  items: Kpi[];
}
export interface Trend {
  label: string;
  unit: string;
  periods: string[];
  values: Array<number | null>;
  yoy: Array<string | null>;
  note: string | null;
}

/** Numbers for one position, computed from live company data + the cached analysis (never the model). */
export interface PositionNumbers {
  symbol: string;
  price: number | null;
  currency: string;
  sector: string | null;
  fcfIcon: "✅" | "⚠️" | "❌" | "—";
  fcfTtm: number | null;
  fcfMarginPct: number | null;
  range52: [number, number] | null;
  nextEarnings: string | null;
  kgroups: KpiGroup[];
  trends: Trend[];
  history: Trend[]; // annual, one bar per fiscal year
  hasAnalysis: boolean;
  hasLiveData: boolean;
}

const q = (p: string) => {
  const [y, m] = p.split("-");
  return `Q${Math.ceil(Number(m) / 3)}'${y.slice(2)}`;
};
const marginOf = (n: number | null | undefined, d: number | null | undefined): number | null => (n !== null && n !== undefined && d ? (n / d) * 100 : null);

const FCF_ICON: Record<string, "✅" | "⚠️" | "❌" | "—"> = { healthy: "✅", thin: "⚠️", negative: "❌", unverified: "—" };

function flagFwdPe(v: number | null): Flag {
  if (v === null) return "none";
  if (v < 20) return "good";
  if (v > 45) return "bad";
  return "none";
}
function flagFcfMargin(v: number | null): Flag {
  if (v === null) return "none";
  if (v >= 15) return "good";
  if (v < 2) return "bad";
  return "warn";
}
function flagNetCash(v: number | null): Flag {
  if (v === null) return "none";
  return v >= 0 ? "good" : "warn";
}

/**
 * Builds the full KPI groups + quarterly trends for a position (FCF-first, debt never optional).
 * `stock` is LIVE data (getStockData) — the primary source per the skill's "live data first" rule;
 * `company` supplies longer history; `analysis` adds the AI rating/thesis when one exists.
 */
export function positionNumbers(symbol: string, stock: StockData | null, company: CompanyData | null, analysis: Analysis | null): PositionNumbers {
  const cur = stock?.currency ?? company?.currency ?? analysis?.meta.currency ?? "USD";
  const price = stock?.quote.price.value ?? analysis?.price.current.value ?? null;
  const ks = company?.overview.keyStats;
  const latest = company && company.annual.length ? company.annual[company.annual.length - 1] : null;

  // Prefer live StockData; fall back to the cached analysis, then to company financials.
  const v = stock?.valuation;
  const f = stock?.fundamentals;
  const fwdPe = v?.forwardPE.value ?? analysis?.valuation.forwardPE.value ?? null;
  const fcfTtm = f?.fcfTTM.value ?? analysis?.fcf.ttm.value ?? latest?.fcf ?? null;
  const revTtm = f?.revenueTTM.value ?? analysis?.growth.revenueTTM.value ?? latest?.revenue ?? null;
  const fcfMargin = analysis?.fcf.marginPct.value ?? marginOf(fcfTtm, revTtm);
  const cash = f?.cash.value ?? analysis?.balanceSheet.cash.value ?? latest?.cash ?? null;
  const totalDebt = f?.totalDebt.value ?? analysis?.balanceSheet.totalDebt.value ?? latest?.totalDebt ?? null;
  const netCash = cash !== null && totalDebt !== null ? cash - totalDebt : analysis?.balanceSheet.netCash ?? null;
  const mktCap = stock?.quote.marketCap.value ?? analysis?.price.marketCap.value ?? ks?.marketCap ?? null;
  const low = stock?.quote.week52Low.value ?? analysis?.price.week52Low.value ?? null;
  const high = stock?.quote.week52High.value ?? analysis?.price.week52High.value ?? null;
  const revGrowth = f?.revenueGrowthYoYPct.value ?? analysis?.growth.revenueGrowthYoYLatestQ.value ?? null;
  const grossM = f?.grossMarginPct.value ?? analysis?.growth.grossMarginPct.value ?? marginOf(latest?.grossProfit, latest?.revenue);
  const opM = f?.operatingMarginPct.value ?? analysis?.growth.operatingMarginPct.value ?? marginOf(latest?.operatingIncome, latest?.revenue);

  const valuation: Kpi[] = [
    { label: "Fwd P/E", info: "forward-pe", value: multiple(fwdPe), flag: flagFwdPe(fwdPe) },
    { label: "Trailing P/E", info: "pe", value: multiple(v?.trailingPE.value ?? analysis?.valuation.trailingPE.value ?? null), flag: "none" },
    { label: "P/FCF", info: "pfcf", value: multiple(v?.priceToFcf.value ?? analysis?.valuation.priceToFcf.value ?? null), flag: "none" },
    { label: "EV/EBITDA", value: multiple(v?.evToEbitda.value ?? analysis?.valuation.evToEbitda.value ?? null), flag: "none" },
    { label: "P/S", value: multiple(v?.priceToSales.value ?? analysis?.valuation.priceToSales.value ?? null), flag: "none" },
    { label: "P/B", value: multiple(v?.priceToBook.value ?? analysis?.valuation.priceToBook.value ?? null), flag: "none" },
  ];
  const growth: Kpi[] = [
    { label: "Rev TTM", value: revTtm !== null ? `${money(revTtm, cur)} · ${pct(revGrowth, 1, true)}` : "—", flag: "none" },
    { label: "Gross margin", info: "gross-margin", value: pct(grossM), flag: "none" },
    { label: "Operating margin", info: "operating-margin", value: pct(opM), flag: "none" },
    { label: "FCF margin", info: "fcf-margin", value: pct(fcfMargin), flag: flagFcfMargin(fcfMargin) },
  ];
  const balance: Kpi[] = [
    { label: "Cash", value: money(cash, cur), flag: "none" },
    { label: "Total debt", value: money(totalDebt, cur), flag: "none" },
    { label: "Net cash/debt", info: "net-cash", value: netCash === null ? "—" : money(netCash, cur), flag: flagNetCash(netCash) },
    { label: "Buybacks TTM", value: money(f?.buybacksTTM.value ?? analysis?.balanceSheet.buybacksTTM.value ?? null, cur), flag: "none" },
  ];
  const market: Kpi[] = [
    { label: "Mkt cap", info: "market-cap", value: money(mktCap, cur), flag: "none" },
    { label: "52-wk range", value: low !== null && high !== null ? `${compact(low)} – ${compact(high)}` : "—", flag: "none" },
    { label: "Beta", info: "beta", value: ks?.beta != null ? ks.beta.toFixed(2) : "—", flag: "none" },
    { label: "Dividend yield", info: "dividend-yield", value: pct(ks?.dividendYieldPct ?? null), flag: "none" },
  ];

  const kgroups: KpiGroup[] = [
    { name: "Valuation", items: valuation },
    { name: "Growth & profitability", items: growth },
    { name: "Balance sheet & debt", items: balance },
    { name: "Market", items: market },
  ];

  const trends: Trend[] = [];
  const quarters = company && company.quarterly.length >= 2 ? company.quarterly : [];
  if (quarters.length >= 2) {
    const recent = quarters.slice(-8);
    const periods = recent.map((r) => q(r.period));
    const yoyFor = (vals: Array<number | null>) =>
      vals.map((v, i) => {
        const prev = i >= 4 ? vals[i - 4] : null;
        return v !== null && prev !== null && prev !== 0 ? `${(((v - prev) / Math.abs(prev)) * 100).toFixed(0)}%` : null;
      });
    const rev = recent.map((r) => r.revenue);
    const fcf = recent.map((r) => r.fcf);
    trends.push({ label: "Revenue", unit: cur, periods, values: rev, yoy: yoyFor(rev), note: null });
    if (fcf.some((v) => v !== null)) trends.push({ label: "Free cash flow", unit: cur, periods, values: fcf, yoy: yoyFor(fcf), note: null });
    const gm = recent.map((r) => marginOf(r.grossProfit, r.revenue));
    if (gm.some((v) => v !== null)) trends.push({ label: "Gross margin", unit: "%", periods, values: gm, yoy: [], note: null });
  }

  // Long-term history: annual revenue / net income / FCF (last ~5 fiscal years).
  const history: Trend[] = [];
  const years = company?.annual ?? [];
  if (years.length >= 2) {
    const recent = years.slice(-6);
    const periods = recent.map((r) => `FY${r.period.slice(2, 4)}`);
    const rev = recent.map((r) => r.revenue);
    history.push({ label: "Revenue", unit: cur, periods, values: rev, yoy: [], note: "annual" });
    const ni = recent.map((r) => r.netIncome);
    if (ni.some((v) => v !== null)) history.push({ label: "Net income", unit: cur, periods, values: ni, yoy: [], note: "annual" });
    const afcf = recent.map((r) => r.fcf);
    if (afcf.some((v) => v !== null)) history.push({ label: "Free cash flow", unit: cur, periods, values: afcf, yoy: [], note: "annual" });
  }

  // FCF verdict: prefer the analysis's; otherwise derive from the live margin.
  const derivedIcon: "✅" | "⚠️" | "❌" | "—" =
    fcfTtm !== null && fcfTtm < 0 ? "❌" : fcfMargin !== null ? (fcfMargin >= 15 ? "✅" : fcfMargin >= 2 ? "⚠️" : "❌") : fcfTtm !== null ? (fcfTtm > 0 ? "✅" : "❌") : "—";

  return {
    symbol,
    price,
    currency: cur,
    sector: stock?.sector ?? company?.overview.sector ?? analysis?.meta.sector ?? null,
    fcfIcon: analysis ? FCF_ICON[analysis.fcf.verdict] : derivedIcon,
    fcfTtm,
    fcfMarginPct: fcfMargin,
    range52: low !== null && high !== null && high > low ? [low, high] : null,
    nextEarnings: stock?.nextEarningsDate ?? null,
    kgroups,
    trends,
    history,
    hasAnalysis: Boolean(analysis),
    hasLiveData: Boolean(stock),
  };
}
