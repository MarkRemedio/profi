# Attachments

**Status:** Missing
**Category:** Data model

## What this is

A polymorphic table linking uploaded files (in object storage) to source records: bills, invoices, journals, payments, bank transactions, expense claims, employee documents.

## Current state

- Not in [prisma/schema.prisma](../../../prisma/schema.prisma).
- No upload UI anywhere in [components/](../../../components/).
- Design doc ([context/accounting_software_overview.md](../../../context/accounting_software_overview.md)) lists attachments as a core area.

## Why it's needed

- Audit evidence: HMRC and any decent bookkeeper need to see the supplier invoice PDF behind the bill row.
- Expense claims need receipt images.
- Bank reconciliation evidence (statement screenshots) often gets attached.

## Recommended approach

```prisma
model Attachment {
  id              String
  organizationId  String
  storageKey      String   // path in Supabase Storage bucket
  filename        String
  mimeType        String
  byteSize        Int
  sha256          String   // dedupe + integrity
  uploadedByUserId String?
  // polymorphic refs (only one set):
  invoiceId       String?
  billId          String?
  journalId       String?
  paymentId       String?
  bankTransactionId String?
}
```

## Implementation notes

- Enforce one-of polymorphic FK with a CHECK constraint.
- Virus-scan via background job before exposing.
- Soft-delete only — keep for the audit retention period.

## Related

- [File storage](../architecture/file-storage.md), [Audit-trail UI](../cross-cutting/audit-trail-ui.md), [GDPR](../cross-cutting/gdpr.md)
