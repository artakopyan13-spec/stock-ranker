import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/quota/ratelimit";
import { isValidSymbol } from "@/lib/data";
import { getOrCreateDeep, getCachedDeepWithMeta } from "@/lib/deep/run";
import { FreshAnalysisDeniedError } from "@/lib/analysis/service";
import { toApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby plan hard cap

/** GET — the cached deep analysis (free), or 404 if none exists yet. */
export async function GET(_req: Request, ctx: { params: Promise<{ ticker: string }> }): Promise<Response> {
  const { ticker } = await ctx.params;
  if (!isValidSymbol(ticker)) return Response.json({ error: "Invalid ticker" }, { status: 400 });
  const cached = await getCachedDeepWithMeta(ticker);
  if (!cached) return Response.json({ error: "No deep analysis yet" }, { status: 404 });
  return Response.json({ ...cached, cached: true });
}

/** POST — build/refresh the deep analysis (gated paid action; degrades to cached + notice). */
export async function POST(req: Request, ctx: { params: Promise<{ ticker: string }> }): Promise<Response> {
  const { ticker } = await ctx.params;
  if (!isValidSymbol(ticker)) return Response.json({ error: "Invalid ticker" }, { status: 400 });

  const ip = clientIp(req);
  const ipRl = await rateLimit(`ip:${ip}`);
  if (!ipRl.ok) return Response.json({ error: "Too many requests. Slow down a moment." }, { status: 429, headers: { "retry-after": String(ipRl.retryAfterSec) } });

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const user = await currentUser();
  try {
    const result = await getOrCreateDeep(ticker, { userId: user?.id ?? null, ip, force: body.force });
    return Response.json(result);
  } catch (err) {
    if (err instanceof FreshAnalysisDeniedError) {
      return Response.json({ notice: { reason: err.reason, message: err.message } }, { status: 200 });
    }
    const e = toApiError(err);
    return Response.json({ error: e.message }, { status: e.status });
  }
}
