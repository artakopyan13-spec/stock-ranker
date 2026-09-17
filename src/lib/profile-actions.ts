"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/auth";
import { redirect } from "next/navigation";

export async function setUsername(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const raw = String(formData.get("username") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(raw)) redirect("/profile?err=" + encodeURIComponent("Username must be 3–20 letters, numbers or underscore"));
  const taken = await db().user.findFirst({ where: { username: raw, id: { not: user.id } } });
  if (taken) redirect("/profile?err=" + encodeURIComponent("That username is taken"));
  await db().user.update({ where: { id: user.id }, data: { username: raw } });
  revalidatePath("/profile");
  redirect("/profile?ok=1");
}

export async function setWatchlistPublic(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const slug = String(formData.get("slug") ?? "");
  const isPublic = formData.get("isPublic") === "true";
  await db().watchlist.updateMany({ where: { slug, userId: user.id }, data: { isPublic } });
  revalidatePath("/profile");
}
