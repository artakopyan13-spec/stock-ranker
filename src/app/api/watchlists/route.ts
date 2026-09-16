import { z } from "zod";
import { createWatchlist, listWatchlists } from "@/lib/watchlists";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().min(1).max(60), symbols: z.array(z.string()).max(50) });

export async function GET(): Promise<Response> {
  return Response.json({ watchlists: await listWatchlists() });
}

export async function POST(req: Request): Promise<Response> {
  if (env().DEMO_MODE) return Response.json({ error: "Watchlists are read-only in demo mode" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "name and symbols[] are required" }, { status: 400 });
  const w = await createWatchlist(parsed.data.name, parsed.data.symbols);
  return Response.json({ watchlist: w }, { status: 201 });
}
