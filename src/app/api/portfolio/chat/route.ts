import { z } from "zod";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/quota/ratelimit";
import { getPortfolioRow, enrich, parseReview } from "@/lib/portfolio/store";
import { portfolioSystem, type HeldFacts } from "@/lib/ai/grounding";
import { runChatTurn, type ChatEvent } from "@/lib/ai/chat-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ message: z.string().min(1).max(2000) });

/** POST /api/portfolio/chat — SSE. Grounded chat about the user's own portfolio. */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "message is required" }, { status: 400 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to chat about your portfolio." }, { status: 401 });

  const ip = clientIp(req);
  const ipRl = await rateLimit(`ip:${ip}`);
  if (!ipRl.ok) return Response.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(ipRl.retryAfterSec) } });

  const row = await getPortfolioRow(user.id);
  if (!row) return Response.json({ error: "Add your holdings first." }, { status: 400 });
  const { holdings, metrics } = await enrich(row);
  const held: HeldFacts[] = holdings.map((h) => ({
    symbol: h.symbol,
    weightPct: h.weightPct ?? 0,
    valueUsd: h.valueUsd,
    rating: h.rating,
    action: h.action,
    fcfVerdict: h.fcfVerdict,
    sector: h.sector,
    thesisBear: null,
  }));
  const system = portfolioSystem({ holdings: held, cashUsd: row.cashUsd, totalValueUsd: metrics.totalValueUsd, notes: row.notes, review: parseReview(row.review) });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      try {
        await runChatTurn({ userId: user.id, ip, thread: `portfolio:${row.id}`, system, message: parsed.data.message, emit });
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Unexpected error" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}

/** GET — prior portfolio-chat turns for rehydration. */
export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ messages: [] });
  const row = await getPortfolioRow(user.id);
  if (!row) return Response.json({ messages: [] });
  const { loadThread } = await import("@/lib/ai/chat-service");
  return Response.json({ messages: await loadThread(user.id, `portfolio:${row.id}`, 20) });
}
