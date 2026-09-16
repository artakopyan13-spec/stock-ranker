import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Admin-editable runtime settings, stored in the Setting table so the admin can pause fresh
 * analyses or change quotas without a redeploy. Env values are the defaults / fallbacks.
 */
export type SettingKey = "kill_switch_manual" | "daily_spend_ceiling_usd" | "free_daily_fresh_analyses" | "max_analyses_per_day";

export async function getSetting(key: SettingKey): Promise<string | null> {
  const row = await db().setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await db().setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

async function numSetting(key: SettingKey, fallback: number): Promise<number> {
  const v = await getSetting(key);
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export interface EffectiveLimits {
  spendCeilingUsd: number;
  maxAnalysesPerDay: number;
  freeDailyFresh: number;
  killSwitchManual: boolean;
}

/** The limits actually in force right now (DB override, else env default). */
export async function effectiveLimits(): Promise<EffectiveLimits> {
  const e = env();
  const [ceiling, cap, free, manual] = await Promise.all([
    numSetting("daily_spend_ceiling_usd", e.DAILY_SPEND_CEILING_USD),
    numSetting("max_analyses_per_day", e.MAX_ANALYSES_PER_DAY),
    numSetting("free_daily_fresh_analyses", e.FREE_DAILY_FRESH_ANALYSES),
    getSetting("kill_switch_manual").then((v) => v === "true"),
  ]);
  return { spendCeilingUsd: ceiling, maxAnalysesPerDay: cap, freeDailyFresh: free, killSwitchManual: manual };
}
