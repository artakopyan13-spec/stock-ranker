import { currentUser } from "@/auth";
import { clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/quota/ratelimit";
import { getOrCreateMacroBrief } from "@/lib/macro/brief";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST — refresh the macro briefing (gated paid action; returns the brief or a quota notice). */
export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const ipRl = await rateLimit(`ip:${ip}`);
  if (!ipRl.ok) return Response.json({ error: "Too many requests. Slow down a moment." }, { status: 429, headers: { "retry-after": String(ipRl.retryAfterSec) } });

  const user = await currentUser();
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const result = await getOrCreateMacroBrief({ userId: user?.id ?? null, ip, force: body.force ?? true });
  return Response.json(result);
}
