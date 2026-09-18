import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { runAssistantJson } from "@/lib/ai/assistant";
import { logUsage } from "@/lib/ai/client";
import { tickerFacts } from "@/lib/ai/grounding";
import { gateFreshAnalysis, type DenyReason } from "@/lib/quota/gate";
import { CommitteeOutput, CommitteeReport, SEATS } from "@/lib/committee/schema";
import { FreshAnalysisDeniedError } from "@/lib/analysis/service";

const TTL_MS = 24 * 3_600_000;

const SYSTEM = `You are the chair of a five-seat investment committee for a source-verified research app.
You are given FACTS (a source-tagged analysis + financials) for one company. Convene the committee:
${SEATS.map((s) => `- ${s.name}: ${s.brief}`).join("\n")}

Rules:
- Each seat argues its lens honestly, in character, citing figures that appear in FACTS (rating, FCF margin, growth, valuation multiples, net cash, catalysts). Never invent a figure not in FACTS; if a lens lacks data, it says so.
- Seats must genuinely disagree where the facts justify it. The Devil's Advocate attacks the emerging consensus, not a strawman.
- The debate section is 2-4 pointed exchanges where one seat challenges another by name.
- The chair states a decision rule up front, then synthesizes a final 1-10 score and BUY/HOLD/SELL that is consistent with the weight of argument, and records the strongest surviving objection as dissent.
- This is research, not advice. Tone: sharp, concrete, no hype, no boilerplate.`;

export interface CommitteeResult {
  report: CommitteeReport;
  cached: boolean;
  notice?: { reason: DenyReason; message: string };
}

async function latestRow(symbol: string) {
  return db().committee.findFirst({ where: { symbol }, orderBy: { createdAt: "desc" } });
}

function parseRow(row: { payload: string }): CommitteeReport {
  return CommitteeReport.parse(JSON.parse(row.payload));
}

/** Cached committee if fresh; otherwise gate (heavy paid action), run one structured call, store, log. */
export async function getOrCreateCommittee(
  symbol: string,
  opts: { userId?: string | null; ip?: string; force?: boolean } = {},
): Promise<CommitteeResult> {
  const sym = symbol.toUpperCase();
  const e = env();

  const existing = await latestRow(sym);
  const fresh = existing ? Date.now() - existing.createdAt.getTime() < TTL_MS : false;
  if (e.DEMO_MODE) {
    if (existing) return { report: parseRow(existing), cached: true };
    throw new FreshAnalysisDeniedError("no_key", "Committee debates are pre-generated in demo mode.");
  }
  if (existing && fresh && !opts.force) return { report: parseRow(existing), cached: true };

  const gate = await gateFreshAnalysis({ userId: opts.userId ?? null, ip: opts.ip ?? "0.0.0.0" });
  if (!gate.allow) {
    if (existing) return { report: parseRow(existing), cached: true, notice: { reason: gate.reason, message: gate.message } };
    throw new FreshAnalysisDeniedError(gate.reason, gate.message);
  }

  const tf = await tickerFacts(sym);
  const user = `FACTS for ${tf.symbol}${tf.hasAnalysis ? ` (${tf.companyName})` : ""}:\n${JSON.stringify(tf.facts, null, 1)}\n\nConvene the committee and return the JSON.`;
  const { value, usage, model } = await runAssistantJson({
    system: SYSTEM,
    user,
    schema: CommitteeOutput,
    model: e.ANALYSIS_MODEL,
    effort: "low",
    maxTokens: 6000,
  });
  const logged = await logUsage("committee", model, usage, { symbol: sym, userId: opts.userId ?? null });

  const report: CommitteeReport = {
    ...value,
    symbol: tf.symbol,
    companyName: tf.companyName,
    basedOnAnalysisAt: tf.analyzedAt,
    model,
    createdAt: new Date().toISOString(),
  };
  await db().committee.create({ data: { symbol: sym, payload: JSON.stringify(report), model, usdCost: logged.usd } });
  return { report, cached: false };
}

export async function getCachedCommittee(symbol: string): Promise<CommitteeReport | null> {
  const row = await latestRow(symbol.toUpperCase());
  return row ? parseRow(row) : null;
}
