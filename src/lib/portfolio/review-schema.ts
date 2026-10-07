import { z } from "zod";
import type { PositionNumbers } from "@/lib/portfolio/kpis";

// Every field below is deliberately forgiving. These sections are expensive to generate, and a
// single missing/odd field used to throw out the WHOLE array via the `.catch([])` defaults below —
// silently wiping entire dashboard sections (cards, actions). Now each field degrades on its own.
/** String that tolerates a missing value or a stray number. */
const S = z.preprocess((v) => (v === null || v === undefined ? "" : typeof v === "string" ? v : String(v)), z.string()).catch("");
/** Nullable number that tolerates "$1,234", "26x", "" and junk. */
const NN = z
  .preprocess((v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (v === null || v === undefined || v === "") return null;
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }, z.number().nullable())
  .catch(null);
/** Required number with a fallback. */
const NUM = (d: number) =>
  z
    .preprocess((v) => {
      if (typeof v === "number") return Number.isFinite(v) ? v : d;
      const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : d;
    }, z.number())
    .catch(d);
const BOOL = z.preprocess((v) => (typeof v === "boolean" ? v : v === "true" || v === 1), z.boolean()).catch(false);
const arr = <T extends z.ZodTypeAny>(item: T) => z.array(item).catch([]);

// Loose strings (validated leniently for raw-JSON parsing); the UI maps known values and defaults the rest.
export const Tone = S;
export const ActionKind = S;

const Theme = z.object({ label: S, pct: NUM(0), sub: S, tone: Tone });
const MacroBox = z.object({ h: S, p: S });
const EventItem = z.object({
  date: S, // YYYY-MM-DD or "TBD"
  type: S, // earnings/dividend/fed/macro/political/company/other
  impact: S, // high/med/low
  tickers: arr(S),
  title: S,
  watch: S,
  est: BOOL,
});
const Zone = z.object({
  t: S,
  strongBuyBelow: NN,
  buyBelow: NN,
  trimAbove: NN,
  sellAbove: NN,
  stopBelow: NN,
  basis: S,
});
const ActionRow = z.object({
  action: ActionKind,
  tone: Tone,
  position: S, // ticker
  size: S, // e.g. "trim 1/3", "hold full"
  why: S,
  tax: S.nullable().catch(null),
});
const IdeaPick = z.object({ t: S, name: S, why: S, numbers: S, risk: S });
const IdeaLeader = z.object({ t: S, name: S, perf1y: S, fwdPe: S, fcf: S, note: S });
const Idea = z.object({ sector: S, gap: S, picks: arr(IdeaPick), leaders: arr(IdeaLeader) });
const PlanAlloc = z.object({ name: S, amt: NUM(0), why: S });
const Tranche = z.object({ name: S, amt: NUM(0), window: S, buy: S, logic: S });
const Plan = z.object({ allocations: arr(PlanAlloc), tranches: arr(Tranche), noAdds: arr(S), why: S });

/** Per-position JUDGMENT (numbers come from code). Keyed by ticker `t`. */
const CardJudgment = z.object({
  t: S,
  tag: ActionKind,
  tone: Tone,
  rate: NUM(5), // 1-10
  one: S, // what it does, one line
  fcfHeadline: S, // e.g. "$39.4B TTM · 44% FCF margin"
  fcfExplanation: S,
  best: S, // what it's best at
  bull: S,
  bear: S,
  trip: S, // tripwire up/down
  cat: S, // next catalyst
  why: S, // one-line verdict
  fBear: NN,
  fBase: NN,
  fBull: NN,
});

/** Plain-language "Honest review" tab — no jargon, consistent with plan/zones/actions. */
const PerStockCall = z.object({ t: S, call: S, tone: Tone, line: S });
const HonestReview = z.object({
  grade: S, // letter grade
  gradeNote: S,
  summary: S, // 3-4 plain sentences
  good: arr(S), // what you're doing right
  bad: arr(S), // what worries me
  suggestions: arr(S), // imperative, html allowed
  perStock: arr(PerStockCall),
});
export type HonestReview = z.infer<typeof HonestReview>;

const EMPTY_REVIEW = { grade: "—", gradeNote: "", summary: "", good: [], bad: [], suggestions: [], perStock: [] };

