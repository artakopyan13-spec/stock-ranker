import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { usdFor, type TokenUsage } from "@/lib/ai/pricing";
import type { Usage } from "@/lib/analysis/schema";

let client: Anthropic | null = null;

export class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set. Add it to .env (see .env.example) or enable DEMO_MODE.");
    this.name = "MissingApiKeyError";
  }
}

export class DailyCapReachedError extends Error {
  constructor(public readonly cap: number) {
    super(`Daily analysis cap reached (MAX_ANALYSES_PER_DAY=${cap}). Try again tomorrow or raise the cap.`);
    this.name = "DailyCapReachedError";
  }
}

export function anthropic(): Anthropic {
  if (client) return client;
  const e = env();
  if (!e.ANTHROPIC_API_KEY) throw new MissingApiKeyError();
  client = new Anthropic({ apiKey: e.ANTHROPIC_API_KEY, timeout: 10 * 60 * 1000 });
  return client;
}

/** Test hook: inject a fake client. */
export function setAnthropicClient(c: Anthropic | null): void {
  client = c;
}

export function usageFromMessage(u: Anthropic.Usage | Anthropic.MessageDeltaUsage): TokenUsage {
  return {
    inputTokens: u.input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
  };
}

export type UsageKind = "analysis" | "news_search" | "batch_analysis" | "chat" | "committee" | "command" | "portfolio" | "portfolio_review";

export async function logUsage(
  kind: UsageKind,
  model: string,
  u: TokenUsage,
  opts: { symbol?: string; batch?: boolean; webSearches?: number; userId?: string | null } = {},
): Promise<Usage> {
  const usd = usdFor(model, u, { batch: opts.batch, webSearches: opts.webSearches });
  await db().usageLog.create({
    data: {
      symbol: opts.symbol ?? null,
      userId: opts.userId ?? null,
      kind,
      model,
      inputTokens: u.inputTokens,
      cacheReadTokens: u.cacheReadTokens,
      cacheWriteTokens: u.cacheWriteTokens,
      outputTokens: u.outputTokens,
      usd,
    },
  });
  return { ...u, usd };
}

export { analysesToday } from "@/lib/quota/spend";
