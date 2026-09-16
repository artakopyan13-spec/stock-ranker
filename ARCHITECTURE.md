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
                                              alerts/detect.detectChanges vs previous verified analysis ──► Alert rows (unique key)
                                                                     ▼
                                         event "done" (full Analysis) ──► AnalysisView
```

## Nightly (batch mode)

```
cron 02:00  /api/cron/refresh ── planRefresh: fresh data for each watched symbol (≤ MAX_CRON_TICKERS)
                                   decideRefresh: skip unless new quarter / unseen news / price move / TTL expired
                                   messages.batches.create([...buildRequestParams(data)])   (50% price)
                                   RefreshRun{runKey=YYYY-MM-DD, batchId}  +  CronPayload{data snapshot per symbol}

cron 11:00  /api/cron/collect ── batch ended? ── for each result: finalize → verify → assemble → store → detectChanges
                                   sendPendingAlerts (sentAt null only)  →  sendDailyDigest (unique `${date}:${slug}`)
```

Idempotency: `RefreshRun.runKey` is unique per day; `Alert.key` = `symbol:type:analysisId`; `Digest.key` = `date:slug`;
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

`UsageLog` records every call with token counts and USD (`pricing.ts`). `assertDailyCap` blocks on-demand calls past
`MAX_ANALYSES_PER_DAY`; the cron slices watched symbols to `MAX_CRON_TICKERS`. `/admin/costs` shows daily spend, runs, alerts.

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
