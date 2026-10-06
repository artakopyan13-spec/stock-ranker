/**
 * Off-Vercel refresh worker — run by GitHub Actions (see docs/worker-refresh.yml.txt).
 *
 * Why this exists: the live, web-verified versions of the macro briefing, industry research, deep
 * analyses and earnings reports each run an agentic web-search loop that takes 2–5 minutes. Vercel
 * Hobby caps every function (routes AND crons) at 60s, so those refreshes can't run on Vercel at
 * all. A GitHub Actions runner has no such cap, so it runs the SAME `refresh*System(…, web=true)`
 * functions here and writes the rich results straight to the production database. The app's
 * on-demand buttons use the fast knowledge-only path; this keeps the cached copies web-verified.
 *
 * Cost safety: every call goes through the same kill-switch + daily spend-ceiling guards the app
 * uses; this worker refreshes only a small rotating slice per run and stops the moment a guard trips.
 *
 *   tsx scripts/worker-refresh.ts          # do the refresh
 *   tsx scripts/worker-refresh.ts --dry    # print the plan only; no AI calls, no cost
 */
import "dotenv/config";
import { refreshMacroBriefSystem } from "../src/lib/macro/brief";
import { refreshResearchSystem, POPULAR_INDUSTRIES } from "../src/lib/research/run";
import { refreshDeepSystem, staleWatchedDeepSymbols } from "../src/lib/deep/run";
import { refreshEarningsSystem } from "../src/lib/earnings/run";

const DRY = process.argv.includes("--dry");
const RESEARCH_PER_RUN = Number(process.env.WORKER_RESEARCH_PER_RUN || 2);
const SYMBOLS_PER_RUN = Number(process.env.WORKER_SYMBOLS_PER_RUN || 3);

const started = Date.now();
const log = (...a: unknown[]) => console.log(`[worker +${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);
const tripped = (r?: string) => r === "spend_ceiling" || r === "kill_switch";

async function main(): Promise<void> {
  log(DRY ? "DRY RUN — no AI calls" : "LIVE refresh (web-verified)");

  // 1) Macro briefing — the time-sensitive one; refresh every run.
  if (DRY) log("would refresh: macro (web)");
  else {
    const r = await refreshMacroBriefSystem(true);
    log("macro", r);
    if (tripped(r.reason)) return log("cost guard tripped — stopping");
  }

  // 2) Industry research — a rotating slice so the whole set stays fresh across the day.
  const h = new Date().getUTCHours();
  const industries = Array.from({ length: Math.min(RESEARCH_PER_RUN, POPULAR_INDUSTRIES.length) }, (_, i) => POPULAR_INDUSTRIES[(h + i) % POPULAR_INDUSTRIES.length]);
  for (const ind of industries) {
    if (DRY) { log("would refresh: research", ind, "(web)"); continue; }
    const r = await refreshResearchSystem(ind, true);
    log("research", ind, r);
    if (tripped(r.reason)) return log("cost guard tripped — stopping");
  }

  // 3) Watched stocks whose deep analysis has gone stale — deep + earnings, web-verified, capped.
  const symbols = (await staleWatchedDeepSymbols(SYMBOLS_PER_RUN)).slice(0, SYMBOLS_PER_RUN);
  log("stale watched symbols:", symbols.join(", ") || "(none)");
  for (const s of symbols) {
    if (DRY) { log("would refresh: deep + earnings", s, "(web)"); continue; }
    const d = await refreshDeepSystem(s, true);
    log("deep", s, d);
    if (tripped(d.reason)) return log("cost guard tripped — stopping");
    const e = await refreshEarningsSystem(s, true);
    log("earnings", s, e);
    if (tripped(e.reason)) return log("cost guard tripped — stopping");
  }

  log("done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[worker] fatal:", err);
    process.exit(1);
  });
