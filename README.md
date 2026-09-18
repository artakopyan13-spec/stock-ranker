# Stock Ranker

A public, multi-user AI stock research & ranking web app, built on the [`stock-analysis`](stock-analysis/SKILL.md)
skill. Anyone signs up, searches a ticker, and gets the full FCF-first analysis (rating, bull & bear, catalysts,
12-month view, tripwire) plus financials, interactive charts, a screener, compare, a leaderboard, and a nightly
auto-refresh. Every fresh analysis is shared across all users and quota-gated, so a public audience can't run up the bill.

**This is a research notebook, not financial advice.** Ratings and forecasts are the model's judgment.

## The cost design (why a stranger can't bankrupt you)

- **Global shared cache** — one analysis per ticker, seen by everyone. The 100th person to search NVDA pays nothing; they get the cached analysis with an "analyzed X ago" stamp. Cached views are unlimited and free.
- **A fresh (paid) analysis is the only thing that costs money, and it passes one gate** ([`gate.ts`](src/lib/quota/gate.ts)): login required → ban check → per-IP + per-user rate limit → **dollar spend kill switch** → **global daily cap** → **per-user daily quota**.
- **Bounded by design.** Spend scales with unique fresh analyses, not with users. `MAX_ANALYSES_PER_DAY` and `DAILY_SPEND_CEILING_USD` cap the total; past the ceiling, everyone gets cached results and a "high demand" notice — never an error. The [load test](tests/quota.test.ts) proves 1,000 users × 3 attempts can't exceed either cap.
- **Runtime controls, no redeploy.** The admin toggles the kill switch and changes the ceiling, cap, and quotas from `/admin`.

| Model | Per fresh analysis | 20-ticker night (batch) | 1,000 daily users |
|---|---|---|---|
| Sonnet 5 (default) | ~$0.056 | ~$0.56 | **bounded by the cap** (e.g. 200/day ≈ $11) |
| Opus 5 | ~$0.14 | ~$1.40 | bounded by the cap (e.g. 200/day ≈ $28) |

## Skill hard rules, enforced in code

| Rule | Enforcement |
|---|---|
| No invented numbers | Claude emits only judgment fields; code copies every number from the data adapter ([`assemble.ts`](src/lib/analysis/assemble.ts)). The verifier rejects any unit-bearing figure in prose that doesn't reconcile. |
| Source + date everything | Each figure is `{ value, source, url, asOf }`; `null` renders "unverified"; data > 7 days flagged stale. |
| FCF is #1 KPI | ✅/⚠️/❌ verdict computed from data, shown first; negative/deteriorating FCF is the headline risk. |
| Label estimates; bear as loud as bull | `isEstimate` literals + UI badge; verifier requires the bear case ≥ 80% of the bull length. |
| Not financial advice | Fixed disclaimer checked verbatim, on every page and at sign-in. |
| Step 6 verification | [`verify.ts`](src/lib/analysis/verify.ts) runs before anything is stored, rendered, or served. |

## Signature features (why it's more than a wrapper)

