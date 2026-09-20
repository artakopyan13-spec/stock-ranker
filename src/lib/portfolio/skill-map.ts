import type { PortfolioReviewV2, ReviewCard } from "@/lib/portfolio/review-schema";
import type { EnrichedHolding } from "@/lib/portfolio/schema";
import type { Trend } from "@/lib/portfolio/kpis";
import type { SkillCard, SkillData, SkillTrend, Kv } from "@/lib/portfolio/skill-dashboard";

/** Scale a code-computed trend into the skill's bar format (money → $B, margins → percentage-points). */
function mapTrend(t: Trend, annual: boolean): SkillTrend {
  const isPct = t.unit === "%";
  const values = isPct ? t.values : t.values.map((v) => (v === null ? null : Math.round((v / 1e9) * 100) / 100));
  return {
    label: t.label,
    unit: isPct ? "%" : "$B",
    periods: t.periods,
    values,
    yoy: t.yoy && t.yoy.length ? t.yoy : undefined,
    fmt: "{:,.1f}",
    pct_points: isPct || undefined,
    note: annual ? null : t.note,
  };
}

function headlineKpis(card: ReviewCard): Kv[] {
  const byLabel = new Map<string, string>();
  for (const g of card.numbers.kgroups) for (const it of g.items) byLabel.set(it.label, it.value);
  const pick = (label: string): Kv | null => (byLabel.has(label) ? [label, byLabel.get(label) as string] : null);
  const cur = card.numbers.currency;
  const price = card.numbers.price;
  const out: Kv[] = [];
  if (price !== null) out.push(["Price", price < 100 ? `$${price.toFixed(2)}` : `$${Math.round(price).toLocaleString("en-US")}`]);
  for (const label of ["Mkt cap", "Fwd P/E", "P/FCF", "Rev TTM", "FCF margin", "Net cash/debt", "52-wk range"]) {
    const kv = pick(label);
    if (kv) out.push(kv);
  }
  void cur;
  return out.slice(0, 8);
}

const FCF_CLASS: Record<string, string> = { "✅": "✅", "⚠️": "⚠️", "❌": "❌", "—": "—" };

