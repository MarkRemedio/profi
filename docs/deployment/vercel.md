# Deploying waw-profi to Vercel

A repeatable checklist for deploying the Next.js app. The whole app — including
banking — runs on a single backend: Prisma + Supabase Auth. There is no separate
Django service.

## 1. Environment variables

Add these in **Vercel → Project → Settings → Environment Variables**, for
**Production, Preview, and Development**. Values come from your local `.env`
(see [`.env.example`](../../.env.example) for the shape).

| Variable | Required | Value | Why |
|---|---|---|---|
| `DATABASE_URL` | ✅ | **pooled** string, port `6543`, `?pgbouncer=true` | Prisma at runtime. Must be pooled — Vercel serverless opens many connections. |
| `DIRECT_URL` | ✅ | **direct** string, port `5432` | Prisma migrations / seed only. |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `https://<project>.supabase.co` | Supabase Auth (login/sessions). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | publishable anon key | Supabase Auth. Public, RLS-limited. |

### Critical: `DATABASE_URL` must be the pooled URL
On Vercel, each serverless function invocation can open its own DB connection.
The **pooled** connection (port `6543`, `pgbouncer=true`) routes through Supabase
PgBouncer and prevents exhausting Postgres connection limits. Using the direct
`5432` URL here will cause `too many connections` errors under load.

## 2. Build settings

- **Framework preset:** Next.js (auto-detected).
- **Install command:** `pnpm install` (repo uses pnpm — see `pnpm-lock.yaml`).
- **Build command:** default. `package.json` `build` is `prisma generate && next build`,
  and `postinstall` also runs `prisma generate`, so the Prisma client is generated
  on Vercel with no extra config.
- **Node version:** match local (set in Vercel Project Settings if needed).

## 3. Database migrations

Vercel does not run migrations automatically. Apply schema changes against the
**direct** connection before/after deploy:

```bash
# Uses DIRECT_URL (port 5432) via prisma.config.ts
pnpm prisma migrate deploy
```

Run this from local or CI with `DIRECT_URL` set to the production database.

## 4. Post-deploy smoke check

- [ ] App boots (no `DATABASE_URL or DIRECT_URL is required` error).
- [ ] Login works (Supabase Auth).
- [ ] Accounting / chart of accounts loads (Prisma read path).
- [ ] Create a journal or sale (Prisma write path).
- [ ] Banking pages load (accounts, dashboard, feed) — banking now runs on
      Prisma + server actions, no Django.

## 5. Known follow-ups

- **Supabase Auth redirect URLs:** add the Vercel production + preview domains to
  Supabase → Authentication → URL Configuration so login redirects resolve.
