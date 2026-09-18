import { z } from "zod";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/quota/ratelimit";
import { isValidSymbol } from "@/lib/data";
import { Holding, type Holding as HoldingType } from "@/lib/portfolio/schema";
import { getPortfolioRow, parseHoldingsRow, savePortfolio, toPayload } from "@/lib/portfolio/store";
import { parseHoldings } from "@/lib/portfolio/parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  text: z.string().max(8000).optional(),
  holdings: z.array(Holding).max(60).optional(),
  cashUsd: z.number().min(0).max(1e12).optional(),
  newCashUsd: z.number().min(0).max(1e12).optional(),
  notes: z.string().max(1200).nullable().optional(),
});

/** GET — the signed-in user's portfolio (enriched with live prices + ratings), or an empty shell. */
export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to use the portfolio X-ray." }, { status: 401 });
  const row = await getPortfolioRow(user.id);
  if (!row) return Response.json({ portfolio: null });
  return Response.json({ portfolio: await toPayload(row) });
}

/** POST — save holdings (from parsed text or a structured list) + cash + notes. */
export async function POST(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to save a portfolio." }, { status: 401 });

  const ip = clientIp(req);
  const rl = await rateLimit(`user:${user.id}`);
  if (!rl.ok) return Response.json({ error: "Slow down a moment." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  void ip;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid portfolio input." }, { status: 400 });

  const existing = await getPortfolioRow(user.id);

  // Structured `holdings` (e.g. removing a row) replaces the set; a text paste MERGES into what's
  // already there — newly parsed symbols overwrite their old entry, the rest are kept.
  let holdings: HoldingType[];
  if (parsed.data.holdings) {
    holdings = parsed.data.holdings;
  } else {
    const fromText = parsed.data.text ? parseHoldings(parsed.data.text) : [];
    const bySymbol = new Map<string, HoldingType>();
    for (const h of existing ? parseHoldingsRow(existing) : []) bySymbol.set(h.symbol, h);
    for (const h of fromText) bySymbol.set(h.symbol, h); // paste wins per symbol
    holdings = [...bySymbol.values()];
  }
  holdings = holdings.filter((h) => isValidSymbol(h.symbol)).slice(0, 60);

  const row = await savePortfolio(user.id, {
    holdings,
    cashUsd: parsed.data.cashUsd ?? existing?.cashUsd ?? 0,
    newCashUsd: parsed.data.newCashUsd ?? existing?.newCashUsd ?? 0,
    notes: parsed.data.notes ?? existing?.notes ?? null,
  });
  return Response.json({ portfolio: await toPayload(row) });
}