/** Turns the app's stored review + live holdings into the skill's data JSON for buildSkillDashboard. */
export function toSkillData(review: PortfolioReviewV2, holdings: EnrichedHolding[], opts: { newCashUsd: number; today: string }): SkillData {
  const holdBy = new Map(holdings.map((h) => [h.symbol, h]));

  const positions: SkillData["positions"] = [];
  const cards: SkillCard[] = review.cards.map((card): SkillCard => {
    const sym = card.numbers.symbol;
    const h = holdBy.get(sym);
    const price = card.numbers.price ?? h?.price ?? null;
    let owned = false;
    if (h && price !== null) {
      if (h.shares !== null && h.shares > 0) {
        positions.push({ t: sym, name: h.name ?? sym, shares: h.shares, avg: h.avgCost ?? price, price });
        owned = true;
      } else if (h.valueUsd !== null && h.valueUsd > 0) {
        positions.push({ t: sym, name: h.name ?? sym, shares: h.valueUsd / price, avg: price, price });
        owned = true;
      }
    }

    const j = card.j;
    const p = price ?? 0;
    const f: [number, number, number] = j && j.fBear !== null && j.fBase !== null && j.fBull !== null ? [j.fBear, j.fBase, j.fBull] : [p * 0.8, p, p * 1.2];
    const kgroups = card.numbers.kgroups.map((g) => ({ name: g.name, items: g.items.map((it) => (it.flag && it.flag !== "none" ? [it.label, it.value, it.flag] : [it.label, it.value])) }));
    const trends = card.numbers.trends.map((t) => mapTrend(t, false));
    const history = card.numbers.history.map((t) => mapTrend(t, true));

    return {
      t: sym,
      name: h?.name ?? sym,
      tag: j?.tag ?? "HOLD",
      tone: j?.tone ?? "gold",
      rate: j?.rate ?? 5,
      one: j?.one ?? "",
      k: headlineKpis(card),
      kgroups,
      trends,
      history,
      range52: card.numbers.range52,
      fcf: [FCF_CLASS[card.numbers.fcfIcon] ?? "—", j?.fcfHeadline ?? (card.numbers.fcfTtm !== null ? `${(card.numbers.fcfTtm / 1e9).toFixed(1)}B TTM` : "not verified"), j?.fcfExplanation ?? ""],
      best: j?.best ?? "",
      bull: j?.bull ?? "",
      bear: j?.bear ?? "",
      trip: j?.trip ?? "",
      cat: j?.cat ?? "",
      why: j?.why ?? "",
      f,
      watch: owned ? undefined : true,
      no_trends_reason: trends.length ? undefined : "no quarterly data available from the provider",
    };
  });

  const zones = review.zones.map((z) => {
    const price = review.cards.find((c) => c.numbers.symbol === z.t.toUpperCase())?.numbers.price ?? null;
    return { t: z.t.toUpperCase(), price, strong_buy_below: z.strongBuyBelow, buy_below: z.buyBelow, trim_above: z.trimAbove, sell_above: z.sellAbove, stop_below: z.stopBelow, basis: z.basis };
  });

  const events = review.events.map((e) => ({ date: e.date, type: e.type, impact: e.impact, tickers: e.tickers, title: e.title, watch: e.watch, est: e.est }));

  const plan = review.plan
    ? {
        allocations: review.plan.allocations.map((a) => ({ name: a.name, amt: a.amt, sub: a.why })),
        why: review.plan.why,
        no_adds: review.plan.noAdds,
        tranches: review.plan.tranches.map((t) => ({ name: t.name, amt: t.amt, window: t.window, buy: t.buy, logic: t.logic })),
      }
    : undefined;

  const ideas = review.ideas.map((idea) => ({
    sector: idea.sector,
    gap: idea.gap,
    picks: idea.picks.map((pk) => ({ t: pk.t, name: pk.name, why: pk.why, numbers: pk.numbers, risk: pk.risk })),
    leaders: idea.leaders.map((l) => ({ t: l.t, name: l.name, perf_1y: l.perf1y, fwd_pe: l.fwdPe, fcf: l.fcf, note: l.note })),
  }));

  const alltime = review.alltime
    ? {
        account_value: review.alltime.accountValue ?? 0,
        net_deposits: review.alltime.netDeposits ?? 0,
        realized: review.alltime.realized ?? 0,
        closed: review.alltime.closed.map((c) => ({ t: c.t, pl: c.pl, note: c.note ?? undefined })),
        insights: review.alltime.insights,
        footnote: review.alltime.footnote,
      }
    : undefined;

  return {
    meta: { title: "Portfolio review", eyebrow: "Portfolio review", headline: review.headline, thesis: review.thesis, build_date: opts.today, price_date: opts.today, new_cash: opts.newCashUsd, today: opts.today },
    positions,
    themes: review.themes.map((t) => ({ label: t.label, pct: t.pct, sub: t.sub, tone: t.tone })),
    honest_read: review.honestRead,
    macro: review.macro,
    plan,
    actions: review.actions.map((a) => ({ action: a.action, tone: a.tone, position: a.position, size: a.size, why: a.why, tax: a.tax ?? undefined })),
    ideas,
    guardrails: review.guardrails,
    cards,
    events,
    zones,
    review: {
      grade: review.review.grade,
      grade_note: review.review.gradeNote,
      summary: review.review.summary,
      good: review.review.good,
      bad: review.review.bad,
      suggestions: review.review.suggestions,
      per_stock: review.review.perStock.map((x) => ({ t: x.t, call: x.call, tone: x.tone, line: x.line })),
    },
    next_steps: review.nextSteps,
    sources: review.sources,
    unverified: review.unverified,
    alltime,
  };
}
