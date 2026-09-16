import type { NextRequest } from "next/server";
import { checkApiKey, unauthorized } from "@/lib/auth";
import { getLatestAnalysis, getOrCreateAnalysis } from "@/lib/analysis/service";
import { toApiError } from "@/lib/api-errors";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/analysis/:ticker — structured analysis JSON (API key required).
 * Returns the latest verified analysis; `?refresh=1` forces a new one (counts against the cap).
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/analysis/[ticker]">): Promise<Response> {
  if (!env().DEMO_MODE) {
    const auth = checkApiKey(req);
    if (!auth.ok) return unauthorized(auth);
  }
  const { ticker } = await ctx.params;
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    const stored = refresh ? await getOrCreateAnalysis(ticker, { force: true }) : (await getLatestAnalysis(ticker)) ?? (await getOrCreateAnalysis(ticker));
    return Response.json({ id: stored.id, version: stored.version, analysis: stored.analysis }, { headers: { "cache-control": "private, max-age=300" } });
  } catch (err) {
    const e = toApiError(err);
    return Response.json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
  }
}
