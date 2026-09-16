# Stock Ranker

Self-updating AI stock research and ranking app built on the [`stock-analysis`](stock-analysis/SKILL.md) skill.
Search a ticker → live data → the skill's framework via Claude → a verified, source-stamped analysis
(FCF first, bull and bear, catalysts, 1–10 rating, 12-month view, tripwire). Watchlists get re-analyzed
nightly, alerts fire on rating changes, and a morning digest lands in Telegram or email.

**This is a research notebook, not financial advice.** Ratings and forecasts are the model's judgment.

## How the skill's hard rules are enforced in code

| Skill rule | Enforcement |
|---|---|
| No invented numbers | Claude never emits a KPI. Every number is copied from the data adapter by code ([`assemble.ts`](src/lib/analysis/assemble.ts)); the model fills judgment fields only ([`ModelOutput`](src/lib/analysis/schema.ts)). The verifier rejects any unit-bearing figure in prose that does not reconcile with the data. |
| Source + date everything | Every figure is a `Sourced<number>` `{ value, source, url, asOf }`. `value: null` renders as "unverified". Price/news older than 7 days is flagged stale. |
| FCF is the #1 KPI | The ✅/⚠️/❌ verdict is computed from the data, rendered first, and negative/deteriorating FCF is the headline risk. |
| Label estimates | `rating.isEstimate` and `forecast12m.isEstimate` are literal `true`; the UI shows an "estimate · model judgment" badge. |
| Not financial advice | The disclaimer is a fixed literal checked verbatim by the verifier, on every page, alert, and digest. |
| Bear as loud as bull | Verifier requires the bear case to be at least 80% the length of the bull case. |
| Step 6 verification | [`verify.ts`](src/lib/analysis/verify.ts) runs before anything is stored, rendered, alerted, or served by the API. One automatic retry with feedback; failures are never published. |

## Quick start (local, zero keys)

```bash
npm install
cp .env.example .env            # defaults: sqlite, Yahoo Finance data, console alerts
npm run db:migrate              # creates dev.db
npm run dev                     # http://localhost:3000
```

Without `ANTHROPIC_API_KEY` the app fetches live data but cannot produce a new analysis. Add the key to `.env`
and search any ticker. The first analysis of a ticker costs roughly $0.14 on Opus 5 (about $0.06 on Sonnet 5).

## Configuration

Everything is in [`.env.example`](.env.example). The important knobs:

| Variable | Default | Purpose |
|---|---|---|
| `ANALYSIS_MODEL` | `claude-opus-5` | Model for the analysis. `claude-sonnet-5` cuts cost ~60%. |
| `ANALYSIS_EFFORT` | `medium` | Thinking depth. `high` for max quality, `low` for cheapest. |
| `DATA_PROVIDER` | `yahoo` | `yahoo` (no key), `fmp`, `finnhub`. Swappable adapters, one normalized schema. |
| `NEWS_WEB_SEARCH_FALLBACK` | `true` | Anthropic web search when the provider has no 7-day news (~$0.03/use). |
| `MAX_ANALYSES_PER_DAY` | `40` | Hard cap on on-demand model calls. |
| `MAX_CRON_TICKERS` | `20` | Hard cap on tickers per nightly refresh. |
| `SMART_REFRESH` | `true` | Only re-analyze when something changed (new filing, new news, price move ≥ `SMART_REFRESH_PRICE_MOVE_PCT`, or analysis older than `ANALYSIS_TTL_HOURS`). |
| `API_KEY` | — | Protects the JSON API. |
| `CRON_SECRET` | — | Vercel Cron authorization. |
| `ALERT_CHANNEL` | `console` | `telegram`, `email` (Resend), or `console`. |
| `DEMO_MODE` | `false` | Serve only the seeded demo tickers; zero model or data calls per visitor. |

## What's where

```
prompts/v1/                 versioned prompts (system, user template, news search)
stock-analysis/             the skill this app reproduces
src/lib/data/               adapters (yahoo, fmp, finnhub, fixture) → StockData
src/lib/analysis/           schema, assemble (data → sections), verify (Step 6), service (orchestration)
src/lib/ai/                 Anthropic client, pricing, streaming analysis, batch params, news search
src/lib/cron/               smart refresh, nightly batch submit, morning collect
src/lib/alerts/  digest/    change detection, channels, digest template (json/md/text/html)
src/app/api/                analyze (SSE), analysis/:ticker, rankings/:watchlist, digest/:watchlist,
                            cron/refresh, cron/collect, search, watchlists
src/app/                    pages: / (search), /t/:ticker, /w/:slug (rankings + compare), /s/:token (public), /admin/costs
tests/                      vitest: adapters, schema, verify, assemble, alerts, streaming, digest, e2e pipeline
```

