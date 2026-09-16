import type { Metadata } from "next";
import { loadUniverse } from "@/lib/universe";
import { currentUser } from "@/auth";
import { db } from "@/lib/db";
import { Screener } from "@/components/Screener";
import type { ScreenFilters } from "@/lib/screener";

export const metadata: Metadata = { title: "Screener" };
export const dynamic = "force-dynamic";

export default async function ScreenerPage() {
  const [rows, user] = await Promise.all([loadUniverse(), currentUser()]);
  const sectors = [...new Set(rows.map((r) => r.sector).filter((s): s is string => Boolean(s)))].sort();
  const saved = user
    ? (await db().savedScreen.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } })).map((s) => ({ id: s.id, name: s.name, filters: JSON.parse(s.filters) as ScreenFilters }))
    : [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Stock screener</h1>
      <Screener rows={rows} sectors={sectors} saved={saved} />
    </div>
  );
}
