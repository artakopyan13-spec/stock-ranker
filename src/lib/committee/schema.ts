import { z } from "zod";
import { Action, Confidence } from "@/lib/analysis/schema";

/** The five fixed committee seats. Each is a distinct analytical lens. */
export const SEATS = [
  { id: "research", name: "Research", brief: "Fundamentals: growth durability, margins, free cash flow quality, competitive moat." },
  { id: "risk", name: "Risk", brief: "What breaks the thesis: leverage, dilution, cyclicality, customer concentration, valuation downside." },
  { id: "macro", name: "Macro", brief: "Rates, cycle, sector rotation, policy and demand backdrop the company sits inside." },
  { id: "devil", name: "Devil's Advocate", brief: "Argues the opposite of the emerging consensus and attacks the weakest link in it." },
  { id: "capital", name: "Capital Allocation", brief: "Management's use of cash: buybacks, M&A, capex discipline, insider alignment." },
] as const;

export type SeatId = (typeof SEATS)[number]["id"];
export const SEAT_IDS = SEATS.map((s) => s.id) as [SeatId, ...SeatId[]];

export const Stance = z.enum(["bull", "bear", "neutral"]);
export type Stance = z.infer<typeof Stance>;

export const SeatOpinion = z.object({
  seat: z.enum(SEAT_IDS),
  stance: Stance,
  headline: z.string(), // one-line position
  argument: z.string(), // 2-4 sentences, referencing figures from the brief
  keyPoints: z.array(z.string()), // 2-3 crisp bullets
  score: z.number(), // this seat's own 1-10 conviction
  vote: Action,
});
export type SeatOpinion = z.infer<typeof SeatOpinion>;

export const DebateTurn = z.object({
  from: z.enum(SEAT_IDS),
  to: z.enum(SEAT_IDS),
  challenge: z.string(),
});

/** What the model returns. Judgment/opinion only — it cites figures from the analysis, invents none. */
export const CommitteeOutput = z.object({
  opinions: z.array(SeatOpinion), // one per seat
  debate: z.array(DebateTurn), // 2-4 sharp exchanges
  chair: z.object({
    decisionRule: z.string(), // e.g. "upgrade only if two lenses agree AND it survives the devil's advocate"
    synthesis: z.string(), // the reasoned verdict
    dissent: z.string(), // the strongest surviving objection
    finalScore: z.number(), // 1-10
    finalAction: Action,
    confidence: Confidence,
  }),
});
export type CommitteeOutput = z.infer<typeof CommitteeOutput>;

/** Stored/served shape: the model output plus provenance. */
export const CommitteeReport = CommitteeOutput.extend({
  symbol: z.string(),
  companyName: z.string(),
  basedOnAnalysisAt: z.string().nullable(),
  model: z.string(),
  createdAt: z.string(),
});
export type CommitteeReport = z.infer<typeof CommitteeReport>;

export const SEAT_NAME: Record<SeatId, string> = Object.fromEntries(SEATS.map((s) => [s.id, s.name])) as Record<SeatId, string>;
