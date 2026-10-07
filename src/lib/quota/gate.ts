import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { capsFor } from "@/lib/plans";
import { effectiveLimits } from "@/lib/quota/settings";
import { analysesToday, spendToday, userActionsToday, userAnalysesToday } from "@/lib/quota/spend";
import { rateLimit } from "@/lib/quota/ratelimit";

export type DenyReason = "login_required" | "banned" | "rate_limit" | "kill_switch" | "global_cap" | "user_quota" | "no_key";

/** Lightweight AI actions that draw from one shared per-user daily allowance (copilot, portfolio, command bar). */
export const AI_ACTION_KINDS = ["chat", "portfolio", "command"];

export type GateResult =
  | { allow: true; userId: string; remainingToday: number }
  | { allow: false; reason: DenyReason; message: string; retryAfterSec?: number };

export interface GateInput {
  userId: string | null;
  ip: string;
  now?: Date;
  /** Allow a single anonymous "try it once" analysis (landing demo). Still bounded by IP rate
   *  limit, the global kill switch, spend ceiling and daily cap — just not by login/user quota. */
  allowAnon?: boolean;
  /** The visitor already used their free anonymous attempt (drives a tailored message). */
  anonUsed?: boolean;
}

/**
 * The single chokepoint before any fresh (paid) analysis. Everything about protecting the bill
 * lives here: login requirement, ban, rate limit, global spend kill switch, global daily cap,
 * and per-user daily quota. Cached views never pass through this — they are always free.
 * Never throws; the caller degrades to cached results on a deny.
 */
export async function gateFreshAnalysis(input: GateInput): Promise<GateResult> {
  const now = input.now ?? new Date();
  const e = env();

  if (!e.ANTHROPIC_API_KEY && !e.DEMO_MODE) {
    return { allow: false, reason: "no_key", message: "Fresh analyses are temporarily unavailable." };
  }
  if (!input.userId) {
    if (!input.allowAnon) {
      return {
        allow: false,
        reason: "login_required",
        message: input.anonUsed
          ? "You've used your free analysis. Sign in — it's free — to run more. Cached analyses stay free to view."
          : "Sign in to run a fresh analysis. Cached analyses are free to view.",
      };
    }
    // One anonymous "try it once" analysis: skip login + per-user quota, keep the bill guards.
    const rl = await rateLimit(`ip:${input.ip}`, now);
    if (!rl.ok) return { allow: false, reason: "rate_limit", message: "You're going a bit fast. Try again in a moment.", retryAfterSec: rl.retryAfterSec };
    const limits = await effectiveLimits();
    if (limits.killSwitchManual) return { allow: false, reason: "kill_switch", message: "Fresh analyses are paused right now due to high demand. Cached results are still available." };
    const [spend, count] = await Promise.all([spendToday(now), analysesToday(now)]);
    if (spend >= limits.spendCeilingUsd) return { allow: false, reason: "kill_switch", message: "We've hit today's analysis budget. Showing the latest cached analysis; fresh runs resume tomorrow." };
    if (count >= limits.maxAnalysesPerDay) return { allow: false, reason: "global_cap", message: "Today's global analysis limit is reached. Showing cached results; fresh runs resume tomorrow." };
    return { allow: true, userId: "anon", remainingToday: 0 };
  }

  const user = await db().user.findUnique({ where: { id: input.userId }, select: { banned: true, dailyQuota: true, role: true, plan: true } });
  if (!user) return { allow: false, reason: "login_required", message: "Please sign in again." };
  if (user.banned) return { allow: false, reason: "banned", message: "Your account is suspended." };

  const rl = await rateLimit(`user:${input.userId}`, now);
  if (!rl.ok) return { allow: false, reason: "rate_limit", message: "You're going a bit fast. Try again in a moment.", retryAfterSec: rl.retryAfterSec };

  const limits = await effectiveLimits();

  // Global spend kill switch — degrade everyone to cached, never error.
  if (limits.killSwitchManual) {
    return { allow: false, reason: "kill_switch", message: "Fresh analyses are paused right now due to high demand. Cached results are still available." };
  }
  const [spend, count] = await Promise.all([spendToday(now), analysesToday(now)]);
  if (spend >= limits.spendCeilingUsd) {
    return { allow: false, reason: "kill_switch", message: "We've hit today's analysis budget. Showing the latest cached analysis; fresh runs resume tomorrow." };
  }
  if (count >= limits.maxAnalysesPerDay) {
    return { allow: false, reason: "global_cap", message: "Today's global analysis limit is reached. Showing cached results; fresh runs resume tomorrow." };
  }

  // Per-user daily quota by plan. Admins and unlimited (Elite) plans are exempt — still bounded by
  // the global spend ceiling above. A per-user dailyQuota override, when set, wins over the plan.
  const caps = capsFor(user);
  if (caps.unlimited) {
    return { allow: true, userId: input.userId, remainingToday: 999999 };
  }
  const quota = user.dailyQuota ?? caps.freshPerDay;
  const used = await userAnalysesToday(input.userId, now);
  if (used >= quota) {
    return { allow: false, reason: "user_quota", message: `You've used today's ${quota} fresh AI reports (analyses, deep dives, earnings, research, committees and reviews share this). Upgrade for more — or they reset at midnight UTC.` };
  }

  return { allow: true, userId: input.userId, remainingToday: quota - used };
}

