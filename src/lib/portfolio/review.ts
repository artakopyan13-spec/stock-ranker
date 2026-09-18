import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { runAssistantJson } from "@/lib/ai/assistant";
import { logUsage } from "@/lib/ai/client";
import { enrich, getPortfolioRow } from "@/lib/portfolio/store";
import { PortfolioReview } from "@/lib/portfolio/schema";
import type { EnrichedHolding, PortfolioMetrics } from "@/lib/portfolio/schema";

const SYSTEM = `You are an honest portfolio reviewer for a source-verified stock research app. You are given the user's HOLDINGS (with weights, per-stock AI ratings/verdicts and sector) and computed METRICS.
Your job is a candid construction review — the kind a good friend who knows markets would give, not a sales pitch.
Rules:
- Ground every point in the numbers provided. Name the real concentration ("~X% sits in <ticker/theme>"), correlated bets that look diverse but aren't, weak free-cash-flow exposure, and gaps (no cash buffer, one-sector, all mega-cap, unrated positions).
- "themes" groups holdings that would move together (same sector, same macro driver, same customer) — this is the heart of the review.
- Score 1-10 is construction quality (diversification, quality, risk balance) — NOT a market prediction.
- Where holdings are unrated, say the review is partial and suggest analyzing them.
- Never tell the user to buy or sell a specific security and never give personalized investment advice. Frame everything as observations, trade-offs and questions to consider. This is research, not advice.
- Be specific and concise. No hedging boilerplate, no hype.`;

function buildUser(holdings: EnrichedHolding[], metrics: PortfolioMetrics, cashUsd: number, notes: string | null): string {
  const compact = holdings.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    weightPct: h.weightPct === null ? null : Math.round(h.weightPct * 10) / 10,
    valueUsd: h.valueUsd,
    sector: h.sector,
    rating: h.rating,
    action: h.action,
    fcfVerdict: h.fcfVerdict,
    analyzed: h.analyzed,
  }));
  return `METRICS:\n${JSON.stringify(metrics, null, 1)}\n\nHOLDINGS:\n${JSON.stringify(compact, null, 1)}\n\nCASH_USD: ${cashUsd}\nUSER_NOTES: ${notes ?? "(none)"}\n\nReturn the review JSON.`;
}

/** Generates and stores the AI review for the user's portfolio. Caller must gate for cost first. */
export async function generateReview(userId: string): Promise<PortfolioReview> {
  const row = await getPortfolioRow(userId);
  if (!row) throw new Error("No portfolio to review yet.");
  const { holdings, metrics } = await enrich(row);
  if (holdings.length === 0) throw new Error("Add at least one holding before requesting a review.");

  const { value, usage, model } = await runAssistantJson({
    system: SYSTEM,
    user: buildUser(holdings, metrics, row.cashUsd, row.notes),
    schema: PortfolioReview,
    model: env().ASSISTANT_MODEL,
    maxTokens: 2500,
  });
  await logUsage("portfolio", model, usage, { userId });
  await db().portfolio.update({ where: { id: row.id }, data: { review: JSON.stringify(value), reviewAt: new Date() } });
  return value;
}
