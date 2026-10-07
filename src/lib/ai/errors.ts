import Anthropic from "@anthropic-ai/sdk";

/** A model-provider failure translated into something safe and useful to show a user. */
export interface AiFailure {
  status: number;
  code: "ai_credits" | "ai_auth" | "ai_rate_limited" | "ai_overloaded" | "ai_timeout" | "ai_error";
  message: string;
}

/**
 * Classifies an Anthropic SDK error. Returns null for anything that isn't a provider error, so
 * our own (already user-facing) error messages pass through untouched.
 *
 * Why this exists: the raw SDK message is the provider's JSON body — request IDs and billing
 * text — and it was being streamed verbatim to anonymous visitors. It also made an empty credit
 * balance look like a generic "busy" failure, hiding the one cause that takes down every feature.
 */
export function classifyAiError(err: unknown): AiFailure | null {
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return { status: 504, code: "ai_timeout", message: "The AI took too long to respond. Try again in a moment." };
  }
  if (!(err instanceof Anthropic.APIError)) return null;

  const raw = `${err.message ?? ""}`.toLowerCase();
  if (raw.includes("credit balance")) {
    console.error("[ai] ANTHROPIC CREDIT BALANCE EXHAUSTED — every AI feature is down. Top up at console.anthropic.com → Plans & Billing.");
    return { status: 503, code: "ai_credits", message: "AI analysis is temporarily unavailable. Saved reports still work — please try again later." };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    console.error("[ai] Anthropic rejected the API key (auth/permission). Check ANTHROPIC_API_KEY.");
    return { status: 503, code: "ai_auth", message: "AI analysis is temporarily unavailable. Saved reports still work — please try again later." };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, code: "ai_rate_limited", message: "The AI is handling a lot of requests. Try again in a minute." };
  }
  if (err.status === 529 || err instanceof Anthropic.InternalServerError) {
    return { status: 503, code: "ai_overloaded", message: "The AI provider is overloaded right now. Try again shortly." };
  }
  console.error("[ai] unclassified provider error:", err.status, err.message);
  return { status: 502, code: "ai_error", message: "The AI request failed. Try again in a moment." };
}
