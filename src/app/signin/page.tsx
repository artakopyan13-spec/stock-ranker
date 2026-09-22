import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { currentUser } from "@/auth";
import { profileSignIn } from "@/lib/auth-actions";
import { DISCLAIMER } from "@/lib/analysis/schema";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const user = await currentUser();
  if (user) redirect("/");
  const e = env();
  return (
    <div className="max-w-md mx-auto mt-10 space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Sign in to Stock Ranker</h1>
        <p className="text-muted text-sm mt-1">Just your email and a nickname — no password. Free: {e.FREE_DAILY_FRESH_ANALYSES} fresh AI analyses a day, unlimited cached views.</p>
      </div>
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
      <p className="text-xs text-dim text-center">
        By signing in you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>. {DISCLAIMER}
      </p>
    </div>
  );
}
