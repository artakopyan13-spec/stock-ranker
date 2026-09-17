import type { StockData } from "@/lib/data/types";
import { DISCLAIMER, MODEL_OUTPUT_KEYS, type ModelOutput, type Verification, type VerificationCheck } from "@/lib/analysis/schema";

/**
 * Mirrors the skill's Step 6 before anything renders or is sent:
 * numbers reconcile, no placeholders, sources present, footer present, judgments consistent.
 * Runs on the model output + data (pre-assembly) so a failing run can be retried with feedback.
 */

const PLACEHOLDER = /\b(TODO|lorem ipsum|placeholder|XXX+|N\/A|\[insert[^\]]*\]|\{\{[^}]*\}\})\b/i;

/** Collects every numeric value the data contains, plus the scalings prose may use. */
function allowedNumbers(data: StockData): number[] {
  const out: number[] = [];
  const push = (v: number | null | undefined) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    out.push(v, v / 1e3, v / 1e6, v / 1e9, v / 1e12);
  };
  const walk = (v: unknown): void => {
    if (typeof v === "number") push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(data);
  // Derived figures the model is allowed to cite.
  const f = data.fundamentals;
  if (f.fcfTTM.value !== null && f.revenueTTM.value) push((f.fcfTTM.value / f.revenueTTM.value) * 100);
  if (f.cash.value !== null && f.totalDebt.value !== null) push(f.cash.value - f.totalDebt.value);
  const q = data.quote;
  if (q.price.value !== null && q.week52Low.value !== null && q.week52High.value !== null && q.week52High.value > q.week52Low.value) {
    push(((q.price.value - q.week52Low.value) / (q.week52High.value - q.week52Low.value)) * 100);
    push(((q.week52High.value - q.price.value) / q.price.value) * 100);
    push(((q.price.value - q.week52Low.value) / q.week52Low.value) * 100);
  }
  for (let i = 4; i < data.quarters.length; i++) {
    const now = data.quarters[i];
    const ago = data.quarters[i - 4];
    if (now.revenue !== null && ago.revenue) push(((now.revenue - ago.revenue) / Math.abs(ago.revenue)) * 100);
    if (now.fcf !== null && ago.fcf) push(((now.fcf - ago.fcf) / Math.abs(ago.fcf)) * 100);
  }
  for (const row of data.quarters) {
    if (row.revenue) {
      if (row.grossProfit !== null) push((row.grossProfit / row.revenue) * 100);
      if (row.operatingIncome !== null) push((row.operatingIncome / row.revenue) * 100);
      if (row.fcf !== null) push((row.fcf / row.revenue) * 100);
    }
  }
  return out;
}

/** Numbers with a money/percent/multiple unit in prose — the ones that must reconcile. */
const UNIT_NUMBER = /(?:\$|€|£|¥)\s?(\d[\d,]*(?:\.\d+)?)\s?([KMBT]|bn|mn|billion|million|trillion)?|(\d[\d,]*(?:\.\d+)?)\s?(%|x\b|×|[KMBT]\b|bn\b|mn\b|billion|million|trillion)/gi;

function unitScale(unit: string | undefined): number {
  switch ((unit ?? "").toLowerCase()) {
    case "k":
      return 1e3;
    case "m":
    case "mn":
    case "million":
      return 1e6;
    case "b":
    case "bn":
    case "billion":
      return 1e9;
    case "t":
    case "trillion":
      return 1e12;
    default:
      return 1;
  }
}

/** "above 70%", "north of $100B", "~20x": a threshold or approximation, not a cited figure. */
const COMPARATIVE = /(above|below|over|under|near|around|roughly|about|approximately|more than|less than|at least|up to|toward|towards|north of|south of|exceed(?:s|ed|ing)?|beyond|past|~)\s*$/i;

function isThreshold(text: string, index: number): boolean {
  return COMPARATIVE.test(text.slice(Math.max(0, index - 16), index));
}

