import { z } from "zod";
import type { PositionNumbers } from "@/lib/portfolio/kpis";

// Loose strings (validated leniently for raw-JSON parsing); the UI maps known values and defaults the rest.
export const Tone = z.string();
export const ActionKind = z.string();

const Theme = z.object({ label: z.string(), pct: z.number(), sub: z.string(), tone: Tone });
const MacroBox = z.object({ h: z.string(), p: z.string() });
const EventItem = z.object({
  date: z.string(), // YYYY-MM-DD or "TBD"
  type: z.string(), // earnings/dividend/fed/macro/political/company/other
  impact: z.string(), // high/med/low
  tickers: z.array(z.string()),
  title: z.string(),
  watch: z.string(),
  est: z.boolean(),
});
const Zone = z.object({
  t: z.string(),
  strongBuyBelow: z.number().nullable(),
  buyBelow: z.number().nullable(),
  trimAbove: z.number().nullable(),
  sellAbove: z.number().nullable(),
  stopBelow: z.number().nullable(),
  basis: z.string(),
});
const ActionRow = z.object({
  action: ActionKind,
  tone: Tone,
  position: z.string(), // ticker
  size: z.string(), // e.g. "trim 1/3", "hold full"
  why: z.string(),
  tax: z.string().nullable(),
});
const IdeaPick = z.object({ t: z.string(), name: z.string(), why: z.string(), numbers: z.string(), risk: z.string() });
const IdeaLeader = z.object({ t: z.string(), name: z.string(), perf1y: z.string(), fwdPe: z.string(), fcf: z.string(), note: z.string() });
const Idea = z.object({ sector: z.string(), gap: z.string(), picks: z.array(IdeaPick), leaders: z.array(IdeaLeader) });
const PlanAlloc = z.object({ name: z.string(), amt: z.number(), why: z.string() });
const Tranche = z.object({ name: z.string(), amt: z.number(), window: z.string(), buy: z.string(), logic: z.string() });
const Plan = z.object({ allocations: z.array(PlanAlloc), tranches: z.array(Tranche), noAdds: z.array(z.string()), why: z.string() });

/** Per-position JUDGMENT (numbers come from code). Keyed by ticker `t`. */
const CardJudgment = z.object({
  t: z.string(),
  tag: ActionKind,
  tone: Tone,
  rate: z.number(), // 1-10
  one: z.string(), // what it does, one line
  fcfHeadline: z.string(), // e.g. "$39.4B TTM · 44% FCF margin"
  fcfExplanation: z.string(),
  best: z.string(), // what it's best at
  bull: z.string(),
  bear: z.string(),
  trip: z.string(), // tripwire up/down
  cat: z.string(), // next catalyst
  why: z.string(), // one-line verdict
  fBear: z.number().nullable(),
  fBase: z.number().nullable(),
  fBull: z.number().nullable(),
});

/** Plain-language "Honest review" tab — no jargon, consistent with plan/zones/actions. */
const PerStockCall = z.object({ t: z.string(), call: z.string(), tone: Tone, line: z.string() });
const HonestReview = z.object({
  grade: z.string(), // letter grade
  gradeNote: z.string(),
  summary: z.string(), // 3-4 plain sentences
  good: z.array(z.string()), // what you're doing right
  bad: z.array(z.string()), // what worries me
  suggestions: z.array(z.string()), // imperative, html allowed
  perStock: z.array(PerStockCall),
});
export type HonestReview = z.infer<typeof HonestReview>;

const EMPTY_REVIEW = { grade: "—", gradeNote: "", summary: "", good: [], bad: [], suggestions: [], perStock: [] };

/** The full model output. Judgment only — code supplies every hard number.
 * `.catch` makes each field degrade to a safe default so one malformed field never discards the whole (expensive) generation. */
export const ReviewJudgment = z.object({
  headline: z.string().catch(""),
  thesis: z.string().catch(""),
  score: z.number().catch(5),
  honestRead: z.string().catch(""),
  review: HonestReview.catch(EMPTY_REVIEW),
  nextSteps: z.array(z.string()).catch([]),
  themes: z.array(Theme).catch([]),
  macro: z.array(MacroBox).catch([]),
  events: z.array(EventItem).catch([]),
  zones: z.array(Zone).catch([]),
  actions: z.array(ActionRow).catch([]),
  ideas: z.array(Idea).catch([]),
  guardrails: z.array(z.string()).catch([]),
  cards: z.array(CardJudgment).catch([]),
  plan: Plan.nullable().catch(null),
  sources: z.array(z.string()).catch([]),
  unverified: z.string().catch(""),
});
export type ReviewJudgment = z.infer<typeof ReviewJudgment>;

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
