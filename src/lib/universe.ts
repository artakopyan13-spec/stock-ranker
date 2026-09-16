import { db } from "@/lib/db";
import { Analysis } from "@/lib/analysis/schema";

/** One row per ticker that has a verified analysis in the shared cache. */
export interface UniverseRow {
  symbol: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  rating: number;
  action: string;
  fcfVerdict: string;
  fcfMarginPct: number | null;
  revenueGrowthPct: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToFcf: number | null;
  priceToSales: number | null;
  evToEbitda: number | null;
  marketCap: number | null;
  netCash: number | null;
  debtToEquity: number | null;
  price: number | null;
  currency: string;
  searchCount: number;
  analyzedAt: string;
  shareToken: string | null;
  nextEarnings: string | null;
  headlineRisk: boolean;
  stale: boolean;
}

function rowFrom(a: Analysis, searchCount: number, shareToken: string | null): UniverseRow {
  return {
    symbol: a.meta.ticker,
    companyName: a.meta.companyName,
    sector: a.meta.sector,
    industry: a.meta.industry,
    rating: a.rating.score,
    action: a.rating.action,
    fcfVerdict: a.fcf.verdict,
    fcfMarginPct: a.fcf.marginPct.value,
    revenueGrowthPct: a.growth.revenueGrowthYoYLatestQ.value,
    grossMarginPct: a.growth.grossMarginPct.value,
    operatingMarginPct: a.growth.operatingMarginPct.value,
    trailingPE: a.valuation.trailingPE.value,
    forwardPE: a.valuation.forwardPE.value,
    priceToFcf: a.valuation.priceToFcf.value,
    priceToSales: a.valuation.priceToSales.value,
    evToEbitda: a.valuation.evToEbitda.value,
    marketCap: a.price.marketCap.value,
    netCash: a.balanceSheet.netCash,
    debtToEquity: null, // computed below when equity is derivable
    price: a.price.current.value,
    currency: a.meta.currency,
    searchCount,
    analyzedAt: a.meta.analyzedAt,
    shareToken,
    nextEarnings: a.catalysts.find((c) => c.type === "earnings" && /^\d{4}-\d{2}-\d{2}$/.test(c.date))?.date ?? null,
    headlineRisk: a.fcf.headlineRisk,
    stale: a.meta.staleData || Date.now() - new Date(a.meta.analyzedAt).getTime() > 7 * 86_400_000,
  };
}

/** Latest verified analysis of every ticker in the cache, as rows for the screener/leaderboard. */
export async function loadUniverse(): Promise<UniverseRow[]> {
  const tickers = await db().ticker.findMany({ select: { symbol: true, searchCount: true, shareToken: true } });
  const rows: UniverseRow[] = [];
  for (const t of tickers) {
    const latest = await db().analysis.findFirst({ where: { symbol: t.symbol, verified: true }, orderBy: { version: "desc" } });
    if (!latest) continue;
    try {
      rows.push(rowFrom(Analysis.parse(JSON.parse(latest.payload)), t.searchCount, t.shareToken));
    } catch {
      // skip malformed
    }
  }
  return rows;
}
