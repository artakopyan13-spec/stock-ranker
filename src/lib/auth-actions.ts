"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut, currentUser } from "@/auth";
import { db } from "@/lib/db";
import { normalizeEmail, requestEmailCode } from "@/lib/auth/otp";

export type EmailCodeState = { step: "email" | "code"; email: string; error?: string; notice?: string; devCode?: string };

/** Step 1 of email-code sign-in: generate + send a code. Returns state for the client form. */
export async function sendEmailCode(_prev: EmailCodeState, formData: FormData): Promise<EmailCodeState> {
  const email = normalizeEmail(formData.get("email"));
  const res = await requestEmailCode(email);
  if (!res.ok) return { step: "email", email, error: res.error };
  return {
    step: "code",
    email,
    notice: res.dev ? "Dev mode: no email provider set — use the code below (also logged to the server console)." : `We emailed a 6-digit code to ${email}. It expires in 10 minutes.`,
    devCode: res.devCode,
  };
}

/** Step 2: verify the code by signing in through the email-code provider. */
export async function emailCodeSignIn(_prev: EmailCodeState, formData: FormData): Promise<EmailCodeState> {
  const email = normalizeEmail(formData.get("email"));
  const code = String(formData.get("code") ?? "").trim();
  try {
    await signIn("email-code", { email, code, redirectTo: "/" });
  } catch (error) {
    // A successful sign-in throws a redirect (NEXT_REDIRECT) that must propagate.
    if (error instanceof AuthError) {
      return { step: "code", email, error: "That code isn’t right or has expired. Check it, or request a new one." };
    }
    throw error;
  }
  return { step: "code", email };
}

export async function googleSignIn(): Promise<void> {
  await signIn("google", { redirectTo: "/" });
}

export async function devSignIn(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  await signIn("dev", { email, redirectTo: "/" });
}

export async function codeSignIn(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "");
  await signIn("code", { email, code, redirectTo: "/" });
}

export async function doSignOut(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

/** Save the welcome/onboarding answers, then continue into the app. */
export async function completeOnboarding(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const clip = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);
  const answers = {
    experience: clip(formData.get("experience"), 40),
    goal: clip(formData.get("goal"), 40),
    source: clip(formData.get("source"), 80),
  };
  await db().user.update({ where: { id: user.id }, data: { onboardedAt: new Date(), onboarding: JSON.stringify(answers) } });
  redirect("/");
}
