import type { NextRequest } from "next/server";
import { checkCronAuth, unauthorized } from "@/lib/auth";
import { runRefresh, type RefreshMode } from "@/lib/cron/refresh";
import { refreshMacroBriefSystem } from "@/lib/macro/brief";
import { refreshResearchSystem, POPULAR_INDUSTRIES } from "@/lib/research/run";
import { toApiError } from "@/lib/api-errors";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Nightly: plan + submit the analysis batch, then refresh the macro briefing and rotate a couple
 * of popular research industries so those tabs are current daily even without a sub-daily cron.
 * `?mode=sync` analyzes inline instead. Idempotent per day.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = checkCronAuth(req);
  if (!auth.ok) return unauthorized(auth);
  if (env().DEMO_MODE) return Response.json({ status: "skipped", reason: "DEMO_MODE" });
  const mode: RefreshMode = req.nextUrl.searchParams.get("mode") === "sync" ? "sync" : "batch";
  try {
    const refresh = await runRefresh({ mode });
    // Keep the market tabs current daily (best-effort; never fail the analysis refresh over these).
    const day = Math.floor(Date.now() / 86_400_000);
    const industries = [POPULAR_INDUSTRIES[day % POPULAR_INDUSTRIES.length], POPULAR_INDUSTRIES[(day + 4) % POPULAR_INDUSTRIES.length]];
    const [macro, ...research] = await Promise.all([
      refreshMacroBriefSystem().catch((e) => ({ refreshed: false, reason: String(e) })),
      ...industries.map((ind) => refreshResearchSystem(ind).catch((e) => ({ refreshed: false, reason: String(e) }))),
    ]);
    return Response.json({ ...refresh, macro, research: industries.map((industry, i) => ({ industry, ...research[i] })) });
  } catch (err) {
    const e = toApiError(err);
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  }
}
