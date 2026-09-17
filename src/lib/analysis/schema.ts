import { z } from "zod";
import { SourcedNumber, NewsItem } from "@/lib/data/types";

export const SCHEMA_VERSION = "1.0";
export const DISCLAIMER =
  "This is a research notebook, not financial advice. Ratings and forecasts are the model's judgment, not fact. Verify every figure against the cited source before acting.";

// ---------- enums ----------
export const FcfVerdict = z.enum(["healthy", "thin", "negative", "unverified"]);
export type FcfVerdict = z.infer<typeof FcfVerdict>;

export const Trend = z.enum(["improving", "stable", "deteriorating", "unknown"]);
export type Trend = z.infer<typeof Trend>;

export const Action = z.enum(["BUY", "HOLD", "SELL"]);
export type Action = z.infer<typeof Action>;

export const RatingBand = z.enum(["elite", "strong", "hold", "speculative", "avoid"]);
export type RatingBand = z.infer<typeof RatingBand>;

export const PrimaryMultiple = z.enum([
  "trailingPE",
  "forwardPE",
  "evToEbitda",
  "priceToSales",
  "priceToFcf",
  "priceToBook",
]);

export const NewsCategory = z.enum([
  "earnings",
  "guidance",
  "analyst",
  "offering",
  "insider",
  "ma",
  "regulatory",
  "customer_partner",
  "other",
]);

export const ThesisImpact = z.enum(["positive", "negative", "neutral"]);
export const CatalystType = z.enum(["earnings", "product", "regulatory", "macro", "other"]);
export const Direction = z.enum(["up", "down", "unclear"]);
export const Durability = z.enum(["low", "medium", "high"]);
export const Confidence = z.enum(["low", "medium", "high"]);

// ---------- what Claude returns (judgment only — never a KPI number) ----------
// Kept free of numeric min/max and string formats so it maps to the structured-output
// JSON schema subset. Ranges are enforced by verify.ts.
export const ModelOutput = z.object({
  /** Plain-language TL;DR for a beginner: what this is, the one big reason to like it, the main risk, bottom line. */
  summary: z.string(),
  valuation: z.object({
    primaryMultiple: PrimaryMultiple,
    peakOnPeakCyclical: z.object({
      flag: z.boolean(),
      reasoning: z.string(),
    }),
  }),
  fcfVerdictReason: z.string(),
  capitalActions: z.string().nullable(),
  news: z.array(
    z.object({
      id: z.string(),
      category: NewsCategory,
      thesisImpact: ThesisImpact,
      summary: z.string(),
    }),
  ),
  newsScanNote: z.string().nullable(),
  business: z.object({
    whatItDoes: z.string(),
    bestAt: z.string(),
    worksWith: z.array(z.object({ name: z.string(), relationship: z.string() })),
    moat: z.object({ description: z.string(), durability: Durability }),
  }),
  thesis: z.object({
    bull: z.string(),
    bear: z.string(),
    primaryFailureMode: z.string(),
  }),
  catalysts: z.array(
    z.object({
      date: z.string(), // YYYY-MM-DD or "TBD"
      dateSource: z.string().nullable(),
      event: z.string(),
      type: CatalystType,
      expectedDirection: Direction,
    }),
  ),
  rating: z.object({
    score: z.number(),
    action: Action,
    justification: z.string(),
    confidence: Confidence,
  }),
  forecast12m: z.object({
    bear: z.object({ returnPct: z.number(), reasoning: z.string() }),
    base: z.object({ returnPct: z.number(), reasoning: z.string() }),
    bull: z.object({ returnPct: z.number(), reasoning: z.string() }),
  }),
  tripwire: z.object({
    description: z.string(),
    direction: z.enum(["up", "down", "both"]),
    metric: z.string(),
    threshold: z.string().nullable(),
  }),
  dataConcerns: z.array(z.string()),
  /** Only when a previous tripwire was supplied: did it trigger since the last analysis? */
  previousTripwire: z
    .object({
      triggered: z.boolean(),
      reason: z.string(),
    })
    .nullable(),
});
export type ModelOutput = z.infer<typeof ModelOutput>;

/** Top-level keys in the order the model is asked to emit them (used for streaming). */
export const MODEL_OUTPUT_KEYS = Object.keys(ModelOutput.shape) as Array<keyof ModelOutput>;

// ---------- the full, rendered analysis ----------
const Sourced = SourcedNumber;

export const VerificationCheck = z.object({
  id: z.string(),
  ok: z.boolean(),
  detail: z.string(),
});
export type VerificationCheck = z.infer<typeof VerificationCheck>;

export const Verification = z.object({
  passed: z.boolean(),
  checks: z.array(VerificationCheck),
});
export type Verification = z.infer<typeof Verification>;

