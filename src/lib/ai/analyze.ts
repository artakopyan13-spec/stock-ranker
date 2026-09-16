import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { parse as parsePartial, ALL } from "partial-json";
import { env } from "@/lib/env";
import type { StockData } from "@/lib/data/types";
import { ModelOutput, MODEL_OUTPUT_KEYS } from "@/lib/analysis/schema";
import { ANALYSIS_USER_TEMPLATE, PROMPT_VERSION, SYSTEM_PROMPT } from "@/lib/ai/prompts.generated";
import { anthropic, usageFromMessage } from "@/lib/ai/client";
import type { TokenUsage } from "@/lib/ai/pricing";

export { PROMPT_VERSION };

export interface AnalyzeOptions {
  previousTripwire?: string | null;
  /** Verification failures from a previous attempt, fed back for one retry. */
  retryFeedback?: string | null;
  /** Called as each top-level key of the model output completes (streaming only). */
  onSection?: (key: keyof ModelOutput, value: unknown) => void;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export interface AnalyzeResult {
  output: ModelOutput;
  usage: TokenUsage;
  model: string;
  stopReason: string | null;
}

export class ModelRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super(`The model declined this request${category ? ` (${category})` : ""}.`);
    this.name = "ModelRefusalError";
  }
}

export function buildUserMessage(data: StockData, opts: Pick<AnalyzeOptions, "previousTripwire" | "retryFeedback"> = {}): string {
  const today = new Date().toISOString().slice(0, 10);
  const prev = opts.previousTripwire
    ? `Previous tripwire (from the last analysis): "${opts.previousTripwire}". Judge from the data whether it has triggered.`
    : "No previous tripwire was recorded.";
  let msg = ANALYSIS_USER_TEMPLATE.replace("{{SYMBOL}}", data.symbol)
    .replace("{{TODAY}}", today)
    .replace("{{STOCK_DATA_JSON}}", JSON.stringify(data, null, 1))
    .replace("{{PREVIOUS_TRIPWIRE}}", prev);
  if (opts.retryFeedback) {
    msg += `\n\nYour previous attempt failed verification. Fix these and return the full JSON again:\n${opts.retryFeedback}`;
  }
  return msg;
}

/** Shared request shape for single calls and batch entries. */
export function buildRequestParams(
  data: StockData,
  opts: Pick<AnalyzeOptions, "previousTripwire" | "retryFeedback" | "model" | "effort"> = {},
): Anthropic.MessageCreateParamsNonStreaming {
  const e = env();
  return {
    model: opts.model ?? e.ANALYSIS_MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserMessage(data, opts) }],
    output_config: {
      effort: opts.effort ?? e.ANALYSIS_EFFORT,
      format: zodOutputFormat(ModelOutput),
    },
  };
}

function parseOutputText(text: string): ModelOutput {
  return ModelOutput.parse(JSON.parse(text));
}

/**
 * Emits sections as the JSON stream completes each top-level key.
 * A key is considered complete once the following key's name has appeared in the buffer.
 */
export class SectionStreamer {
  private buffer = "";
  private emitted = new Set<string>();
  constructor(private readonly onSection: (key: keyof ModelOutput, value: unknown) => void) {}

  push(delta: string): void {
    this.buffer += delta;
    this.flush(false);
  }

  finish(): void {
    this.flush(true);
  }

  private flush(final: boolean): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = parsePartial(this.buffer, ALL) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof parsed !== "object" || parsed === null) return;
    MODEL_OUTPUT_KEYS.forEach((key, i) => {
      if (this.emitted.has(key)) return;
      const next = MODEL_OUTPUT_KEYS[i + 1];
      const complete = final || (next !== undefined && this.buffer.includes(`"${next}"`));
      if (complete && parsed[key] !== undefined) {
        this.emitted.add(key);
        this.onSection(key, parsed[key]);
      }
    });
  }
}

/** Streaming analysis call (on-demand path). */
export async function analyzeStreaming(data: StockData, opts: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const params = buildRequestParams(data, opts);
  const client = anthropic();
  const streamer = opts.onSection ? new SectionStreamer(opts.onSection) : null;

  const stream = client.messages.stream({ ...params, stream: true });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta" && streamer) {
      streamer.push(event.delta.text);
    }
  }
  const message = await stream.finalMessage();
  streamer?.finish();
  return finalize(message, params.model);
}

/** Non-streaming analysis call (used for seeding and sync cron). */
export async function analyzeOnce(data: StockData, opts: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const params = buildRequestParams(data, opts);
  const message = await anthropic().messages.create(params);
  return finalize(message, params.model);
}

export function finalize(message: Anthropic.Message, model: string): AnalyzeResult {
  if (message.stop_reason === "refusal") {
    const details = message.stop_details;
    throw new ModelRefusalError(details && details.type === "refusal" ? (details.category ?? null) : null);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Model output was cut off (max_tokens). Retry with a shorter data payload.");
  }
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    output: parseOutputText(text),
    usage: usageFromMessage(message.usage),
    model: message.model || model,
    stopReason: message.stop_reason,
  };
}
