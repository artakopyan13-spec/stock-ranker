import { z } from "zod";
import { runAssistantJson } from "@/lib/ai/assistant";
import { isValidSymbol } from "@/lib/data";
import type { ScreenFilters } from "@/lib/screener";

const NlFilters = z.object({
  sector: z.string().nullable(),
  minMarketCapB: z.number().nullable(),
  minRevGrowthPct: z.number().nullable(),
  minFcfMarginPct: z.number().nullable(),
  maxTrailingPE: z.number().nullable(),
  maxForwardPE: z.number().nullable(),
  maxPriceToFcf: z.number().nullable(),
  minRating: z.number().nullable(),
  actions: z.array(z.enum(["BUY", "HOLD", "SELL"])),
  fcfVerdicts: z.array(z.enum(["healthy", "thin", "negative"])),
});

export const Intent = z.object({
  kind: z.enum(["analyze", "compare", "screen", "answer"]),
  ticker: z.string().nullable(),
  tickers: z.array(z.string()),
  filters: NlFilters.nullable(),
  reply: z.string().nullable(),
});
export type Intent = z.infer<typeof Intent>;

export type CommandResult =
  | { action: "navigate"; href: string; label: string }
  | { action: "answer"; reply: string };

function toScreenFilters(f: z.infer<typeof NlFilters> | null): ScreenFilters {
  if (!f) return {};
  const out: ScreenFilters = {};
  if (f.sector) out.sector = f.sector;
  if (f.minMarketCapB !== null) out.minMarketCap = f.minMarketCapB;
  if (f.minRevGrowthPct !== null) out.minRevGrowth = f.minRevGrowthPct;
  if (f.minFcfMarginPct !== null) out.minFcfMargin = f.minFcfMarginPct;
  if (f.maxTrailingPE !== null) out.maxTrailingPE = f.maxTrailingPE;
  if (f.maxForwardPE !== null) out.maxForwardPE = f.maxForwardPE;
  if (f.maxPriceToFcf !== null) out.maxPriceToFcf = f.maxPriceToFcf;
  if (f.minRating !== null) out.minRating = f.minRating;
  if (f.actions.length) out.actions = f.actions;
  if (f.fcfVerdicts.length) out.fcfVerdicts = f.fcfVerdicts;
  return out;
}

function screenHref(f: ScreenFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const qs = p.toString();
  return qs ? `/screener?${qs}` : "/screener";
}

/** Turns a parsed intent into a client action. */
export function intentToResult(intent: Intent): CommandResult {
  if (intent.kind === "analyze" && intent.ticker) {
    const t = intent.ticker.toUpperCase();
    return { action: "navigate", href: `/t/${encodeURIComponent(t)}`, label: `Analyzing ${t}` };
  }
  if (intent.kind === "compare" && intent.tickers.length >= 2) {
    const list = intent.tickers.map((t) => t.toUpperCase()).slice(0, 5);
    return { action: "navigate", href: `/compare?tickers=${list.join(",")}`, label: `Comparing ${list.join(", ")}` };
  }
  if (intent.kind === "screen") {
    const f = toScreenFilters(intent.filters);
    return { action: "navigate", href: screenHref(f), label: "Opening the screener" };
  }
  return { action: "answer", reply: intent.reply ?? "I couldn't turn that into a search. Try a ticker (AAPL), a comparison (compare NVDA and AMD), or a screen (cash machines under 20x FCF)." };
}

const TICKER_SHAPE = /^[A-Z][A-Z0-9.\-]{0,5}$/;

/**
 * Zero-cost fast path (no model call): a bare/`$`-prefixed ticker jumps to analyze/compare.
 * A token counts as a ticker if it's already in the universe, OR the user signalled it's a symbol
 * by writing it uppercase or with `$` and it has ticker shape (so lowercase words don't false-trigger).
 */
export function heuristicIntent(input: string, universe: Set<string>): Intent | null {
  const cleaned = input.trim().replace(/[,\s]+/g, " ");
  const rawTokens = cleaned.split(" ").filter(Boolean);
  if (rawTokens.length === 0 || rawTokens.length > 5) return null;
  const tickerLike = (raw: string): string | null => {
    const looksIntentional = raw.startsWith("$") || raw === raw.toUpperCase();
    const sym = raw.replace(/^\$/, "").toUpperCase();
    if (universe.has(sym)) return sym;
    if (looksIntentional && TICKER_SHAPE.test(sym) && isValidSymbol(sym)) return sym;
    return null;
  };
  const syms = rawTokens.map(tickerLike);
  if (syms.some((s) => s === null)) return null; // every token must resolve to a ticker
  const known = syms as string[];
  if (known.length === 1) return { kind: "analyze", ticker: known[0], tickers: [], filters: null, reply: null };
  return { kind: "compare", ticker: null, tickers: known, filters: null, reply: null };
}

const SYSTEM = `You translate a user's natural-language request in a stock-research app into ONE structured command. Kinds:
- "analyze": they want one company's page. Set ticker to its symbol (resolve names, e.g. Apple -> AAPL, Nvidia -> NVDA).
- "compare": they name 2-5 companies to compare. Fill tickers with symbols.
- "screen": they describe filters ("cash machines", "cheap growth", "rated 8+", "software under 25x forward P/E", "profitable, FCF margin over 20%"). Fill filters; leave unmentioned fields null/empty. minMarketCapB is in billions. Sector must be one of the provided SECTORS or null.
- "answer": it's a general question or not a search. Put a concise, helpful 1-2 sentence reply and remind that this is research, not advice, if they ask what to buy.
Only set fields you're confident about. Prefer "screen" for descriptive/thematic requests, "analyze" for a single named company.`;

/** Model-parses a request into an Intent. Cheap (Haiku, structured). */
export async function llmIntent(input: string, sectors: string[]) {
  return runAssistantJson({
    system: `${SYSTEM}\n\nSECTORS: ${sectors.join(", ")}`,
    user: input.slice(0, 400),
    schema: Intent,
    maxTokens: 500,
  });
}
