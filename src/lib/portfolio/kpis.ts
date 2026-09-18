import type { Analysis } from "@/lib/analysis/schema";
import type { CompanyData } from "@/lib/data/company";
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
  fcfIcon: "✅" | "⚠️" | "❌" | "—";
  fcfTtm: number | null;
  fcfMarginPct: number | null;
  range52: [number, number] | null;
  kgroups: KpiGroup[];
  trends: Trend[];
  history: Trend[]; // annual, one bar per fiscal year
  hasAnalysis: boolean;
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

/** Builds the full KPI groups + quarterly trends for a position (FCF-first, debt never optional). */
export function positionNumbers(symbol: string, company: CompanyData | null, analysis: Analysis | null): PositionNumbers {
  const cur = company?.currency ?? analysis?.meta.currency ?? "USD";
  const price = analysis?.price.current.value ?? null;
  const ks = company?.overview.keyStats;
  const latest = company && company.annual.length ? company.annual[company.annual.length - 1] : null;

  const fcfTtm = analysis?.fcf.ttm.value ?? latest?.fcf ?? null;
  const fcfMargin = analysis?.fcf.marginPct.value ?? marginOf(latest?.fcf, latest?.revenue);
  const netCash = analysis?.balanceSheet.netCash ?? (latest && latest.cash !== null && latest.totalDebt !== null ? latest.cash - latest.totalDebt : null);

  const valuation: Kpi[] = [
    { label: "Fwd P/E", info: "forward-pe", value: multiple(analysis?.valuation.forwardPE.value ?? null), flag: flagFwdPe(analysis?.valuation.forwardPE.value ?? null) },
    { label: "Trailing P/E", info: "pe", value: multiple(analysis?.valuation.trailingPE.value ?? null), flag: "none" },
    { label: "P/FCF", info: "pfcf", value: multiple(analysis?.valuation.priceToFcf.value ?? null), flag: "none" },
    { label: "EV/EBITDA", value: multiple(analysis?.valuation.evToEbitda.value ?? null), flag: "none" },
    { label: "P/S", value: multiple(analysis?.valuation.priceToSales.value ?? null), flag: "none" },
    { label: "P/B", value: multiple(analysis?.valuation.priceToBook.value ?? null), flag: "none" },
  ];
  const growth: Kpi[] = [
    { label: "Rev TTM", value: analysis ? `${money(analysis.growth.revenueTTM.value, cur)} · ${pct(analysis.growth.revenueGrowthYoYLatestQ.value, 1, true)}` : money(latest?.revenue ?? null, cur), flag: "none" },
    { label: "Gross margin", info: "gross-margin", value: pct(analysis?.growth.grossMarginPct.value ?? marginOf(latest?.grossProfit, latest?.revenue)), flag: "none" },
    { label: "Operating margin", info: "operating-margin", value: pct(analysis?.growth.operatingMarginPct.value ?? marginOf(latest?.operatingIncome, latest?.revenue)), flag: "none" },
    { label: "FCF margin", info: "fcf-margin", value: pct(fcfMargin), flag: flagFcfMargin(fcfMargin) },
  ];
  const balance: Kpi[] = [
    { label: "Cash", value: money(analysis?.balanceSheet.cash.value ?? latest?.cash ?? null, cur), flag: "none" },
    { label: "Total debt", value: money(analysis?.balanceSheet.totalDebt.value ?? latest?.totalDebt ?? null, cur), flag: "none" },
    { label: "Net cash/debt", value: netCash === null ? "—" : money(netCash, cur), flag: flagNetCash(netCash) },
    { label: "Posture", value: analysis?.balanceSheet.posture ?? (netCash === null ? "—" : netCash >= 0 ? "net_cash" : "net_debt"), flag: "none" },
  ];
  const market: Kpi[] = [
    { label: "Mkt cap", info: "market-cap", value: money(analysis?.price.marketCap.value ?? ks?.marketCap ?? null, cur), flag: "none" },
    { label: "52-wk range", value: analysis && analysis.price.week52Low.value !== null && analysis.price.week52High.value !== null ? `${compact(analysis.price.week52Low.value)} – ${compact(analysis.price.week52High.value)}` : "—", flag: "none" },
    { label: "Beta", value: ks?.beta != null ? ks.beta.toFixed(2) : "—", flag: "none" },
    { label: "Dividend yield", info: "dividend-yield", value: pct(ks?.dividendYieldPct ?? null), flag: "none" },
  ];

  const kgroups: KpiGroup[] = [
    { name: "Valuation", items: valuation },
    { name: "Growth & profitability", items: growth },
    { name: "Balance sheet & debt", items: balance },
    { name: "Market", items: market },
  ];

  const trends: Trend[] = [];
  const quarters = company?.quarterly ?? [];
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

  const low = analysis?.price.week52Low.value ?? null;
  const high = analysis?.price.week52High.value ?? null;

  return {
    symbol,
    price,
    currency: cur,
    fcfIcon: analysis ? FCF_ICON[analysis.fcf.verdict] : fcfTtm !== null ? (fcfTtm > 0 ? "✅" : "❌") : "—",
    fcfTtm,
    fcfMarginPct: fcfMargin,
    range52: low !== null && high !== null && high > low ? [low, high] : null,
    kgroups,
    trends,
    history,
    hasAnalysis: Boolean(analysis),
  };
}
