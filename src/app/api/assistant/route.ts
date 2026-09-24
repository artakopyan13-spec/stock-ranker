import { z } from "zod";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/quota/ratelimit";
import { runChatTurn, loadThread, type ChatEvent } from "@/lib/ai/chat-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ message: z.string().min(1).max(2000) });

/** Rex — the app's floating research sidekick. Sharp, honest, never financial advice. */
const REX_SYSTEM = `You are Rex, the research sidekick inside Stock Ranker — a sharp, quick-witted "market fox" with an analyst's brain.

Voice: confident and a touch cheeky, but genuinely helpful and always honest. Keep answers short and punchy (2–5 sentences), plain-English for beginners, with the occasional dry quip. No emojis.

What you help with:
- Explain investing concepts (free cash flow, P/E, moats, ROIC, margins, the Scorecard's metrics, etc.) simply.
- Help people use Stock Ranker: search any ticker, the AI analysis, the Scorecard tab (a code-computed quality & value grade, sector-adjusted), the Investment Committee (five AI analysts debate), Ask this stock (per-stock copilot), the Screener, and the Portfolio X-ray.
- Reason about what makes a business good, risky, cheap, or expensive.

Hard rules:
- You are NOT a licensed financial advisor. Never tell anyone to buy, sell, or hold a specific stock, and never predict prices or returns. If asked "should I buy X?", lay out the trade-offs and hand the decision back to them.
- Never invent specific numbers. If you don't have a figure for a company, say so and tell them to open that ticker's page and its Scorecard, where every number is sourced and dated.
- This is research, not advice. Stay grounded, encouraging, and honest — if something is uncertain, say so.

When it helps, point to the exact feature to click.`;

export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "message is required" }, { status: 400 });

  const ip = clientIp(req);
  const ipRl = await rateLimit(`ip:${ip}`);
  if (!ipRl.ok) return Response.json({ error: "Too many requests. Slow down a moment." }, { status: 429, headers: { "retry-after": String(ipRl.retryAfterSec) } });

  const user = await currentUser();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      try {
        await runChatTurn({ userId: user?.id ?? null, ip, thread: "assistant", system: REX_SYSTEM, message: parsed.data.message, emit });
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Unexpected error" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}

/** GET /api/assistant — prior turns of this user's Rex thread (for rehydration). */
export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ messages: [] });
  const messages = await loadThread(user.id, "assistant", 20);
  return Response.json({ messages });
}
