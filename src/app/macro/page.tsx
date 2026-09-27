import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { fetchYields, type Quote } from "@/lib/macro/yields";
import { fetchFred, fredConfigured, type FredSeries } from "@/lib/macro/fred";
import type { MacroBriefOutput } from "@/lib/macro/schema";
import { MacroRefresh } from "@/components/MacroRefresh";

export const metadata: Metadata = { title: "Macro" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtPct(v: number | null, digits = 2): string {
  return v === null ? "—" : `${v.toFixed(digits)}%`;
}
function fmtLevel(v: number | null): string {
  return v === null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function changeColor(c: number | null): string {
  return c === null ? "text-muted" : c > 0 ? "text-green" : c < 0 ? "text-red" : "text-muted";
}

export default async function MacroPage() {
  const [{ yields, indices }, fred, briefRow] = await Promise.all([
    fetchYields().catch(() => ({ yields: [] as Quote[], indices: [] as Quote[] })),
    fetchFred().catch(() => [] as FredSeries[]),
    db().macroBrief.findFirst({ where: { kind: "brief" }, orderBy: { createdAt: "desc" } }).catch(() => null),
  ]);
  const brief: MacroBriefOutput | null = briefRow ? (JSON.parse(briefRow.payload) as MacroBriefOutput) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Macro</h1>
          <p className="text-muted text-sm mt-1">The backdrop that moves every stock — rates, inflation, the high-impact calendar, and what the big players just said.</p>
        </div>
        <MacroRefresh />
      </div>

      {/* Rates & indices */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="text-sm font-semibold mb-3">Treasury yields</div>
          <div className="grid grid-cols-2 gap-3">
            {yields.map((q) => (
              <Stat key={q.symbol} label={q.label} value={fmtPct(q.value)} change={q.changePct} />
            ))}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm font-semibold mb-3">Markets</div>
          <div className="grid grid-cols-2 gap-3">
            {indices.map((q) => (
              <Stat key={q.symbol} label={q.label} value={fmtLevel(q.value)} change={q.changePct} />
            ))}
          </div>
        </div>
      </div>

      {/* Economy (FRED) */}
      <div className="card p-4">
        <div className="text-sm font-semibold mb-3">Economy</div>
        {fredConfigured() ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {fred.map((s) => (
              <div key={s.id} className="card p-3">
                <div className="text-[0.68rem] text-muted">{s.label}</div>
                <div className="text-xl font-semibold tabular-nums mt-1">{fmtPct(s.value, 1)}</div>
                <div className="text-[0.62rem] text-muted mt-0.5">{s.hint}{s.date ? ` · ${s.date}` : ""}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">Add a free <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noopener noreferrer" className="text-purple no-underline">FRED API key</a> as <code>FRED_API_KEY</code> to show CPI inflation, mortgage rates, the fed funds rate, and unemployment here.</p>
        )}
      </div>

      {brief?.summary && (
        <div className="card p-4">
          <div className="text-sm font-semibold mb-1">The read</div>
          <p className="text-sm text-muted leading-relaxed">{brief.summary}</p>
          {briefRow && <div className="text-[0.62rem] text-muted mt-2">as of {brief.asOf}</div>}
        </div>
      )}

      {/* Calendar + market-movers */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">📅 High-impact calendar</div>
          {brief && brief.calendar.length > 0 ? (
            <ul className="space-y-2">
              {brief.calendar.map((ev, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className={`shrink-0 tabular-nums text-xs mt-0.5 ${ev.importance === "high" ? "text-red font-semibold" : "text-gold"}`}>{ev.date}</span>
                  <span>
                    <span className="font-medium">{ev.name}</span>
                    <span className="text-muted text-xs"> — {ev.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">No briefing yet — hit “Refresh briefing” to pull the calendar.</p>
          )}
        </div>

        <div className="card p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">🗞️ What just moved markets</div>
          {brief && brief.headlines.length > 0 ? (
            <ul className="space-y-3">
              {brief.headlines.map((h, i) => (
                <li key={i} className="text-sm">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="tabular-nums text-[0.68rem] text-muted">{h.date}</span>
                    <span className="font-medium">{h.who}</span>
                    {h.tickers.map((t) => (
                      <Link key={t} href={`/t/${t}`} className="chip chip-purple text-[0.6rem] no-underline">{t}</Link>
                    ))}
                  </div>
                  <div className="mt-0.5">{h.headline}</div>
                  <div className="text-xs text-muted mt-0.5">→ {h.impact}{h.source ? ` · ${h.source}` : ""}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">No briefing yet — hit “Refresh briefing” to pull market-moving headlines.</p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        Yields &amp; indices are live from Yahoo; economic series from FRED; the calendar and headlines are AI‑gathered from the web with sources and dates — never invented. Research, not financial advice.
      </p>
    </div>
  );
}

function Stat({ label, value, change }: { label: string; value: string; change: number | null }) {
  return (
    <div>
      <div className="text-[0.68rem] text-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {change !== null && <div className={`text-[0.66rem] tabular-nums ${changeColor(change)}`}>{change > 0 ? "+" : ""}{change.toFixed(2)}%</div>}
    </div>
  );
}
