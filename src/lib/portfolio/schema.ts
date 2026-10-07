import { z } from "zod";

/** One position. The user gives shares (preferred) or a dollar value; avgCost is optional. */
const Amount = z.number().finite().nonnegative().max(1e12);
export const Holding = z.object({
  symbol: z.string().max(12),
  shares: Amount.nullable(),
  avgCost: Amount.nullable(),
  valueUsd: Amount.nullable(), // used when shares are unknown
});
export type Holding = z.infer<typeof Holding>;

export const HoldingsInput = z.object({
  holdings: z.array(Holding).max(60),
  cashUsd: z.number().min(0).default(0),
  notes: z.string().max(1200).nullable().default(null),
});
export type HoldingsInput = z.infer<typeof HoldingsInput>;

/** Code-computed portfolio metrics (honest numbers; not the model's opinion). */
export interface EnrichedHolding {
  symbol: string;
  name: string | null;
  shares: number | null;
  avgCost: number | null;
  price: number | null;
  valueUsd: number | null;
  weightPct: number | null;
  gainPct: number | null; // vs avg cost, if given
  sector: string | null;
  rating: number | null;
  action: string | null;
  fcfVerdict: string | null;
  analyzed: boolean;
}

export interface PortfolioMetrics {
  totalValueUsd: number | null; // holdings + cash
  investedUsd: number | null;
  cashUsd: number;
  cashPct: number | null;
  holdingsCount: number;
  analyzedPct: number; // share of value with an AI rating
  topWeightPct: number | null;
  top3WeightPct: number | null;
  hhi: number | null; // Herfindahl concentration (0-1) over holdings
  weightedRating: number | null; // value-weighted AI rating, over analyzed value
  weakFcfPct: number | null; // share of value in thin/negative FCF names
  sectors: Array<{ sector: string; weightPct: number }>;
}

export interface PortfolioPayload {
  id: string;
  name: string;
  notes: string | null;
  cashUsd: number;
  newCashUsd: number;
  hasActivity: boolean;
  holdings: EnrichedHolding[];
  metrics: PortfolioMetrics;
  review: import("@/lib/portfolio/review-schema").PortfolioReviewV2 | null;
  reviewAt: string | null;
  updatedAt: string;
}
