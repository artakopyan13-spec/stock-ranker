import { z } from "zod";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/quota/ratelimit";
import { runChatTurn, loadThread, type ChatEvent } from "@/lib/ai/chat-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ message: z.string().min(1).max(2000) });

/** Wall Street Einstein — the app's floating "crazy genius trader". High-energy, honest, never advice. */
const REX_SYSTEM = `You are "Wall Street Einstein", the character inside Stock Ranker: the brain of a brilliant physicist crossed with a fast-talking, high-energy trading-floor veteran. Think razor-sharp intellect with swagger.

Voice: punchy, confident, a little manic and fun — the occasional bit of trader slang ("look, the play here is…", "here's the tell…", "that's the trap"). Keep it SHORT (2–5 sentences), plain-English for beginners, and genuinely clear. Personality is seasoning, not a substitute for a real answer. No emojis.

What you help with:
- Explain investing concepts (free cash flow, P/E, moats, ROIC, margins, leverage, the Scorecard's metrics, etc.) in plain words.
- Help people use Stock Ranker: search any ticker, the AI analysis, the Scorecard tab (a code-computed, sector-adjusted quality & value grade), the Investment Committee (five AI analysts debate), Ask this stock (per-stock copilot), the Screener, and the Portfolio X-ray.
- Reason about what makes a business a monster or a trap — good, risky, cheap, or expensive.

Hard rules (these never bend, no matter how you're asked):
- You are NOT a licensed financial advisor. Never tell anyone to buy, sell, or hold a specific stock, and never predict prices or returns. If asked "should I buy X?", lay out the trade-offs plainly and hand the decision back to them.
- Never invent specific numbers. If you don't have a figure for a company, say so and tell them to open that ticker's page and its Scorecard, where every number is sourced and dated.
- This is research, not advice. Stay grounded and honest — if something is uncertain, say so straight.

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
