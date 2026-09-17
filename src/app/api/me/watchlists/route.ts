import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/auth";
import { createWatchlist, listWatchlists, ownsWatchlist } from "@/lib/watchlists";
import { isValidSymbol } from "@/lib/data";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** GET /api/me/watchlists?symbol=NVDA — my watchlists, each flagged whether it contains the symbol. */
export async function GET(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ signedIn: false, watchlists: [] });
  const symbol = (new URL(req.url).searchParams.get("symbol") ?? "").toUpperCase();
  const lists = await listWatchlists(user.id);
  return Response.json({ signedIn: true, watchlists: lists.map((w) => ({ slug: w.slug, name: w.name, contains: symbol ? w.symbols.includes(symbol) : false })) });
}

const Body = z.object({ symbol: z.string(), slug: z.string().optional(), newList: z.string().max(60).optional(), add: z.boolean() });

/** POST — add/remove a symbol to a watchlist (owner only), optionally creating a new list. */
export async function POST(req: Request): Promise<Response> {
  if (env().DEMO_MODE) return Response.json({ error: "read-only in demo mode" }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const symbol = parsed.data.symbol.toUpperCase();
  if (!isValidSymbol(symbol)) return Response.json({ error: "invalid symbol" }, { status: 400 });

  const prisma = db();
  if (parsed.data.newList) {
    const w = await createWatchlist(parsed.data.newList, [symbol], user.id);
    return Response.json({ ok: true, slug: w.slug });
  }
  const slug = parsed.data.slug;
  if (!slug || !(await ownsWatchlist(slug, user.id))) return Response.json({ error: "not your watchlist" }, { status: 403 });
  const w = await prisma.watchlist.findUnique({ where: { slug }, include: { items: true } });
  if (!w) return Response.json({ error: "not found" }, { status: 404 });
  const has = w.items.some((i) => i.symbol === symbol);
  if (parsed.data.add && !has) {
    await prisma.ticker.upsert({ where: { symbol }, create: { symbol, name: symbol, shareToken: `${symbol.toLowerCase()}-${Math.random().toString(16).slice(2, 14)}` }, update: {} });
    await prisma.watchlistItem.create({ data: { watchlistId: w.id, symbol, position: w.items.length } });
  } else if (!parsed.data.add && has) {
    await prisma.watchlistItem.deleteMany({ where: { watchlistId: w.id, symbol } });
  }
  return Response.json({ ok: true });
}
