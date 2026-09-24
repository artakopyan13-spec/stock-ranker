import type { CompanyData, FinancialRow } from "@/lib/data/company";

/**
 * A deterministic, code-computed quality/value scorecard for a stock. Every point is math on
 * the provider's financials — no model judgment — so it fits the app's "no invented numbers"
 * rule. FCF-weighted, and the good/bad standards are ADJUSTED BY SECTOR so a low-margin
 * retailer or a leveraged utility isn't judged by software-company rules. Missing figures
 * score neutral.
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
  overall: { score: number; max: number; pct: number; grade: string; verdict: string; strengths: string[]; watch: string[] };
  sectorLabel: string;
  pillars: ScPillar[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

// ---- sector-aware thresholds ----
type Band = [good: number, ok: number];
interface Cfg {
  netMargin: Band;
  grossMargin: Band;
  opMargin: Band;
  fcfMargin: Band;
  roe: Band;
  roa: Band;
  roic: Band;
  revGrowth: Band;
  epsGrowth: Band;
  pe: Band; // lower better
  pfcf: Band;
  pocf: Band;
  ps: Band;
  peg: Band;
  de: Band;
  ndEbitda: Band; // net debt / EBITDA, lower better
  leverageNormal: boolean; // true = debt is structural; don't punish net debt
}

const BASE: Cfg = {
  netMargin: [20, 8],
  grossMargin: [40, 20],
  opMargin: [15, 6],
  fcfMargin: [10, 3],
  roe: [15, 8],
  roa: [8, 3],
  roic: [12, 6],
  revGrowth: [10, 3],
  epsGrowth: [10, 2],
  pe: [20, 40],
  pfcf: [20, 40],
  pocf: [18, 35],
  ps: [5, 12],
  peg: [1.5, 3],
  de: [0.5, 1.5],
  ndEbitda: [2, 3.5],
  leverageNormal: false,
};

/** Per-sector overrides (Yahoo sector strings, lowercased). Anything omitted inherits BASE. */
const SECTORS: Record<string, Partial<Cfg>> = {
  technology: { netMargin: [18, 8], grossMargin: [55, 35], opMargin: [18, 8], roa: [10, 4], roic: [15, 7], revGrowth: [15, 5], epsGrowth: [15, 4], pe: [30, 55], pfcf: [30, 55], pocf: [25, 45], ps: [8, 18], peg: [2, 4] },
  "communication services": { netMargin: [15, 6], grossMargin: [50, 30], opMargin: [15, 7], roa: [8, 3], revGrowth: [12, 4], pe: [28, 50], pfcf: [28, 55], pocf: [22, 45], ps: [6, 14], peg: [2, 4] },
  healthcare: { netMargin: [12, 5], grossMargin: [45, 25], opMargin: [15, 6], revGrowth: [8, 2], pe: [25, 45], pfcf: [25, 50], pocf: [22, 40], ps: [4, 9] },
  "consumer defensive": { netMargin: [8, 4], grossMargin: [30, 18], opMargin: [10, 5], roa: [8, 4], roic: [12, 6], revGrowth: [5, 1], epsGrowth: [7, 2], pe: [22, 35], pfcf: [22, 45], pocf: [15, 30], ps: [2, 4] },
  "consumer cyclical": { netMargin: [8, 3], grossMargin: [30, 18], opMargin: [8, 4], roa: [7, 3], revGrowth: [8, 2], pe: [20, 35], pfcf: [22, 45], pocf: [14, 28], ps: [2, 5] },
  industrials: { netMargin: [10, 5], grossMargin: [30, 18], opMargin: [12, 6], revGrowth: [8, 2], pe: [20, 35], pocf: [14, 28], ps: [2.5, 6] },
  energy: { netMargin: [10, 4], grossMargin: [30, 15], opMargin: [12, 5], roa: [7, 3], revGrowth: [8, 0], pe: [15, 30], pfcf: [15, 30], pocf: [8, 18], ps: [2, 5], de: [0.6, 1.5], ndEbitda: [2.5, 4], leverageNormal: true },
  "basic materials": { netMargin: [10, 4], grossMargin: [28, 15], opMargin: [12, 5], roa: [7, 3], revGrowth: [8, 0], pe: [16, 30], pocf: [8, 18], ps: [2, 5], de: [0.6, 1.5], ndEbitda: [2.5, 4], leverageNormal: true },
  utilities: { netMargin: [10, 6], grossMargin: [30, 18], opMargin: [15, 8], roa: [3, 1.5], roic: [7, 4], revGrowth: [4, 0], epsGrowth: [5, 1], pe: [20, 30], pfcf: [25, 55], pocf: [12, 25], ps: [3, 6], de: [1.5, 2.5], ndEbitda: [4.5, 6.5], leverageNormal: true },
  "real estate": { netMargin: [20, 8], grossMargin: [45, 25], opMargin: [25, 12], roa: [4, 2], roic: [6, 3], revGrowth: [6, 1], pe: [30, 60], pfcf: [25, 60], pocf: [14, 28], ps: [6, 14], de: [1.5, 3], ndEbitda: [6, 9], leverageNormal: true },
  "financial services": { netMargin: [22, 12], grossMargin: [60, 35], opMargin: [25, 12], roe: [12, 7], roa: [1.3, 0.7], roic: [10, 5], revGrowth: [8, 2], pe: [15, 25], pfcf: [20, 45], pocf: [12, 30], ps: [3, 6], de: [2, 4], ndEbitda: [5, 8], leverageNormal: true },
};

