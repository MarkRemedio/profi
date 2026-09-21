# Payments module missing (no Payment / Allocation model)

**Audit priority:** High (structural gap)
**Section:** Module integration with the COA

## What the auditor saw

In the module-verification table:

| Module     | Verification                                     |
|------------|--------------------------------------------------|
| Payments   | **Module Not Found (Except for bills and invoices)** |

There is no general "Payments" area. The only payment-shaped actions live as one-off journals inside the invoice and bill pages.

## Current state in the codebase

- No `Payment`, `PaymentAllocation`, or `Refund` model in [prisma/schema.prisma](../../../prisma/schema.prisma).
- [Bill](../../../prisma/schema.prisma) carries a single `paidJournalId` FK — sufficient only for one full payment per bill.
- `Invoice` has no `paidJournalId` at all.
- No way to record a customer overpayment, a refund, or one payment that pays multiple invoices.

## Why this matters

- Real receivables work needs many-to-many between payments and documents.
- Bank reconciliation depends on having distinct payment rows to match against bank transactions.
- Without payments, you cannot represent: part-payment, prepayment, overpayment, supplier refund, customer refund.

## What to do

Introduce a payments aggregate. Suggested shape (also captured in [Missing — Payments](../../missing/data-models/payments.md)):

```prisma
model Payment {
  id              String
  organizationId  String
  contactId       String?
  paymentDate     DateTime
  amountMinor     BigInt
  currency        CurrencyCode
  bankAccountId   String?       // see invoice-payment-bank-source-tracking
  journalId       String        // the GL journal
  allocations     PaymentAllocation[]
}
model PaymentAllocation {
  id              String
  paymentId       String
  invoiceId       String?
  billId          String?
  amountMinor     BigInt
}
```

And enum changes:

- Add `PART_PAID` to `InvoiceStatus` and `BillStatus`.

## Posting rules

- Customer receipt: `DR bank / CR accounts receivable`.
- Supplier payment: `DR accounts payable / CR bank`.
- Refund out: `DR accounts receivable (or customer credit) / CR bank`.

## Related

- [Invoice payment bank source tracking](../ledger-correctness/invoice-payment-bank-source-tracking.md) — the same `Payment.bankAccountId` field solves both.
- [Bill payment traceability](../ledger-correctness/bill-payment-traceability.md) — part-payments depend on this.
- [Missing — Payments data model](../../missing/data-models/payments.md).
