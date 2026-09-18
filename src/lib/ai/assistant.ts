import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { anthropic, usageFromMessage } from "@/lib/ai/client";
import { ModelRefusalError } from "@/lib/ai/analyze";
import { env } from "@/lib/env";
import type { TokenUsage } from "@/lib/ai/pricing";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantResult {
  text: string;
  usage: TokenUsage;
  model: string;
}

const SYSTEM_CACHE = { type: "ephemeral" as const };

/**
 * Streams a grounded, free-text assistant reply on the cheap model. The system prompt is
 * cached (it carries the ticker/portfolio grounding, which is reused across a conversation).
 * `onDelta` receives text as it arrives; the full text + token usage are returned for logging.
 */
export async function streamAssistant(args: {
  system: string;
  messages: ChatTurn[];
  onDelta?: (text: string) => void;
  model?: string;
  maxTokens?: number;
}): Promise<AssistantResult> {
  const model = args.model ?? env().ASSISTANT_MODEL;
  const stream = anthropic().messages.stream({
    model,
    max_tokens: args.maxTokens ?? 1024,
    system: [{ type: "text", text: args.system, cache_control: SYSTEM_CACHE }],
    messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      args.onDelta?.(event.delta.text);
    }
  }
  const message = await stream.finalMessage();
  return finalizeText(message, model);
}

export interface StructuredResult<T> {
  value: T;
  usage: TokenUsage;
  model: string;
}

/** One structured-output call returning a value validated against `schema`. Used for the committee, review, and command parser. */
export async function runAssistantJson<T>(args: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  model?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<StructuredResult<T>> {
  const model = args.model ?? env().ASSISTANT_MODEL;
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: args.maxTokens ?? 4096,
    system: [{ type: "text", text: args.system, cache_control: SYSTEM_CACHE }],
    messages: [{ role: "user", content: args.user }],
    output_config: {
      ...(args.effort ? { effort: args.effort } : {}),
      format: zodOutputFormat(args.schema as z.ZodType),
    },
  };
  const message = await anthropic().messages.create(params);
  const { text, usage, model: resolved } = finalizeText(message, model);
  return { value: args.schema.parse(JSON.parse(text)), usage, model: resolved };
}

function finalizeText(message: Anthropic.Message, model: string): AssistantResult {
  if (message.stop_reason === "refusal") {
    const details = message.stop_details;
    throw new ModelRefusalError(details && details.type === "refusal" ? (details.category ?? null) : null);
  }
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { text, usage: usageFromMessage(message.usage), model: message.model || model };
}