- **Investment committee** — five AI seats (Research, Risk, Macro, Devil's Advocate, Capital Allocation) debate a ticker from the *verified* analysis and a chair rules a score + BUY/HOLD/SELL. Genuine disagreement, a live debate, one decision rule. Cached and shared like an analysis.
- **AI track record** — every rating the app ever published, graded against today's price with **no model call**: priced calls, average return, a rating-vs-return scatter, the strong-minus-weak spread, and calibration by confidence. The app grades itself.
- **Time machine** — scrub the AI's rating history over the 5-year price and see the forward return since each call.
- **Ask this stock** — a grounded copilot that answers **only** from the analysis + financials on the page (with dates) and refuses to invent a number.
- **Portfolio X-ray** — paste holdings for an honest construction review: real concentration (HHI), the bets that secretly move together, weak free-cash-flow exposure, a build-quality score — then chat about it, grounded in your own positions' verified ratings.
- **Natural-language search** — one box: a ticker, "compare NVDA and AMD", or "cash machines under 20x FCF". Known tickers jump for free; everything else is parsed by a cheap model into a navigation. Every paid AI action shares the same spend ceiling + kill switch.

## Features (v1)

- **Search & analysis** — streamed section-by-section; data-derived sections render instantly, model sections as they complete.
- **Ticker tabs** — AI analysis · Committee · Ask this stock · Time machine · Financials (10yr IS/BS/CF, annual+quarterly) · Charts (price 1M–MAX, valuation history, revenue/FCF/margins/shares/debt-vs-cash) · Overview (description, key stats, ownership, insiders).
- **Rankings** — per-user watchlists, sortable scoreboard, analyze-all, compare in place.
- **Top Rated leaderboard** — highest rated / most searched, from the shared cache.
- **Screener** — filter the cache universe by rating, FCF margin, growth, P/E, P/FCF, market cap, sector; presets; saved screens.
- **Compare** — up to 5 tickers side by side (cached-only, no cost).
- **Calendar** — upcoming earnings + dated catalysts.
- **Accounts** — Google or local dev sign-in, profile, per-user quota badge.
- **Admin** — costs (top tickers/users), user list (ban, per-user quota), runtime kill switch / ceiling / cap / quota.
- **Automation** — nightly Message-Batch refresh of every watched ticker (one run serves all users watching it), "what changed" page, public share links.
- **Legal** — Terms, Privacy, cookie notice, disclaimer at sign-in.
- **Demo mode** — 5 pre-analyzed tickers, no keys, zero per-visitor cost.

## Quick start (local, zero keys for browsing data)

```bash
npm install
cp .env.example .env
# For local testing without Google: set AUTH_DEV_LOGIN=true and AUTH_SECRET in .env
npm run db:push          # creates dev.db
npm run dev              # http://localhost:3000
```

Financials, charts, screener, compare, and calendar work from Yahoo data with no keys. To run a **fresh AI analysis**
you need `ANTHROPIC_API_KEY`, and you must be signed in (quota is per account).

## What's where

```
prompts/v1/            versioned prompts
stock-analysis/        the skill this app reproduces
src/lib/data/          adapters (yahoo/fmp/finnhub/fixture) → StockData; company.ts → financials/charts/overview
src/lib/analysis/      schema, assemble, verify, service (orchestration + gate)
src/lib/quota/         gate, spend, settings (runtime), ratelimit — the cost-control spine
src/lib/ai/            Anthropic client, pricing, streaming, batch, news search
src/lib/cron/          smart refresh, nightly batch, morning collect
src/lib/{universe,screener,rankings,changes,watchlists}.ts
src/auth.ts            Auth.js v5 (Google + dev), admin role
src/app/               pages + API routes; src/components/ UI
tests/                 vitest incl. quota + 1,000-user load test
```

## Tests

```bash
npm test    # 70 tests incl. the load test proving the spend ceiling holds under 1,000 users
```

See [DEPLOY.md](DEPLOY.md) for Vercel + Postgres + Google OAuth, [ARCHITECTURE.md](ARCHITECTURE.md) for the data flow,
[PROGRESS.md](PROGRESS.md) for status and what's blocked on your secrets.

## Decisions (cheapest-viable, made for you)

- **Yahoo Finance keyless** for everything (analysis input, financials, charts, ownership). $0 data cost. FMP/Finnhub adapters remain swappable.
- **Sonnet 5** at low effort with hard prompt caching (env-switchable to Opus 5).
- **Auth.js v5 + Google** (free); local dev sign-in for testing; Turnstile CAPTCHA optional.
- **DB-backed quotas + rate limiter** (no paid Redis). Kill switch + quotas admin-editable at runtime.
- **Message Batches** for the nightly run (50% cost). **Postgres (Neon)** in prod, SQLite locally.
- **Screener runs over the shared-cache universe** — it grows as tickers get analyzed (free); a whole-market screen would need a paid data tier, noted in-app rather than faked.
- Out of v1: transcripts, copilot, Stripe, multi-agent deep dive — the quota/Setting layer is built so a paid tier is a small addition.
