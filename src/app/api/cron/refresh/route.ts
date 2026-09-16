import type { NextRequest } from "next/server";
import { checkCronAuth, unauthorized } from "@/lib/auth";
import { runRefresh, type RefreshMode } from "@/lib/cron/refresh";
import { toApiError } from "@/lib/api-errors";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Nightly: plan + submit the batch. `?mode=sync` analyzes inline instead. Idempotent per day. */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = checkCronAuth(req);
  if (!auth.ok) return unauthorized(auth);
  if (env().DEMO_MODE) return Response.json({ status: "skipped", reason: "DEMO_MODE" });
  const mode: RefreshMode = req.nextUrl.searchParams.get("mode") === "sync" ? "sync" : "batch";
  try {
    return Response.json(await runRefresh({ mode }));
  } catch (err) {
    const e = toApiError(err);
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  }
}
