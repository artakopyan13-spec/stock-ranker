import { db } from "@/lib/db";
import { env } from "@/lib/env";

export interface RateResult {
  ok: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
}

/** Fraction of hits that also sweep a bounded batch of expired rows (so the table can't balloon between crons). */
const PRUNE_PROBABILITY = 0.02;
const PRUNE_BATCH = 500;

/**
 * DB-backed fixed-window rate limiter (per minute). Cheap: one upsert per hit, no Redis.
 * `subject` is e.g. `user:<id>` or `ip:<addr>`. The window key rolls each minute so old
 * rows are harmless; a few hits opportunistically prune them and the daily cron sweeps the rest.
 */
export async function rateLimit(subject: string, now = new Date(), limitOverride?: number): Promise<RateResult> {
  const limit = limitOverride ?? env().RATE_LIMIT_PER_MIN;
  const minute = Math.floor(now.getTime() / 60_000);
  const key = `${subject}:min:${minute}`;
  const row = await db().rateLimit.upsert({
    where: { key },
    create: { key, count: 1, windowStart: now },
    update: { count: { increment: 1 } },
  });
  if (Math.random() < PRUNE_PROBABILITY) await pruneRateLimits(now, PRUNE_BATCH).catch(() => 0);
  const remaining = Math.max(0, limit - row.count);
  const retryAfterSec = 60 - (Math.floor(now.getTime() / 1000) % 60);
  return { ok: row.count <= limit, remaining, limit, retryAfterSec };
}

/** Removes rate-limit rows older than 10 minutes (at most `max` of them when given). Called by the cron. */
export async function pruneRateLimits(now = new Date(), max?: number): Promise<number> {
  const cutoff = new Date(now.getTime() - 10 * 60_000);
  const where = { windowStart: { lt: cutoff } };
  if (max === undefined) return (await db().rateLimit.deleteMany({ where })).count;
  const stale = await db().rateLimit.findMany({ where, select: { key: true }, take: max });
  if (stale.length === 0) return 0;
  return (await db().rateLimit.deleteMany({ where: { key: { in: stale.map((r) => r.key) } } })).count;
}
