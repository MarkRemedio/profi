# Observability (logs / metrics / traces)

**Status:** Missing
**Category:** Cross-cutting

## What this is

Structured logging, metrics, and distributed tracing across the Next.js app, Server Actions, the Django banking service, and any future background workers.

## Current state

- No structured logger (no pino / winston / bunyan).
- Server Actions use `console.log` only (where they log at all).
- No Sentry, Datadog, OpenTelemetry exporter, or `instrumentation.ts` file.

## Why it's needed

- A finance product needs reliable incident triage — "the invoice didn't post" must be traceable.
- Multi-tenant ops: per-tenant error rates, P95 latency on report endpoints.
- Distributed: Next ↔ Django ↔ Supabase needs trace correlation IDs.

## Recommended approach

- Sentry for errors (Next supports it via `@sentry/nextjs`).
- pino for structured server logs; ship to Axiom / Logtail / Datadog.
- OpenTelemetry via Next.js `instrumentation.ts` for traces; propagate the trace header into Django calls.
- Per-org logger context so support can filter by `orgId`.

## Implementation notes

- Never log PII or financial figures in plaintext — log row IDs only.
- Sample traces; alert on errors only.

## Related

- [Rate limiting](../architecture/rate-limiting.md), [Analytics](analytics.md), [Audit-trail UI](audit-trail-ui.md)