function cfgFor(sector: string | null): Cfg {
  const key = (sector ?? "").trim().toLowerCase();
  return { ...BASE, ...(SECTORS[key] ?? {}) };
}

// ---- scoring primitives (frac in [0,1]) ----
type S = { frac: number; tone: Tone };
function hi(v: number | null, [good, ok]: Band): S {
  if (v == null || !Number.isFinite(v)) return { frac: 0.4, tone: "unknown" };
  if (v >= good) return { frac: 1, tone: "good" };
  if (v >= ok) return { frac: 0.5 + (0.5 * (v - ok)) / (good - ok), tone: "ok" };
  if (v <= 0) return { frac: 0, tone: "bad" };
  return { frac: Math.max(0, (0.5 * v) / ok), tone: "bad" };
}
function lo(v: number | null, [good, ok]: Band): S {
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
  const c = cfgFor(data.overview.sector);
  const sectorLabel = data.overview.sector ?? "the market";

  const rev = ttm(q, "revenue") ?? a.revenue;
  const ni = ttm(q, "netIncome") ?? a.netIncome;
  const fcf = ttm(q, "fcf") ?? a.fcf;
  const gp = ttm(q, "grossProfit") ?? a.grossProfit;
  const oi = ttm(q, "operatingIncome") ?? a.operatingIncome;
  const ebitda = ttm(q, "ebitda") ?? a.ebitda;
  const ocf = ttm(q, "operatingCashFlow") ?? a.operatingCashFlow;
  const assets = a.totalAssets;
  const equity = a.equity;
  const debt = a.totalDebt;
  const cash = a.cash;
  const mcap = ks.marketCap;

  // ---------- Profitability & quality ----------
  const netM = marginPct(ni, rev);
  const grossM = marginPct(gp, rev);
  const opM = marginPct(oi, rev);
  const fcfM = marginPct(fcf, rev);
  const roe = equity != null && equity > 0 ? marginPct(ni, equity) : null; // negative equity makes ROE meaningless
  const roa = assets != null && assets > 0 ? marginPct(ni, assets) : null;
  const investedCapital = (debt ?? 0) + (equity ?? 0);
  const roic = oi != null && investedCapital > 0 ? ((oi * 0.79) / investedCapital) * 100 : null; // NOPAT ≈ EBIT × (1 − 21% tax)
  const cashConv = ocf != null && ni != null && ni > 0 ? ocf / ni : null; // operating cash flow per $1 of net income
  const cashConvScore: S = cashConv == null ? { frac: 0.4, tone: "unknown" } : cashConv >= 0.9 ? { frac: 1, tone: "good" } : cashConv >= 0.7 ? { frac: 0.6, tone: "ok" } : { frac: 0.2, tone: "bad" };
  const last5 = A.slice(-5);
  const positiveYears = last5.filter((y) => (y.netIncome ?? -1) > 0).length;
  const lossFree: S = last5.length ? { frac: positiveYears / last5.length, tone: positiveYears === last5.length ? "good" : positiveYears >= last5.length - 1 ? "ok" : "bad" } : { frac: 0.4, tone: "unknown" };

  const profit = pillar("profit", "Profitability & Quality", [
    metric("Net margin", "Net income as a share of revenue — how much of each sale becomes profit. Adjusted for the sector.", `>${c.netMargin[0]}% ideal`, pct(netM), hi(netM, c.netMargin), 5),
    metric("Free cash flow margin", "FCF as a share of revenue. The app's #1 lens: real cash the business throws off.", `>${c.fcfMargin[0]}% ideal`, pct(fcfM), hi(fcfM, c.fcfMargin), 5),
    metric("Return on equity", "Net income over shareholder equity — how hard the equity works. (Blank when equity is negative.)", `>${c.roe[0]}% ideal`, pct(roe), hi(roe, c.roe), 5),
    metric("Return on invested capital", "After-tax operating profit over debt + equity — how well management turns capital into profit. Adjusted for the sector.", `>${c.roic[0]}% ideal`, pct(roic), hi(roic, c.roic), 5),
    metric("Return on assets", "Net income over total assets — profit per dollar of assets. Adjusted for the sector.", `>${c.roa[0]}% ideal`, pct(roa), hi(roa, c.roa), 4),
    metric("Gross margin", "Revenue minus cost of goods, as a share of revenue — pricing power. Adjusted for the sector.", `>${c.grossMargin[0]}% ideal`, pct(grossM), hi(grossM, c.grossMargin), 3),
    metric("Operating margin", "Operating income over revenue — profitability of the core business.", `>${c.opMargin[0]}% ideal`, pct(opM), hi(opM, c.opMargin), 3),
    metric("Cash-backed earnings", "Operating cash flow per $1 of net income — are the profits real cash, or just accounting? Below ~0.9× is a quality flag.", "≥0.9× ideal", cashConv == null ? "—" : `${r1(cashConv)}×`, cashConvScore, 3),
    metric("Loss-free record", "Profitable years out of the last five. Consistency beats a single great year.", "5/5 ideal", `${positiveYears}/${last5.length || 5}`, lossFree, 2),
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

  // Revenue and profit moving together is a quality signal (growth that reaches the bottom line).
  const niThen = span > 0 ? A[A.length - 1 - span].netIncome : null;
  let revNi: S = { frac: 0.4, tone: "unknown" };
  let revNiLabel = "—";
  if (revCAGR != null && ni != null && niThen != null) {
    const revUp = revCAGR > 0;
    const niUp = ni > niThen;
    revNi = revUp && niUp ? { frac: 1, tone: "good" } : revUp || niUp ? { frac: 0.5, tone: "ok" } : { frac: 0.15, tone: "bad" };
    revNiLabel = revUp && niUp ? "Aligned" : revUp || niUp ? "Mixed" : "Both falling";
  }

  const growth = pillar("growth", "Growth", [
    metric("Revenue growth (YoY)", "Latest year's revenue vs the prior year. Adjusted for the sector.", `>${c.revGrowth[0]}% ideal`, pct(revYoY), hi(revYoY, c.revGrowth), 4),
    metric(`Revenue CAGR (${span || "—"}yr)`, "Compound annual revenue growth over the window — the durable trend.", `>${c.revGrowth[0]}% ideal`, pct(revCAGR), hi(revCAGR, c.revGrowth), 5),
    metric(`EPS growth (${span || "—"}yr)`, "Compound annual growth in earnings per share — growth that reaches owners.", `>${c.epsGrowth[0]}% ideal`, pct(epsCAGR), hi(epsCAGR, c.epsGrowth), 5),
    metric("Revenue & income aligned", "Are revenue and net income both growing? Profit that keeps pace with sales is higher quality.", "Aligned ideal", revNiLabel, revNi, 3),
    metric("Free cash flow trend", "Latest FCF vs the prior three-year average.", "Rising ideal", fcfTrendLabel, fcfTrend, 3),
  ]);

  // ---------- Financial health ----------
  const netCash = debt != null && cash != null ? cash - debt : null;
  const de = div(debt, equity);
  const fcfPos = fcf == null ? null : fcf > 0;
  const shPrev = span > 0 ? A[A.length - 1 - span].sharesOutstanding : null;
  const dilution = shPrev && a.sharesOutstanding ? (a.sharesOutstanding / shPrev - 1) * 100 : null;
  const dilutionScore: S = dilution == null ? { frac: 0.4, tone: "unknown" } : dilution <= 0 ? { frac: 1, tone: "good" } : dilution <= 5 ? { frac: 0.6, tone: "ok" } : { frac: 0.2, tone: "bad" };
  // In leverage-normal sectors (utilities, REITs, financials, energy) net debt is structural, not a red flag.
  const netCashScore: S =
    netCash == null ? { frac: 0.4, tone: "unknown" } : netCash >= 0 ? { frac: 1, tone: "good" } : c.leverageNormal ? { frac: 0.6, tone: "ok" } : { frac: 0, tone: "bad" };

  // Net debt / EBITDA — the standard leverage yardstick (years of cash earnings to clear the debt).
  let ndebScore: S;
  let ndebLabel: string;
  if (netCash == null || ebitda == null) {
    ndebScore = { frac: 0.4, tone: "unknown" };
    ndebLabel = "—";
  } else if (netCash >= 0) {
    ndebScore = { frac: 1, tone: "good" };
    ndebLabel = "Net cash";
  } else if (ebitda <= 0) {
    ndebScore = { frac: 0.15, tone: "bad" };
    ndebLabel = "—";
  } else {
    const v = -netCash / ebitda;
    ndebScore = lo(v, c.ndEbitda);
    ndebLabel = `${r1(v)}×`;
  }

  const health = pillar("health", "Financial Health", [
    metric("Net cash position", `Cash minus total debt. ${c.leverageNormal ? "Net debt is normal in this sector, so it isn't penalized." : "Positive means a fortress balance sheet."}`, c.leverageNormal ? "Positive is a plus" : "Positive ideal", money(netCash), netCashScore, 5),
    metric("Net debt / EBITDA", "Net debt against annual cash earnings — how many years of EBITDA would clear the debt. Adjusted for the sector.", `<${c.ndEbitda[0]}× ideal`, ndebLabel, ndebScore, 5),
    metric("Debt / equity", "Total debt over equity — leverage. Threshold adjusted for the sector.", `<${c.de[0]} ideal`, de == null ? "—" : `${r1(de)}`, lo(de, c.de), 4),
    metric("Free cash flow positive", "Does the business generate positive free cash flow?", "Yes", fcf == null ? "—" : fcf > 0 ? "Yes" : "No", bool(fcfPos), 4),
    metric(`Share count (${span || "—"}yr)`, "Change in shares outstanding. Buybacks (shrinking) reward owners; issuance dilutes them.", "Shrinking ideal", dilution == null ? "—" : `${dilution > 0 ? "+" : ""}${r1(dilution)}%`, dilutionScore, 3),
  ]);

  // ---------- Valuation (current, from market cap) ----------
  const pe = mcap != null && ni != null && ni > 0 ? mcap / ni : null;
  const pfcf = mcap != null && fcf != null && fcf > 0 ? mcap / fcf : null;
  const pocf = mcap != null && ocf != null && ocf > 0 ? mcap / ocf : null;
  const ps = div(mcap, rev);
  const peHist = data.valuationHistory.map((v) => v.pe).filter((x): x is number => typeof x === "number" && x > 0);
  const peAvg5 = peHist.length ? peHist.slice(-5).reduce((x, y) => x + y, 0) / peHist.slice(-5).length : null;
  const peVs5y = pe != null && peAvg5 ? pe / peAvg5 : null;
  const peg = pe != null && revCAGR != null && revCAGR > 0 ? pe / revCAGR : null;

  const valuation = pillar("valuation", "Valuation", [
    metric("Price / free cash flow", "Market cap over trailing FCF. The app's primary value lens — what you pay for the cash. Adjusted for the sector.", `<${c.pfcf[0]}× ideal`, mult(pfcf), lo(pfcf, c.pfcf), 8),
    metric("Price / operating cash flow", "Market cap over trailing operating cash flow — harder to game than earnings. Adjusted for the sector.", `<${c.pocf[0]}× ideal`, mult(pocf), lo(pocf, c.pocf), 6),
    metric("Price / earnings", "Market cap over trailing net income. Adjusted for the sector.", `<${c.pe[0]}× ideal`, mult(pe), lo(pe, c.pe), 6),
    metric("Price / sales", "Market cap over trailing revenue — useful when earnings are thin. Adjusted for the sector.", `<${c.ps[0]}× ideal`, mult(ps), lo(ps, c.ps), 4),
    metric("P/E vs 5-yr average", "Today's P/E relative to its own five-year average — cheaper than its history is good.", "<1.0× ideal", mult(peVs5y), lo(peVs5y, [1.0, 1.5]), 4),
    metric("PEG (P/E ÷ growth)", "Valuation adjusted for growth — a rich multiple can be fair if growth is high.", `<${c.peg[0]} ideal`, peg == null ? "—" : `${r1(peg)}`, lo(peg, c.peg), 4),
  ]);

  const pillars = [profit, growth, health, valuation];
  const score = r1(pillars.reduce((s, p) => s + p.score, 0));
  const max = r1(pillars.reduce((s, p) => s + p.max, 0));
  const pctScore = max > 0 ? (score / max) * 100 : 0;
  const grade = pctScore >= 85 ? "A" : pctScore >= 75 ? "A−" : pctScore >= 65 ? "B" : pctScore >= 55 ? "B−" : pctScore >= 45 ? "C" : "D";
  const verdict = pctScore >= 75 ? "Excellent" : pctScore >= 60 ? "Good" : pctScore >= 45 ? "Fair" : "Weak";

  // Auto strengths / watch: best "good" metrics and worst "bad" metrics by fill ratio.
  const all = pillars.flatMap((p) => p.metrics.map((m) => ({ label: m.label, tone: m.tone, fill: m.max ? m.points / m.max : 0 })));
  const strengths = all.filter((m) => m.tone === "good").sort((x, y) => y.fill - x.fill).slice(0, 3).map((m) => m.label);
  const watch = all.filter((m) => m.tone === "bad").sort((x, y) => x.fill - y.fill).slice(0, 3).map((m) => m.label);

  return { overall: { score, max, pct: r1(pctScore), grade, verdict, strengths, watch }, sectorLabel, pillars };
}
