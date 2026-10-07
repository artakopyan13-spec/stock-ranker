"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { SourcedNumber } from "@/lib/data/types";
import { FCF_EMOJI, type Action, type FcfVerdict } from "@/lib/analysis/schema";
import { ago, dateLabel, UNVERIFIED } from "@/lib/format";
import { InfoDot } from "@/components/Info";

export function RatingChip({ score }: { score: number }) {
  return <span className="chip chip-gold text-sm">★ {score}/10</span>;
}

export function ActionChip({ action }: { action: Action }) {
  const cls = action === "BUY" ? "chip-green" : action === "SELL" ? "chip-red" : "chip-gold";
  return <span className={`chip ${cls}`}>{action}</span>;
}

export function FcfChip({ verdict, large = false }: { verdict: FcfVerdict; large?: boolean }) {
  const cls = verdict === "healthy" ? "chip-green" : verdict === "negative" ? "chip-red" : "chip-gold";
  const label = verdict === "healthy" ? "FCF healthy" : verdict === "thin" ? "FCF thin" : verdict === "negative" ? "FCF negative" : "FCF unverified";
  return (
    <span className={`chip ${cls} ${large ? "text-sm px-3 py-1" : ""}`}>
      {FCF_EMOJI[verdict]} {label}
    </span>
  );
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "purple" | "green" | "red" | "gold" }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function StaleBadge({ asOf, days = 7 }: { asOf: string; days?: number }) {
  const [now] = useState(() => Date.now());
  const ageDays = Math.floor((now - new Date(asOf).getTime()) / 86_400_000);
  if (ageDays <= days) return null;
  return (
    <span className="chip chip-red" title={`Data is ${ageDays} days old`}>
      stale · {ageDays}d
    </span>
  );
}

/** A KPI value; hover or focus reveals source + date (style guide: "on hover/footnote"). */
export function Kpi({ label, value, source, sub, tone, infoId }: { label: string; value: string; source?: SourcedNumber | { source: string; asOf: string; url?: string | null }; sub?: string; tone?: "green" | "red" | "gold"; infoId?: string }) {
  const unverified = value === UNVERIFIED;
  const color = unverified ? "text-dim italic" : tone === "green" ? "text-green" : tone === "red" ? "text-red" : tone === "gold" ? "text-gold" : "text-text";
  return (
    <div className="kpi card-2 p-3 min-w-0" tabIndex={0}>
      <div className="text-[0.7rem] uppercase tracking-wider text-muted flex items-center gap-1">{label}{infoId && <InfoDot id={infoId} />}</div>
      <div className={`text-lg font-semibold mt-0.5 truncate ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
      {source && (
        <div className="src">
          <div className="text-text">{source.source}</div>
          <div>as of {dateLabel(source.asOf)}</div>
          {source.url && (
            <a href={source.url} target="_blank" rel="noreferrer" className="break-all">
              {source.url}
            </a>
          )}
          {unverified && <div className="text-red mt-1">Not provided by the source — shown as unverified, never guessed.</div>}
        </div>
      )}
    </div>
  );
}

export function Card({ title, right, children, className = "", tone }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; tone?: "green" | "red" | "gold" | "purple" }) {
  const border = tone === "green" ? "border-l-2 border-l-green" : tone === "red" ? "border-l-2 border-l-red" : tone === "gold" ? "border-l-2 border-l-gold" : tone === "purple" ? "border-l-2 border-l-purple" : "";
  return (
    <section className={`card p-4 md:p-5 fade-up ${border} ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title && <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Click-to-toggle card with a smooth height/opacity transition. */
export function ExpandableCard({ header, children, defaultOpen = false, id }: { header: ReactNode; children: ReactNode; defaultOpen?: boolean; id?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card fade-up" id={id}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left p-4 md:p-5 flex items-center gap-3 cursor-pointer" aria-expanded={open}>
        <div className="flex-1 min-w-0">{header}</div>
        <span className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      <div className="expand" data-open={open}>
        <div>
          <div className="px-4 md:px-5 pb-5">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i % 2 ? "w-5/6" : "w-full"}`} />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <div className="text-lg font-semibold">{title}</div>
      {children && <div className="text-muted text-sm mt-2 max-w-md mx-auto">{children}</div>}
    </div>
  );
}

export function ErrorState({ title, message, details }: { title?: string; message: string; details?: ReactNode }) {
  return (
    <div className="card p-6 border-l-2 border-l-red">
      <div className="font-semibold text-red">{title ?? "Something went wrong"}</div>
      <div className="text-sm text-muted mt-1 whitespace-pre-wrap">{message}</div>
      {details && <div className="mt-3 text-xs text-muted">{details}</div>}
    </div>
  );
}

export function AnalyzedAgo({ analyzedAt, onRefresh, refreshing }: { analyzedAt: string; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <span className="text-xs text-muted inline-flex items-center gap-2">
      analyzed {ago(analyzedAt)}
      {onRefresh && (
        <button type="button" className="btn btn-ghost py-0.5 px-2 text-xs" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "refreshing…" : "↻ refresh"}
        </button>
      )}
    </span>
  );
}

export function Estimate() {
  return (
    <span className="text-[0.68rem] uppercase tracking-wider text-purple border border-purple/40 rounded px-1.5 py-0.5" title="The model's judgment, not fact">
      estimate · model judgment
    </span>
  );
}

/** Provenance of a cached AI report (deep / earnings), as returned in the API's `meta`. */
export interface ReportMetaView {
  mode: "web" | "knowledge";
  builtAt: string;
  outdated: boolean;
  expired: boolean;
}
export interface ReportNoticeView {
  reason: string;
  message: string;
}

/** "Web-verified · built Oct 7, 2026" vs "From AI knowledge (may be out of date) · built …". */
export function reportProvenance(meta: ReportMetaView): string {
  const built = dateLabel(meta.builtAt);
  return meta.mode === "web" ? `Web-verified · built ${built}` : `From AI knowledge (may be out of date) · built ${built}`;
}

/** A report notice (quota, refresh failed, already verified, errors) with the action that resolves it. */
export function ReportNotice({ notice, signedIn, className = "" }: { notice: ReportNoticeView; signedIn: boolean; className?: string }) {
  const upgrade = notice.reason === "user_quota";
  // Anonymous users hitting any gate (login, rate limit, caps) get a sign-in route; not for plain errors.
  const signIn = notice.reason === "login_required" || (!signedIn && !upgrade && !["already_verified", "refresh_failed", "error"].includes(notice.reason));
  return (
    <span className={`inline-flex items-center gap-2 flex-wrap ${className}`}>
      <span className="text-gold">{notice.message}</span>
      {upgrade && <a href="/pricing" className="btn btn-primary no-underline text-xs px-2 py-1">Upgrade →</a>}
      {signIn && <a href="/signin" className="btn btn-primary no-underline text-xs px-2 py-1">Sign in</a>}
    </span>
  );
}

/** Appears under a progress bar once a build has run past the usual time. Remount (key) to reset. */
export function SlowHint({ active, afterSec = 45 }: { active: boolean; afterSec?: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setSlow(true), afterSec * 1000);
    return () => clearTimeout(id);
  }, [active, afterSec]);
  if (!active || !slow) return null;
  return <div className="text-[0.68rem] text-muted mt-1">Taking longer than usual…</div>;
}
