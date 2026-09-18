import { z } from "zod";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/quota/ratelimit";
import { env } from "@/lib/env";
import { loadUniverse } from "@/lib/universe";
import { AI_ACTION_KINDS, gateAiAction } from "@/lib/quota/gate";
import { logUsage } from "@/lib/ai/client";
import { heuristicIntent, intentToResult, llmIntent } from "@/lib/nl/parse";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ q: z.string().min(1).max(400) });

/** POST /api/command — parse a natural-language request into a navigation/answer action. */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "q is required" }, { status: 400 });
  const q = parsed.data.q.trim();

  const ip = clientIp(req);
  const ipRl = await rateLimit(`ip:${ip}`);
  if (!ipRl.ok) return Response.json({ error: "Too many requests. Slow down a moment." }, { status: 429, headers: { "retry-after": String(ipRl.retryAfterSec) } });

  const universe = await loadUniverse();
  const symbols = new Set(universe.map((r) => r.symbol));

  // Zero-cost fast path: bare/$-prefixed known tickers need no model call and no login.
  const fast = heuristicIntent(q, symbols);
  if (fast) return Response.json({ result: intentToResult(fast) });

  const user = await currentUser();
  const gate = await gateAiAction({ userId: user?.id ?? null, ip, kinds: AI_ACTION_KINDS, dailyCap: env().FREE_DAILY_CHAT_MESSAGES });
  if (!gate.allow) {
    const reply = user ? gate.message : "Sign in to use natural-language search — or type a ticker like AAPL, or “compare NVDA and AMD”.";
    return Response.json({ result: { action: "answer", reply } });
  }

  const sectors = [...new Set(universe.map((r) => r.sector).filter((s): s is string => Boolean(s)))].sort();
  try {
    const { value, usage, model } = await llmIntent(q, sectors);
    await logUsage("command", model, usage, { userId: user?.id ?? null });
    return Response.json({ result: intentToResult(value) });
  } catch (err) {
    return Response.json({ result: { action: "answer", reply: err instanceof Error ? `I couldn't parse that (${err.message}). Try a ticker or “cash machines under 20x FCF”.` : "I couldn't parse that." } });
  }
}