function reconciles(n: number, allowed: number[]): boolean {
  if (n === 0) return true;
  const tol = Math.max(Math.abs(n) * 0.02, 0.06); // 2% or rounding to one decimal
  return allowed.some((a) => Math.abs(a - n) <= tol || Math.abs(Math.abs(a) - Math.abs(n)) <= tol);
}

function proseFields(m: ModelOutput): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ["summary", m.summary],
    ["fcfVerdictReason", m.fcfVerdictReason],
    ["valuation.peakOnPeakCyclical.reasoning", m.valuation.peakOnPeakCyclical.reasoning],
    ["business.whatItDoes", m.business.whatItDoes],
    ["business.bestAt", m.business.bestAt],
    ["business.moat.description", m.business.moat.description],
    ["thesis.bull", m.thesis.bull],
    ["thesis.bear", m.thesis.bear],
    ["thesis.primaryFailureMode", m.thesis.primaryFailureMode],
    ["rating.justification", m.rating.justification],
    ["forecast12m.bear.reasoning", m.forecast12m.bear.reasoning],
    ["forecast12m.base.reasoning", m.forecast12m.base.reasoning],
    ["forecast12m.bull.reasoning", m.forecast12m.bull.reasoning],
    ["tripwire.description", m.tripwire.description],
  ];
  if (m.capitalActions) out.push(["capitalActions", m.capitalActions]);
  if (m.newsScanNote) out.push(["newsScanNote", m.newsScanNote]);
  m.news.forEach((n, i) => out.push([`news[${i}].summary`, n.summary]));
  m.catalysts.forEach((c, i) => out.push([`catalysts[${i}].event`, c.event]));
  m.business.worksWith.forEach((w, i) => out.push([`business.worksWith[${i}].relationship`, w.relationship]));
  return out;
}

