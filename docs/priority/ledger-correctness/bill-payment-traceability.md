# Bill payment traceability / partial payments

**Audit priority:** High
**Section:** Ledger correctness / posting

## What the auditor saw

> Balance Sheet is OK — Accounts Payable and Bank Current Account are both updating correctly. The bill payment is visible in the correct account, so the posting itself is working as expected. However, we still need better tracking and linking for the payment flow. Right now, even though the entry is correctly reflected in the accounts, we don't have a clear end-to-end trail that shows exactly which supplier bill each payment is connected to, especially when dealing with partial payments.

> Trial Balance, General Ledger and Profit & Loss is okay.

> Overall, the accounting entries are correct and visible in the right accounts, but we need to improve the traceability layer so each bill payment is clearly linked to its source bill and can be tracked properly across full and partial settlements.

## Current state in the codebase

- `Bill.paidJournalId` in [prisma/schema.prisma](../../../prisma/schema.prisma) is a **single** FK — one payment journal per bill.
- `BillStatus` enum has `PAID` but no `PART_PAID`.
- No `Payment` / `PaymentAllocation` model — see [payments-module-missing](../module-integration/payments-module-missing.md).

This means part-payment of a bill is structurally impossible without changes:

- you can't record two payments against the same bill;
- you can't allocate one payment across two bills;
- you can't see "still owed" on the bill.

## What to do

1. Add the [Payment + PaymentAllocation models](../module-integration/payments-module-missing.md).
2. Replace `Bill.paidJournalId` with a `Bill.paymentAllocations` reverse relation (or keep `paidJournalId` for the latest journal as an optimisation, but treat allocations as the source of truth).
3. Derive `outstandingMinor` on each bill: `totalMinor - sum(allocations.amountMinor where billId = bill.id)`.
4. Status transitions:
   - any allocation with `outstandingMinor > 0` → `PART_PAID`,
   - allocation sum equals total → `PAID`.
5. Bill detail UI: payment history table showing every allocation, the journal id, the bank account used, and the date.

## Posting rules

- First partial payment of bill: `DR Accounts Payable (sub: this bill) / CR <bank>` for the part amount only.
- Second partial payment: same.
- Final payment: same, and on commit move `BillStatus` to `PAID`.

## Implementation notes

- `Bill.paidAt` should be the date of the *last* allocation that closed the bill, not the first one.
- Reconciliation engine matches `BankTransaction` ↔ `PaymentAllocation`, not directly ↔ `Bill`.

## Related

- [Payments module missing](../module-integration/payments-module-missing.md).
- [Invoice payment bank source tracking](invoice-payment-bank-source-tracking.md) — same shape on the AR side.
- [Invoice status / outstanding](invoice-status-outstanding-display.md) — symmetric on the AR side.
