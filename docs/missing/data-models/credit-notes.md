# Credit notes & refunds

**Status:** Missing
**Category:** Data model

## What this is

Sales credit notes (reverse/reduce an invoice) and supplier credit notes (reduce a bill), plus refund records when credit is returned as cash.

## Current state

- No model in [prisma/schema.prisma](../../../prisma/schema.prisma).
- `InvoiceStatus.VOID` exists but voiding loses information — a credit note preserves audit context.
- No way to hold customer credit balance.

## Why it's needed

- Voiding is destructive; credit notes are the proper accounting tool for corrections and returns.
- Required for VAT correctness — a credit note creates negative output tax.

## Recommended approach

```prisma
model CreditNote {
  id              String
  organizationId  String
  type            CreditNoteType  // SALES | PURCHASE
  contactId       String
  sourceInvoiceId String?         // optional: applied against invoice
  sourceBillId    String?
  issueDate       DateTime
  totalMinor      BigInt
  status          CreditNoteStatus // draft|approved|applied|refunded
  postedJournalId String?
  lines           CreditNoteLine[]
}
```

## Implementation notes

- Posting: sales credit = `DR sales revenue / DR VAT output / CR AR`.
- Application: link to invoice via `PaymentAllocation`-style row, reducing the invoice's outstanding balance.
- A standalone credit can be refunded later via a `Payment`.

## Related

- [Payments](payments.md), [Tax returns](tax-returns.md)
