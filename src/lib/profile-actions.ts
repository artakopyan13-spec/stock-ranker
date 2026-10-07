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
  try {
    await db().user.update({ where: { id: user.id }, data: { username: raw } });
  } catch (err) {
    // Two people can claim the same free name between the check above and this write; the unique
    // constraint catches it — show the same friendly message instead of a 500.
    if ((err as { code?: unknown })?.code === "P2002") redirect("/profile?err=" + encodeURIComponent("That username is taken"));
    throw err;
  }
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

export async function setDisplayName(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  await db().user.update({ where: { id: user.id }, data: { name: name || null } });
  revalidatePath("/settings");
  redirect("/settings?ok=1");
}

/** Deletes the signed-in user's portfolio(s) and the portfolio chat history (current user only). */
export async function deletePortfolioData(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (formData.get("confirm") !== "on") redirect("/settings?err=" + encodeURIComponent("Tick the confirmation box to delete your portfolio data."));
  await db().$transaction([db().portfolio.deleteMany({ where: { userId: user.id } }), db().chatMessage.deleteMany({ where: { userId: user.id, thread: { startsWith: "portfolio:" } } })]);
  revalidatePath("/settings");
  revalidatePath("/portfolio");
  redirect("/settings?deleted=portfolio");
}

export async function deleteMyData(): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/signin");
  await db().watchlist.deleteMany({ where: { userId: user.id } });
  await db().savedScreen.deleteMany({ where: { userId: user.id } });
  revalidatePath("/settings");
  redirect("/settings?deleted=1");
}
