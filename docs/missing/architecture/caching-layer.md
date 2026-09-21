# Caching layer

**Status:** Missing
**Category:** Architecture / Backend

## What this is

A server-side cache for expensive reads: trial balance, P&L, balance sheet aggregates, account-balance views, dashboard rollups.

## Current state

- No Redis / Upstash / Memcached.
- TanStack Query handles client-side cache only.
- Report queries hit Postgres views (e.g. `account_balances_period_movements` from migration `20260508120000`) on every request.

## Why it's needed

- Reports like Balance Sheet and P&L recompute from `JournalLine` aggregates — fine at low volume, costly at scale.
- Multi-tenant dashboards repeat the same query per user view.

## Recommended approach

- Add Upstash Redis (Vercel-friendly) or self-host Redis.
- Cache by `(org_id, report, period, version)` where `version` is bumped on any new posted journal in that org.
- Use Next.js `unstable_cache` / `revalidateTag` for page-level caching where appropriate.

## Implementation notes

- Never cache un-posted (draft) data — it changes constantly.
- Invalidation key: `org:{id}:journals:version` incremented inside the posting transaction.

## Related

- [Service / domain layer](service-domain-layer.md), [Reporting periods](../data-models/reporting-periods.md)
