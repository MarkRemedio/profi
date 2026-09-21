# Payments & allocations

**Status:** Missing
**Category:** Data model

## What this is

Models that record money movement settling invoices and bills: customer receipts, supplier payments, refunds, overpayments, prepayments — plus the allocation table that links a payment to one or many invoices/bills.

## Current state

- No `Payment`, `PaymentAllocation`, or `Refund` models in [prisma/schema.prisma](../../../prisma/schema.prisma).
- `Bill` has `paidJournalId` ([prisma/schema.prisma:346](../../../prisma/schema.prisma#L346)) suggesting a single ad-hoc payment journal, but `Invoice` has no equivalent.
- No way to record an overpayment or apply a credit.

## Why it's needed

- Part-payment lifecycle: `BillStatus` has `PAID` but not `PART_PAID`, contradicting the design doc.
- Many-to-many: one payment may pay many invoices; one invoice may be settled by many payments.
- Cash and bank reconciliation depend on having distinct payment rows.

## Recommended approach

```prisma
model Payment {
  id              String
  organizationId  String
  contactId       String?
  paymentDate     DateTime
  amountMinor     BigInt
  currency        CurrencyCode
  bankAccountId   String?
  journalId       String  // posted GL impact
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

## Implementation notes

- Posting rule: Receipt = `DR bank / CR AR`; Supplier payment = `DR AP / CR bank`.
- Add `PART_PAID` to `InvoiceStatus` and `BillStatus` enums.

## Related

- [Bank models](bank-models.md), [Credit notes](credit-notes.md), [Service / domain layer](../architecture/service-domain-layer.md)
