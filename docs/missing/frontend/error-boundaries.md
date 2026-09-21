# Error boundaries / error pages

**Status:** Missing
**Category:** Frontend

## What this is

A consistent error handling strategy: global error boundary, per-route `error.tsx`, `not-found.tsx`, friendly fallbacks, and a path back to a working state.

## Current state

- No `app/error.tsx` or `app/global-error.tsx` (App Router conventions).
- No per-feature `error.tsx` under feature folders.
- Server-action errors surface as raw alerts or get swallowed.

## Why it's needed

- An uncaught error in any nested component will currently take down the page silently or with a generic Next error overlay.
- Finance users need to _know_ something went wrong (especially for posting) — silent failure is unacceptable.

## Recommended approach

- `app/global-error.tsx` for last-resort.
- `app/(app)/error.tsx` (or per-feature) for in-app recoverable errors with a "try again" CTA.
- Sonner toast + Sentry capture on any caught client error.
- For Server Actions: return a discriminated-union result `{ ok: true } | { ok: false, error }` instead of throwing.

## Implementation notes

- Never log financial figures into error reports — only IDs.
- Distinguish validation errors (show inline) from system errors (show toast + retry).

## Related

- [Observability](../cross-cutting/observability.md), [Form layer](form-layer.md)
