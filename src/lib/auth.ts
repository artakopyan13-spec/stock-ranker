import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** External JSON API: `x-api-key` header or `?api_key=`. Demo mode opens read endpoints. */
export function checkApiKey(req: Request): { ok: true } | { ok: false; status: number; message: string } {
  const e = env();
  if (!e.API_KEY) return { ok: false, status: 503, message: "API_KEY is not configured on the server" };
  const url = new URL(req.url);
  const provided = req.headers.get("x-api-key") ?? url.searchParams.get("api_key") ?? "";
  if (!provided || !safeEqual(provided, e.API_KEY)) return { ok: false, status: 401, message: "Invalid or missing API key" };
  return { ok: true };
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Also accepts x-api-key for manual runs. */
export function checkCronAuth(req: Request): { ok: true } | { ok: false; status: number; message: string } {
  const e = env();
  const auth = req.headers.get("authorization") ?? "";
  if (e.CRON_SECRET && auth === `Bearer ${e.CRON_SECRET}`) return { ok: true };
  const api = checkApiKey(req);
  if (api.ok) return api;
  return { ok: false, status: 401, message: "Cron secret or API key required" };
}

export function unauthorized(r: { status: number; message: string }): Response {
  return Response.json({ error: r.message }, { status: r.status });
}
