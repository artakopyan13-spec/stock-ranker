import { z } from "zod";

/** 0–10 score, or null when the model gave none (the UI shows "—", never a fake red 0).
 *  Robust: 7, "7", "~7", "7/10", "7.5 out of 10" → the FIRST number, clamped to 0–10.
 *  (The old parser stripped every non-digit, so "7/10" became 710 → clamped to 10.) */
const Score = z
  .preprocess((v) => {
    if (typeof v === "number") return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : null;
    const m = String(v ?? "").match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null;
  }, z.number().nullable())
  .catch(null);

/** A string field that tolerates a stray number/null from the model. */
const Str = z.preprocess((v) => (v === null || v === undefined ? "" : typeof v === "string" ? v : String(v)), z.string()).catch("");

export const DeepSource = z.object({ title: Str, url: Str, date: Str });

/** A ranked growth constraint, each paired with what management is doing about it. */
export const DeepBottleneck = z.object({
  rank: Score,
  title: Str,
  severity: Score, // /10, higher = more constraining
  detail: Str,
  solution: z
    .object({
      summary: Str, // what management is doing
      detail: Str, // factories, capacity, M&A, partnerships, R&D, financing
      timeline: Str, // estimated completion / capacity added, or "—"
    })
    .catch({ summary: "", detail: "", timeline: "" }),
});

export const DeepMetric = z.object({ label: Str, value: Str, yoy: Str, forward: Str });
export const DeepMultiple = z.object({ label: Str, value: Str, vsHistory: Str, vsPeers: Str });
/** Tolerate the model returning a peer as a bare ticker string instead of {ticker, note}. */
export const DeepPeer = z.preprocess(
  (v) => (typeof v === "string" ? { ticker: v, note: "" } : v),
  z.object({ ticker: Str, note: Str }),
);
export const DeepCatalyst = z.object({ title: Str, window: Str, detail: Str });
export const DeepRisk = z.object({ title: Str, detail: Str });
export const DeepScenario = z.object({ operational: Str, priceRange: Str, note: Str });
export const DeepKpi = z.object({
  name: Str,
  previous: Str,
  expectation: Str, // market/management expectation, or "—"
  bullish: Str, // threshold that reads bullish
  neutral: Str,
  bearish: Str,
});

export const DeepScorecard = z.object({
  moat: Score,
  growth: Score,
  financialStrength: Score,
  management: Score,
  valuation: Score,
  catalysts: Score,
  risk: Score, // higher = lower risk / safer
  overall: Score,
});

const emptyScorecard = { moat: null, growth: null, financialStrength: null, management: null, valuation: null, catalysts: null, risk: null, overall: null };

export const DeepAnalysisOutput = z.object({
  asOf: Str, // YYYY-MM-DD
  company: Str,
  headline: Str, // 1–2 sentence read
  moat: z
    .object({
      score: Score,
      strength: Str, // weak | moderate | strong | exceptional
      direction: Str, // strengthening | stable | weakening
      advantages: z.array(Str).catch([]), // the concrete sources of advantage
      summary: Str,
    })
    .catch({ score: null, strength: "", direction: "", advantages: [], summary: "" }),
  bottlenecks: z.array(DeepBottleneck).catch([]), // 3–5, ranked most→least important
  growth: z.object({ score: Score, summary: Str, metrics: z.array(DeepMetric).catch([]) }).catch({ score: null, summary: "", metrics: [] }),
  valuation: z
    .object({
      score: Score, // attractiveness: higher = cheaper for the quality
      summary: Str,
      multiples: z.array(DeepMultiple).catch([]),
      peers: z.array(DeepPeer).catch([]),
      greatCompanyVsStock: Str, // the "great company vs great stock at this price" call
    })
    .catch({ score: null, summary: "", multiples: [], peers: [], greatCompanyVsStock: "" }),
  catalysts: z.array(DeepCatalyst).catch([]), // 3–5, next 6–24 months
  risks: z.array(DeepRisk).catch([]), // what could cause a 20%+ drawdown
  scenarios: z
    .object({ bull: DeepScenario, base: DeepScenario, bear: DeepScenario })
    .catch({ bull: { operational: "", priceRange: "", note: "" }, base: { operational: "", priceRange: "", note: "" }, bear: { operational: "", priceRange: "", note: "" } }),
  earningsWatchlist: z.object({ nextDate: Str, kpis: z.array(DeepKpi).catch([]) }).catch({ nextDate: "", kpis: [] }), // the 5 KPIs that matter next report
  scorecard: DeepScorecard.catch(emptyScorecard),
  thesis: z.object({ whyOwn: Str, whyAvoid: Str, whatChanges: Str, attractivePrice: Str }).catch({ whyOwn: "", whyAvoid: "", whatChanges: "", attractivePrice: "" }),
  sources: z.array(DeepSource).catch([]),
});
export type DeepAnalysisOutput = z.infer<typeof DeepAnalysisOutput>;
