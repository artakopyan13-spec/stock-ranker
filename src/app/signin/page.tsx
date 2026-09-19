import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { currentUser } from "@/auth";
import { googleSignIn, devSignIn, codeSignIn } from "@/lib/auth-actions";
import { DISCLAIMER } from "@/lib/analysis/schema";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const user = await currentUser();
  if (user) redirect("/");
  const e = env();
  const hasGoogle = Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
  const hasCode = Boolean(e.ACCESS_CODE);
  const devLogin = e.AUTH_DEV_LOGIN;
  return (
    <div className="max-w-md mx-auto mt-10 space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Sign in to Stock Ranker</h1>
        <p className="text-muted text-sm mt-1">Free. Viewing cached analyses is unlimited; you get {e.FREE_DAILY_FRESH_ANALYSES} fresh AI analyses a day.</p>
      </div>
      <div className="card p-6 space-y-4">
        {hasGoogle && (
          <form action={googleSignIn}>
            <button type="submit" className="btn btn-primary w-full justify-center">Continue with Google</button>
          </form>
        )}
        {hasCode && (
          <form action={codeSignIn} className="space-y-2">
            {hasGoogle && <div className="text-center text-xs text-dim">or, with an access code</div>}
            <input name="email" type="email" required placeholder="you@example.com" className="w-full" />
            <input name="code" type="password" required placeholder="Access code" className="w-full" />
            <button type="submit" className="btn btn-primary w-full justify-center">Sign in with code</button>
          </form>
        )}
        {devLogin && (
          <form action={devSignIn} className="space-y-2">
            {(hasGoogle || hasCode) && <div className="text-center text-xs text-dim">or, for local testing</div>}
            <input name="email" type="email" required placeholder="you@example.com" className="w-full" />
            <button type="submit" className="btn w-full justify-center">Dev sign-in (no password)</button>
          </form>
        )}
        {!hasGoogle && !devLogin && !hasCode && (
          <p className="text-sm text-muted">Sign-in is not configured on this deployment. Set an <code>ACCESS_CODE</code> for a shared-code login, add <code>GOOGLE_CLIENT_ID</code>/<code>GOOGLE_CLIENT_SECRET</code> for Google, or <code>AUTH_DEV_LOGIN=true</code> for local testing.</p>
        )}
      </div>
      <p className="text-xs text-dim text-center">
        By signing in you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>. {DISCLAIMER}
      </p>
    </div>
  );
}
