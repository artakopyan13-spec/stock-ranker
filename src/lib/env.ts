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

  API_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  ALERT_CHANNEL: z.enum(["telegram", "email", "console"]).default("console"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ALERT_EMAIL_FROM: z.string().default("Stock Ranker <onboarding@resend.dev>"),
  ALERT_EMAIL_TO: z.string().optional(),
  DIGEST_WATCHLIST: z.string().default("main"),

  APP_URL: z.string().default("http://localhost:3000"),
  DEMO_MODE: boolFromString,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parsed, typed environment. Never throws on missing optional secrets; callers check presence. */
export function env(): Env {
  if (cached) return cached;
  cached = EnvSchema.parse(process.env);
  return cached;
}

/** Test helper: force re-parse after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export function hasAnthropicKey(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}
