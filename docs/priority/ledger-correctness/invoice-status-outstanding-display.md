# Invoice status — no clear "outstanding / unpaid" indication

**Audit priority:** Medium
**Section:** Ledger correctness / posting

## What the auditor saw

> For the Balance Sheet under Accounts Receivable, the system is correctly increasing Accounts Receivable on the debit side when an invoice is created. However, there is currently no clear indication that the amount is still unpaid or outstanding, so we need to improve the way invoice status or outstanding balances are displayed.

The accounting is right; the UX of "is this paid?" is wrong.

## Current state in the codebase

- `InvoiceStatus` enum in [prisma/schema.prisma](../../../prisma/schema.prisma): `DRAFT | APPROVED | SENT | VOID`.
- Notably **missing**: `PART_PAID`, `PAID`. (The `Bill` side has `PAID` but not `PART_PAID`.)
- There's no derived "outstanding amount" surfaced in the invoice list or detail.

## Why this matters

- Users cannot triage "what's owed to me right now" without doing manual maths.
- AR aging reports become unreliable without a paid/part-paid signal.

## What to do

1. Add `PART_PAID` and `PAID` to `InvoiceStatus`.
2. Derive (or store) `outstandingMinor = totalMinor - sum(allocated payment amounts)` per invoice.
3. Surface in the UI:
   - Status badge: `Draft · Approved · Sent · Part-paid · Paid · Overdue · Void`.
   - "Outstanding" column on the invoice list with the remaining amount + due date colour code.
4. Overdue computation: `Outstanding > 0 AND dueDate < today` → red badge.

## Implementation notes

- Don't compute outstanding on every render — store it on the invoice and recompute inside the same transaction that records a payment.
- The status transitions should be enforced server-side (e.g. cannot go `PAID → SENT`).

## Dependencies

- Requires the [Payments model](../module-integration/payments-module-missing.md) to track allocations against the invoice.
- Bank-source tracking ([invoice-payment-bank-source-tracking](invoice-payment-bank-source-tracking.md)) belongs on the same Payment row.

## Related

- [Bill payment traceability](bill-payment-traceability.md) — same pattern on the AP side.
- [Missing — Notifications](../../missing/cross-cutting/notifications.md) — "Invoice overdue" notification flows from this.
