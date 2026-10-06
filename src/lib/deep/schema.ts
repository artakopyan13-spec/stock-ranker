import { z } from "zod";

/** 0–10 score. */
const Score = z.number();

export const DeepSource = z.object({ title: z.string(), url: z.string(), date: z.string() });

/** A ranked growth constraint, each paired with what management is doing about it. */
export const DeepBottleneck = z.object({
  rank: z.number(),
  title: z.string(),
  severity: Score, // /10, higher = more constraining
  detail: z.string(),
  solution: z.object({
    summary: z.string(), // what management is doing
    detail: z.string(), // factories, capacity, M&A, partnerships, R&D, financing
    timeline: z.string(), // estimated completion / capacity added, or "—"
  }),
});

export const DeepMetric = z.object({ label: z.string(), value: z.string(), yoy: z.string(), forward: z.string() });
export const DeepMultiple = z.object({ label: z.string(), value: z.string(), vsHistory: z.string(), vsPeers: z.string() });
export const DeepPeer = z.object({ ticker: z.string(), note: z.string() });
export const DeepCatalyst = z.object({ title: z.string(), window: z.string(), detail: z.string() });
export const DeepRisk = z.object({ title: z.string(), detail: z.string() });
export const DeepScenario = z.object({ operational: z.string(), priceRange: z.string(), note: z.string() });
export const DeepKpi = z.object({
  name: z.string(),
  previous: z.string(),
  expectation: z.string(), // market/management expectation, or "—"
  bullish: z.string(), // threshold that reads bullish
  neutral: z.string(),
  bearish: z.string(),
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

export const DeepAnalysisOutput = z.object({
  asOf: z.string(), // YYYY-MM-DD
  company: z.string(),
  headline: z.string(), // 1–2 sentence read
  moat: z.object({
    score: Score,
    strength: z.string(), // weak | moderate | strong | exceptional
    direction: z.string(), // strengthening | stable | weakening
    advantages: z.array(z.string()), // the concrete sources of advantage
    summary: z.string(),
  }),
  bottlenecks: z.array(DeepBottleneck), // 3–5, ranked most→least important
  growth: z.object({ score: Score, summary: z.string(), metrics: z.array(DeepMetric) }),
  valuation: z.object({
    score: Score, // attractiveness: higher = cheaper for the quality
    summary: z.string(),
    multiples: z.array(DeepMultiple),
    peers: z.array(DeepPeer),
    greatCompanyVsStock: z.string(), // the "great company vs great stock at this price" call
  }),
  catalysts: z.array(DeepCatalyst), // 3–5, next 6–24 months
  risks: z.array(DeepRisk), // what could cause a 20%+ drawdown
  scenarios: z.object({ bull: DeepScenario, base: DeepScenario, bear: DeepScenario }),
  earningsWatchlist: z.object({ nextDate: z.string(), kpis: z.array(DeepKpi) }), // the 5 KPIs that matter next report
  scorecard: DeepScorecard,
  thesis: z.object({ whyOwn: z.string(), whyAvoid: z.string(), whatChanges: z.string(), attractivePrice: z.string() }),
  sources: z.array(DeepSource),
});
export type DeepAnalysisOutput = z.infer<typeof DeepAnalysisOutput>;
