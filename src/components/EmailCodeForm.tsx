"use client";

import { useActionState } from "react";
import { sendEmailCode, emailCodeSignIn, type EmailCodeState } from "@/lib/auth-actions";

const INIT: EmailCodeState = { step: "email", email: "" };

/** Two-step passwordless sign-in: request a 6-digit code, then verify it. */
export function EmailCodeForm() {
  const [sent, sendAction, sending] = useActionState(sendEmailCode, INIT);
  const [verified, verifyAction, verifying] = useActionState(emailCodeSignIn, INIT);

  if (sent.step !== "code") {
    return (
      <form key="email-step" action={sendAction} className="space-y-2">
        <input name="email" type="email" required placeholder="you@example.com" className="w-full" autoComplete="email" />
        <button type="submit" className="btn btn-primary w-full justify-center" disabled={sending}>
          {sending ? "Sending…" : "Email me a sign-in code"}
        </button>
        {sent.error && <p className="text-xs text-red">{sent.error}</p>}
      </form>
    );
  }

  return (
    <form key="code-step" action={verifyAction} className="space-y-2">
      <input type="hidden" name="email" value={sent.email} />
      {sent.notice && <p className="text-xs text-muted">{sent.notice}</p>}
      {sent.devCode && (
        <p className="text-xs">Dev code: <b className="tracking-widest">{sent.devCode}</b></p>
      )}
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        placeholder="6-digit code"
        className="w-full text-center tracking-[0.5em] text-lg"
        autoFocus
      />
      <button type="submit" className="btn btn-primary w-full justify-center" disabled={verifying}>
        {verifying ? "Verifying…" : "Verify & sign in"}
      </button>
      {verified.error && <p className="text-xs text-red">{verified.error}</p>}
      <div className="flex items-center justify-between text-xs pt-1">
        <button type="submit" formAction={sendAction} className="text-purple hover:underline">Resend code</button>
        <a href="/signin" className="text-muted hover:text-text no-underline">Use a different email</a>
      </div>
    </form>
  );
}
