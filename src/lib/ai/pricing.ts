/** USD per million tokens. Anthropic first-party rates (claude-api reference, cached 2026-06-24). */
interface Rate {
  input: number;
  output: number;
}

const RATES: Record<string, Rate> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;
const BATCH_MULTIPLIER = 0.5;
/** Anthropic web search is billed per search on top of tokens. */
export const WEB_SEARCH_USD_PER_SEARCH = 0.01;

export interface TokenUsage {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export function rateFor(model: string): Rate {
  const key = Object.keys(RATES).find((k) => model.startsWith(k));
  return key ? RATES[key] : RATES["claude-opus-5"];
}

export function usdFor(model: string, u: TokenUsage, opts: { batch?: boolean; webSearches?: number } = {}): number {
  const r = rateFor(model);
  const cacheRead = model.startsWith("claude-fable-5-1") ? 0.025 : CACHE_READ_MULTIPLIER;
  let usd =
    (u.inputTokens * r.input +
      u.cacheReadTokens * r.input * cacheRead +
      u.cacheWriteTokens * r.input * CACHE_WRITE_MULTIPLIER +
      u.outputTokens * r.output) /
    1e6;
  if (opts.batch) usd *= BATCH_MULTIPLIER;
  usd += (opts.webSearches ?? 0) * WEB_SEARCH_USD_PER_SEARCH;
  return Math.round(usd * 1e6) / 1e6;
}

/** Rough pre-flight estimate for docs/admin: ~3.5k cached system, ~5k data, ~4.5k output. */
export function estimatePerAnalysisUsd(model: string, batch = false): number {
  return usdFor(model, { inputTokens: 5000, cacheReadTokens: 3500, cacheWriteTokens: 0, outputTokens: 4500 }, { batch });
}
