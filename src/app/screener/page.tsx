import type { Metadata } from "next";
import Link from "next/link";
import { loadUniverse } from "@/lib/universe";
import { currentUser } from "@/auth";
import { db } from "@/lib/db";
import { Screener } from "@/components/Screener";
import { Heatmap } from "@/components/Heatmap";
import type { ScreenFilters } from "@/lib/screener";

export const metadata: Metadata = { title: "Screener" };
export const dynamic = "force-dynamic";

export default async function ScreenerPage({ searchParams }: PageProps<"/screener">) {
  const sp = await searchParams;
  const view = sp.view === "map" ? "map" : "table";
  const [rows, user] = await Promise.all([loadUniverse(), currentUser()]);
  const sectors = [...new Set(rows.map((r) => r.sector).filter((s): s is string => Boolean(s)))].sort();
  const saved = user
    ? (await db().savedScreen.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } })).map((s) => ({ id: s.id, name: s.name, filters: JSON.parse(s.filters) as ScreenFilters }))
    : [];
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Screener</h1>
        <div className="flex gap-2 text-xs">
          <Link href="/screener" className={`chip ${view === "table" ? "chip-gold" : "chip-muted"} no-underline`}>Filter table</Link>
          <Link href="/screener?view=map" className={`chip ${view === "map" ? "chip-gold" : "chip-muted"} no-underline`}>Heatmap</Link>
        </div>
      </div>
      {view === "map" ? <Heatmap /> : <Screener rows={rows} sectors={sectors} saved={saved} />}
    </div>
  );
}
