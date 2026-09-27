import { z } from "zod";

/** One publicly-traded company surfaced for the user to research themselves (never a "buy" call). */
export const ResearchCompany = z.object({
  ticker: z.string(), // correct, currently-listed stock ticker (uppercase)
  name: z.string(),
  whatTheyDo: z.string(), // one plain sentence
  role: z.string(), // e.g. "Market leader", "Challenger", "Picks-and-shovels supplier", "Turnaround"
  bullCase: z.string(), // why it's worth a look (research angle, not a recommendation)
  keyRisk: z.string(), // the single biggest risk
});
export type ResearchCompany = z.infer<typeof ResearchCompany>;

export const ResearchOutput = z.object({
  industry: z.string(), // cleaned industry/theme label
  asOf: z.string(), // YYYY-MM-DD
  overview: z.string(), // 2-3 sentences: demand, tailwinds, headwinds
  themes: z.array(z.string()), // 3-5 structural drivers/themes
  companies: z.array(ResearchCompany), // ~6-10 across the value chain
});
export type ResearchOutput = z.infer<typeof ResearchOutput>;
