import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteWatchlist, getWatchlist, setWatchlistSymbols } from "@/lib/watchlists";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const Body = z.object({ symbols: z.array(z.string()).max(50) });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/watchlists/[slug]">): Promise<Response> {
  const { slug } = await ctx.params;
  const w = await getWatchlist(slug);
  return w ? Response.json({ watchlist: w }) : Response.json({ error: "not found" }, { status: 404 });
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/watchlists/[slug]">): Promise<Response> {
  if (env().DEMO_MODE) return Response.json({ error: "Watchlists are read-only in demo mode" }, { status: 403 });
  const { slug } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "symbols[] is required" }, { status: 400 });
  const w = await setWatchlistSymbols(slug, parsed.data.symbols);
  return w ? Response.json({ watchlist: w }) : Response.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/watchlists/[slug]">): Promise<Response> {
  if (env().DEMO_MODE) return Response.json({ error: "Watchlists are read-only in demo mode" }, { status: 403 });
  const { slug } = await ctx.params;
  return (await deleteWatchlist(slug)) ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
