# File storage / attachments

**Status:** Missing
**Category:** Architecture / Backend

## What this is

Object storage for source documents: supplier invoice PDFs, receipts, bank statements, signed contracts, generated invoice PDFs, payslips.

## Current state

- Supabase is in the dependency list (`@supabase/ssr`, `@supabase/supabase-js`) but only used for auth.
- No `Attachment` model in [prisma/schema.prisma](../../../prisma/schema.prisma), despite [context/accounting_software_overview.md](../../../context/accounting_software_overview.md) listing it as core.
- No upload UI, no signed-URL helpers.

## Why it's needed

- HMRC MTD and standard audit practice require source evidence linked to each transaction.
- Bills typically need a supplier-invoice PDF attached.
- POS receipts and bank statements need durable storage.

## Recommended approach

- Use Supabase Storage (already wired) with one bucket per tenant or a single bucket and per-row RLS.
- Generate short-lived signed URLs for downloads; never expose direct bucket paths.
- Add an `Attachment` model — see [Attachments data model](../data-models/attachments.md).

## Implementation notes

- Virus-scan uploads (ClamAV via a job) before exposing them.
- Hash uploads and dedupe per org to keep storage cheap.

## Related

- [Attachments data model](../data-models/attachments.md), [PDF generation](pdf-generation.md), [Tenant isolation](../cross-cutting/tenant-isolation.md)
