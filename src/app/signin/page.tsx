import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { currentUser } from "@/auth";
import { profileSignIn, codeSignIn } from "@/lib/auth-actions";
import { emailCodeLoginEnabled } from "@/lib/auth/otp";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { DISCLAIMER } from "@/lib/analysis/schema";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  admin: "That email and access code didn't match.",
  profile: "Couldn't sign you in with that email. If this is an admin account, use the admin sign-in below.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  if (user) redirect("/");
  const { error } = await searchParams;
  const e = env();
  const verified = emailCodeLoginEnabled();
  return (
    <div className="max-w-md mx-auto mt-10 space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Sign in to Stock Ranker</h1>
        <p className="text-muted text-sm mt-1">
          {verified ? "We'll email you a 6-digit code — no password." : "Just your email and a nickname — no password."} Free: {e.FREE_DAILY_FRESH_ANALYSES} fresh AI analyses a day, unlimited cached views.
        </p>
      </div>

      {error && ERRORS[error] && <div role="alert" className="card p-3 text-sm border-l-2 border-l-red">{ERRORS[error]}</div>}

      {verified ? (
        <div className="card p-6">
          <EmailCodeForm />
        </div>
      ) : (
        <form action={profileSignIn} className="card p-6 space-y-3">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input id="email" name="email" type="email" required placeholder="you@example.com" autoComplete="email" className="w-full" />
          </div>
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium">Nickname</label>
            <input id="name" name="name" required maxLength={40} placeholder="What should we call you?" autoComplete="nickname" className="w-full" />
          </div>
          <button type="submit" className="btn btn-primary w-full justify-center">Continue →</button>
        </form>
      )}

      {e.ACCESS_CODE && (
        <details className="card p-4 text-sm" open={error === "admin"}>
          <summary className="cursor-pointer text-muted">Admin sign-in</summary>
          <form action={codeSignIn} className="space-y-2 mt-3">
            <label htmlFor="admin-email" className="sr-only">Admin email</label>
            <input id="admin-email" name="email" type="email" required placeholder="Admin email" autoComplete="email" className="w-full" />
            <label htmlFor="admin-code" className="sr-only">Access code</label>
            <input id="admin-code" name="code" type="password" required placeholder="Access code" autoComplete="current-password" className="w-full" />
            <button type="submit" className="btn w-full justify-center">Sign in as admin</button>
          </form>
        </details>
      )}

      <p className="text-xs text-dim text-center">
        By signing in you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>. {DISCLAIMER}
      </p>
    </div>
  );
}