/** The concrete, portfolio-specific plan to OUTPERFORM QQQ (Nasdaq-100). Benchmark-relative. */
const BeatMove = z.object({
  step: S, // the move, imperative + specific (ticker, size, trigger)
  edge: S, // WHY this creates alpha vs QQQ (lower overlap, better FCF/valuation, etc.)
});
export const BeatQQQ = z.object({
  verdict: S, // plain one-liner: are you realistically set up to beat QQQ, and why
  overlap: S, // how much this portfolio already looks like QQQ (its mega-cap tech core)
  gap: S, // the honest alpha gap — where you're most likely to LAG QQQ
  edges: arr(S), // genuine edges this portfolio has over the index
  moves: arr(BeatMove), // 3-5 concrete, portfolio-specific moves to beat QQQ
  risk: S, // the main way this plan underperforms QQQ instead
});
export type BeatQQQ = z.infer<typeof BeatQQQ>;
const EMPTY_BEATQQQ = { verdict: "", overlap: "", gap: "", edges: [], moves: [], risk: "" };

/** The full model output. Judgment only — code supplies every hard number.
 * `.catch` makes each field degrade to a safe default so one malformed field never discards the whole (expensive) generation. */
export const ReviewJudgment = z.object({
  headline: S,
  thesis: S,
  score: NUM(5),
  honestRead: S,
  review: HonestReview.catch(EMPTY_REVIEW),
  beatQQQ: BeatQQQ.catch(EMPTY_BEATQQQ),
  nextSteps: arr(S),
  themes: arr(Theme),
  macro: arr(MacroBox),
  events: arr(EventItem),
  zones: arr(Zone),
  actions: arr(ActionRow),
  ideas: arr(Idea),
  guardrails: arr(S),
  cards: arr(CardJudgment),
  plan: Plan.nullable().catch(null),
  sources: arr(S),
  unverified: S,
});
export type ReviewJudgment = z.infer<typeof ReviewJudgment>;

/**
 * The review is split into independent halves that are generated CONCURRENTLY, because one
 * combined call runs ~70s and the Vercel Hobby function cap is 60s. Per-position work is also
 * batched across several parallel calls so a large portfolio doesn't grow past the cap either.
 */
export const PositionsJudgment = z.object({
  cards: arr(CardJudgment),
  zones: arr(Zone),
  actions: arr(ActionRow),
  perStock: arr(PerStockCall),
});
export type PositionsJudgment = z.infer<typeof PositionsJudgment>;

export const PortfolioJudgment = z.object({
  headline: S,
  thesis: S,
  score: NUM(5),
  honestRead: S,
  review: HonestReview.omit({ perStock: true }).catch({ grade: "—", gradeNote: "", summary: "", good: [], bad: [], suggestions: [] }),
  beatQQQ: BeatQQQ.catch(EMPTY_BEATQQQ),
  nextSteps: arr(S),
  themes: arr(Theme),
  macro: arr(MacroBox),
  events: arr(EventItem),
  ideas: arr(Idea),
  guardrails: arr(S),
  plan: Plan.nullable().catch(null),
  sources: arr(S),
  unverified: S,
});
export type PortfolioJudgment = z.infer<typeof PortfolioJudgment>;

// ---------- assembled, stored shape (judgment + code numbers) ----------

export interface AllTimeClosed {
  t: string;
  pl: number;
  note: string | null;
}
export interface AllTime {
  netDeposits: number | null;
  realized: number | null;
  income: number | null;
  fees: number | null;
  accountValue: number | null;
  closed: AllTimeClosed[];
  insights: string[];
  footnote: string;
}

export interface ReviewCard {
  numbers: PositionNumbers;
  j: z.infer<typeof CardJudgment> | null;
}

export interface PortfolioReviewV2 {
  version: 2;
  headline: string;
  thesis: string;
  score: number;
  honestRead: string;
  review: HonestReview;
  beatQQQ: BeatQQQ;
  nextSteps: string[];
  themes: z.infer<typeof Theme>[];
  macro: z.infer<typeof MacroBox>[];
  events: z.infer<typeof EventItem>[];
  zones: z.infer<typeof Zone>[];
  actions: z.infer<typeof ActionRow>[];
  ideas: z.infer<typeof Idea>[];
  guardrails: string[];
  cards: ReviewCard[];
  plan: z.infer<typeof Plan> | null;
  alltime: AllTime | null;
  sources: string[];
  unverified: string;
  generatedAt: string;
  model: string;
}

export function isReviewV2(v: unknown): v is PortfolioReviewV2 {
  return typeof v === "object" && v !== null && (v as { version?: number }).version === 2;
}
