import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "@/lib/env";
import { anthropic, logUsage, usageFromMessage } from "@/lib/ai/client";

const Result = z.object({
  hasData: z.boolean(),
  latestQuarterLabel: z.string(), // e.g. "Q2 FY2026"
  reportDate: z.string(), // YYYY-MM-DD, or "unknown"
  summary: z.string(), // dated, figures with periods; guidance + recent developments
});

/**
 * Web-searches the MOST RECENT reported quarter and material developments for a ticker,
 * returning a short dated summary the analysis can reason from. This is how the app stays
 * current on earnings published after the model's training cutoff. Cheap model, low effort,
 * ≤3 searches. Returns null when nothing recent can be confirmed. Never throws to callers
 * that wrap it, but callers should still try/catch.
 */
export async function searchLatestEarnings(symbol: string, company: string, now: Date = new Date()): Promise<{ summary: string; asOf: string } | null> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY) return null;
  const today = now.toISOString().slice(0, 10);
  const prompt = `Today is ${today}. Search the web for the MOST RECENT reported quarterly earnings and material developments for ${company} (${symbol}).

Report, as of the latest confirmable data:
- the latest reported fiscal quarter and its report date
- revenue and EPS for that quarter, each with its year-over-year change and whether it beat or missed expectations
- any forward guidance management gave
- 1-2 notable developments in the last ~90 days (a major product, deal, or regulatory event)

Prefer the company's official results and reputable financial press. If you cannot confirm a recent quarter, set hasData=false. Keep the summary under 120 words. Attach the period to every figure. No speculation, no price targets.`;

  const response = await anthropic().messages.parse({
    model: e.NEWS_SEARCH_MODEL,
    max_tokens: 3000,
    output_config: { effort: "low", format: zodOutputFormat(Result) },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages: [{ role: "user", content: prompt }],
  });

  const searches = response.content.filter((b): b is Anthropic.ServerToolUseBlock => b.type === "server_tool_use").length;
  await logUsage("earnings_search", e.NEWS_SEARCH_MODEL, usageFromMessage(response.usage), { symbol, webSearches: searches });

  if (response.stop_reason === "refusal" || !response.parsed_output || !response.parsed_output.hasData) return null;
  const r = response.parsed_output;
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(r.reportDate) ? r.reportDate : today;
  return { summary: `Latest reported quarter: ${r.latestQuarterLabel} (reported ${r.reportDate}). ${r.summary}`, asOf };
}
