# Fixed assets & depreciation

**Status:** Missing
**Category:** Data model

## What this is

A fixed-asset register: assets purchased, their cost, useful life, depreciation method, accumulated depreciation, and disposal records.

## Current state

- `AccountReportCategory.DEPRECIATION` enum value exists ([prisma/schema.prisma:39](../../../prisma/schema.prisma#L39)) — the chart-of-accounts side anticipates it.
- No `FixedAsset` or `DepreciationSchedule` model.
- No periodic posting job to recognise depreciation expense.

## Why it's needed

- Required for accurate balance sheet (NBV of assets) and P&L (depreciation expense).
- Corporation tax / capital allowances depend on the register.
- Disposal of an asset must post `DR accum depreciation / CR asset` and any gain/loss.

## Recommended approach

```prisma
model FixedAsset {
  id              String
  orgId           String
  name            String
  acquiredDate    Date
  costMinor       BigInt
  residualMinor   BigInt
  usefulLifeMonths Int
  method          DepreciationMethod  // straight_line | reducing_balance
  assetAccountId  String
  accumDeprAccountId String
  deprExpenseAccountId String
  disposedAt      DateTime?
}
model DepreciationEntry {
  id String, assetId String, periodEnd Date, journalId String, amountMinor BigInt
}
```

## Implementation notes

- Background job runs at month-end, posting one journal per asset (or one batched journal).
- Re-running for the same period is a no-op (idempotent).

## Related

- [Background jobs](../architecture/background-jobs.md), [Reporting periods](reporting-periods.md), [Corporation tax](../compliance/corporation-tax.md)
