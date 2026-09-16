import { db } from "@/lib/db";
import { Analysis, type Action, type FcfVerdict } from "@/lib/analysis/schema";
import { getWatchlist, type WatchlistSummary } from "@/lib/watchlists";

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

export interface Rankings {
  watchlist: WatchlistSummary;
  rows: RankingRow[];
  generatedAt: string;
  bestRiskAdjusted: string | null;
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

/** Ranking rows for a watchlist from the latest verified analysis of each ticker. */
export async function getRankings(slug: string): Promise<Rankings | null> {
  const watchlist = await getWatchlist(slug);
  if (!watchlist) return null;
  const prisma = db();
  const rows: RankingRow[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const symbol of watchlist.symbols) {
    const ticker = await prisma.ticker.findUnique({ where: { symbol } });
    const latest = await prisma.analysis.findMany({ where: { symbol, verified: true }, orderBy: { version: "desc" }, take: 2 });
    if (!latest.length) {
      rows.push({
        symbol,
        companyName: ticker?.name ?? symbol,
        analysisId: null,
        analyzedAt: null,
        rating: null,
        action: null,
        fcfVerdict: null,
        fcfMarginPct: null,
        revenueGrowthPct: null,
        forwardPE: null,
        trailingPE: null,
        primaryMultiple: null,
        primaryMultipleValue: null,
        price: null,
        currency: ticker?.currency ?? "USD",
        headlineRisk: false,
        nextCatalyst: null,
        ratingDelta: null,
        shareToken: ticker?.shareToken ?? null,
        stale: false,
      });
      continue;
    }
    const a = Analysis.parse(JSON.parse(latest[0].payload));
    const upcoming = a.catalysts.filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.date >= today).sort((x, y) => x.date.localeCompare(y.date))[0];
    rows.push({
      symbol,
      companyName: a.meta.companyName,
      analysisId: latest[0].id,
      analyzedAt: a.meta.analyzedAt,
      rating: a.rating.score,
      action: a.rating.action,
      fcfVerdict: a.fcf.verdict,
      fcfMarginPct: a.fcf.marginPct.value,
      revenueGrowthPct: a.growth.revenueGrowthYoYLatestQ.value,
      forwardPE: a.valuation.forwardPE.value,
      trailingPE: a.valuation.trailingPE.value,
      primaryMultiple: a.valuation.primaryMultiple,
      primaryMultipleValue: a.valuation[a.valuation.primaryMultiple].value,
      price: a.price.current.value,
      currency: a.meta.currency,
      headlineRisk: a.fcf.headlineRisk,
      nextCatalyst: upcoming ? { date: upcoming.date, event: upcoming.event } : null,
      ratingDelta: latest[1] ? a.rating.score - latest[1].rating : null,
      shareToken: ticker?.shareToken ?? null,
      stale: a.meta.staleData || Date.now() - new Date(a.meta.analyzedAt).getTime() > 7 * 86_400_000,
    });
  }
  const sorted = sortRows(rows, "rating");
  const best = sorted.find((r) => r.rating !== null && r.fcfVerdict === "healthy" && r.action !== "SELL") ?? sorted.find((r) => r.rating !== null) ?? null;
  return { watchlist, rows: sorted, generatedAt: new Date().toISOString(), bestRiskAdjusted: best?.symbol ?? null };
}
