"use client";

import { useCallback, useEffect, useState } from "react";
import type { CommitteeReport, SeatId, Stance } from "@/lib/committee/schema";
import { SEAT_NAME } from "@/lib/committee/schema";
import { ago } from "@/lib/format";

const STANCE_TONE: Record<Stance, string> = { bull: "text-green", bear: "text-red", neutral: "text-muted" };
const STANCE_CHIP: Record<Stance, string> = { bull: "chip-green", bear: "chip-red", neutral: "chip-muted" };
const ACTION_TONE: Record<string, string> = { BUY: "text-green", HOLD: "text-gold", SELL: "text-red" };

export function Committee({ symbol, signedIn }: { symbol: string; signedIn: boolean }) {
  const [report, setReport] = useState<CommitteeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/committee/${symbol}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { report?: CommitteeReport } | null) => {
        if (alive && d?.report) setReport(d.report);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [symbol]);

  const convene = useCallback(
    async (force: boolean) => {
      setRunning(true);
      setNotice(null);
      setError(null);
      try {
        const res = await fetch(`/api/committee/${symbol}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force }) });
        const d = (await res.json()) as { report?: CommitteeReport; notice?: { message: string }; error?: string };
        if (d.report) setReport(d.report);
        if (d.notice) setNotice(d.notice.message);
        if (d.error) setError(d.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not convene the committee.");
      } finally {
        setRunning(false);
      }
    },
    [symbol],
  );

  if (loading) return <div className="card p-6"><div className="text-sm text-muted">Loading committee…</div></div>;

  if (!report) {
    return (
      <div className="card p-8 text-center space-y-3">
        <div className="text-lg font-semibold">Convene the investment committee</div>
        <p className="text-muted text-sm max-w-lg mx-auto">Five AI analysts — Research, Risk, Macro, Devil&rsquo;s Advocate and Capital Allocation — debate {symbol} from the verified analysis, then the chair rules on a score and a BUY/HOLD/SELL.</p>
        {notice && <div className="text-sm text-gold">{notice}</div>}
        {error && <div className="text-sm text-red">{error}</div>}
        {signedIn ? (
          <button className="btn btn-primary" disabled={running} onClick={() => convene(false)}>{running ? "Debating…" : "Convene committee"}</button>
        ) : (
          <a href="/signin" className="btn btn-primary no-underline inline-block">Sign in to convene</a>
        )}
        <p className="text-[0.65rem] text-dim">Uses one fresh-analysis credit. Cached after that, free for everyone. Not financial advice.</p>
      </div>
    );
  }

  const c = report.chair;
  return (
    <div className="space-y-4">
      {notice && <div className="card p-3 text-sm border-l-2 border-l-gold text-muted">{notice}</div>}

      <div className="card p-4 border-l-2 border-l-purple">
        <div className="text-xs uppercase tracking-wider text-purple mb-1">Chair&rsquo;s decision rule</div>
        <p className="text-sm">{c.decisionRule}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {report.opinions.map((o) => (
          <div key={o.seat} className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-text">{SEAT_NAME[o.seat as SeatId] ?? o.seat}</div>
              <span className={`chip ${STANCE_CHIP[o.stance]}`}>{o.stance}</span>
            </div>
            <div className={`text-sm font-medium ${STANCE_TONE[o.stance]}`}>{o.headline}</div>
            <p className="text-sm text-muted leading-relaxed">{o.argument}</p>
            <ul className="list-disc ml-4 text-xs text-muted space-y-1">
              {o.keyPoints.map((k, i) => <li key={i}>{k}</li>)}
            </ul>
            <div className="text-xs text-dim pt-1 border-t border-line flex gap-3">
              <span>conviction <span className="text-text font-semibold">{o.score}/10</span></span>
              <span>vote <span className={ACTION_TONE[o.vote] ?? "text-text"}>{o.vote}</span></span>
            </div>
          </div>
        ))}
      </div>

      {report.debate.length > 0 && (
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">The debate</div>
          <ul className="space-y-2">
            {report.debate.map((d, i) => (
              <li key={i} className="text-sm">
                <span className="text-gold font-medium">{SEAT_NAME[d.from as SeatId] ?? d.from}</span>
                <span className="text-dim"> → {SEAT_NAME[d.to as SeatId] ?? d.to}: </span>
                <span className="text-muted">{d.challenge}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-5 border-l-2 border-l-gold space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-xs uppercase tracking-wider text-gold">Chair&rsquo;s verdict</div>
          <div className="text-2xl font-bold">{c.finalScore}/10</div>
          <div className={`text-lg font-semibold ${ACTION_TONE[c.finalAction] ?? "text-text"}`}>{c.finalAction}</div>
          <span className="chip chip-muted">{c.confidence} confidence</span>
        </div>
        <p className="text-sm leading-relaxed">{c.synthesis}</p>
        <div className="text-sm">
          <span className="text-red font-medium">Strongest surviving objection: </span>
          <span className="text-muted">{c.dissent}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-dim">
        <span>Convened {ago(report.createdAt)}{report.basedOnAnalysisAt ? ` · from analysis of ${report.basedOnAnalysisAt.slice(0, 10)}` : ""} · {report.model}</span>
        {signedIn && <button className="chip chip-muted" disabled={running} onClick={() => convene(true)}>{running ? "Re-debating…" : "Re-convene"}</button>}
      </div>
      <p className="text-[0.65rem] text-dim">The committee is a role-played reasoning aid over the model&rsquo;s own analysis, not five independent sources. Ratings are judgment, not fact. Not financial advice.</p>
    </div>
  );
}
