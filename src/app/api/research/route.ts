import { z } from "zod";
import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/quota/ratelimit";
import { getOrCreateResearch } from "@/lib/research/run";
import { FreshAnalysisDeniedError } from "@/lib/analysis/service";
import { toApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby plan hard cap

const Body = z.object({ industry: z.string().min(2).max(80), force: z.boolean().optional() });

/** POST { industry } → a cached-or-fresh set of companies to research in that industry. */
export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const ipRl = await rateLimit(`ip:${ip}`);
  if (!ipRl.ok) return Response.json({ error: "Too many requests. Slow down a moment." }, { status: 429, headers: { "retry-after": String(ipRl.retryAfterSec) } });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter an industry or theme (2–80 chars)." }, { status: 400 });

  const user = await currentUser();
  try {
    const result = await getOrCreateResearch(parsed.data.industry, { userId: user?.id ?? null, ip, force: parsed.data.force });
    return Response.json(result);
  } catch (err) {
    if (err instanceof FreshAnalysisDeniedError) {
      return Response.json({ notice: { reason: err.reason, message: err.message } }, { status: 200 });
    }
    const e = toApiError(err);
    return Response.json({ error: e.message }, { status: e.status });
  }
}
