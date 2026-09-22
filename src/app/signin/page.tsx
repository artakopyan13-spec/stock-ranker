import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { currentUser } from "@/auth";
import { EmailCodeForm } from "@/components/EmailCodeForm";
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
        <p className="text-muted text-sm mt-1">Enter your email and we&rsquo;ll send you a one-time code. No password. Free — you get {e.FREE_DAILY_FRESH_ANALYSES} fresh AI analyses a day, and unlimited cached views.</p>
      </div>
      <div className="card p-6">
        <EmailCodeForm />
      </div>
      <p className="text-xs text-dim text-center">
        By signing in you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>. {DISCLAIMER}
      </p>
    </div>
  );
}
