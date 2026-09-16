# Architecture

## Data flow (on demand)

```
/t/NVDA ──► AnalysisStream (client) ──POST /api/analyze (SSE)──► service.getOrCreateAnalysis
                                                                     │
                       cached & fresh? ──► done                      │
                                                                     ▼
                                              data/index.getStockData (RawSnapshot cache, 15 min)
                                                                     │ adapter: yahoo | fmp | finnhub | fixture
                                                                     ▼
                                              StockData (every figure = { value, source, url, asOf })
                                                                     │
                                         event "data" ◄── assemble.deriveDataSections (price, valuation, growth,
                                                                     │  FCF verdict/trend, balance sheet, staleness)
                                            news empty? ──► ai/news-search (Sonnet 5 + web_search, cheap)
                                                                     ▼
                                              ai/analyze.analyzeStreaming (Opus 5, structured output = ModelOutput)
                                         event "section" ◄── SectionStreamer emits each top-level key as it completes
                                                                     ▼
                                              verify.verifyModelOutput  ──fail──► retry once with feedback ──fail──► 422, not published
                                                                     ▼
                                              assemble.assembleAnalysis (numbers from data, judgment from model,
                                                price targets from returnPct × price, band from score, sources list)
                                                                     ▼
                                              verify.verifyAssembled (sources, footer) ──► Analysis row (verified=true)
                                                                     ▼
                                              changes/detect.detectChanges vs previous verified analysis ──► Change rows (unique key)
                                                                     ▼
                                         event "done" (full Analysis) ──► AnalysisView
```

## Nightly (batch mode)

```
cron 02:00  /api/cron/refresh ── planRefresh: fresh data for each watched symbol (≤ MAX_CRON_TICKERS)
                                   decideRefresh: skip unless new quarter / unseen news / price move / TTL expired
                                   messages.batches.create([...buildRequestParams(data)])   (50% price)
                                   RefreshRun{runKey=YYYY-MM-DD, batchId}  +  CronPayload{data snapshot per symbol}

cron 11:00  /api/cron/collect ── batch ended? ── for each result: finalize → verify → assemble → store → recordChanges
```

Idempotency: `RefreshRun.runKey` is unique per day; `Change.key` = `symbol:type:analysisId`;
collect skips a symbol whose cron analysis already exists for the run. Re-running any route is safe.

## Schema split: what the model may and may not produce

`ModelOutput` (Claude): valuation lens + peak-cycle flag, FCF verdict reason, capital-actions note, news annotations
(by id), business, thesis, catalysts, rating (score/action/justification/confidence), forecast (percent returns),
tripwire, data concerns, previous-tripwire verdict. **Only four numbers exist in it**: the score and three returns.

`Analysis` (rendered): everything above merged with data-derived sections. Every KPI is `Sourced`. Price targets,
bands, FCF verdict, trends, positions, dilution, net cash, staleness are computed in `assemble.ts`.

## Caching

| Layer | TTL | Where |
|---|---|---|
| Raw provider data | `RAW_CACHE_MINUTES` (15) | `RawSnapshot` |
| Analysis | `ANALYSIS_TTL_HOURS` (24) or until cron refresh | `Analysis` (all versions kept for diffs) |
| Public share page | 1 h edge, 24 h stale-while-revalidate | `/s/:token` headers |
| Prompt prefix | 5-minute Anthropic cache | `cache_control` on the system block |

## Cost guardrails

`UsageLog` records every call with token counts, USD, and userId (`pricing.ts`). The gate (below) enforces the global
cap and dollar ceiling; the cron slices watched symbols to `MAX_CRON_TICKERS`. `/admin/costs` shows daily spend, top tickers/users, runs.

## Adapter interface

```ts
interface DataAdapter {
  name: string;
  search(query: string): Promise<SymbolMatch[]>;
  fetch(symbol: string): Promise<StockData>;
}
```

Each adapter has a pure `normalizeX(symbol, raw, now)` function that tests exercise on fixtures (`tests/fixtures/yahoo_NVDA.json`
is a real capture). The `fixture` adapter serves that capture for offline development and the end-to-end test.

## v2 (not built)

The skill's multi-agent deep dive: five lenses (equity research, risk, macro, devil's advocate, execution/tax) as
separate structured calls, a synthesis step with the "≥2 lenses + survives devil's advocate" rule, and a CONFIRM/RESIZE/
REPLACE/SELL scorecard. It fits as an optional second analysis type stored alongside the standard one.

## Cost-control gate (public multi-user)

```
POST /api/analyze  ── per-IP rate limit ──► service.getOrCreateAnalysis({ userId, ip })
                                               │
              shared cache fresh? ──► serve cached (free, unlimited, any user)
                                               │ else a fresh (paid) analysis is wanted
                                               ▼
                     quota/gate.gateFreshAnalysis  (the ONLY place spend can grow)
                       login required → banned? → per-user + per-IP rate limit
                       → manual kill switch (Setting) → spendToday ≥ ceiling
                       → analysesToday ≥ global cap → per-user daily quota
                                               │
                 deny → cached analysis exists? ──► serve it + "notice"  (never an error)
                                               │        else FreshAnalysisDeniedError → soft notice
                 allow → fetch → stream model → verify → store → detect "what changed"
                                               │
                         logUsage(..., userId)  → UsageLog (per-user + per-ticker spend)
```

Runtime limits come from `quota/settings.effectiveLimits()` — DB `Setting` rows (admin-editable) over env defaults.
The nightly cron also checks the kill switch + ceiling before submitting. The 1,000-user load test drives this gate
directly and asserts `analysesToday ≤ cap` and `spendToday ≤ ceiling + one analysis`.

## Company data (Financials / Charts / Overview tabs)

`data/company.ts` (pure normalizers) + `data/company-source.ts` (Yahoo fetch, cached in RawSnapshot: `company` 24h,
`prices:<range>` 1h; fixtures in demo/test). Valuation history is computed from year-end price × shares vs each year's
reported fundamentals — approximate, labeled as such. Never triggers a Claude call.

## Multi-user

Auth.js v5 (`src/auth.ts`) with Google + a local dev provider; JWT sessions; admin role from `ADMIN_EMAILS`.
Watchlists and saved screens carry a `userId`; the shared cache (Ticker/Analysis) is global. `universe.ts` reads
every ticker's latest verified analysis into rows for the leaderboard and screener.
