# Accounting Core Transition Plan

## Summary

Transition the current Supabase-backed UI prototype into a UK/GBP/VAT accounting core while preserving existing invoices and bills. Use Supabase SQL migrations as the schema source of truth, move accounting mutations into Next Server Actions, and introduce immutable journal posting for approved sales invoices and supplier bills first.

Payments, allocations, bank feeds, VAT returns, and full reports come after the core is stable.

## Implementation Changes

### Supabase Schema Source Of Truth

- Establish Supabase SQL migrations as the authoritative schema workflow.
- Keep Prisma non-authoritative for now; do not expand `prisma/schema.prisma` as the primary source of truth.
- Before implementation, verify current Supabase changelog/docs for SQL migrations, RLS, and `@supabase/ssr` server usage.

### Accounting Foundation

- Confirm or add organisation fields for `base_currency = 'GBP'`, VAT registration details, and accounting period settings.
- Standardize organisation membership roles as `owner`, `accountant`, and `employee`.
- Add `contacts` as shared customer/supplier records with contact type, name, email, phone, address, VAT number, payment terms, and default currency.
- Keep the current chart of accounts concept, but enforce organisation scoping, unique `(org_id, code)`, account type, VAT defaults, active/system flags, and RLS.
- Add `tax_rates` and seed UK VAT defaults: `vat_20`, `vat_5`, `vat_0`, `vat_exempt`, and `no_vat`.

### Operational Documents

- Replace flat invoice/bill records with line-based documents.
- Add `invoices` and `invoice_lines` with customer/contact, number, issue/due dates, status, currency, subtotal/tax/total minor units, and posted journal reference.
- Add `bills` and `bill_lines` with supplier/contact, supplier invoice number, dates, status, currency, subtotal/tax/total minor units, and posted journal reference.
- Store money as integer minor units, not persisted JavaScript-style floats.
- Preserve current records by backfilling them into the new structure with one line per legacy invoice or bill.

### Accounting Engine

- Add `journals` with organisation, source type/id, status, journal date, memo, created metadata, and posted metadata.
- Add `journal_lines` with account, debit minor units, credit minor units, contact/document metadata, and organisation scoping.
- Enforce that posted journals balance: total debits must equal total credits.
- Treat posted journals as immutable. Corrections use void/reversal flows rather than edits.

### V1 Posting Behavior

- Invoice approval/post creates:
  - Debit Accounts Receivable
  - Credit Sales
  - Credit VAT Payable when VAT applies
- Bill approval/post creates:
  - Debit Expense or selected purchase account
  - Debit VAT Control/Input VAT when recoverable VAT applies
  - Credit Accounts Payable
- Draft documents may be edited.
- Posted documents cannot be silently changed.
- Migrated records default to `draft` or `legacy_unposted` unless already safe to post.

### Server-Side Mutations

- Add a server-only Supabase client helper using `@supabase/ssr`.
- Add a data access layer that verifies Supabase user session and organisation membership on every mutation.
- Implement Server Actions for creating/updating invoices, creating/updating bills, approving/posting invoices, approving/posting bills, and voiding documents.
- Client components may still render interactive dialogs, but direct browser writes for accounting documents should be removed.
- Use `revalidatePath` or refresh after mutations according to the installed Next Server Action docs.

### UI Transition

- Update the sales invoices page to read new invoice DTOs and support draft/create/approve/post status flow.
- Update the purchases page to read new bill DTOs and support draft/create/approve/post/void status flow.
- Update the customers page to read from `contacts` instead of deriving customers only from invoices.
- Keep the chart of accounts UI, but read standardized account/tax fields.
- Hide or disable payment actions until the payments/allocation phase exists.

### Audit Trail

- Add `audit_events` with organisation, actor user, entity type/id, action, timestamp, and before/after JSON where appropriate.
- Log create, draft update, approve/post, void, reverse, and permission-sensitive changes.
- Do not hard-delete accounting documents. Use `void`, `archived_at`, or reversal entries.

## Public Interfaces And Types

- Replace current `amount: number` document types with minor-unit DTOs:
  - `subtotalMinor: number`
  - `taxMinor: number`
  - `totalMinor: number`
  - `currency: "GBP"`
- Format minor units to GBP only at render boundaries.
- Replace invoice statuses with `draft`, `approved`, `sent`, `part_paid`, `paid`, and `void`.
- Phase one implements invoice `draft`, `approved`, `sent`, and `void`; payment-derived statuses remain future work.
- Replace bill statuses with `draft`, `approved`, `part_paid`, `paid`, and `void`.
- Phase one implements bill `draft`, `approved`, and `void`.
- Add DTOs for `ContactSummary`, `InvoiceWithLines`, `BillWithLines`, `JournalPreview`, and `ChartAccountOption`.

## Test Plan

- Run `npm run lint` and `npm run build`.
- Verify fresh database migration succeeds.
- Verify seeded starter accounts and VAT rates are present.
- Verify existing invoice/bill rows backfill into new document and one-line records.
- Verify users can only read/write records for their organisation.
- Verify employees cannot post if posting is reserved for owner/accountant roles.
- Verify Server Actions reject unauthenticated and wrong-organisation requests.
- Verify posted invoice journals balance.
- Verify posted bill journals balance.
- Verify VAT-inclusive/exclusive calculations produce expected minor units.
- Verify posted documents cannot be edited directly.
- Verify void/reversal creates an audit event and preserves the original posted record.
- Verify UI scenarios: create draft invoice/bill, add line item and VAT code, approve/post document, confirm totals/status updates, and confirm customers are read from contacts.

## Assumptions And Defaults

- V1 accounting defaults are UK, GBP, and VAT-oriented.
- Supabase SQL migrations and RLS are authoritative.
- Prisma remains present but non-authoritative.
- Existing invoice and bill data must be preserved and backfilled.
- Phase one posts invoices and bills only.
- Payments, allocations, reconciliation, VAT returns, and financial reports are planned for later phases.
- Server Actions are the mutation boundary.
- Browser Supabase writes remain only for non-sensitive reads or are phased out where practical.
- Current UI structure should be evolved, not replaced with a full redesign.
