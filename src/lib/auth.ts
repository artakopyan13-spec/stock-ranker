import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The same header works for manual runs. */
export function checkCronAuth(req: Request): { ok: true } | { ok: false; status: number; message: string } {
  const secret = env().CRON_SECRET;
  if (!secret) return { ok: false, status: 503, message: "CRON_SECRET is not configured on the server" };
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!safeEqual(auth, expected)) return { ok: false, status: 401, message: "Cron secret required" };
  return { ok: true };
}

export function unauthorized(r: { status: number; message: string }): Response {
  return Response.json({ error: r.message }, { status: r.status });
}
