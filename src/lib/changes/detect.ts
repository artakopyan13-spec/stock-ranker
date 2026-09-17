import { db } from "@/lib/db";
import type { Analysis } from "@/lib/analysis/schema";

export type ChangeType = "rating_change" | "verdict_flip" | "tripwire" | "fcf_negative" | "opportunity";

export const CHANGE_LABEL: Record<ChangeType, string> = {
  rating_change: "Rating change",
  verdict_flip: "Verdict flip",
  tripwire: "Tripwire triggered",
  fcf_negative: "FCF turned negative",
  opportunity: "Potential buy",
};

export interface Change {
  type: ChangeType;
  message: string; // one-line reason
}

/** Pure diff of two analyses → the changes worth surfacing on the "What changed" page. */
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
  // Opportunity: the AI now sees a potential buy (upgraded to BUY, or rating climbed into the 8+ band).
  const becameBuy = previous && previous.rating.action !== "BUY" && current.rating.action === "BUY";
  const climbedHigh = previous && previous.rating.score < 8 && current.rating.score >= 8;
  if (becameBuy || climbedHigh) {
    changes.push({ type: "opportunity", message: `${t} looks like a potential buy — ${current.rating.score}/10 ${current.rating.action}: ${current.rating.justification}` });
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

/** Stores change rows keyed `${symbol}:${type}:${analysisId}`; the unique key makes re-runs no-ops. */
export async function recordChanges(analysisId: string, analysis: Analysis, changes: Change[], runKey: string | null = null): Promise<number> {
  const prisma = db();
  let recorded = 0;
  for (const c of changes) {
    const key = `${analysis.meta.ticker}:${c.type}:${analysisId}`;
    const exists = await prisma.change.findUnique({ where: { key } });
    if (exists) continue;
    await prisma.change.create({ data: { key, symbol: analysis.meta.ticker, type: c.type, message: c.message, analysisId, runKey } });
    recorded++;
  }
  return recorded;
}
