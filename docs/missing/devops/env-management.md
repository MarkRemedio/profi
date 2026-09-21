# Env management

**Status:** Missing
**Category:** DevOps / Quality

## What this is

A typed, validated env-var contract that the app reads through one module — and a checked-in `.env.example` documenting every variable.

## Current state

- No `.env.example` in the repo.
- `process.env.NEXT_PUBLIC_DJANGO_API_URL` read directly in [lib/django/client.ts:14](../../../lib/django/client.ts#L14), other vars likely scattered.
- No zod schema, no startup validation, no documented list of required vars.

## Why it's needed

- "Works on my machine" is almost always an env-var mismatch.
- Production should fail fast at boot when a required variable is missing, not at first runtime use.

## Recommended approach

- `lib/env.ts` exporting a zod-validated, typed `env` object.
- `.env.example` checked in (no secrets, just keys + comments).
- Server-only vs client-safe split (`NEXT_PUBLIC_*`).
- Import `env` everywhere instead of `process.env`.

## Implementation notes

- Validate at module load — throw on missing/invalid.
- Distinct schemas per environment (dev allows defaults; prod requires explicit).

## Related

- [Docker](docker.md), [CI/CD](ci-cd.md), [Observability](../cross-cutting/observability.md)
