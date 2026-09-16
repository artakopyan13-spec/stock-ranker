# Deploy to Vercel

## 1. Database (free Postgres)

Create a database on [Neon](https://neon.tech) or [Supabase](https://supabase.com) and copy the connection string
(pooled is fine; include `?sslmode=require`).

## 2. Vercel project

```bash
npm i -g vercel
vercel login
vercel link          # in this repo
```

Set environment variables (Production, and Preview if you use it):

```bash
vercel env add DATABASE_PROVIDER    # postgresql
vercel env add DATABASE_URL         # postgresql://...
vercel env add ANTHROPIC_API_KEY
vercel env add API_KEY              # any long random string
vercel env add CRON_SECRET          # any long random string — Vercel sends it as a Bearer token to cron routes
vercel env add APP_URL              # https://<your-app>.vercel.app
vercel env add ALERT_CHANNEL        # telegram | email | console
vercel env add TELEGRAM_BOT_TOKEN   # if telegram (create via @BotFather; chat id via @userinfobot)
vercel env add TELEGRAM_CHAT_ID
vercel env add RESEND_API_KEY       # if email
vercel env add ALERT_EMAIL_TO
vercel env add ANALYSIS_MODEL       # claude-opus-5 (default) or claude-sonnet-5
vercel env add DIGEST_WATCHLIST     # slug of the watchlist to digest (default: main)
```

Optional: `DATA_PROVIDER=fmp` + `FMP_API_KEY`, `MAX_ANALYSES_PER_DAY`, `MAX_CRON_TICKERS`, `DEMO_MODE`.

## 3. Build command

In the Vercel project settings set **Build Command** to:

```
npm run vercel-build
```

It generates the Prisma schema for Postgres, bundles prompts, runs `prisma migrate deploy`, loads any
committed demo analyses, and builds Next.js.

## 4. Deploy

```bash
vercel --prod
```

## 5. Cron

[`vercel.json`](vercel.json) schedules two daily crons (Hobby plan allows two):

| Path | Default (UTC) | What |
|---|---|---|
| `/api/cron/refresh` | 02:00 | submit the nightly batch |
| `/api/cron/collect` | 11:00 | collect, verify, alert, digest |

Change the times in `vercel.json` (cron syntax, UTC). Batches usually finish within an hour; the collect step
simply reports `pending` and retries next day if not, and you can hit it manually any time:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/collect
```

Vercel's Hobby plan runs crons once per day at best-effort times within the hour; Pro allows per-minute schedules.
If you are on Pro and prefer synchronous processing, point the refresh cron at `/api/cron/refresh?mode=sync`
and drop the collect cron's batch step (it still sends alerts and the digest).

## 6. First run

1. Open the site, create a watchlist (e.g. `main`), click **Analyze missing / stale**.
2. Trigger the cron once by hand to confirm auth and the alert channel:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/refresh`
3. Check `/admin/costs`.

## Demo / portfolio deployment

Run `npm run seed:demo` locally once (needs `ANTHROPIC_API_KEY`), commit `data/demo/`, and deploy a second
Vercel project with `DEMO_MODE=true` and only `DATABASE_URL` + `DATABASE_PROVIDER` set. The seed step in
`vercel-build` loads the five analyses; no other keys are needed and visitors cost nothing.

## Local Postgres instead of SQLite

```bash
DATABASE_PROVIDER=postgresql DATABASE_URL=postgresql://... npm run db:migrate
```

## Troubleshooting

- **`prisma migrate deploy` fails on Vercel** — check `DATABASE_PROVIDER=postgresql` is set; the schema is generated from it.
- **Analyses fail with `missing_anthropic_key`** — `ANTHROPIC_API_KEY` is not set in that environment.
- **`daily_cap`** — raise `MAX_ANALYSES_PER_DAY` or wait for UTC midnight.
- **Yahoo errors in production** — Yahoo occasionally blocks datacenter IPs. Switch `DATA_PROVIDER=fmp` with a key.
- **Cron returns 401** — `CRON_SECRET` must be set in the same environment; Vercel adds the header automatically.