export const Usage = z.object({
  inputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  outputTokens: z.number(),
  usd: z.number(),
});
export type Usage = z.infer<typeof Usage>;

export const Analysis = z.object({
  meta: z.object({
    schemaVersion: z.string(),
    promptVersion: z.string(),
    ticker: z.string(),
    companyName: z.string(),
    exchange: z.string().nullable(),
    currency: z.string(),
    sector: z.string().nullable(),
    industry: z.string().nullable(),
    analyzedAt: z.string(),
    dataAsOf: z.string(),
    dataProvider: z.string(),
    model: z.string(),
    usage: Usage,
    verification: Verification,
    demo: z.boolean(),
    staleData: z.boolean(), // any price/news figure older than 7 days
  }),

  price: z.object({
    current: Sourced,
    dayChangePct: Sourced,
    week52Low: Sourced,
    week52High: Sourced,
    positionIn52wRangePct: z.number().nullable(),
    marketCap: Sourced,
    sharesOutstanding: Sourced,
    dilution: z.object({
      flag: z.boolean(),
      sharesChangeYoYPct: z.number().nullable(),
      note: z.string(),
    }),
  }),

  valuation: z.object({
    trailingPE: Sourced,
    forwardPE: Sourced,
    evToEbitda: Sourced,
    priceToSales: Sourced,
    priceToFcf: Sourced,
    priceToBook: Sourced,
    primaryMultiple: PrimaryMultiple,
    peakOnPeakCyclical: z.object({ flag: z.boolean(), reasoning: z.string() }),
  }),

  growth: z.object({
    revenueTTM: Sourced,
    revenueGrowthYoYLatestQ: Sourced,
    revenueHistory: z.array(
      z.object({ period: z.string(), revenue: z.number().nullable(), yoyPct: z.number().nullable() }),
    ),
    grossMarginPct: Sourced,
    operatingMarginPct: Sourced,
    marginHistory: z.array(
      z.object({
        period: z.string(),
        grossPct: z.number().nullable(),
        operatingPct: z.number().nullable(),
      }),
    ),
    marginDirection: Trend,
  }),

  fcf: z.object({
    ttm: Sourced,
    latestQuarter: Sourced,
    marginPct: Sourced,
    history: z.array(
      z.object({ period: z.string(), fcf: z.number().nullable(), marginPct: z.number().nullable() }),
    ),
    trend: Trend,
    verdict: FcfVerdict,
    headlineRisk: z.boolean(),
    verdictReason: z.string(),
  }),

  balanceSheet: z.object({
    cash: Sourced,
    totalDebt: Sourced,
    netCash: z.number().nullable(),
    posture: z.enum(["net_cash", "net_debt", "unknown"]),
    selfFundsCapex: z.boolean().nullable(),
    buybacksTTM: Sourced,
    netShareIssuanceTTM: Sourced,
    capitalActions: z.string().nullable(),
  }),

  news: z.array(
    NewsItem.extend({
      category: NewsCategory,
      thesisImpact: ThesisImpact,
      summary: z.string().nullable(),
    }),
  ),
  newsSource: z.enum(["provider", "web_search", "none"]),
  newsScanNote: z.string().nullable(),

  summary: z.string().optional(),
  business: ModelOutput.shape.business,
  thesis: ModelOutput.shape.thesis,
  catalysts: ModelOutput.shape.catalysts,

  rating: z.object({
    score: z.number(),
    band: RatingBand,
    action: Action,
    justification: z.string(),
    confidence: Confidence,
    isEstimate: z.literal(true),
  }),

  forecast12m: z.object({
    bear: z.object({ returnPct: z.number(), priceTarget: z.number().nullable(), reasoning: z.string() }),
    base: z.object({ returnPct: z.number(), priceTarget: z.number().nullable(), reasoning: z.string() }),
    bull: z.object({ returnPct: z.number(), priceTarget: z.number().nullable(), reasoning: z.string() }),
    horizonMonths: z.literal(12),
    isEstimate: z.literal(true),
  }),

  tripwire: ModelOutput.shape.tripwire,
  previousTripwire: z
    .object({
      description: z.string(),
      triggered: z.boolean(),
      reason: z.string(),
    })
    .nullable(),
  dataConcerns: z.array(z.string()),

  sources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string().nullable(),
      asOf: z.string(),
      usedFor: z.array(z.string()),
    }),
  ),

  disclaimer: z.string(),
});
export type Analysis = z.infer<typeof Analysis>;

export function bandForScore(score: number): RatingBand {
  if (score >= 9) return "elite";
  if (score >= 7) return "strong";
  if (score >= 5) return "hold";
  if (score >= 3) return "speculative";
  return "avoid";
}

export const FCF_EMOJI: Record<FcfVerdict, string> = {
  healthy: "✅",
  thin: "⚠️",
  negative: "❌",
  unverified: "⚠️",
};
