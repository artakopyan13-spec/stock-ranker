import type { NextRequest } from "next/server";
import { getCompanyData } from "@/lib/data/company-source";
import { isValidSymbol } from "@/lib/data";
import { toApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Financials + overview + valuation history for a ticker. Cached; never triggers a Claude call. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/company/[ticker]">): Promise<Response> {
  const { ticker } = await ctx.params;
  if (!isValidSymbol(ticker)) return Response.json({ error: "Invalid ticker" }, { status: 400 });
  try {
    const data = await getCompanyData(ticker);
    return Response.json(data, { headers: { "cache-control": "public, max-age=3600" } });
  } catch (err) {
    const e = toApiError(err);
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  }
}
