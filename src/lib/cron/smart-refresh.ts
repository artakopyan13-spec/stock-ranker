import type { StockData } from "@/lib/data/types";
import type { Analysis } from "@/lib/analysis/schema";

export interface RefreshDecision {
  refresh: boolean;
  reason: string;
}

/**
 * Decides whether a ticker needs a new model call tonight. Pure.
 * Re-analyze when: no verified analysis, analysis older than ttlHours, a new quarter was
 * filed, there is news the last analysis did not see, or price moved more than the threshold.
 */
export function decideRefresh(
  previous: { analysis: Analysis; createdAt: Date } | null,
  data: StockData,
  opts: { ttlHours: number; priceMovePct: number; smart: boolean; now?: Date },
): RefreshDecision {
  const now = opts.now ?? new Date();
  if (!previous) return { refresh: true, reason: "no verified analysis yet" };
  if (!opts.smart) return { refresh: true, reason: "smart refresh disabled" };
  const ageH = (now.getTime() - previous.createdAt.getTime()) / 3_600_000;
  if (ageH >= opts.ttlHours) return { refresh: true, reason: `analysis is ${Math.round(ageH)}h old (ttl ${opts.ttlHours}h)` };

  const prevQuarter = previous.analysis.growth.revenueHistory.at(-1)?.period ?? null;
  const newQuarter = data.quarters.at(-1)?.period ?? null;
  if (newQuarter && prevQuarter && newQuarter > prevQuarter) return { refresh: true, reason: `new quarter filed (${newQuarter})` };

  const seen = new Set(previous.analysis.news.map((n) => n.url ?? n.headline));
  const unseen = data.news.filter((n) => !seen.has(n.url ?? n.headline));
  if (unseen.length) return { refresh: true, reason: `${unseen.length} new news item(s)` };

  const prevPrice = previous.analysis.price.current.value;
  const price = data.quote.price.value;
  if (prevPrice !== null && price !== null && prevPrice !== 0) {
    const move = Math.abs((price - prevPrice) / prevPrice) * 100;
    if (move >= opts.priceMovePct) return { refresh: true, reason: `price moved ${move.toFixed(1)}% since last analysis` };
  }
  return { refresh: false, reason: "nothing material changed" };
}
