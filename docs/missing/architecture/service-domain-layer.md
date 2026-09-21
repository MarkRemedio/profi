# Service / domain layer

**Status:** Partial
**Category:** Architecture / Backend

## What this is

A dedicated layer that owns accounting business rules (posting, reversals, allocations, period close) — separate from transport (Server Actions, future HTTP API) and persistence (Prisma).

## Current state

- Business rules sit inside Server Action files (e.g. invoice posting in [app/sales/invoices/actions.ts](../../../app/sales/invoices/actions.ts)) and in [lib/accounting/dal.ts](../../../lib/accounting/dal.ts).
- [lib/accounting/](../../../lib/accounting/) contains some helpers (`money.ts`, `period-close.ts`, `reports.ts`) but mixes data access with logic.
- No command/handler split, no domain events, no clear seam to unit-test posting logic in isolation.

## Why it's needed

- Multiple entry points will eventually exercise the same logic: Server Actions, HTTP API, background jobs, webhooks.
- Auditability and correctness of posting requires logic to be testable without HTTP.
- Avoids drift between operational records and ledger.

## Recommended approach

- Introduce `lib/domain/` with per-aggregate modules: `invoices`, `bills`, `payments`, `journals`, `periods`.
- Each module exposes pure-ish functions (validate, post, reverse) that take a Prisma transaction client.
- Server Actions become thin: parse input → call domain → return view-model.

## Implementation notes

- Keep `JournalLine` debit/credit balancing assertions in the domain layer, not in actions.
- Emit in-process events (`InvoicePosted`, `BillPaid`) that future job queue can subscribe to.

## Related

- [Background jobs](background-jobs.md), [Tests](../devops/tests.md), [HTTP API](http-api-layer.md)
