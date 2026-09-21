import { env } from "@/lib/env";

export type SendMailResult = { delivered: boolean; dev: boolean };

/**
 * Send a transactional email. Uses Resend (https://resend.com) when RESEND_API_KEY is set —
 * a plain HTTPS call, no SDK dependency. Without a key (local dev), it logs to the server
 * console and returns { dev: true } so the flow is testable without an email provider.
 */
export async function sendMail(opts: { to: string; subject: string; html: string; text: string }): Promise<SendMailResult> {
  const e = env();
  if (!e.RESEND_API_KEY) {
    // Dev fallback — no provider configured.
    console.info(`\n[email:dev] To: ${opts.to}\n[email:dev] Subject: ${opts.subject}\n[email:dev] ${opts.text}\n`);
    return { delivered: false, dev: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: e.EMAIL_FROM, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return { delivered: true, dev: false };
}
