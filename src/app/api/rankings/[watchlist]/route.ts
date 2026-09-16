import type { NextRequest } from "next/server";
import { checkApiKey, unauthorized } from "@/lib/auth";
import { getRankings, sortRows, type SortKey } from "@/lib/rankings";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const SORT_KEYS: SortKey[] = ["rating", "fcfMarginPct", "revenueGrowthPct", "forwardPE", "symbol"];

/** GET /api/rankings/:watchlist?sort=rating&dir=desc — ranked rows (API key required). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/rankings/[watchlist]">): Promise<Response> {
  if (!env().DEMO_MODE) {
    const auth = checkApiKey(req);
    if (!auth.ok) return unauthorized(auth);
  }
  const { watchlist } = await ctx.params;
  const rankings = await getRankings(watchlist);
  if (!rankings) return Response.json({ error: "watchlist not found" }, { status: 404 });
  const sortParam = req.nextUrl.searchParams.get("sort");
  const sort = SORT_KEYS.find((k) => k === sortParam) ?? "rating";
  const dir = req.nextUrl.searchParams.get("dir") === "asc" ? "asc" : "desc";
  return Response.json({ ...rankings, rows: sortRows(rankings.rows, sort, dir), sort, dir }, { headers: { "cache-control": "private, max-age=300" } });
}
