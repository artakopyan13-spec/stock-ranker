"use server";

import { signIn, signOut } from "@/auth";

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
