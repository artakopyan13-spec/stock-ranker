import { rateLimit } from "@/lib/quota/ratelimit";

/** Best-effort client IP for rate limiting (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

/**
 * Per-IP throttle for the public read endpoints (company/quotes/search/prices) — protects the
 * data provider (Yahoo can block a flooded IP) and the DB from abuse. Generous so normal browsing
 * never trips it. Returns a 429 Response when exceeded, otherwise null.
 */
export async function readGuard(req: Request, limitPerMin = 120): Promise<Response | null> {
  const rl = await rateLimit(`read:ip:${clientIp(req)}`, new Date(), limitPerMin);
  if (!rl.ok) return Response.json({ error: "Too many requests. Slow down a moment." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  return null;
}
