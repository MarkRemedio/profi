# PDF generation

**Status:** Partial
**Category:** Architecture / Backend

## What this is

Server-side PDF rendering of invoices, credit notes, bills, payslips, VAT returns, statements, and reports.

## Current state

- Only an HTML print view exists: [components/sales/print-invoice-view.tsx](../../../components/sales/print-invoice-view.tsx).
- No PDF library installed.
- "Sent" invoices cannot be attached to emails as PDF, and there is no archive of the _exact bytes_ the customer received.

## Why it's needed

- Audit and tax: a posted invoice should produce an immutable PDF kept alongside the journal.
- Payslips legally have to be delivered as PDFs in many jurisdictions.
- Customer-facing emails should attach the PDF, not just a link.

## Recommended approach

- React-PDF (`@react-pdf/renderer`) for templated documents.
- Or Playwright/Chromium in a job for pixel-perfect renders.
- Store the rendered PDF in [file storage](file-storage.md) and reference it from the source row (`Invoice.pdfAttachmentId`).

## Implementation notes

- Render on the job queue, not inline.
- Re-render is allowed only while a doc is in draft; once posted, the PDF is frozen.

## Related

- [Email service](email-service.md), [File storage](file-storage.md), [Background jobs](background-jobs.md)
