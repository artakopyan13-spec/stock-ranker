import { z } from "zod";

/** A scheduled high-impact macro event (the "red-folder" calendar). */
export const MacroEvent = z.object({
  date: z.string(), // YYYY-MM-DD
  name: z.string(), // e.g. "FOMC rate decision", "CPI (June)"
  importance: z.enum(["high", "medium"]),
  note: z.string(), // one line: why it matters / what's expected
});

/** A market-moving statement or news item from a major figure or event. */
export const MacroHeadline = z.object({
  date: z.string(), // YYYY-MM-DD
  who: z.string(), // e.g. "Donald Trump", "Fed Chair", "Jensen Huang (NVDA CEO)"
  headline: z.string(), // short, factual
  impact: z.string(), // one line: likely market effect
  tickers: z.array(z.string()), // affected tickers, if specific
  source: z.string(), // publication / URL
});

export const MacroBriefOutput = z.object({
  asOf: z.string(), // YYYY-MM-DD
  summary: z.string(), // 2-3 sentence read on the current macro backdrop
  calendar: z.array(MacroEvent), // upcoming ~2 weeks
  headlines: z.array(MacroHeadline), // last ~3 days of market-movers
});
export type MacroBriefOutput = z.infer<typeof MacroBriefOutput>;
