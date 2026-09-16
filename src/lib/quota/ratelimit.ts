import { db } from "@/lib/db";
import { env } from "@/lib/env";

export interface RateResult {
  ok: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
}

/**
 * DB-backed fixed-window rate limiter (per minute). Cheap: one upsert per hit, no Redis.
 * `subject` is e.g. `user:<id>` or `ip:<addr>`. The window key rolls each minute so old
 * rows are harmless; a periodic cleanup (cron) prunes them.
 */
export async function rateLimit(subject: string, now = new Date()): Promise<RateResult> {
  const limit = env().RATE_LIMIT_PER_MIN;
  const minute = Math.floor(now.getTime() / 60_000);
  const key = `${subject}:min:${minute}`;
  const row = await db().rateLimit.upsert({
    where: { key },
    create: { key, count: 1, windowStart: now },
    update: { count: { increment: 1 } },
  });
  const remaining = Math.max(0, limit - row.count);
  const retryAfterSec = 60 - (Math.floor(now.getTime() / 1000) % 60);
  return { ok: row.count <= limit, remaining, limit, retryAfterSec };
}

/** Removes rate-limit rows older than 10 minutes. Called by the cron. */
export async function pruneRateLimits(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 10 * 60_000);
  const res = await db().rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return res.count;
}
