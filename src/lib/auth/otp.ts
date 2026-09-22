import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/email";

const CODE_TTL_MS = 10 * 60 * 1000; // codes valid 10 minutes
const RESEND_COOLDOWN_MS = 45 * 1000; // min gap between code requests for one email
const MAX_ATTEMPTS = 5; // verify attempts before a code is burned

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

function hashCode(email: string, code: string): string {
  // Pepper with AUTH_SECRET so a DB leak alone doesn't reveal codes; email binds the hash.
  const pepper = env().AUTH_SECRET ?? "stock-ranker";
  return createHash("sha256").update(`${email}:${code}:${pepper}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export type RequestCodeResult = { ok: true; dev: boolean; devCode?: string } | { ok: false; error: string };

/** Create (or refresh) a one-time code for `email` and send it. Rate-limited per email. */
export async function requestEmailCode(email: string): Promise<RequestCodeResult> {
  if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };
  const prisma = db();

  const existing = await prisma.emailCode.findUnique({ where: { email } });
  if (existing && Date.now() - existing.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return { ok: false, error: "A code was just sent — check your inbox, or try again in a moment." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = hashCode(email, code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await prisma.emailCode.upsert({
    where: { email },
    create: { email, codeHash, expiresAt, attempts: 0 },
    update: { codeHash, expiresAt, attempts: 0, createdAt: new Date() },
  });

  // Capture the email for the admin (deduplicated — one row per email).
  await prisma.emailLead
    .upsert({ where: { email }, create: { email }, update: { requests: { increment: 1 } } })
    .catch(() => {});

  const subject = "Your Stock Ranker sign-in code";
  const text = `Your Stock Ranker sign-in code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  const html = codeEmailHtml(code);
  const sent = await sendMail({ to: email, subject, html, text });

  // In dev (no provider), surface the code so sign-in is testable without email.
  return { ok: true, dev: sent.dev, devCode: sent.dev ? code : undefined };
}

/** Verify a submitted code. Returns true and burns the code on success; false otherwise. */
export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) return false;
  const prisma = db();
  const row = await prisma.emailCode.findUnique({ where: { email } });
  if (!row) return false;

  if (row.expiresAt.getTime() < Date.now() || row.attempts >= MAX_ATTEMPTS) {
    await prisma.emailCode.delete({ where: { email } }).catch(() => {});
    return false;
  }

  if (!safeEqualHex(row.codeHash, hashCode(email, code))) {
    await prisma.emailCode.update({ where: { email }, data: { attempts: { increment: 1 } } }).catch(() => {});
    return false;
  }

  await prisma.emailCode.delete({ where: { email } }).catch(() => {});
  await prisma.emailLead.update({ where: { email }, data: { verifiedAt: new Date() } }).catch(() => {});
  return true;
}

function codeEmailHtml(code: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f6fc;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#14153b">
  <div style="max-width:440px;margin:0 auto;padding:32px 24px">
    <div style="font-size:18px;font-weight:600">▲ Stock Ranker</div>
    <p style="color:#585c7e;margin:20px 0 8px">Your sign-in code is:</p>
    <div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#fff;border:1px solid #e3e5f1;border-radius:12px;padding:16px;text-align:center">${code}</div>
    <p style="color:#585c7e;margin:16px 0 0;font-size:13px">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
    <p style="color:#9599b7;margin:24px 0 0;font-size:12px">Stock Ranker — research, not financial advice.</p>
  </div></body></html>`;
}
