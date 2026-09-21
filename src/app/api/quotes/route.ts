import type { NextRequest } from "next/server";
import { getQuotes } from "@/lib/data/quotes";
import { readGuard } from "@/lib/request";

export const dynamic = "force-dynamic";

/** GET /api/quotes?symbols=NVDA,AAPL,NQ=F — batch quotes for the heatmap (no Claude call). */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await readGuard(req);
  if (guard) return guard;
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const quotes = await getQuotes(symbols);
  return Response.json({ quotes }, { headers: { "cache-control": "public, max-age=120" } });
}
