import { db } from "@/lib/db";

export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Total USD spent on Claude calls since UTC midnight (across all users + cron). */
export async function spendToday(now = new Date()): Promise<number> {
  const rows = await db().usageLog.aggregate({ _sum: { usd: true }, where: { createdAt: { gte: startOfUtcDay(now) } } });
  return rows._sum.usd ?? 0;
}

/** Fresh + batch analyses run since UTC midnight (global cap counter). */
export async function analysesToday(now = new Date()): Promise<number> {
  return db().usageLog.count({ where: { kind: { in: ["analysis", "batch_analysis"] }, createdAt: { gte: startOfUtcDay(now) } } });
}

/** Fresh analyses a specific user triggered today (per-user quota counter). */
export async function userAnalysesToday(userId: string, now = new Date()): Promise<number> {
  return db().usageLog.count({ where: { kind: "analysis", userId, createdAt: { gte: startOfUtcDay(now) } } });
}

/** How many calls of the given kind(s) a user made today — powers the per-kind daily caps (chat, command). */
export async function userActionsToday(userId: string, kinds: string[], now = new Date()): Promise<number> {
  return db().usageLog.count({ where: { kind: { in: kinds }, userId, createdAt: { gte: startOfUtcDay(now) } } });
}
