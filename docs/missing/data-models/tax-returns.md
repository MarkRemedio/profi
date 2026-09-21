# Tax returns (VAT/MTD persistence)

**Status:** Stub
**Category:** Data model

## What this is

Persistent records of each tax return prepared and submitted (VAT 9-box, EC Sales, CIS, Corporation Tax), with status, submission receipts, and links to the journal lines that fed the figures.

## Current state

- [components/taxes/vat-view.tsx](../../../components/taxes/vat-view.tsx) is hard-coded — see the `vatObligations` and `vatReturnDraft` constants at top of file.
- No `VatReturn`, `EcSalesList`, `CisReturn`, `CorporationTaxReturn` models in [prisma/schema.prisma](../../../prisma/schema.prisma).
- No HMRC obligation pull, no submission receipt, no immutable snapshot.

## Why it's needed

- MTD digital-links requirement: each filed return must have an immutable record of the figures and an auditable link back to source journal lines.
- Late corrections must be made via the _next_ period's adjustment, not by re-editing the filed return.

## Recommended approach

```prisma
model VatReturn {
  id              String
  orgId           String
  periodStart     Date
  periodEnd       Date
  obligationId    String?       // HMRC obligation ref
  status          VatReturnStatus // draft | submitted | accepted | rejected
  box1Minor..box9Minor BigInt
  submittedAt     DateTime?
  submissionRef   String?
  receiptJson     Json?
  snapshotJournalLineIds String[] // immutable evidence
}
```

## Implementation notes

- Persist the _exact_ JSON sent to HMRC and the response receipt.
- Lock the period (see [reporting periods](reporting-periods.md)) on accepted submission.

## Related

- [HMRC MTD VAT](../compliance/hmrc-mtd-vat.md), [Reporting periods](reporting-periods.md), [Audit-trail UI](../cross-cutting/audit-trail-ui.md)
