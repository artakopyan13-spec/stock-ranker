import { z } from "zod";
import { getOrCreateAnalysis, getLatestAnalysis, isFresh, FreshAnalysisDeniedError, type AnalysisEvent } from "@/lib/analysis/service";
import { toApiError } from "@/lib/api-errors";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/quota/ratelimit";
import { isValidSymbol } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ ticker: z.string().min(1).max(12), force: z.boolean().optional() });

/**
 * POST /api/analyze — Server-Sent Events. Cached analyses are free for anyone; a fresh (paid)
 * analysis is gated by login + per-user quota + global spend kill switch inside the service.
 * Events: status | data | section | notice | done | error.
 */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "ticker is required" }, { status: 400 });
  const ticker = parsed.data.ticker.toUpperCase();
  if (!isValidSymbol(ticker)) return Response.json({ error: "Invalid ticker symbol" }, { status: 400 });

  // Per-IP throttle in front of everything (protects the anonymous cached path from floods).
  const ip = clientIp(req);
  const ipRl = await rateLimit(`ip:${ip}`);
  if (!ipRl.ok) return Response.json({ error: "Too many requests. Slow down a moment." }, { status: 429, headers: { "retry-after": String(ipRl.retryAfterSec) } });

  const user = await currentUser();

  // Anonymous "try it once": grant a single fresh analysis per browser (cookie-tracked), only
  // when the result would actually be a fresh run (a cached-fresh hit stays free and doesn't burn it).
  let allowAnon = false;
  let anonUsed = false;
  let setTryCookie = false;
  if (!user) {
    const tried = /(?:^|;\s*)sr_try=1(?:;|$)/.test(req.headers.get("cookie") ?? "");
    const stored = await getLatestAnalysis(ticker).catch(() => null);
    const willBeFresh = !stored || !isFresh(stored) || parsed.data.force === true;
    if (willBeFresh) {
      if (tried) anonUsed = true;
      else {
        allowAnon = true;
        setTryCookie = true;
      }
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnalysisEvent) => controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      try {
        await getOrCreateAnalysis(ticker, { force: parsed.data.force, onEvent: send, userId: user?.id ?? null, ip, allowAnon, anonUsed });
      } catch (err) {
        if (err instanceof FreshAnalysisDeniedError) {
          // No cached analysis to fall back to — a soft notice, not an error (never a 500 for quota).
          send({ type: "notice", reason: err.reason, message: err.message });
        } else {
          const e = toApiError(err);
          send({ type: "error", message: e.message });
          if (e.details) controller.enqueue(encoder.encode(`event: details\ndata: ${JSON.stringify(e.details)}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
  });
  const headers: Record<string, string> = { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" };
  if (setTryCookie) headers["set-cookie"] = `sr_try=1; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`;
  return new Response(stream, { headers });
}
