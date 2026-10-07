import { z } from "zod";

/** One headline earnings metric vs. the Street's estimate (a KPI tile). */
export const EarningsMetric = z.object({
  label: z.string(), // "Revenue", "EPS", "Gross margin", "EBITDA", "Guidance (next-Q revenue)"
  value: z.string(), // reported value, formatted ("$26.0B", "$0.61", "78.4%")
  consensus: z.string(), // analyst consensus, or "—" if none found
  deltaPct: z.number().nullable(), // % surprise vs consensus (positive = above)
  verdict: z.enum(["beat", "miss", "inline", "above", "below", "na"]),
});

export const EarningsHighlight = z.object({
  title: z.string(), // short, plain
  detail: z.string(), // one plain sentence
});

/** A forward scenario: what a future result would mean for the stock's direction. */
export const EarningsScenario = z.object({
  trigger: z.string(), // concrete future result ("Next-quarter revenue above ~$X and margins hold")
  outcome: z.string(), // plain-English likely direction ("supports the growth story; the stock likely re-rates higher")
});

export const RevenuePoint = z.object({
  period: z.string(), // "Q1 FY26"
  revenue: z.number(), // millions USD
});

export const EarningsReportOutput = z.object({
  asOf: z.string(), // YYYY-MM-DD this was built
  company: z.string(),
  quarterLabel: z.string(), // "Q1 FY2026"
  reportDate: z.string(), // YYYY-MM-DD
  timing: z.string(), // "After market close" / "Before open" / ""
  headlineVerdict: z.enum(["beat", "mixed", "miss", "unknown"]), // overall read; "unknown" when the figures weren't found
  priceReactionPct: z.number().nullable(), // post-earnings move %, or null
  metrics: z.array(EarningsMetric), // ~4-5 tiles
  revenueTrend: z.array(RevenuePoint), // last ~5 quarters, millions USD
  highlights: z.array(EarningsHighlight), // 3-5
  bottleneck: z.object({ title: z.string(), detail: z.string() }), // the single biggest constraint right now
  scenarios: z.object({ bull: EarningsScenario, bear: EarningsScenario }),
  nextReportDate: z.string(), // estimated next earnings date, or ""
});
export type EarningsReportOutput = z.infer<typeof EarningsReportOutput>;