## Pages

- `/` — search (ticker or company name), recent analyses, watchlists.
- `/t/NVDA` — streams the analysis: data-derived sections render instantly, model sections appear as they complete, then the verified document replaces them. "analyzed X ago · refresh".
- `/w/main` — ranked, sortable table (rating, FCF margin, growth, forward P/E); select 2–4 rows to compare side by side; "Analyze missing / stale".
- `/s/<token>` — public, read-only, edge-cached share page for a ticker's latest analysis.
- `/admin/costs` — daily spend, per-call token usage, cron runs, alerts.

## JSON API (send `x-api-key: $API_KEY`)

```bash
curl -H "x-api-key: $API_KEY" https://your-app.vercel.app/api/analysis/NVDA
curl -H "x-api-key: $API_KEY" "https://your-app.vercel.app/api/analysis/NVDA?refresh=1"   # force new analysis
curl -H "x-api-key: $API_KEY" "https://your-app.vercel.app/api/rankings/main?sort=fcfMarginPct&dir=desc"
curl -H "x-api-key: $API_KEY" "https://your-app.vercel.app/api/digest/main?format=md"     # json | md | text | html
```

The analysis document follows the [`Analysis`](src/lib/analysis/schema.ts) Zod schema. The digest JSON is the
reusable template for your briefing tool: `ranked[]`, `movers[]`, `newRisks[]`, `catalystsThisWeek[]`, `disclaimer`.

## Automation

- **Nightly refresh** (`/api/cron/refresh`, default 02:00 UTC): fetches fresh data for every watched ticker, applies the smart-refresh rule, and submits one Anthropic **Message Batch** (50% price). Idempotent per calendar day. `?mode=sync` analyzes inline instead (for Pro plans with long function timeouts).
- **Morning collect** (`/api/cron/collect`, default 11:00 UTC): stores + verifies batch results, diffs each against the previous analysis, sends queued alerts, then sends the digest. Every step is idempotent — runs flip status, alerts have a unique key and `sentAt`, digests a unique day key. Safe to re-run.
- **Alerts**: rating change, BUY/HOLD/SELL flip, tripwire triggered (the model judges the previous tripwire against new data), FCF turned negative. One line + link, with the disclaimer.

## Demo mode

```bash
npm run seed:demo          # once, with ANTHROPIC_API_KEY: analyzes NVDA AAPL TSLA MSFT AMD (~$0.70 on Opus 5)
git add data/demo && git commit -m "Seed demo analyses"
```

Deploy with `DEMO_MODE=true` and no keys: visitors get the five cached analyses, search is limited to them,
and nothing costs money per visit.

## Tests

```bash
npm test                   # 56 tests: adapters on real captured Yahoo data, schema, verifier, assembly,
                           # change detection, smart refresh, section streaming, digest, e2e NVDA pipeline
```

## Costs (Anthropic list prices, ~3.5k cached system + ~5k data + ~4.5k output tokens)

| Model | Per analysis | 20-ticker night (batch) | Month |
|---|---|---|---|
| Opus 5 | $0.14 | $1.40 | ~$42 |
| Sonnet 5 | $0.056 | $0.56 | ~$17 |

Smart refresh typically re-analyzes 30–40% of a list per night, which cuts these further. Live numbers are on `/admin/costs`.

## Design decisions and deviations

- **Yahoo Finance as the default provider.** It needs no key, has quarterly statements, TTM cash flow, and news, so the app works out of the box and demo seeding uses real data. It is an unofficial API; FMP and Finnhub adapters are included for production use.
- **Message Batches for the nightly run** instead of a long-running function: halves model cost and sidesteps Vercel's function timeout. The cost is a second cron to collect.
- **Prisma 7 with driver adapters** (better-sqlite3 locally, pg in prod). The schema template swaps the provider line at build time because Prisma does not allow env() there.
- **Prompts are bundled at build time** from `prompts/` into a generated TS module so serverless functions never read the filesystem.
- **No server-side refusal fallback** is configured; a refusal surfaces as a clear error rather than silently switching models. Enable it in `src/lib/ai/analyze.ts` if you prefer.
- **Out of v1**: the skill's multi-agent deep dive (equity research / risk / macro / devil's advocate / execution lenses). Planned for v2 as a second, opt-in analysis type on top of the same schema.

See [DEPLOY.md](DEPLOY.md) for Vercel + Postgres, [ARCHITECTURE.md](ARCHITECTURE.md) for the data flow.
