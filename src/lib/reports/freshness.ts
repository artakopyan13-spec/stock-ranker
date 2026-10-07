/**
 * Choosing which cached AI report to serve (Deep Analysis, Earnings, Research, Macro).
 *
 * Two kinds of row coexist in each table:
 *  - mode "web":       built by the off-Vercel worker with live web search (sourced, current)
 *  - mode "knowledge": built on demand inside a 60s Vercel function, from model knowledge only
 * The newest row is NOT necessarily the best one: an on-demand rebuild used to overwrite a fresh
 * web-verified report with a weaker knowledge-only one for every visitor until it expired. And rows
 * written by an older prompt (e.g. ones with blank "—" figures) must read as outdated rather than
 * being served as current for the rest of their cache lifetime.
 */
export type ReportMode = "web" | "knowledge";

export interface ReportRow {
  payload: string;
  createdAt: Date;
  mode: string;
  promptVersion: number;
}

export interface ReportMeta {
  /** How the figures were sourced — drives the label shown to users. */
  mode: ReportMode;
  /** When this report was built (ISO). NOT the date of the underlying figures. */
  builtAt: string;
  /** Built by an older prompt than the current one; offer a rebuild. */
  outdated: boolean;
  /** Past its cache lifetime. */
  expired: boolean;
}

/** Rows to load per key when picking the best one. */
export const CANDIDATE_ROWS = 8;

export const asMode = (m: string): ReportMode => (m === "web" ? "web" : "knowledge");

export function isCurrent(row: ReportRow, version: number, ttlMs: number, now = Date.now()): boolean {
  return row.promptVersion >= version && now - row.createdAt.getTime() < ttlMs;
}

/**
 * Best row to show, given candidates sorted newest-first:
 *   1. a current web-verified row (sourced beats unsourced)
 *   2. otherwise any current row
 *   3. otherwise the newest row at all (served, but flagged expired/outdated)
 */
export function pickBest<R extends ReportRow>(rows: R[], version: number, ttlMs: number, now = Date.now()): R | null {
  return (
    rows.find((r) => asMode(r.mode) === "web" && isCurrent(r, version, ttlMs, now)) ??
    rows.find((r) => isCurrent(r, version, ttlMs, now)) ??
    rows[0] ??
    null
  );
}

export function metaOf(row: ReportRow, version: number, ttlMs: number, now = Date.now()): ReportMeta {
  return {
    mode: asMode(row.mode),
    builtAt: row.createdAt.toISOString(),
    outdated: row.promptVersion < version,
    expired: now - row.createdAt.getTime() >= ttlMs,
  };
}
