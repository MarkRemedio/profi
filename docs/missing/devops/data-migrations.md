# Data migrations strategy

**Status:** Partial
**Category:** DevOps / Quality

## What this is

A repeatable process for both schema migrations (Prisma) and data migrations / backfills that need to run alongside schema changes.

## Current state

- Prisma migrations live under [prisma/migrations/](../../../prisma/migrations/) — schema side is good.
- Data fixes are ad-hoc Node CJS scripts in [scripts/](../../../scripts/): `apply-migration.cjs`, `audit-historical-journals.cjs`, `remediate-misrouted-journals.cjs`.
- No checked-in record of which one-off scripts have run in which environment.
- No idempotency guard, no resume-from-failure.

## Why it's needed

- Ledger fix-ups are accounting events — running them twice or partially is dangerous.
- Need a paper trail of which production has had which backfill applied.

## Recommended approach

- Add a `data_migrations` table: `(id, name, applied_at, applied_by, summary_json)`.
- Wrap each one-off script in a runner that records the row on success.
- Refuse to re-run unless `--force-rerun` is passed.
- Long-running backfills should batch (e.g. 1000 rows / commit) and be resumable.

## Implementation notes

- Always dry-run in staging with a prod snapshot first.
- Pair each ledger-touching migration with an audit query that proves the result.

## Related

- [Backups](backups.md), [Audit-trail UI](../cross-cutting/audit-trail-ui.md), [Service / domain layer](../architecture/service-domain-layer.md)
