import { z } from "zod";
import { db } from "@/lib/db";
import { getQuotes } from "@/lib/data/quotes";
import { Holding, PortfolioReview, type EnrichedHolding, type HoldingsInput, type PortfolioMetrics, type PortfolioPayload } from "@/lib/portfolio/schema";

type Row = {
  id: string;
  name: string;
  notes: string | null;
  cashUsd: number;
  holdings: string;
  review: string | null;
  reviewAt: Date | null;
  updatedAt: Date;
};

function parseHoldingsJson(json: string): Holding[] {
  try {
    return z.array(Holding).parse(JSON.parse(json));
  } catch {
    return [];
  }
}

/** Existing holdings on a portfolio row (empty on parse failure). */
export function parseHoldingsRow(row: { holdings: string }): Holding[] {
  return parseHoldingsJson(row.holdings);
}

export async function getPortfolioRow(userId: string): Promise<Row | null> {
  return db().portfolio.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
}

/** Create or update the user's portfolio. Editing holdings invalidates the stored review. */
export async function savePortfolio(userId: string, input: HoldingsInput): Promise<Row> {
  const existing = await getPortfolioRow(userId);
  const holdingsJson = JSON.stringify(input.holdings);
  const holdingsChanged = !existing || existing.holdings !== holdingsJson;
  if (existing) {
    return db().portfolio.update({
      where: { id: existing.id },
      data: {
        holdings: holdingsJson,
        cashUsd: input.cashUsd,
        notes: input.notes,
        ...(holdingsChanged ? { review: null, reviewAt: null } : {}),
      },
    });
  }
  return db().portfolio.create({ data: { userId, holdings: holdingsJson, cashUsd: input.cashUsd, notes: input.notes } });
}

/** Prices (Yahoo batch) + each holding's latest verified AI rating and sector, then honest metrics. */
export async function enrich(row: Row): Promise<{ holdings: EnrichedHolding[]; metrics: PortfolioMetrics }> {
  const holdings = parseHoldingsJson(row.holdings);
  const symbols = holdings.map((h) => h.symbol);
  const [quotes, tickers, analyses] = await Promise.all([
    symbols.length ? getQuotes(symbols) : Promise.resolve([]),
    symbols.length ? db().ticker.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, name: true, sector: true } }) : Promise.resolve([]),
    symbols.length ? db().analysis.findMany({ where: { symbol: { in: symbols }, verified: true }, orderBy: { version: "desc" }, select: { symbol: true, rating: true, action: true, fcfVerdict: true } }) : Promise.resolve([]),
  ]);
  const quoteBy = new Map(quotes.map((q) => [q.symbol, q]));
  const tickerBy = new Map(tickers.map((t) => [t.symbol, t]));
  const ratingBy = new Map<string, { rating: number; action: string; fcfVerdict: string }>();
  for (const a of analyses) if (!ratingBy.has(a.symbol)) ratingBy.set(a.symbol, a);

  const enriched: EnrichedHolding[] = holdings.map((h) => {
    const q = quoteBy.get(h.symbol);
    const price = q?.price ?? null;
    const value = h.shares !== null && price !== null ? h.shares * price : h.valueUsd;
    const rt = ratingBy.get(h.symbol);
    return {
      symbol: h.symbol,
      name: q?.name ?? tickerBy.get(h.symbol)?.name ?? null,
      shares: h.shares,
      avgCost: h.avgCost,
      price,
      valueUsd: value,
      weightPct: null, // filled below
      gainPct: h.avgCost && price ? ((price - h.avgCost) / h.avgCost) * 100 : null,
      sector: tickerBy.get(h.symbol)?.sector ?? null,
      rating: rt?.rating ?? null,
      action: rt?.action ?? null,
      fcfVerdict: rt?.fcfVerdict ?? null,
      analyzed: Boolean(rt),
    };
  });

  const invested = enriched.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  const total = invested + row.cashUsd;
  for (const h of enriched) h.weightPct = h.valueUsd !== null && total > 0 ? (h.valueUsd / total) * 100 : null;

  const weights = enriched.map((h) => h.valueUsd ?? 0).filter((v) => v > 0).sort((a, b) => b - a);
  const investedFrac = (v: number) => (invested > 0 ? v / invested : 0);
  const analyzedValue = enriched.filter((h) => h.analyzed).reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  const ratingValue = enriched.filter((h) => h.analyzed && h.rating !== null).reduce((s, h) => s + (h.rating as number) * (h.valueUsd ?? 0), 0);
  const weakFcf = enriched.filter((h) => h.fcfVerdict === "thin" || h.fcfVerdict === "negative").reduce((s, h) => s + (h.valueUsd ?? 0), 0);

  const sectorMap = new Map<string, number>();
  for (const h of enriched) {
    if (h.valueUsd === null || h.valueUsd <= 0) continue;
    const key = h.sector ?? "Unclassified";
    sectorMap.set(key, (sectorMap.get(key) ?? 0) + h.valueUsd);
  }
  const sectors = [...sectorMap.entries()]
    .map(([sector, v]) => ({ sector, weightPct: total > 0 ? (v / total) * 100 : 0 }))
    .sort((a, b) => b.weightPct - a.weightPct);

  const metrics: PortfolioMetrics = {
    totalValueUsd: total > 0 ? total : null,
    investedUsd: invested > 0 ? invested : null,
    cashUsd: row.cashUsd,
    cashPct: total > 0 ? (row.cashUsd / total) * 100 : null,
    holdingsCount: enriched.length,
    analyzedPct: invested > 0 ? (analyzedValue / invested) * 100 : 0,
    topWeightPct: weights.length && total > 0 ? (weights[0] / total) * 100 : null,
    top3WeightPct: weights.length && total > 0 ? (weights.slice(0, 3).reduce((s, v) => s + v, 0) / total) * 100 : null,
    hhi: weights.length && invested > 0 ? weights.reduce((s, v) => s + investedFrac(v) ** 2, 0) : null,
    weightedRating: analyzedValue > 0 ? ratingValue / analyzedValue : null,
    weakFcfPct: invested > 0 ? (weakFcf / invested) * 100 : null,
    sectors,
  };
  return { holdings: enriched, metrics };
}

export function parseReview(json: string | null): PortfolioReview | null {
  if (!json) return null;
  try {
    return PortfolioReview.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

export async function toPayload(row: Row): Promise<PortfolioPayload> {
  const { holdings, metrics } = await enrich(row);
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    cashUsd: row.cashUsd,
    holdings,
    metrics,
    review: parseReview(row.review),
    reviewAt: row.reviewAt ? row.reviewAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