/**
 * Chokepoint for the lighter, cheaper AI actions (copilot chat, portfolio chat, command bar).
 * Same bill protection as a fresh analysis — login, ban, rate limit, kill switch, spend ceiling —
 * but metered by its own per-user daily message cap instead of the analysis quota, and it never
 * counts toward the global analysis cap. Never throws.
 */
export async function gateAiAction(
  input: GateInput & { kinds: string[]; dailyCap: number },
): Promise<GateResult> {
  const now = input.now ?? new Date();
  const e = env();

  if (!e.ANTHROPIC_API_KEY) {
    return { allow: false, reason: "no_key", message: "The assistant is temporarily unavailable." };
  }
  if (!input.userId) {
    return { allow: false, reason: "login_required", message: "Sign in to chat with the assistant." };
  }

  const user = await db().user.findUnique({ where: { id: input.userId }, select: { banned: true, role: true, plan: true } });
  if (!user) return { allow: false, reason: "login_required", message: "Please sign in again." };
  if (user.banned) return { allow: false, reason: "banned", message: "Your account is suspended." };

  const rl = await rateLimit(`user:${input.userId}`, now);
  if (!rl.ok) return { allow: false, reason: "rate_limit", message: "You're going a bit fast. Try again in a moment.", retryAfterSec: rl.retryAfterSec };

  const limits = await effectiveLimits();
  if (limits.killSwitchManual) {
    return { allow: false, reason: "kill_switch", message: "The assistant is paused right now due to high demand. Cached analyses are still available." };
  }
  const spend = await spendToday(now);
  if (spend >= limits.spendCeilingUsd) {
    return { allow: false, reason: "kill_switch", message: "We've hit today's AI budget. The assistant resumes tomorrow; cached analyses stay free." };
  }

  // Admins and unlimited (Elite) plans never hit a per-user message cap; other plans use their
  // own daily message allowance (falling back to the free default when a plan cap isn't finite).
  const caps = capsFor(user);
  if (caps.unlimited) {
    return { allow: true, userId: input.userId, remainingToday: 999999 };
  }
  const cap = Number.isFinite(caps.chatPerDay) ? caps.chatPerDay : input.dailyCap;
  const used = await userActionsToday(input.userId, input.kinds, now);
  if (used >= cap) {
    return { allow: false, reason: "user_quota", message: "You've hit today's message limit. Upgrade for unlimited Wall Street Einstein and the Investment Committee." };
  }

  return { allow: true, userId: input.userId, remainingToday: cap - used };
}
