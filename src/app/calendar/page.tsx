import type { Metadata } from "next";
import Link from "next/link";
import { loadUniverse } from "@/lib/universe";
import { db } from "@/lib/db";
import { Analysis } from "@/lib/analysis/schema";
import { currentUser } from "@/auth";
import { listWatchlists } from "@/lib/watchlists";
import { dateLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Earnings calendar" };
export const dynamic = "force-dynamic";

interface Item { date: string; symbol: string; kind: "earnings" | "catalyst"; label: string }

function windowDates(): { today: string; horizon: string } {
  const now = Date.now();
  return { today: new Date(now).toISOString().slice(0, 10), horizon: new Date(now + 120 * 86_400_000).toISOString().slice(0, 10) };
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const user = await currentUser();
  const mine = sp.mine === "1" && Boolean(user);
  const watched = user ? new Set((await listWatchlists(user.id)).flatMap((w) => w.symbols)) : new Set<string>();

  const rows = await loadUniverse();
  const { today, horizon } = windowDates();
  const items: Item[] = [];
  for (const r of rows) {
    if (r.nextEarnings && r.nextEarnings >= today && r.nextEarnings <= horizon) items.push({ date: r.nextEarnings, symbol: r.symbol, kind: "earnings", label: "Earnings report" });
  }
  const latest = await db().analysis.findMany({ where: { verified: true }, orderBy: { version: "desc" }, distinct: ["symbol"] });
  for (const row of latest) {
    try {
      const a = Analysis.parse(JSON.parse(row.payload));
      for (const c of a.catalysts) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.date >= today && c.date <= horizon && c.type !== "earnings") {
          items.push({ date: c.date, symbol: a.meta.ticker, kind: "catalyst", label: c.event });
        }
      }
    } catch {}
  }
  const shown = (mine ? items.filter((i) => watched.has(i.symbol)) : items).sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Earnings &amp; catalysts</h1>
        <span className="text-sm text-muted">next 120 days</span>
        {user && (
          <div className="flex gap-2 text-xs ml-auto">
            <Link href="/calendar" className={`chip ${!mine ? "chip-gold" : "chip-muted"} no-underline`}>All</Link>
            <Link href="/calendar?mine=1" className={`chip ${mine ? "chip-gold" : "chip-muted"} no-underline`}>My watchlist</Link>
          </div>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="card p-8 text-center text-muted">{mine ? "No upcoming events for your watchlisted tickers yet. Analyze them to populate dates." : "No dated events ahead yet."}</div>
      ) : (
        <ol className="relative border-l border-line ml-2 space-y-3">
          {shown.map((it, i) => (
            <li key={i} className="ml-4">
              <span className={`absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full ${it.kind === "earnings" ? "bg-gold" : "bg-purple"}`} />
              <div className="text-xs text-muted">{dateLabel(it.date)} · {it.kind}</div>
              <div className="text-sm">
                <Link href={`/t/${it.symbol}`} className="font-semibold no-underline text-text">{it.symbol}</Link>
                {watched.has(it.symbol) && <span className="chip chip-purple ml-2">watchlist</span>} — {it.label}
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-dim">Earnings dates and catalysts come from the latest cached analysis of each ticker. Dates may shift; verify with the company&apos;s IR page.</p>
    </div>
  );
}
