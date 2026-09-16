import type { NextRequest } from "next/server";
import { searchSymbols } from "@/lib/data";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** GET /api/search?q=nvidia — symbol lookup for the search box (same-origin). */
export async function GET(req: NextRequest): Promise<Response> {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return Response.json({ matches: [] });
  if (env().DEMO_MODE) {
    const rows = await db().ticker.findMany({ where: { isDemo: true } });
    const needle = q.toUpperCase();
    return Response.json({
      matches: rows
        .filter((t) => t.symbol.includes(needle) || t.name.toUpperCase().includes(needle))
        .map((t) => ({ symbol: t.symbol, name: t.name, exchange: t.exchange, type: "EQUITY" })),
    });
  }
  try {
    const matches = (await searchSymbols(q)).filter((m) => m.type === "EQUITY" || m.type === "ETF");
    return Response.json({ matches });
  } catch (err) {
    return Response.json({ matches: [], error: err instanceof Error ? err.message : "search failed" }, { status: 502 });
  }
}
