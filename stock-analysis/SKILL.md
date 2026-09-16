---
name: stock-analysis
description: >-
  Generate a beautiful, self-contained interactive HTML dashboard that analyzes
  one or more stocks well enough to make a real buy / hold / sell decision. Pulls
  LIVE data (every number sourced and dated) for price, market cap, valuation
  multiples, revenue growth, and free cash flow — FCF is the #1 KPI — then adds
  what the company does, its differentiation, partners, risks/failure modes,
  catalysts, a 1–10 rating, and a 12-month forecast (bear/base/bull). Use this
  skill whenever the user wants to analyze, research, rate, value, or compare
  stocks, or decide whether to invest. Triggers include: "analyze [ticker]",
  "should I buy/sell X", "rate this stock", "is X a good investment", "build a
  stock dashboard", "compare these stocks", "stock/portfolio analysis",
  "research [company] for investing", or pasting a list of tickers.
---

# Stock Analysis → Interactive HTML Dashboard

## What this skill does

Turns a ticker (or a list of tickers, or a portfolio) into one self-contained,
offline-capable, mobile-responsive HTML dashboard that contains everything needed
to decide whether the stock is worth investing in: live-verified KPIs, plain-English
explanation of the business, differentiation, risks, catalysts, a transparent 1–10
rating, and a 12-month forecast. Default output is the **HTML dashboard**. A short
chat summary of the conclusion is given alongside the file.

## Hard rules (non-negotiable)

1. **No invented numbers.** Every price, market cap, multiple, growth rate, and FCF
   figure must come from a live web source. If a number can't be verified, say so in
   the card — do not guess or fill from memory.
2. **Source + date everything.** Each data point carries its source and the date it
   was published/observed. Prefer data ≤ 7 days old for prices/news; flag anything
   staler. Stamp the dashboard with the build date.
3. **FCF is the #1 KPI.** Always surface free cash flow with a ✅/❌ verdict. Explicitly
   flag any name where FCF is negative or deteriorating — that is the headline risk.
4. **Label estimates as estimates.** Forecasts and ratings are clearly marked as the
   author's judgment, not fact.
5. **Not financial advice.** Every dashboard footer states this is a research notebook,
   not financial advice. Keep that line in.
6. **Default is honesty over hype.** Name the bear case as loudly as the bull case.
   Cyclicals at peak-multiple-on-peak-earnings get flagged as such.

## Workflow

Run these steps in order. Use `WebSearch` / web fetch aggressively in step 2 (load via
ToolSearch if the tools are deferred). If broker/market MCP connectors are available, use
them for prices.

**1. Scope.** Confirm the ticker(s) and the lens: single-stock deep dive, multi-stock
compare, or portfolio with dollar allocations. Note horizon (default 12 months) and any
constraints (account type, conviction sizing). Don't over-ask — if the user gave tickers,
proceed.

**2. Gather live data** for each name (see `references/analysis_framework.md` for the full
checklist). At minimum: current price + day/52-wk context, market cap, trailing & forward
P/E (or relevant multiple), latest-quarter revenue growth, **free cash flow** (level, margin,
trend), balance-sheet posture (net cash/debt), and any material news from the last 7 days
(earnings, guidance, downgrades, secondary offerings, insider selling, M&A, regulatory).

**3. Analyze** each name against the framework: what it does (1 sentence), what it's best at,
who it works with (named partners), differentiation/moat, the bull thesis and the strongest
bear case, primary failure mode, and near-term catalysts with dates.

**4. Rate** each name 1–10 with a one-line justification and a BUY / HOLD / SELL (or
ACCUMULATE / WAIT / AVOID) tag, plus a 12-month bear/base/bull view. Use the rubric in
`references/analysis_framework.md`. The default for a thinly-supported change is the more
conservative call.

**5. Build the HTML dashboard** following `references/html_style_guide.md` exactly — dark
theme, expandable cards, animated SVG charts, the specified palette, one self-contained file,
no external libraries, works offline, mobile-responsive.

**6. Verify** before presenting: numbers reconcile, allocations (if any) sum correctly, no
stray placeholder text, JS has no syntax errors, every claim has a source, the not-advice
footer is present. Then present the file and give a tight chat summary of the verdict.

## Rating rubric (1–10)

- **9–10** — Elite FCF, durable moat, accelerating fundamentals, reasonable valuation. Rare.
- **7–8** — Strong business, positive FCF, clear thesis; valuation or cyclicality caps it.
- **5–6** — Real business but a live concern (cyclical FCF, rich multiple, single-customer
  risk, secular question). HOLD-type.
- **3–4** — Cash-burning or structurally challenged; speculative / lottery-sized only.
- **1–2** — Broken thesis or red flags; AVOID.

State the single biggest thing that would move the rating up or down (the tripwire).

## Output & packaging

- Write the dashboard to the outputs folder as a single `.html` file named for the subject
  (e.g. `nvda_analysis.html` or `portfolio_dashboard.html`).
- Present it with the file-sharing tool and follow with a 3–6 line chat verdict.
- Keep the disclaimer in the file and in chat: this is research, not financial advice.

## References

- `references/analysis_framework.md` — the full KPI checklist, what to verify, the card
  field list, ratings, and the multi-agent deep-dive option for high-stakes decisions.
- `references/html_style_guide.md` — exact visual spec, palette, card/section structure,
  and SVG chart patterns so every dashboard looks consistent.
