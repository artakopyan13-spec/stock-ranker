import { DailyCapReachedError, MissingApiKeyError } from "@/lib/ai/client";
import { ModelRefusalError } from "@/lib/ai/analyze";
import { DemoModeError, FreshAnalysisDeniedError, VerificationFailedError } from "@/lib/analysis/service";
import { ProviderError, SymbolNotFoundError } from "@/lib/data/types";

export interface ApiErrorShape {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

/** Maps domain errors to HTTP without leaking internals. */
export function toApiError(err: unknown): ApiErrorShape {
  if (err instanceof SymbolNotFoundError) return { status: 404, code: "symbol_not_found", message: err.message };
  if (err instanceof DemoModeError) return { status: 403, code: "demo_mode", message: err.message };
  if (err instanceof FreshAnalysisDeniedError) return { status: 429, code: err.reason, message: err.message };
  if (err instanceof MissingApiKeyError) return { status: 503, code: "missing_anthropic_key", message: err.message };
  if (err instanceof DailyCapReachedError) return { status: 429, code: "daily_cap", message: err.message };
  if (err instanceof ModelRefusalError) return { status: 502, code: "model_refusal", message: err.message };
  if (err instanceof VerificationFailedError) return { status: 422, code: "verification_failed", message: "The analysis did not pass verification and was not published.", details: err.verification };
  if (err instanceof ProviderError) return { status: 502, code: "provider_error", message: err.message };
  const message = err instanceof Error ? err.message : "Unexpected error";
  return { status: 500, code: "internal", message };
}
