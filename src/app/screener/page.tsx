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

function filtersFromParams(sp: Record<string, string | string[] | undefined>): ScreenFilters {
  const one = (k: string): string | undefined => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const numP = (k: string): number | undefined => {
    const v = one(k);
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const listP = (k: string): string[] | undefined => {
    const v = one(k);
    return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  };
  const f: ScreenFilters = {
    sector: one("sector"),
    minMarketCap: numP("minMarketCap"),
    minRevGrowth: numP("minRevGrowth"),
    minFcfMargin: numP("minFcfMargin"),
    maxTrailingPE: numP("maxTrailingPE"),
    maxForwardPE: numP("maxForwardPE"),
    maxPriceToFcf: numP("maxPriceToFcf"),
    minRating: numP("minRating"),
    actions: listP("actions"),
    fcfVerdicts: listP("fcfVerdicts"),
  };
  // Drop undefined keys so Object.keys(initial).length reflects real filters.
  for (const k of Object.keys(f) as Array<keyof ScreenFilters>) if (f[k] === undefined) delete f[k];
  return f;
}

export default async function ScreenerPage({ searchParams }: PageProps<"/screener">) {
  const sp = await searchParams;
  const view = sp.view === "map" ? "map" : "table";
  const initial = filtersFromParams(sp);
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
      {view === "map" ? <Heatmap /> : <Screener rows={rows} sectors={sectors} saved={saved} initial={Object.keys(initial).length ? initial : undefined} />}
    </div>
  );
}
