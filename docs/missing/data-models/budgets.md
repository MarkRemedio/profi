# Budgets

**Status:** Missing
**Category:** Data model

## What this is

Per-account, per-period budget figures and the report that compares them against actuals.

## Current state

- No `Budget` model in [prisma/schema.prisma](../../../prisma/schema.prisma).
- Reports under [lib/accounting/reports.ts](../../../lib/accounting/reports.ts) cover P&L and balance sheet only.

## Why it's needed

- Variance analysis is a core SME finance workflow.
- Budgets feed cashflow forecasting.

## Recommended approach

```prisma
model Budget {
  id        String
  orgId     String
  name      String
  startDate Date
  endDate   Date
  lines     BudgetLine[]
}
model BudgetLine {
  id        String
  budgetId  String
  accountId String
  monthOffset Int   // 0..11 from budget start
  amountMinor BigInt
}
```

## Implementation notes

- Single "active" budget per org per fiscal year keeps reports simple; allow multiple scenarios later.
- Variance report = `actuals - budget` from `JournalLine` aggregates joined to `BudgetLine` per month.

## Related

- [Tracking categories](tracking-categories.md), [Caching layer](../architecture/caching-layer.md)
