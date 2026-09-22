import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { effectiveLimits } from "@/lib/quota/settings";
import { spendToday, analysesToday } from "@/lib/quota/spend";
import { saveSettings } from "@/lib/admin-actions";
import { AnswerDonut } from "@/components/AnswerDonut";

export const dynamic = "force-dynamic";

/** Tally one onboarding answer key across users into donut segments (by %). */
function tally(rows: { onboarding: string | null }[], key: string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    try {
      const o = JSON.parse(r.onboarding ?? "{}") as Record<string, unknown>;
      const v = o[key];
      if (typeof v === "string" && v.trim()) m.set(v, (m.get(v) ?? 0) + 1);
    } catch {
      /* skip malformed */
    }
  }
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const segments = [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, c]) => ({ label, count: c, pct: total ? (c / total) * 100 : 0 }));
  return { total, segments };
}

export default async function AdminPage() {
  const admin = await currentUser();
  if (!admin) redirect("/signin");
  if (admin.role !== "admin") notFound();
  const e = env();
  const [limits, spend, count, answered] = await Promise.all([
    effectiveLimits(),
    spendToday(),
    analysesToday(),
    db().user.findMany({ where: { onboarding: { not: null } }, select: { onboarding: true } }),
  ]);
  const pct = limits.spendCeilingUsd > 0 ? Math.min(100, (spend / limits.spendCeilingUsd) * 100) : 0;
  const experience = tally(answered, "experience");
  const goal = tally(answered, "goal");
  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <nav className="flex gap-3 text-sm text-muted">
          <Link href="/admin/costs">Costs</Link>
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/emails">Emails</Link>
        </nav>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-2 p-4"><div className="text-xs uppercase text-muted">Spend today</div><div className="text-2xl font-semibold text-gold">${spend.toFixed(2)}</div><div className="text-xs text-muted">of ${limits.spendCeilingUsd.toFixed(2)} ceiling</div></div>
        <div className="card-2 p-4"><div className="text-xs uppercase text-muted">Analyses today</div><div className="text-2xl font-semibold">{count} / {limits.maxAnalysesPerDay}</div></div>
        <div className="card-2 p-4"><div className="text-xs uppercase text-muted">Fresh path</div><div className={`text-2xl font-semibold ${limits.killSwitchManual || spend >= limits.spendCeilingUsd ? "text-red" : "text-green"}`}>{limits.killSwitchManual ? "PAUSED" : spend >= limits.spendCeilingUsd ? "CEILING" : "LIVE"}</div></div>
        <div className="card-2 p-4"><div className="text-xs uppercase text-muted">Free quota / user</div><div className="text-2xl font-semibold">{limits.freeDailyFresh}/day</div></div>
      </div>

      <div className="card p-4">
        <div className="h-2 bg-card2 rounded overflow-hidden"><div className="h-full bg-gold" style={{ width: `${pct}%` }} /></div>
        <div className="text-xs text-muted mt-1">{pct.toFixed(0)}% of today&apos;s spend ceiling used</div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Onboarding answers · most popular by %</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <AnswerDonut title="Which best describes you?" total={experience.total} segments={experience.segments} />
          <AnswerDonut title="What do you most want to do here?" total={goal.total} segments={goal.segments} />
        </div>
      </section>

      <form action={saveSettings} className="card p-5 space-y-4 max-w-lg">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Runtime controls (no redeploy)</h2>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="kill_switch_manual" defaultChecked={limits.killSwitchManual} className="w-4 h-4 p-0" />
          Pause all fresh analyses (kill switch) — users still get cached results
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-muted">Spend ceiling ($/day)<input name="daily_spend_ceiling_usd" defaultValue={limits.spendCeilingUsd} className="w-full mt-1" /></label>
          <label className="text-xs text-muted">Max analyses/day<input name="max_analyses_per_day" defaultValue={limits.maxAnalysesPerDay} className="w-full mt-1" /></label>
          <label className="text-xs text-muted">Free/user/day<input name="free_daily_fresh_analyses" defaultValue={limits.freeDailyFresh} className="w-full mt-1" /></label>
        </div>
        <button type="submit" className="btn btn-primary">Save</button>
        <p className="text-xs text-dim">Env defaults: ceiling ${e.DAILY_SPEND_CEILING_USD}, cap {e.MAX_ANALYSES_PER_DAY}, free {e.FREE_DAILY_FRESH_ANALYSES}. DB values override these live.</p>
      </form>
    </div>
  );
}
