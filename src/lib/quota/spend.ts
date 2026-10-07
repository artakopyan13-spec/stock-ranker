import { db } from "@/lib/db";

export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Total USD spent on Claude calls since UTC midnight (across all users + cron). */
export async function spendToday(now = new Date()): Promise<number> {
  const rows = await db().usageLog.aggregate({ _sum: { usd: true }, where: { createdAt: { gte: startOfUtcDay(now) } } });
  return rows._sum.usd ?? 0;
}

/** Kinds counted against the GLOBAL daily analysis cap. Deliberately excludes deep/earnings/research:
 *  the off-Vercel refresh worker logs those under the system user many times a day, and counting
 *  them here would exhaust the global cap and lock real users out. Spend is still bounded by the
 *  daily USD ceiling, which sees every logged call. */
const FRESH_KINDS = ["analysis", "batch_analysis", "committee", "portfolio_review"];
/** Kinds that use up a USER's daily fresh-AI credits. Every user-triggered paid generation must be
 *  here — deep/earnings/research were missing, so a free user could force-regenerate them without
 *  limit and burn the global spend ceiling, switching AI off for everyone. */
const USER_FRESH_KINDS = ["analysis", "committee", "portfolio_review", "deep", "earnings", "research"];

/** Fresh + batch analyses + committees run since UTC midnight (global cap counter). */
export async function analysesToday(now = new Date()): Promise<number> {
  return db().usageLog.count({ where: { kind: { in: FRESH_KINDS }, createdAt: { gte: startOfUtcDay(now) } } });
}

/** Fresh analyses + committees a specific user triggered today (per-user quota counter). */
export async function userAnalysesToday(userId: string, now = new Date()): Promise<number> {
  return db().usageLog.count({ where: { kind: { in: USER_FRESH_KINDS }, userId, createdAt: { gte: startOfUtcDay(now) } } });
}

/** How many calls of the given kind(s) a user made today — powers the per-kind daily caps (chat, command). */
export async function userActionsToday(userId: string, kinds: string[], now = new Date()): Promise<number> {
  return db().usageLog.count({ where: { kind: { in: kinds }, userId, createdAt: { gte: startOfUtcDay(now) } } });
}
