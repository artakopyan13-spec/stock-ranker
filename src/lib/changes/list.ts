import { db } from "@/lib/db";
import type { ChangeType } from "@/lib/changes/detect";

export interface ChangeRow {
  id: string;
  symbol: string;
  type: ChangeType;
  message: string;
  analysisId: string;
  runKey: string | null;
  createdAt: Date;
}

export interface ChangeDay {
  date: string; // YYYY-MM-DD (UTC)
  rows: ChangeRow[];
}

export interface RunSummary {
  runKey: string;
  status: string;
  mode: string;
  submitted: string[];
  skipped: string[];
  startedAt: Date;
  collectedAt: Date | null;
  error: string | null;
}

/** Changes from the last `days` days, newest first, grouped by UTC day. */
export async function listChanges(days = 30, type?: ChangeType): Promise<ChangeDay[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db().change.findMany({ where: { createdAt: { gte: since }, ...(type ? { type } : {}) }, orderBy: { createdAt: "desc" }, take: 500 });
  const byDay = new Map<string, ChangeRow[]>();
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push({ ...r, type: r.type as ChangeType });
    byDay.set(day, list);
  }
  return [...byDay.entries()].map(([date, rows]) => ({ date, rows }));
}

export async function recentRuns(limit = 10): Promise<RunSummary[]> {
  const runs = await db().refreshRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
  return runs.map((r) => ({
    runKey: r.runKey,
    status: r.status,
    mode: r.mode,
    submitted: JSON.parse(r.tickers) as string[],
    skipped: JSON.parse(r.skipped) as string[],
    startedAt: r.startedAt,
    collectedAt: r.collectedAt,
    error: r.error,
  }));
}
