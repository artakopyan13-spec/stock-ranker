"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isAdmin } from "@/auth";
import { setSetting, type SettingKey } from "@/lib/quota/settings";

async function assertAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export async function saveSettings(formData: FormData): Promise<void> {
  await assertAdmin();
  const entries: Array<[SettingKey, string]> = [
    ["daily_spend_ceiling_usd", String(formData.get("daily_spend_ceiling_usd") ?? "")],
    ["max_analyses_per_day", String(formData.get("max_analyses_per_day") ?? "")],
    ["free_daily_fresh_analyses", String(formData.get("free_daily_fresh_analyses") ?? "")],
    ["kill_switch_manual", formData.get("kill_switch_manual") === "on" ? "true" : "false"],
  ];
  for (const [k, v] of entries) if (v !== "") await setSetting(k, v);
  revalidatePath("/admin");
}

export async function toggleKillSwitch(formData: FormData): Promise<void> {
  await assertAdmin();
  await setSetting("kill_switch_manual", String(formData.get("to") ?? "false"));
  revalidatePath("/admin");
}

export async function setUserBanned(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("userId") ?? "");
  const banned = formData.get("banned") === "true";
  if (id) await db().user.update({ where: { id }, data: { banned } });
  revalidatePath("/admin/users");
}

export async function setUserQuota(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("userId") ?? "");
  const raw = String(formData.get("quota") ?? "").trim();
  const quota = raw === "" ? null : Number.parseInt(raw, 10);
  if (id) await db().user.update({ where: { id }, data: { dailyQuota: Number.isFinite(quota as number) ? quota : null } });
  revalidatePath("/admin/users");
}
