import type { NextRequest } from "next/server";
import { getPriceHistory } from "@/lib/data/company-source";
import { isValidSymbol } from "@/lib/data";
import type { PriceRange } from "@/lib/data/company";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RANGES: PriceRange[] = ["1M", "6M", "1Y", "5Y", "MAX"];

export async function GET(req: NextRequest, ctx: RouteContext<"/api/company/[ticker]/prices">): Promise<Response> {
  const { ticker } = await ctx.params;
  if (!isValidSymbol(ticker)) return Response.json({ error: "Invalid ticker" }, { status: 400 });
  const rangeParam = req.nextUrl.searchParams.get("range");
  const range = RANGES.find((r) => r === rangeParam) ?? "1Y";
  try {
    const prices = await getPriceHistory(ticker, range);
    return Response.json({ range, prices }, { headers: { "cache-control": "public, max-age=1800" } });
  } catch {
    return Response.json({ range, prices: [] }, { status: 200 });
  }
}
