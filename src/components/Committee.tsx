"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommitteeReport, SeatId, Stance } from "@/lib/committee/schema";
import { SEAT_NAME, SEATS } from "@/lib/committee/schema";
import { SeatAvatar } from "@/components/SeatAvatar";
import { ProgressLine } from "@/components/ProgressLine";
import { ago } from "@/lib/format";

const STANCE_CHIP: Record<Stance, string> = { bull: "chip-green", bear: "chip-red", neutral: "chip-muted" };
const STANCE_TONE: Record<Stance, string> = { bull: "text-green", bear: "text-red", neutral: "text-muted" };
const ACTION_TONE: Record<string, string> = { BUY: "text-green", HOLD: "text-gold", SELL: "text-red" };
const SEAT_IDS = SEATS.map((s) => s.id) as SeatId[];
const seatName = (id: string) => SEAT_NAME[id as SeatId] ?? id;

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
      <div className="card p-8 text-center space-y-4">
        <div className="flex justify-center gap-1.5">
          {SEAT_IDS.map((id) => (
            <div key={id} className={`${running ? "animate-bounce" : ""}`} style={{ animationDelay: `${SEAT_IDS.indexOf(id) * 0.12}s` }}>
              <SeatAvatar seat={id} size={44} />
            </div>
          ))}
        </div>
        <div className="text-lg font-semibold">Convene the investment committee</div>
        <p className="text-muted text-sm max-w-lg mx-auto">Five AI analysts — Research, Risk, Macro, Devil&rsquo;s Advocate and Capital Allocation — debate {symbol} from the verified analysis, then the chair rules on a score and a BUY/HOLD/SELL.</p>
        {signedIn ? (
          <button className="btn btn-primary" disabled={running} onClick={() => convene(false)}>{running ? "Debating…" : "Convene committee"}</button>
        ) : (
          <a href="/signin" className="btn btn-primary no-underline inline-block">Sign in to convene</a>
        )}
        <ProgressLine key={running ? "on" : "off"} active={running} estSeconds={40} label="The committee is debating" />
        {notice && <div className="text-sm text-gold">{notice}</div>}
        {error && <div className="text-sm text-red">{error}</div>}
        <p className="text-[0.65rem] text-dim">Uses one fresh-analysis credit. Cached after that, free for everyone. Not financial advice.</p>
      </div>
    );
  }

  const c = report.chair;
  return (
    <div className="space-y-4">
      {notice && <div className="card p-3 text-sm border-l-2 border-l-gold text-muted">{notice}</div>}

      {/* Verdict first — the straight answer */}
      <div className="card p-5 border-l-2 border-l-gold space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-xs uppercase tracking-wider text-gold">Chair&rsquo;s verdict</div>
          <div className="text-3xl font-bold tabular-nums">{c.finalScore}/10</div>
          <div className={`text-xl font-semibold ${ACTION_TONE[c.finalAction] ?? "text-text"}`}>{c.finalAction}</div>
          <span className="chip chip-muted">{c.confidence} confidence</span>
        </div>
        <p className="text-sm leading-relaxed">{c.synthesis}</p>
        <div className="text-sm"><span className="text-red font-medium">Strongest objection that survived: </span><span className="text-muted">{c.dissent}</span></div>
        <div className="text-xs text-dim border-t border-line pt-2"><span className="text-muted">Decision rule: </span>{c.decisionRule}</div>
      </div>

      {/* The five characters + how each voted */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted mb-2">The committee</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {report.opinions.map((o) => (
            <div key={o.seat} className="card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <SeatAvatar seat={o.seat as SeatId} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{seatName(o.seat)}</div>
                  <span className={`chip ${STANCE_CHIP[o.stance]} text-[0.6rem]`}>{o.stance}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold tabular-nums">{o.score}/10</div>
                  <div className={`text-[0.62rem] font-semibold ${ACTION_TONE[o.vote] ?? "text-muted"}`}>{o.vote}</div>
                </div>
              </div>
              <div className={`text-xs font-medium ${STANCE_TONE[o.stance]}`}>{o.headline}</div>
              <p className="text-xs text-muted leading-relaxed">{o.argument}</p>
              {o.keyPoints.length > 0 && (
                <ul className="list-disc ml-4 text-[0.68rem] text-dim space-y-0.5">
                  {o.keyPoints.map((k, i) => <li key={i}>{k}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* The debate, as a group chat */}
      {report.debate.length > 0 && <DebateChat key={report.createdAt} debate={report.debate} />}

      <div className="flex items-center justify-between text-xs text-dim">
        <span>Convened {ago(report.createdAt)}{report.basedOnAnalysisAt ? ` · from analysis of ${report.basedOnAnalysisAt.slice(0, 10)}` : ""} · {report.model}</span>
        {signedIn && <button className="chip chip-muted" disabled={running} onClick={() => convene(true)}>{running ? "Re-debating…" : "Re-convene"}</button>}
      </div>
      <p className="text-[0.65rem] text-dim">The committee is a role-played reasoning aid over the model&rsquo;s own analysis, not five independent sources. Ratings are judgment, not fact. Not financial advice.</p>
    </div>
  );
}

/** Renders the seat-to-seat challenges as a chat thread that types itself out, so you watch them argue. */
function DebateChat({ debate }: { debate: CommitteeReport["debate"] }) {
  const [revealed, setRevealed] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (revealed >= debate.length) return;
    const id = setTimeout(() => setRevealed((n) => Math.min(n + 1, debate.length)), 1100);
    return () => clearTimeout(id);
  }, [revealed, debate.length]);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wider text-muted">The debate</div>
        {revealed < debate.length && <span className="text-[0.62rem] text-dim flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />live</span>}
      </div>
      <div ref={scrollRef} className="space-y-3">
        {debate.slice(0, revealed).map((d, i) => {
          const right = i % 2 === 1;
          return (
            <div key={i} className={`flex items-start gap-2 ${right ? "flex-row-reverse" : ""}`} style={{ animation: "fadeInUp .35s ease both" }}>
              <SeatAvatar seat={d.from as SeatId} size={34} className="mt-0.5 shrink-0" />
              <div className={`max-w-[80%] ${right ? "text-right" : ""}`}>
                <div className={`text-[0.66rem] text-dim mb-0.5 ${right ? "pr-1" : "pl-1"}`}>
                  <span className="text-gold font-medium">{seatName(d.from)}</span> → {seatName(d.to)}
                </div>
                <div className="inline-block text-sm text-left card-2 rounded-xl px-3 py-2 leading-relaxed">{d.challenge}</div>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
