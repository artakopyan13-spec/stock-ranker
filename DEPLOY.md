# Deploy to Vercel

## 1. Database (free Postgres)

Create a database on [Neon](https://neon.tech) or [Supabase](https://supabase.com); copy the pooled connection
string (include `?sslmode=require`).

## 2. Google OAuth (free sign-in)

In [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth client ID (Web):
- Authorized redirect URI: `https://<your-app>.vercel.app/api/auth/callback/google`
- Copy the client ID and secret.

(For local testing you can skip this and set `AUTH_DEV_LOGIN=true` instead.)

## 3. Vercel env vars

```bash
npm i -g vercel && vercel login && vercel link
```

Set (Production):

```bash
vercel env add DATABASE_PROVIDER      # postgresql
vercel env add DATABASE_URL           # postgresql://...
vercel env add ANTHROPIC_API_KEY
vercel env add AUTH_SECRET            # openssl rand -base64 32
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
vercel env add ADMIN_EMAILS           # your email — grants /admin
vercel env add CRON_SECRET            # openssl rand -base64 32
vercel env add APP_URL                # https://<your-app>.vercel.app
```

Optional: `ANALYSIS_MODEL` (default `claude-sonnet-5`), `DAILY_SPEND_CEILING_USD`, `MAX_ANALYSES_PER_DAY`,
`FREE_DAILY_FRESH_ANALYSES`, `RATE_LIMIT_PER_MIN`, `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
`DATA_PROVIDER=fmp` + `FMP_API_KEY`, `DEMO_MODE`.

## 4. Build command

Project settings → Build Command:

```
npm run vercel-build
```

It generates the Postgres schema, bundles prompts, runs `prisma generate` + `prisma db push`, loads any committed
demo analyses, and builds Next.js.

## 5. Deploy & cron

```bash
vercel --prod
```

[`vercel.json`](vercel.json) schedules two daily crons (Hobby allows two):

| Path | UTC | What |
|---|---|---|
| `/api/cron/refresh` | 02:00 | plan + submit the nightly batch (kill-switch-aware) |
| `/api/cron/collect` | 11:00 | collect, verify, record "what changed" |

Trigger by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/refresh
```

## 6. First run

1. Sign in with Google; because your email is in `ADMIN_EMAILS` you'll see **Admin**.
2. Create a watchlist, **Analyze missing / stale**.
3. Open `/admin` — set the spend ceiling and quotas; test the kill switch (fresh analyses should pause and users see cached results).
4. Check `/admin/costs`.

## Demo / portfolio deployment

`npm run seed:demo` locally (needs `ANTHROPIC_API_KEY`), commit `data/demo/`, deploy a second project with
`DEMO_MODE=true` and only `DATABASE_URL` + `DATABASE_PROVIDER`. Visitors get the five cached analyses at no cost.

## Local Postgres instead of SQLite

```bash
DATABASE_PROVIDER=postgresql DATABASE_URL=postgresql://... npm run db:push
```

## Troubleshooting

- **Sign-in loops** — check the Google redirect URI matches `APP_URL` exactly, and `AUTH_SECRET` is set.
- **Everyone sees "high demand"** — the spend kill switch is on (manual, or spend ≥ ceiling). Raise it in `/admin`.
- **`prisma db push` fails on Vercel** — confirm `DATABASE_PROVIDER=postgresql`.
- **Yahoo blocked in prod** — switch `DATA_PROVIDER=fmp` with a key.
