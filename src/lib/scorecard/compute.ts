import type { CompanyData, FinancialRow } from "@/lib/data/company";

/**
 * A deterministic, code-computed quality/value scorecard for a stock. Every point is math on
 * the provider's financials — no model judgment — so it fits the app's "no invented numbers"
 * rule. FCF-weighted, in the spirit of the analysis. Metrics with missing data score neutral.
 */
export type Tone = "good" | "ok" | "bad" | "unknown";

export interface ScMetric {
  label: string;
  help: string;
  ideal: string;
  value: string;
  tone: Tone;
  points: number;
  max: number;
}
export interface ScPillar {
  key: string;
  name: string;
  score: number;
  max: number;
  metrics: ScMetric[];
}
export interface Scorecard {
  overall: { score: number; max: number; pct: number; grade: string; verdict: string };
  pillars: ScPillar[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

// ---- scoring primitives (frac in [0,1]) ----
type S = { frac: number; tone: Tone };
function hi(v: number | null, good: number, ok: number): S {
  if (v == null || !Number.isFinite(v)) return { frac: 0.4, tone: "unknown" };
  if (v >= good) return { frac: 1, tone: "good" };
  if (v >= ok) return { frac: 0.5 + (0.5 * (v - ok)) / (good - ok), tone: "ok" };
  if (v <= 0) return { frac: 0, tone: "bad" };
  return { frac: Math.max(0, (0.5 * v) / ok), tone: "bad" };
}
function lo(v: number | null, good: number, ok: number): S {
  if (v == null || !Number.isFinite(v) || v < 0) return { frac: 0.4, tone: "unknown" };
  if (v <= good) return { frac: 1, tone: "good" };
  if (v <= ok) return { frac: 0.5 + (0.5 * (ok - v)) / (ok - good), tone: "ok" };
  return { frac: Math.max(0, (0.4 * ok) / v), tone: "bad" };
}
function bool(v: boolean | null, goodFrac = 1): S {
  if (v == null) return { frac: 0.4, tone: "unknown" };
  return v ? { frac: goodFrac, tone: "good" } : { frac: 0, tone: "bad" };
}

// ---- formatting ----
const pct = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${r1(v)}%`);
const mult = (v: number | null) => (v == null || !Number.isFinite(v) || v < 0 ? "—" : `${r1(v)}×`);
function money(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e9) return `${s}$${r1(a / 1e9)}B`;
  if (a >= 1e6) return `${s}$${r1(a / 1e6)}M`;
  return `${s}$${Math.round(a)}`;
}

// ---- data helpers ----
function ttm(q: FinancialRow[], key: keyof FinancialRow): number | null {
  const last4 = q.slice(-4);
  if (last4.length < 4) return null;
  let s = 0;
  for (const row of last4) {
    const v = row[key];
    if (typeof v !== "number") return null;
    s += v;
  }
  return s;
}
const div = (a: number | null, b: number | null): number | null => (a != null && b != null && b !== 0 ? a / b : null);
const marginPct = (a: number | null, b: number | null): number | null => {
  const q = div(a, b);
  return q == null ? null : q * 100;
};

function metric(label: string, help: string, ideal: string, value: string, s: S, max: number): ScMetric {
  return { label, help, ideal, value, tone: s.tone, points: r1(s.frac * max), max };
}
function pillar(key: string, name: string, metrics: ScMetric[]): ScPillar {
  const score = r1(metrics.reduce((a, m) => a + m.points, 0));
  const max = r1(metrics.reduce((a, m) => a + m.max, 0));
  return { key, name, score, max, metrics };
}

export function computeScorecard(data: CompanyData): Scorecard | null {
  const A = data.annual;
  if (A.length === 0) return null;
  const a = A[A.length - 1];
  const q = data.quarterly;
  const ks = data.overview.keyStats;

  // Prefer trailing-twelve-month flows; fall back to the latest fiscal year.
  const rev = ttm(q, "revenue") ?? a.revenue;
  const ni = ttm(q, "netIncome") ?? a.netIncome;
  const fcf = ttm(q, "fcf") ?? a.fcf;
  const gp = ttm(q, "grossProfit") ?? a.grossProfit;
  const oi = ttm(q, "operatingIncome") ?? a.operatingIncome;
  const equity = a.equity;
  const debt = a.totalDebt;
  const cash = a.cash;
  const mcap = ks.marketCap;

  // ---------- Profitability & quality ----------
  const netM = marginPct(ni, rev);
  const grossM = marginPct(gp, rev);
  const opM = marginPct(oi, rev);
  const fcfM = marginPct(fcf, rev);
  const roe = marginPct(ni, equity);
  const last5 = A.slice(-5);
  const positiveYears = last5.filter((y) => (y.netIncome ?? -1) > 0).length;
  const lossFree = last5.length ? { frac: positiveYears / last5.length, tone: (positiveYears === last5.length ? "good" : positiveYears >= last5.length - 1 ? "ok" : "bad") as Tone } : { frac: 0.4, tone: "unknown" as Tone };

  const profit = pillar("profit", "Profitability & Quality", [
    metric("Net margin", "Net income as a share of revenue — how much of each sale becomes profit.", ">20% ideal", pct(netM), hi(netM, 20, 8), 6),
    metric("Free cash flow margin", "FCF as a share of revenue. The app's #1 lens: real cash the business throws off.", ">10% ideal", pct(fcfM), hi(fcfM, 10, 3), 6),
    metric("Return on equity", "Net income over shareholder equity — how hard the equity works.", ">15% ideal", pct(roe), hi(roe, 15, 8), 6),
    metric("Gross margin", "Revenue minus cost of goods, as a share of revenue — pricing power.", ">40% ideal", pct(grossM), hi(grossM, 40, 20), 5),
    metric("Operating margin", "Operating income over revenue — profitability of the core business.", ">15% ideal", pct(opM), hi(opM, 15, 6), 4),
    metric("Loss-free record", "Profitable years out of the last five. Consistency beats a single great year.", "5/5 ideal", `${positiveYears}/${last5.length || 5}`, lossFree, 3),
  ]);

  // ---------- Growth ----------
  const revYoY = A.length >= 2 ? marginPct((a.revenue ?? 0) - (A[A.length - 2].revenue ?? 0), A[A.length - 2].revenue) : null;
  const cagr = (last: number | null, first: number | null, yrs: number): number | null =>
    last != null && first != null && first > 0 && last > 0 && yrs > 0 ? (Math.pow(last / first, 1 / yrs) - 1) * 100 : null;
  const span = Math.min(5, A.length - 1);
  const revCAGR = span > 0 ? cagr(a.revenue, A[A.length - 1 - span].revenue, span) : null;
  const epsNow = div(ni, a.sharesOutstanding);
  const epsThen = span > 0 ? div(A[A.length - 1 - span].netIncome, A[A.length - 1 - span].sharesOutstanding) : null;
  const epsCAGR = span > 0 ? cagr(epsNow, epsThen, span) : null;
  // FCF trend: latest vs average of the prior three years.
  const fcfSeries = A.map((y) => y.fcf).filter((x): x is number => typeof x === "number");
  let fcfTrend: S = { frac: 0.4, tone: "unknown" };
  let fcfTrendLabel = "—";
  if (fcfSeries.length >= 4) {
    const latest = fcfSeries[fcfSeries.length - 1];
    const prior = fcfSeries.slice(-4, -1);
    const avg = prior.reduce((x, y) => x + y, 0) / prior.length;
    const chg = avg !== 0 ? (latest - avg) / Math.abs(avg) : 0;
    fcfTrend = chg > 0.05 ? { frac: 1, tone: "good" } : chg > -0.05 ? { frac: 0.6, tone: "ok" } : { frac: 0.2, tone: "bad" };
    fcfTrendLabel = chg > 0.05 ? "Rising" : chg > -0.05 ? "Flat" : "Falling";
  }

  const growth = pillar("growth", "Growth", [
    metric("Revenue growth (YoY)", "Latest year's revenue vs the prior year.", ">10% ideal", pct(revYoY), hi(revYoY, 10, 3), 5),
    metric(`Revenue CAGR (${span || "—"}yr)`, "Compound annual revenue growth over the window — the durable trend.", ">10% ideal", pct(revCAGR), hi(revCAGR, 10, 3), 5),
    metric(`EPS growth (${span || "—"}yr)`, "Compound annual growth in earnings per share — growth that reaches owners.", ">10% ideal", pct(epsCAGR), hi(epsCAGR, 10, 2), 6),
    metric("Free cash flow trend", "Latest FCF vs the prior three-year average.", "Rising ideal", fcfTrendLabel, fcfTrend, 4),
  ]);

  // ---------- Financial health ----------
  const netCash = debt != null && cash != null ? cash - debt : null;
  const de = div(debt, equity);
  const fcfPos = fcf == null ? null : fcf > 0;
  const shPrev = span > 0 ? A[A.length - 1 - span].sharesOutstanding : null;
  const dilution = shPrev && a.sharesOutstanding ? (a.sharesOutstanding / shPrev - 1) * 100 : null;
  const dilutionScore: S = dilution == null ? { frac: 0.4, tone: "unknown" } : dilution <= 0 ? { frac: 1, tone: "good" } : dilution <= 5 ? { frac: 0.6, tone: "ok" } : { frac: 0.2, tone: "bad" };

  const health = pillar("health", "Financial Health", [
    metric("Net cash position", "Cash minus total debt. Positive means the balance sheet is a fortress.", "Positive ideal", money(netCash), bool(netCash == null ? null : netCash >= 0), 6),
    metric("Debt / equity", "Total debt over equity — leverage.", "<0.5 ideal", de == null ? "—" : `${r1(de)}`, lo(de, 0.5, 1.5), 5),
    metric("Free cash flow positive", "Does the business generate positive free cash flow?", "Yes", fcf == null ? "—" : fcf > 0 ? "Yes" : "No", bool(fcfPos), 5),
    metric(`Share count (${span || "—"}yr)`, "Change in shares outstanding. Buybacks (shrinking) reward owners; issuance dilutes them.", "Shrinking ideal", dilution == null ? "—" : `${dilution > 0 ? "+" : ""}${r1(dilution)}%`, dilutionScore, 4),
  ]);

  // ---------- Valuation (current, from market cap) ----------
  const pe = mcap != null && ni != null && ni > 0 ? mcap / ni : null;
  const pfcf = mcap != null && fcf != null && fcf > 0 ? mcap / fcf : null;
  const ps = div(mcap, rev);
  const peHist = data.valuationHistory.map((v) => v.pe).filter((x): x is number => typeof x === "number" && x > 0);
  const peAvg5 = peHist.length ? peHist.slice(-5).reduce((x, y) => x + y, 0) / peHist.slice(-5).length : null;
  const peVs5y = pe != null && peAvg5 ? pe / peAvg5 : null;
  const peg = pe != null && revCAGR != null && revCAGR > 0 ? pe / revCAGR : null;

  const valuation = pillar("valuation", "Valuation", [
    metric("Price / free cash flow", "Market cap over trailing FCF. The app's primary value lens — what you pay for the cash.", "<20 ideal", mult(pfcf), lo(pfcf, 20, 40), 9),
    metric("Price / earnings", "Market cap over trailing net income.", "<20 ideal", mult(pe), lo(pe, 20, 40), 7),
    metric("Price / sales", "Market cap over trailing revenue — useful when earnings are thin.", "<5 ideal", mult(ps), lo(ps, 5, 12), 5),
    metric("P/E vs 5-yr average", "Today's P/E relative to its own five-year average — cheaper than its history is good.", "<1.0× ideal", mult(peVs5y), lo(peVs5y, 1.0, 1.5), 5),
    metric("PEG (P/E ÷ growth)", "Valuation adjusted for growth — a rich multiple can be fair if growth is high.", "<1.5 ideal", peg == null ? "—" : `${r1(peg)}`, lo(peg, 1.5, 3), 4),
  ]);

  const pillars = [profit, growth, health, valuation];
  const score = r1(pillars.reduce((s, p) => s + p.score, 0));
  const max = r1(pillars.reduce((s, p) => s + p.max, 0));
  const pctScore = max > 0 ? (score / max) * 100 : 0;
  const grade = pctScore >= 85 ? "A" : pctScore >= 75 ? "A−" : pctScore >= 65 ? "B" : pctScore >= 55 ? "B−" : pctScore >= 45 ? "C" : "D";
  const verdict = pctScore >= 75 ? "Excellent" : pctScore >= 60 ? "Good" : pctScore >= 45 ? "Fair" : "Weak";

  return { overall: { score, max, pct: r1(pctScore), grade, verdict }, pillars };
}
