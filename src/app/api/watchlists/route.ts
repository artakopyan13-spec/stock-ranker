import { z } from "zod";
import { createWatchlist, listWatchlists } from "@/lib/watchlists";
import { env } from "@/lib/env";
import { currentUser } from "@/auth";
import { normalizeSymbols } from "@/lib/watchlists";
import { isValidSymbol } from "@/lib/data";

export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().min(1).max(60), symbols: z.array(z.string()).max(50) });

export async function GET(): Promise<Response> {
  const user = await currentUser();
  return Response.json({ watchlists: await listWatchlists(user?.id ?? null) });
}

export async function POST(req: Request): Promise<Response> {
  if (env().DEMO_MODE) return Response.json({ error: "Watchlists are read-only in demo mode" }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to create a watchlist" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "name and symbols[] are required" }, { status: 400 });
  const symbols = normalizeSymbols(parsed.data.symbols).filter(isValidSymbol);
  const w = await createWatchlist(parsed.data.name, symbols, user.id);
  return Response.json({ watchlist: w }, { status: 201 });
}
