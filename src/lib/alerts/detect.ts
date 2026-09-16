import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { Analysis } from "@/lib/analysis/schema";

export type AlertType = "rating_change" | "verdict_flip" | "tripwire" | "fcf_negative";

export interface Change {
  type: AlertType;
  message: string; // one-line reason
}

/** Pure diff of two analyses → the alert-worthy changes. */
export function detectChanges(previous: Analysis | null, current: Analysis): Change[] {
  const changes: Change[] = [];
  const t = current.meta.ticker;

  if (previous && previous.rating.score !== current.rating.score) {
    const dir = current.rating.score > previous.rating.score ? "▲" : "▼";
    changes.push({
      type: "rating_change",
      message: `${t} rating ${dir} ${previous.rating.score} → ${current.rating.score}/10: ${current.rating.justification}`,
    });
  }
  if (previous && previous.rating.action !== current.rating.action) {
    changes.push({
      type: "verdict_flip",
      message: `${t} verdict flipped ${previous.rating.action} → ${current.rating.action}: ${current.rating.justification}`,
    });
  }
  if (current.previousTripwire?.triggered) {
    changes.push({
      type: "tripwire",
      message: `${t} tripwire triggered — "${current.previousTripwire.description}": ${current.previousTripwire.reason}`,
    });
  }
  const wasNegative = previous?.fcf.verdict === "negative";
  if (current.fcf.verdict === "negative" && !wasNegative) {
    changes.push({
      type: "fcf_negative",
      message: `${t} free cash flow is negative (${current.fcf.ttm.source}, ${current.fcf.ttm.asOf}): ${current.fcf.verdictReason}`,
    });
  }
  return changes;
}

/** Inserts alert rows keyed `${symbol}:${type}:${analysisId}`; the unique key makes re-runs no-ops. */
export async function queueAlerts(analysisId: string, analysis: Analysis, changes: Change[]): Promise<number> {
  const prisma = db();
  let queued = 0;
  for (const c of changes) {
    const key = `${analysis.meta.ticker}:${c.type}:${analysisId}`;
    const exists = await prisma.alert.findUnique({ where: { key } });
    if (exists) continue;
    await prisma.alert.create({
      data: { key, symbol: analysis.meta.ticker, type: c.type, message: c.message, analysisId, channel: env().ALERT_CHANNEL },
    });
    queued++;
  }
  return queued;
}
