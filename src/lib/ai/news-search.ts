import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "@/lib/env";
import { anthropic, logUsage, usageFromMessage } from "@/lib/ai/client";
import { NEWS_SEARCH_TEMPLATE } from "@/lib/ai/prompts.generated";
import { recentNews, type NewsItem } from "@/lib/data/types";

const Found = z.object({
  items: z.array(
    z.object({
      headline: z.string(),
      publisher: z.string(),
      date: z.string(),
      url: z.string(),
    }),
  ),
});

/**
 * Web-search fallback for the 7-day news scan (skill step 2) when the provider has nothing.
 * Separate, cheaper call so the main analysis stays a single structured request.
 * Every item is tagged source = publisher + "via web search", with the model-reported date.
 */
export async function searchNewsViaWeb(symbol: string, company: string, now: Date = new Date()): Promise<NewsItem[]> {
  const e = env();
  const from = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const prompt = NEWS_SEARCH_TEMPLATE.replace("{{COMPANY}}", company)
    .replace("{{SYMBOL}}", symbol)
    .replace("{{FROM}}", from)
    .replace("{{TODAY}}", today);

  const response = await anthropic().messages.parse({
    model: e.NEWS_SEARCH_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Found) },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages: [{ role: "user", content: prompt }],
  });

  const searches = response.content.filter((b): b is Anthropic.ServerToolUseBlock => b.type === "server_tool_use").length;
  await logUsage("news_search", e.NEWS_SEARCH_MODEL, usageFromMessage(response.usage), { symbol, webSearches: searches });

  if (response.stop_reason === "refusal" || !response.parsed_output) return [];
  const items: NewsItem[] = response.parsed_output.items
    .filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date))
    .map((i, idx) => ({
      id: `web-${idx}-${i.date}`,
      date: i.date,
      headline: i.headline,
      source: `${i.publisher} (via web search)`,
      url: i.url,
      summary: null,
    }));
  return recentNews(items, now);
}
