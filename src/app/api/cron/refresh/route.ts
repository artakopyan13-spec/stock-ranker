import type { NextRequest } from "next/server";
import { checkCronAuth, unauthorized } from "@/lib/auth";
import { runRefresh, type RefreshMode } from "@/lib/cron/refresh";
import { toApiError } from "@/lib/api-errors";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby plan hard cap

/**
 * Nightly: plan + submit the analysis batch. `?mode=sync` analyzes inline instead. Idempotent per day.
 *
 * The AI market tabs (macro briefing, industry research, deep analyses, earnings) are refreshed by
 * the off-Vercel GitHub Actions worker (scripts/worker-refresh.ts) instead — their web-search calls
 * run several minutes and can't survive the 60s Hobby function cap this route runs under, and a
 * knowledge-only refresh here would overwrite the worker's richer web-verified copies.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = checkCronAuth(req);
  if (!auth.ok) return unauthorized(auth);
  if (env().DEMO_MODE) return Response.json({ status: "skipped", reason: "DEMO_MODE" });
  const mode: RefreshMode = req.nextUrl.searchParams.get("mode") === "sync" ? "sync" : "batch";
  try {
    const refresh = await runRefresh({ mode });
    return Response.json(refresh);
  } catch (err) {
    const e = toApiError(err);
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  }
}
