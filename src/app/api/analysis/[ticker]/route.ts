import type { NextRequest } from "next/server";
import { getLatestAnalysis } from "@/lib/analysis/service";

export const dynamic = "force-dynamic";

/** Internal: latest verified analysis for the compare view. Never triggers a model call. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/analysis/[ticker]">): Promise<Response> {
  const { ticker } = await ctx.params;
  const stored = await getLatestAnalysis(ticker);
  if (!stored) return Response.json({ error: "no verified analysis yet" }, { status: 404 });
  return Response.json({ id: stored.id, version: stored.version, analysis: stored.analysis }, { headers: { "cache-control": "private, max-age=300" } });
}
