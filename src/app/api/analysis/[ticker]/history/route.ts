import type { NextRequest } from "next/server";
import { getAnalysisHistory } from "@/lib/analysis/service";
import { isValidSymbol } from "@/lib/data";

export const dynamic = "force-dynamic";

export interface RatingPoint {
  version: number;
  date: string; // YYYY-MM-DD
  rating: number;
  action: string;
  confidence: string;
  price: number | null;
  baseReturnPct: number | null;
  summary: string;
}

/** Compact rating-over-time series for the Time Machine. Never triggers a model call. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/analysis/[ticker]/history">): Promise<Response> {
  const { ticker } = await ctx.params;
  if (!isValidSymbol(ticker)) return Response.json({ error: "Invalid ticker" }, { status: 400 });
  const history = await getAnalysisHistory(ticker.toUpperCase(), 60);
  const points: RatingPoint[] = history
    .map((h) => ({
      version: h.version,
      date: h.analysis.meta.analyzedAt.slice(0, 10),
      rating: h.analysis.rating.score,
      action: h.analysis.rating.action,
      confidence: h.analysis.rating.confidence,
      price: h.analysis.price.current.value,
      baseReturnPct: h.analysis.forecast12m.base.returnPct,
      summary: (h.analysis.rating.justification || h.analysis.summary || "").slice(0, 280),
    }))
    .reverse(); // oldest → newest
  return Response.json({ points }, { headers: { "cache-control": "private, max-age=300" } });
}
