import { z } from "zod";
import { getOrCreateAnalysis, type AnalysisEvent } from "@/lib/analysis/service";
import { toApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ ticker: z.string().min(1).max(12), force: z.boolean().optional() });

/**
 * POST /api/analyze — Server-Sent Events. Same-origin UI only (no API key): the daily cap
 * protects spend. Events: status | data | section | done | error.
 */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "ticker is required" }, { status: 400 });
  const { ticker, force } = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnalysisEvent) => controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      try {
        await getOrCreateAnalysis(ticker, { force, onEvent: send });
      } catch (err) {
        const e = toApiError(err);
        send({ type: "error", message: e.message });
        if (e.details) controller.enqueue(encoder.encode(`event: details\ndata: ${JSON.stringify(e.details)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
