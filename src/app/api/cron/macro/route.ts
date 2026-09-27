import type { NextRequest } from "next/server";
import { checkCronAuth, unauthorized } from "@/lib/auth";
import { env } from "@/lib/env";
import { refreshMacroBriefSystem } from "@/lib/macro/brief";
import { refreshResearchSystem, POPULAR_INDUSTRIES } from "@/lib/research/run";
import { toApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Frequent tick (schedule every few hours): refresh the macro briefing (calendar + market-movers)
 * and keep ONE popular research industry warm per run, rotating by hour so the whole set stays
 * fresh across a day. System refresh — no per-user quota, but still bounded by the kill switch and
 * daily spend ceiling. Cron-authenticated.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = checkCronAuth(req);
  if (!auth.ok) return unauthorized(auth);
  if (env().DEMO_MODE) return Response.json({ status: "skipped", reason: "DEMO_MODE" });
  try {
    const industry = POPULAR_INDUSTRIES[new Date().getHours() % POPULAR_INDUSTRIES.length];
    const [macro, research] = await Promise.all([refreshMacroBriefSystem(), refreshResearchSystem(industry)]);
    return Response.json({ status: "ok", macro, research: { industry, ...research } });
  } catch (err) {
    const e = toApiError(err);
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  }
}
