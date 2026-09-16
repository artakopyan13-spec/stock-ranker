import type { UniverseRow } from "@/lib/universe";

export interface ScreenFilters {
  sector?: string;
  minMarketCap?: number; // in billions
  minRevGrowth?: number; // %
  minFcfMargin?: number; // %
  maxTrailingPE?: number;
  maxForwardPE?: number;
  maxPriceToFcf?: number;
  minRating?: number;
  actions?: string[]; // BUY/HOLD/SELL
  fcfVerdicts?: string[]; // healthy/thin/negative
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  filters: ScreenFilters;
}

export const PRESETS: Preset[] = [
  { id: "cash-machines", name: "Cash machines", description: "FCF margin over 20%", filters: { minFcfMargin: 20, fcfVerdicts: ["healthy"] } },
  { id: "gafp", name: "Growth at fair price", description: "Rev growth >15%, forward P/E <30", filters: { minRevGrowth: 15, maxForwardPE: 30 } },
  { id: "rated-8", name: "Rated 8+", description: "Our AI rating 8 or higher", filters: { minRating: 8 } },
  { id: "turnarounds", name: "Turnarounds", description: "Thin/negative FCF, rating 4–6", filters: { minRating: 4, fcfVerdicts: ["thin", "negative"] } },
];

/** Pure filter — used by the screener UI and tests. A null field passes unless the filter excludes it. */
export function applyScreen(rows: UniverseRow[], f: ScreenFilters): UniverseRow[] {
  return rows.filter((r) => {
    if (f.sector && r.sector !== f.sector) return false;
    if (f.minMarketCap !== undefined && (r.marketCap === null || r.marketCap < f.minMarketCap * 1e9)) return false;
    if (f.minRevGrowth !== undefined && (r.revenueGrowthPct === null || r.revenueGrowthPct < f.minRevGrowth)) return false;
    if (f.minFcfMargin !== undefined && (r.fcfMarginPct === null || r.fcfMarginPct < f.minFcfMargin)) return false;
    if (f.maxTrailingPE !== undefined && (r.trailingPE === null || r.trailingPE > f.maxTrailingPE)) return false;
    if (f.maxForwardPE !== undefined && (r.forwardPE === null || r.forwardPE > f.maxForwardPE)) return false;
    if (f.maxPriceToFcf !== undefined && (r.priceToFcf === null || r.priceToFcf > f.maxPriceToFcf)) return false;
    if (f.minRating !== undefined && r.rating < f.minRating) return false;
    if (f.actions?.length && !f.actions.includes(r.action)) return false;
    if (f.fcfVerdicts?.length && !f.fcfVerdicts.includes(r.fcfVerdict)) return false;
    return true;
  });
}
