# Containerization

**Status:** Missing
**Category:** DevOps / Quality

## What this is

A reproducible local-dev environment (and prod runtime image) covering Postgres, the Django banking service, Supabase emulators, and the Next.js app.

## Current state

- No `Dockerfile`, no `docker-compose.yml`.
- New devs must install Postgres locally, run a Supabase project manually, and have the Django backend running separately.

## Why it's needed

- Onboarding new devs takes hours without a one-command bootstrap.
- CI parity: tests should run against the same Postgres version as prod.
- Reproducible bug repros.

## Recommended approach

- `docker-compose.dev.yml` with: Postgres, Supabase local stack (or `supabase start`), the Django banking service, optionally Redis (when caching is added).
- A `Dockerfile` for the Next app for self-hosted deployments (Vercel users don't need it but consultancy clients may).
- One-command bootstrap: `pnpm dev:up` runs compose + migrations + seed.

## Implementation notes

- Pin Postgres major version; align with Supabase prod version.
- Don't bake secrets into images.

## Related

- [Env management](env-management.md), [CI/CD](ci-cd.md), [Backups](backups.md)
