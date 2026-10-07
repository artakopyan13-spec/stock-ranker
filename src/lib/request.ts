import { rateLimit } from "@/lib/quota/ratelimit";

/**
 * Rate-limit identity for an address. IPv4 is used as-is; IPv6 is grouped by its /64 prefix,
 * because one subscriber is typically handed a whole /64 and could otherwise rotate addresses
 * within it to dodge per-IP limits. IPv4-mapped IPv6 (::ffff:1.2.3.4) collapses to the IPv4.
 */
export function ipKey(raw: string): string {
  const ip = raw.trim().replace(/^\[|\](:\d+)?$/g, "").split("%")[0];
  if (!ip.includes(":")) return ip;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1];
  const [head, tail] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  if (groups.length < 4 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * Best-effort client IP for rate limiting. Prefers the header Vercel's edge sets itself
 * (x-vercel-forwarded-for, which a client can't inject), then x-real-ip, then x-forwarded-for.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const raw = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for");
  const first = raw?.split(",")[0].trim();
  return first ? ipKey(first) : "0.0.0.0";
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
