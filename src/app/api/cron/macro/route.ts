import type { NextRequest } from "next/server";
import { checkCronAuth, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * DEPRECATED. The live macro briefing + industry research refresh moved off Vercel to the GitHub
 * Actions worker (scripts/worker-refresh.ts), because their web-search calls run several minutes
 * and can't survive the 60s Hobby function cap, and a knowledge-only refresh here would overwrite
 * the worker's richer web-verified copies. Kept as an authenticated no-op so any old scheduled
 * ping doesn't 404 or clobber data.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = checkCronAuth(req);
  if (!auth.ok) return unauthorized(auth);
  return Response.json({ status: "deprecated", handledBy: "github-actions-worker" });
}