export function verifyModelOutput(data: StockData, m: ModelOutput): Verification {
  const checks: VerificationCheck[] = [];
  const ok = (id: string, cond: boolean, detail: string) => checks.push({ id, ok: cond, detail });

  // 1. Every top-level section present.
  const missing = MODEL_OUTPUT_KEYS.filter((k) => m[k] === undefined);
  ok("sections_present", missing.length === 0, missing.length ? `Missing: ${missing.join(", ")}` : "All sections present");

  // 2. No placeholder text.
  const placeholders = proseFields(m).filter(([, text]) => PLACEHOLDER.test(text)).map(([f]) => f);
  ok("no_placeholders", placeholders.length === 0, placeholders.length ? `Placeholder text in ${placeholders.join(", ")}` : "No placeholder text");

  // 3. Unit-bearing numbers in prose reconcile with the data.
  const allowed = allowedNumbers(data);
  const bad: string[] = [];
  for (const [field, text] of proseFields(m)) {
    for (const match of text.matchAll(UNIT_NUMBER)) {
      const rawNum = match[1] ?? match[3];
      const unit = match[1] !== undefined ? match[2] : match[4];
      if (!rawNum) continue;
      const n = Number(rawNum.replace(/,/g, ""));
      if (!Number.isFinite(n)) continue;
      const isPct = unit === "%";
      const isMultiple = unit === "x" || unit === "×";
      const scaled = isPct || isMultiple ? n : n * unitScale(unit);
      // Year-like and small ordinal numbers are not KPIs.
      if (!isPct && !isMultiple && unit === undefined && n < 100) continue;
      if (isThreshold(text, match.index ?? 0)) continue;
      if (!reconciles(scaled, allowed) && !reconciles(n, allowed)) bad.push(`${field}: "${match[0].trim()}"`);
    }
  }
  ok("numbers_reconcile", bad.length === 0, bad.length ? `Unreconciled figures — ${bad.slice(0, 6).join("; ")}` : "All cited figures match the data");

  // 4. Rating range and action consistency.
  const s = m.rating.score;
  const inRange = Number.isInteger(s) && s >= 1 && s <= 10;
  ok("rating_range", inRange, inRange ? `Score ${s}` : `Score ${s} is not an integer 1–10`);
  const a = m.rating.action;
  const consistent = !(s >= 7 && a === "SELL") && !(s <= 4 && a === "BUY") && !(s <= 2 && a !== "SELL");
  ok("rating_action_consistent", consistent, consistent ? `${s}/10 → ${a}` : `${s}/10 with ${a} violates the rubric`);

  // 5. Bear case at least as substantive as bull (rule 6).
  const bearLen = m.thesis.bear.trim().length;
  const bullLen = m.thesis.bull.trim().length;
  ok("bear_as_loud_as_bull", bearLen >= bullLen * 0.8, `bear ${bearLen} chars vs bull ${bullLen} chars`);

  // 6. Forecast ordering.
  const { bear, base, bull } = m.forecast12m;
  const ordered = bear.returnPct <= base.returnPct && base.returnPct <= bull.returnPct;
  ok("forecast_ordered", ordered, ordered ? "bear ≤ base ≤ bull" : `bear ${bear.returnPct} / base ${base.returnPct} / bull ${bull.returnPct}`);
  const sane = [bear, base, bull].every((f) => f.returnPct >= -100 && f.returnPct <= 500);
  ok("forecast_sane", sane, sane ? "Return ranges plausible" : "A forecast return is outside −100%…+500%");

  // 7. Catalysts dated (ISO or TBD with a source).
  const badCat = m.catalysts.filter((c) => !(/^\d{4}-\d{2}-\d{2}$/.test(c.date) || (c.date === "TBD" && c.dateSource)));
  ok("catalysts_dated", badCat.length === 0, badCat.length ? `${badCat.length} catalyst(s) lack a date or date source` : "All catalysts dated");

  // 8. News annotations refer only to provided items.
  const ids = new Set(data.news.map((n) => n.id));
  const unknown = m.news.filter((n) => !ids.has(n.id));
  ok("news_ids_known", unknown.length === 0, unknown.length ? `Model referenced unknown news ids: ${unknown.map((n) => n.id).join(", ")}` : "News annotations match provided items");
  ok("news_gap_stated", data.news.length > 0 || Boolean(m.newsScanNote), data.news.length ? "News present" : m.newsScanNote ? "No-news note present" : "No news and no newsScanNote");

  // 9. FCF headline: if FCF is negative the bear case must mention cash flow.
  const fcf = data.fundamentals.fcfTTM.value;
  const mentions = /cash\s?flow|fcf|cash burn|burning cash/i.test(`${m.thesis.bear} ${m.thesis.primaryFailureMode} ${m.fcfVerdictReason}`);
  ok("fcf_headline_risk", fcf === null || fcf >= 0 || mentions, fcf !== null && fcf < 0 ? (mentions ? "Negative FCF is named in the bear case" : "FCF is negative but the bear case does not mention cash flow") : "FCF not negative");

  // 10. Required judgment fields are non-empty.
  const empties = proseFields(m).filter(([, t]) => t.trim().length < 8).map(([f]) => f);
  ok("fields_nonempty", empties.length === 0, empties.length ? `Too short: ${empties.join(", ")}` : "All judgment fields filled");

  return { passed: checks.every((c) => c.ok), checks };
}

/** Post-assembly checks that need the full document (sources, footer). */
export function verifyAssembled(analysis: { sources: unknown[]; disclaimer: string; price: { current: { value: number | null; source: string } } }): VerificationCheck[] {
  return [
    { id: "sources_present", ok: analysis.sources.length > 0, detail: `${analysis.sources.length} source(s) listed` },
    { id: "disclaimer_present", ok: analysis.disclaimer === DISCLAIMER, detail: analysis.disclaimer === DISCLAIMER ? "Not-financial-advice footer present" : "Footer missing or altered" },
    { id: "price_sourced", ok: analysis.price.current.value === null || analysis.price.current.source.length > 0, detail: "Price carries a source" },
  ];
}

/** Human-readable failure summary used for the retry prompt and error states. */
export function failureSummary(v: Verification): string {
  return v.checks.filter((c) => !c.ok).map((c) => `- ${c.id}: ${c.detail}`).join("\n");
}
