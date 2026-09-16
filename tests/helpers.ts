import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { normalizeYahoo, type YahooRaw } from "@/lib/data/adapters/yahoo";
import type { StockData } from "@/lib/data/types";
import type { ModelOutput } from "@/lib/analysis/schema";

export function loadYahooFixture(symbol = "NVDA"): { raw: YahooRaw; data: StockData; capturedAt: Date } {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), `tests/fixtures/yahoo_${symbol}.json`), "utf8")) as YahooRaw;
  const capturedAt = new Date(raw.capturedAt);
  return { raw, data: normalizeYahoo(symbol, raw, capturedAt), capturedAt };
}

const fmtB = (v: number | null) => (v === null ? "unverified" : `$${(v / 1e9).toFixed(1)}B`);
const fmtPct = (v: number | null) => (v === null ? "unverified" : `${v.toFixed(1)}%`);

/** A model output whose cited figures come straight from `data`, so verification passes. */
export function sampleModelOutput(data: StockData, overrides: Partial<ModelOutput> = {}): ModelOutput {
  const f = data.fundamentals;
  const fcfMargin = f.fcfTTM.value !== null && f.revenueTTM.value ? (f.fcfTTM.value / f.revenueTTM.value) * 100 : null;
  const base: ModelOutput = {
    valuation: {
      primaryMultiple: "forwardPE",
      peakOnPeakCyclical: {
        flag: false,
        reasoning: `Revenue growth of ${fmtPct(f.revenueGrowthYoYPct.value)} with an operating margin of ${fmtPct(f.operatingMarginPct.value)} argues the multiple sits on expanding, not peak, earnings.`,
      },
    },
    fcfVerdictReason: `Trailing free cash flow of ${fmtB(f.fcfTTM.value)} is a ${fmtPct(fcfMargin)} margin on revenue, funding buybacks of ${fmtB(f.buybacksTTM.value)} without debt.`,
    capitalActions: `Repurchased ${fmtB(f.buybacksTTM.value)} of stock over the trailing twelve months.`,
    news: data.news.slice(0, 3).map((n) => ({ id: n.id, category: "other" as const, thesisImpact: "neutral" as const, summary: `Coverage item: ${n.headline.slice(0, 60)}` })),
    newsScanNote: data.news.length ? null : "No material company-specific news was found in the seven-day window.",
    business: {
      whatItDoes: "Designs the accelerated computing platforms that train and serve AI models in data centers worldwide.",
      bestAt: "Pairing leading GPU silicon with a software stack that keeps developers locked in.",
      worksWith: [
        { name: "Microsoft", relationship: "Largest hyperscale customer for data-center GPUs" },
        { name: "TSMC", relationship: "Sole foundry partner for leading-edge nodes" },
      ],
      moat: { description: "CUDA software ecosystem and a multi-year lead in interconnect and systems design.", durability: "high" },
    },
    thesis: {
      bull: `Data-center demand keeps revenue compounding at ${fmtPct(f.revenueGrowthYoYPct.value)} while margins stay above 70%, so free cash flow keeps outgrowing the share count.`,
      bear: `Customer capex is cyclical and concentrated in a handful of hyperscalers; a pause in AI infrastructure budgets would compress growth from ${fmtPct(f.revenueGrowthYoYPct.value)} toward zero while the multiple still assumes acceleration, and custom silicon from those same customers erodes pricing power.`,
      primaryFailureMode: "A hyperscaler capex digestion cycle that stalls orders for two or more quarters.",
    },
    catalysts: [
      { date: data.nextEarningsDate ?? "TBD", dateSource: data.nextEarningsDate ? null : "company investor relations calendar", event: "Next quarterly earnings report", type: "earnings", expectedDirection: "unclear" },
    ],
    rating: { score: 8, action: "BUY", justification: "Elite cash generation and a durable moat, capped by customer concentration and cyclicality.", confidence: "medium" },
    forecast12m: {
      bear: { returnPct: -35, reasoning: "Capex digestion cuts growth to low double digits and the multiple compresses." },
      base: { returnPct: 15, reasoning: "Growth decelerates but stays strong; multiple holds." },
      bull: { returnPct: 45, reasoning: "Next-generation platform ramps ahead of plan and sovereign demand broadens the customer base." },
    },
    tripwire: { description: "Two consecutive quarters of sequential data-center revenue decline would cut the rating to 5.", direction: "down", metric: "sequential data-center revenue", threshold: "two consecutive declines" },
    dataConcerns: [],
    previousTripwire: null,
  };
  return { ...base, ...overrides };
}

interface FakeOptions {
  text?: string;
  chunkSize?: number;
  stopReason?: Anthropic.StopReason;
  model?: string;
}

/** Minimal stand-in for the Anthropic client covering `messages.stream` and `messages.create`. */
export function fakeAnthropic(output: ModelOutput | string, opts: FakeOptions = {}): { client: Anthropic; calls: Anthropic.MessageCreateParams[] } {
  const text = typeof output === "string" ? output : JSON.stringify(output);
  const calls: Anthropic.MessageCreateParams[] = [];
  const message = (): Anthropic.Message =>
    ({
      id: "msg_fake",
      type: "message",
      role: "assistant",
      model: opts.model ?? "claude-opus-5",
      content: [{ type: "text", text, citations: null }],
      stop_reason: opts.stopReason ?? "end_turn",
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 5000, output_tokens: 2000, cache_creation_input_tokens: 0, cache_read_input_tokens: 3500, cache_creation: null, server_tool_use: null, service_tier: null, inference_geo: null, iterations: null, output_tokens_details: null },
    }) as unknown as Anthropic.Message;
  const size = opts.chunkSize ?? 40;
  const client = {
    messages: {
      stream: (params: Anthropic.MessageCreateParams) => {
        calls.push(params);
        const iterable = {
          async *[Symbol.asyncIterator]() {
            for (let i = 0; i < text.length; i += size) {
              yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(i, i + size) } };
            }
          },
          finalMessage: async () => message(),
        };
        return iterable;
      },
      create: async (params: Anthropic.MessageCreateParams) => {
        calls.push(params);
        return message();
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}
