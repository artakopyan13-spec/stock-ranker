import type { Action, FcfVerdict } from "@/lib/analysis/schema";

export interface RankingRow {
  symbol: string;
  companyName: string;
  analysisId: string | null;
  analyzedAt: string | null;
  rating: number | null;
  action: Action | null;
  fcfVerdict: FcfVerdict | null;
  fcfMarginPct: number | null;
  revenueGrowthPct: number | null;
  forwardPE: number | null;
  trailingPE: number | null;
  primaryMultiple: string | null;
  primaryMultipleValue: number | null;
  price: number | null;
  currency: string;
  headlineRisk: boolean;
  nextCatalyst: { date: string; event: string } | null;
  ratingDelta: number | null; // vs previous verified analysis
  shareToken: string | null;
  stale: boolean;
}

export type SortKey = "rating" | "fcfMarginPct" | "revenueGrowthPct" | "forwardPE" | "symbol";

export function sortRows(rows: RankingRow[], key: SortKey, dir: "asc" | "desc" = "desc"): RankingRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "symbol") return a.symbol.localeCompare(b.symbol) * mul;
    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * mul;
  });
}

