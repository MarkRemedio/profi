# Bank accounts / transactions / reconciliation

**Status:** Partial (lives in Django)
**Category:** Data model

## What this is

First-class accounting representation of bank accounts, imported bank transactions, and reconciliation matches.

## Current state

- Banking lives entirely in the Django service: [lib/django/banking.ts](../../../lib/django/banking.ts), called from [components/banking/banking-dashboard.tsx](../../../components/banking/banking-dashboard.tsx).
- Memory: `/backend/` Django is **out of scope** for the Next/Prisma accounting work.
- Prisma side has no `BankAccount`, `BankTransaction`, or `BankReconciliation` models; journals cannot link to a bank account via FK.

## Why it's needed

- The whole ledger relies on knowing which `ChartAccount` _is_ a bank — currently only inferred from `AccountReportCategory.BANK`.
- Reconciliation reports need a typed link from a `JournalLine` to a `BankTransaction`.
- Without first-class bank models on the Prisma side, AR/AP allocations can't cleanly reference the settling transaction.

## Recommended approach (decide first)

Two paths — pick one:

1. **Mirror minimal Django state into Prisma** (`BankAccount`, `BankTransaction` with `externalId`, `provider`, `currency`, `balanceMinor`). Sync via webhook from Django.
2. **Move banking into Prisma** as the source of truth, deprecate the Django module. Bigger lift.

## Implementation notes

- Either way, add a `bankAccountId` column to `JournalLine` (nullable) so reconciliation can JOIN.
- Reconciliation status enum: `imported | matched | reconciled | excluded` (matches design doc).

## Related

- [Payments](payments.md), [Bank feeds](../compliance/bank-feeds.md), [Reporting periods](reporting-periods.md)
