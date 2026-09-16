import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteWatchlist, getWatchlist, setWatchlistSymbols, ownsWatchlist } from "@/lib/watchlists";
import { env } from "@/lib/env";
import { currentUser, isAdmin } from "@/auth";

export const dynamic = "force-dynamic";

const Body = z.object({ symbols: z.array(z.string()).max(50) });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/watchlists/[slug]">): Promise<Response> {
  const { slug } = await ctx.params;
  const w = await getWatchlist(slug);
  return w ? Response.json({ watchlist: w }) : Response.json({ error: "not found" }, { status: 404 });
}

async function requireOwner(slug: string): Promise<Response | null> {
  if (env().DEMO_MODE) return Response.json({ error: "Watchlists are read-only in demo mode" }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!(await ownsWatchlist(slug, user.id, await isAdmin()))) return Response.json({ error: "Not your watchlist" }, { status: 403 });
  return null;
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/watchlists/[slug]">): Promise<Response> {
  const { slug } = await ctx.params;
  const denied = await requireOwner(slug);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "symbols[] is required" }, { status: 400 });
  const w = await setWatchlistSymbols(slug, parsed.data.symbols);
  return w ? Response.json({ watchlist: w }) : Response.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/watchlists/[slug]">): Promise<Response> {
  const { slug } = await ctx.params;
  const denied = await requireOwner(slug);
  if (denied) return denied;
  return (await deleteWatchlist(slug)) ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
