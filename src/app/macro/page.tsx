import type { Metadata } from "next";
import Link from "next/link";
import { fetchYields, type Quote } from "@/lib/macro/yields";
import { fetchFred, fredConfigured, type FredSeries } from "@/lib/macro/fred";
import { getMacroBriefWithMeta } from "@/lib/macro/brief";
import { ago } from "@/lib/format";

export const metadata: Metadata = {
  title: "Macro",
  description: "Treasury yields, the major indices, the high-impact economic calendar and the headlines that just moved markets.",
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtPct(v: number | null, digits = 2): string {
  return v === null ? "—" : `${v.toFixed(digits)}%`;
}
function fmtLevel(v: number | null): string {
  return v === null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
/** Day change of a yield in basis points (a 4.20% → 4.25% move is +5 bp, not +1.19%). */
function fmtBp(change: number): string {
  const bp = Math.round(change * 100);
  return `${bp > 0 ? "+" : ""}${bp} bp`;
}
function fmtChangePct(c: number): string {
  return `${c > 0 ? "+" : ""}${c.toFixed(2)}%`;
}
/** Today's date (YYYY-MM-DD) on the US market calendar the briefing's events are dated in. */
function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
function changeColor(c: number | null): string {
  return c === null ? "text-muted" : c > 0 ? "text-green" : c < 0 ? "text-red" : "text-muted";
}

export default async function MacroPage() {
  const [{ yields, indices }, fred, briefWithMeta] = await Promise.all([
    fetchYields().catch(() => ({ yields: [] as Quote[], indices: [] as Quote[] })),
    fetchFred().catch(() => [] as FredSeries[]),
    getMacroBriefWithMeta().catch(() => null),
  ]);
  // On-demand requests never regenerate an existing briefing; a scheduled worker refreshes it with
  // live web search. So there's nothing to "refresh" here — just say how old it is and how it was built.
  const brief = briefWithMeta?.data ?? null;
  const meta = briefWithMeta?.meta ?? null;
  const web = meta?.mode === "web";
  const today = todayET();
  const calendar = brief ? brief.calendar.filter((ev) => ev.date >= today) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Macro</h1>
          <p className="text-muted text-sm mt-1">The backdrop that moves every stock — rates, inflation, the high-impact calendar, and what the big players just said.</p>
        </div>
        {meta && (
          <span className={`chip text-[0.68rem] ${web ? "chip-green" : "chip-muted"}`} title={`Built ${new Date(meta.builtAt).toUTCString()}`}>
            Updated {ago(meta.builtAt)} · {web ? "Web-verified" : "From AI knowledge"}
          </span>
        )}
      </div>

      {meta?.expired && (
        <div className="card p-3 text-xs text-red border-red">
          ⚠ This briefing is more than 6 hours old — the scheduled web refresh is running late. Treat the calendar and headlines as possibly out of date.
        </div>
      )}

      {/* Rates & indices */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="text-sm font-semibold mb-3">Treasury yields</div>
          <div className="grid grid-cols-2 gap-3">
            {yields.map((q) => (
              <Stat key={q.symbol} label={q.label} value={fmtPct(q.value)} change={q.change} changeText={q.change !== null ? fmtBp(q.change) : null} />
            ))}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm font-semibold mb-3">Markets</div>
          <div className="grid grid-cols-2 gap-3">
            {indices.map((q) => (
              <Stat key={q.symbol} label={q.label} value={fmtLevel(q.value)} change={q.changePct} changeText={q.changePct !== null ? fmtChangePct(q.changePct) : null} />
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
        </div>
      )}

      {/* Calendar + market-movers */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">📅 High-impact calendar</div>
          {calendar.length > 0 ? (
            <ul className="space-y-2">
              {calendar.map((ev, i) => (
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
            <p className="text-xs text-muted">No upcoming events cached yet — the calendar is refreshed from the web every few hours.</p>
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
            <p className="text-xs text-muted">Live headlines are refreshed from the web every few hours — none cached yet.</p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        Yields &amp; indices are live from Yahoo; economic series from FRED;{" "}
        {!meta
          ? "the calendar and headlines appear once the scheduled web briefing has run."
          : web
          ? "the calendar and headlines are AI‑gathered from the web with sources and dates — never invented."
          : "the current calendar is drafted from AI knowledge of the scheduled release cycle (not yet web-verified, so dates can shift); sourced headlines appear once the web refresh runs."}{" "}
        Research, not financial advice.
      </p>
    </div>
  );
}

function Stat({ label, value, change, changeText }: { label: string; value: string; change: number | null; changeText: string | null }) {
  return (
    <div>
      <div className="text-[0.68rem] text-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {changeText !== null && <div className={`text-[0.66rem] tabular-nums ${changeColor(change)}`}>{changeText}</div>}
    </div>
  );
}
