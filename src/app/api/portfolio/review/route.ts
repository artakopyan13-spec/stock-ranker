import { currentUser } from "@/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/request";
import { gateFreshAnalysis } from "@/lib/quota/gate";
import { generateReview } from "@/lib/portfolio/review";
import { getPortfolioRow, parseHoldingsRow } from "@/lib/portfolio/store";
import { classifyAiError } from "@/lib/ai/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby plan hard cap

/** POST — generate the full portfolio review (heavy: gated as a fresh-analysis credit). */
export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now(); // the review's time budget runs from here, not from after the data prelude
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  // Cheap input check before the gate, so a portfolio with nothing to review never uses up a credit.
  const row = await getPortfolioRow(user.id);
  if (!row || parseHoldingsRow(row).length === 0) return Response.json({ error: "Add at least one holding before requesting a review." }, { status: 400 });

  const gate = await gateFreshAnalysis({ userId: user.id, ip: clientIp(req) });
  if (!gate.allow) return Response.json({ notice: { reason: gate.reason, message: gate.message } });

  // Claim the quota slot NOW: the gate counts usage rows, and the real row used to be written only
  // when the review finished ~45s later — so parallel requests all passed the gate. The placeholder
  // is filled with the real cost on success and left in place on failure (an attempt still counts).
  const placeholder = await db().usageLog.create({
    data: { kind: "portfolio_review", model: env().ANALYSIS_MODEL, userId: user.id, inputTokens: 0, outputTokens: 0, usd: 0 },
    select: { id: true },
  });

  try {
    const { review, stale } = await generateReview(user.id, { startedAt, usageLogId: placeholder.id });
    return Response.json({ review, stale });
  } catch (err) {
    const ai = classifyAiError(err);
    if (ai) return Response.json({ error: ai.message, code: ai.code }, { status: ai.status });
    return Response.json({ error: err instanceof Error ? err.message : "Could not generate the review." }, { status: 400 });
  }
}
