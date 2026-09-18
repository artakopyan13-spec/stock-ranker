import { z } from "zod";

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const intFromString = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v === undefined || v === "" ? def : Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : def;
    });

const numFromString = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v === undefined || v === "" ? def : Number.parseFloat(v);
      return Number.isFinite(n) ? n : def;
    });

const EnvSchema = z.object({
  DATABASE_PROVIDER: z.enum(["sqlite", "postgresql"]).default("sqlite"),
  DATABASE_URL: z.string().default("file:./dev.db"),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANALYSIS_MODEL: z.string().default("claude-opus-5"),
  ANALYSIS_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  NEWS_SEARCH_MODEL: z.string().default("claude-sonnet-5"),
  NEWS_WEB_SEARCH_FALLBACK: boolFromString,
  /** Cheap model for chat/copilot/portfolio/command-bar (grounded, short answers). */
  ASSISTANT_MODEL: z.string().default("claude-haiku-4-5"),

  DATA_PROVIDER: z.enum(["yahoo", "fmp", "finnhub", "fixture"]).default("yahoo"),
  FMP_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(),

  MAX_ANALYSES_PER_DAY: intFromString(40),
  MAX_CRON_TICKERS: intFromString(20),
  RAW_CACHE_MINUTES: intFromString(15),
  ANALYSIS_TTL_HOURS: intFromString(24),
  SMART_REFRESH: z
    .string()
    .optional()
    .transform((v) => v === undefined || v === "" || v === "true" || v === "1"),
  SMART_REFRESH_PRICE_MOVE_PCT: numFromString(3),

  CRON_SECRET: z.string().optional(),

  // Auth (Auth.js v5)
  AUTH_SECRET: z.string().optional(),
  AUTH_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  AUTH_DEV_LOGIN: boolFromString, // local only: password-less email sign-in for testing
  ADMIN_EMAILS: z.string().default(""), // comma-separated admin emails

  // Abuse protection
  TURNSTILE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  RATE_LIMIT_PER_MIN: intFromString(20), // per user or IP, per minute

  // Public-app spend guardrails
  FREE_DAILY_FRESH_ANALYSES: intFromString(3), // per user per day; cached views unlimited
  FREE_DAILY_CHAT_MESSAGES: intFromString(25), // per user per day: copilot + portfolio chat + command bar
  DAILY_SPEND_CEILING_USD: numFromString(15), // kill switch pauses ALL paid AI calls past this

  APP_URL: z.string().default("http://localhost:3000"),
  DEMO_MODE: boolFromString,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parsed, typed environment. Never throws on missing optional secrets; callers check presence. */
export function env(): Env {
  if (cached) return cached;
  // Treat empty-string env vars as unset so schema defaults apply. Hosting UIs (e.g. Vercel)
  // often add every known key with a blank value; z.enum().default() must not choke on "".
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string" && v !== "") raw[k] = v;
  }
  cached = EnvSchema.parse(raw);
  return cached;
}

/** Test helper: force re-parse after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export function hasAnthropicKey(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}
