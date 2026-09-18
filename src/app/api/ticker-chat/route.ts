import { z } from "zod";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/quota/ratelimit";
import { isValidSymbol } from "@/lib/data";
import { tickerContext } from "@/lib/ai/grounding";
import { runChatTurn, type ChatEvent } from "@/lib/ai/chat-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ ticker: z.string().min(1).max(12), message: z.string().min(1).max(2000) });

/** POST /api/ticker-chat — SSE. Grounded "Ask this stock" copilot. Gated + metered inside runChatTurn. */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "ticker and message are required" }, { status: 400 });
  const ticker = parsed.data.ticker.toUpperCase();
  if (!isValidSymbol(ticker)) return Response.json({ error: "Invalid ticker symbol" }, { status: 400 });

  const ip = clientIp(req);
  const ipRl = await rateLimit(`ip:${ip}`);
  if (!ipRl.ok) return Response.json({ error: "Too many requests. Slow down a moment." }, { status: 429, headers: { "retry-after": String(ipRl.retryAfterSec) } });

  const user = await currentUser();
  const ctx = await tickerContext(ticker);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      try {
        await runChatTurn({ userId: user?.id ?? null, ip, thread: `ticker:${ticker}`, system: ctx.system, message: parsed.data.message, symbol: ticker, emit });
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Unexpected error" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}

/** GET /api/ticker-chat?ticker=… — prior turns of this user's thread (for rehydration). */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ticker = (url.searchParams.get("ticker") ?? "").toUpperCase();
  if (!isValidSymbol(ticker)) return Response.json({ error: "Invalid ticker" }, { status: 400 });
  const user = await currentUser();
  if (!user) return Response.json({ messages: [] });
  const { loadThread } = await import("@/lib/ai/chat-service");
  const messages = await loadThread(user.id, `ticker:${ticker}`, 20);
  return Response.json({ messages });
}
