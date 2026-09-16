import type { NextRequest } from "next/server";
import { checkCronAuth, unauthorized } from "@/lib/auth";
import { runCollect } from "@/lib/cron/collect";
import { toApiError } from "@/lib/api-errors";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Morning: collect the batch, verify + store, send alerts, send the digest. Idempotent. */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = checkCronAuth(req);
  if (!auth.ok) return unauthorized(auth);
  if (env().DEMO_MODE) return Response.json({ status: "skipped", reason: "DEMO_MODE" });
  try {
    return Response.json(await runCollect());
  } catch (err) {
    const e = toApiError(err);
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  }
}
