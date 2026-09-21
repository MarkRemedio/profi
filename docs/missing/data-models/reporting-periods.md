# Reporting periods & locks

**Status:** Partial
**Category:** Data model

## What this is

Persisted accounting periods (month/quarter/year) with hard locks preventing posting into a closed period.

## Current state

- Logic exists in [lib/accounting/period-close.ts](../../../lib/accounting/period-close.ts).
- `Organization` carries a single `accounting_period_start` / `accounting_period_end` pair ([prisma/schema.prisma:106](../../../prisma/schema.prisma#L106)).
- No `ReportingPeriod` table, no lock-at-date model, no enforcement trigger in Postgres.

## Why it's needed

- After P&L is signed off for a period, no one should be able to back-date a journal into it.
- Year-end adjustments must go into the next open period or trigger reopen workflow.
- Required for the design doc's "posted accounting entries immutable where possible" rule.

## Recommended approach

```prisma
model ReportingPeriod {
  id           String
  orgId        String
  startDate    Date
  endDate      Date
  status       PeriodStatus  // open | soft_closed | closed
  closedAt     DateTime?
  closedByUserId String?
}
```

- Add a Postgres trigger on `journals` rejecting INSERT/UPDATE where `journal_date` falls in a `closed` period (unless user is OWNER + override flag).
- Track which user closed and the report snapshots at close (P&L, BS, TB).

## Implementation notes

- Soft-close = warn but allow; closed = block.
- Reopening a period requires creating a `PeriodReopen` audit record.

## Related

- [Audit-trail UI](../cross-cutting/audit-trail-ui.md), [RBAC](../cross-cutting/rbac.md), [Service / domain layer](../architecture/service-domain-layer.md)
