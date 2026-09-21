# Background jobs / queues

**Status:** Missing
**Category:** Architecture / Backend

## What this is

An async job runner for work that should not block a request: bank statement imports, VAT submissions, payroll runs, recurring invoice generation, emails, PDF rendering, FX revaluation.

## Current state

- No queue library installed (no BullMQ, Inngest, Trigger.dev, Temporal, Graphile Worker).
- Statement import in [components/banking/banking-dashboard.tsx](../../../components/banking/banking-dashboard.tsx) and AI matching run inline against the Django service.
- Period close, journal reversal, and large report queries run synchronously in Server Actions.

## Why it's needed

- VAT filing and bank syncs are external, slow, and must retry on failure.
- Recurring invoices, auto-reversal journals (the `auto_reversal_date` column on `Journal`) need a scheduler.
- Payroll runs touch many rows and should not occupy a request thread.

## Recommended approach

- For Vercel-friendly setup: Inngest or Trigger.dev (HTTP-driven, no worker host needed).
- For self-hosted: BullMQ on Redis, or Graphile Worker on the existing Postgres.
- Define a `Job` enum + handler registry in `lib/jobs/`.

## Implementation notes

- Persist a `jobs` table even if using a hosted scheduler — gives an audit trail.
- Make all handlers idempotent (use idempotency keys, especially for HMRC and Stripe).

## Related

- [Webhooks](webhooks.md), [HMRC MTD VAT](../compliance/hmrc-mtd-vat.md), [Recurring transactions](../data-models/recurring-transactions.md), [FX revaluation](../data-models/exchange-rates.md)
