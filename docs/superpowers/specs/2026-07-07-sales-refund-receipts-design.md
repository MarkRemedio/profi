# Sales Receipt & Refund Receipt — Design

**Date:** 2026-07-07
**Status:** Approved

## Goal

Add three sections to the Sales sidebar:

1. **Sales Receipts** — new feature: record a sale paid immediately (no invoice, no Accounts Receivable).
2. **Refund Receipts** — new feature: record money refunded to a customer out of a bank/cash account.
3. **Customer Statements** — already built at `/sales/statements`; just needs a sidebar link.

## Background

- All money amounts are stored in **minor units as `BigInt`**.
- Journals are the ledger truth. They are created `DRAFT` then flipped to `POSTED` (bypasses the DB immutability trigger). `Journal.sourceType`/`sourceId` are free strings — the extension point for new document types.
- The POS module (`lib/pos/posting.ts`) already posts single-journal cash sales and mirror-image refunds; it is the accounting precedent for both features.
- Invoice infrastructure in `lib/accounting/documents.ts` provides reusable helpers: `normalizeLines` (VAT for exclusive/inclusive/no-VAT modes), `computeNextNumber` + `withDocNumberRetry` (sequential doc numbers, race-safe via unique constraint + retry), `resolveSystemAccount`, `resolveDepositAccount` (validates a caller-supplied account is an active BANK asset in the org), `assertJournalBalances`.
- `Journal.paymentMethod` (`cash` | `cheque` | `bank_transfer`, DB CHECK constraint, NULL allowed) exists and is set on payment journals.
- The existing Credit Notes feature is a tracking-only stub with no ledger posting — it is **not** a pattern to copy (random numbering, raw `orgId` argument instead of workspace guard).

## Decisions

- **Dedicated document models** (not invoice reuse, not journal-only): full list/create/view/void UX with line items and VAT breakdown.
- **Refund Receipts are standalone**: pick a customer, add refund lines, choose the bank account. Optional free-text reference to an original invoice/receipt. No hard link or amount validation against a source document.
- **No draft state**: receipts represent money that already changed hands, so saving posts the journal immediately in the same transaction. Statuses are `POSTED` and `VOID` only.
- **Void = reversal journal dated today** (POS pattern) so closed periods are never mutated.

## Data model (`prisma/schema.prisma` + migration)

### SalesReceipt / SalesReceiptLine

Shaped like `Invoice`/`InvoiceLine`:

- `SalesReceipt`: `id`, `organizationId`, `receiptNo` (`SR-0001`…, `@@unique([organizationId, receiptNo])`), `contactId` (customer), `receiptDate @db.Date`, `currency CurrencyCode`, `amountsAre` (`exclusive` default | `inclusive` | `no_vat`), `subtotalMinor`, `taxMinor`, `totalMinor`, `discountMinor` (BigInt), `depositAccountId` (bank/cash account that received the money), `paymentMethod String?`, `status` (`POSTED` | `VOID`), `postedJournalId String? @unique`, `voidJournalId String? @unique`, `notes`, timestamps.
- `SalesReceiptLine`: `accountId` (revenue account), `description`, `quantity Decimal(12,2)`, `unitAmountMinor`, `subtotalMinor`, `discountMinor`, `taxCode` (default `no_vat`), `taxRate Decimal(5,2)`, `taxMinor`, `totalMinor`.

### RefundReceipt / RefundReceiptLine

Same shape with: `refundNo` (`RR-0001`…), `refundFromAccountId` (bank account money leaves), `reference String?` (free text pointing at the original sale), `paymentMethod`, `status`, `postedJournalId`, `voidJournalId`.

## Accounting (`lib/accounting/receipts.ts`)

New module reusing exported helpers from `documents.ts` rather than growing that file further.

### Sales Receipt — one journal, `sourceType: "sales_receipt"`

| Line | Account | Amount |
|---|---|---|
| DR | deposit bank account (via `resolveDepositAccount`, default system Bank 1000) | `totalMinor` |
| CR | each line's revenue account | line `subtotalMinor` (net) |
| CR | Output VAT 2100 | `taxMinor` (only if > 0) |
| DR | Sales Discount 4100 | `discountMinor` (only if > 0) |

No Accounts Receivable (1100). `paymentMethod` set on the journal. `contactId` attached to lines where relevant (mirror invoice behavior on the bank line).

### Refund Receipt — one journal, `sourceType: "refund_receipt"`

The mirror image:

| Line | Account | Amount |
|---|---|---|
| DR | each line's revenue account | line `subtotalMinor` |
| DR | Output VAT 2100 | `taxMinor` (only if > 0) |
| CR | refund-from bank account | `totalMinor` |

(Discount lines mirrored as CR 4100 if present.)

### Void

`voidSalesReceipt` / `voidRefundReceipt`: post a mirror journal dated **today**, `sourceType: "sales_receipt_void"` / `"refund_receipt_void"`, `reversedJournalId` set; flip document status to `VOID`, store `voidJournalId`. Idempotent — a second void is a no-op/error.

### Invariants

- `assertJournalBalances` before every post.
- `total = subtotal − discount + tax` per document (preserved by `normalizeLines`).
- Numbering via `computeNextNumber("SR-" | "RR-")` inside `withDocNumberRetry`.
- VAT reports need no changes: they read Output VAT (2100) postings from the ledger regardless of `sourceType`.

## Server actions

- `app/(dashboard)/sales/receipts/actions.ts` — `createSalesReceipt`, `voidSalesReceipt`, list/fetch helpers.
- `app/(dashboard)/sales/refund-receipts/actions.ts` — `createRefundReceipt`, `voidRefundReceipt`, list/fetch helpers.
- All guarded by `requireAccountantRole()` from `lib/accounting/dal.ts`; `organizationId` derived from the workspace context, never passed by the client. `paymentMethod` clamped to the allowed set at the action layer (as `payInvoiceDocument` does).

## Routes & UI

Follow the invoices page pattern (server page resolves workspace → client component with list + dialogs):

- `app/(dashboard)/sales/receipts/page.tsx` + `components/sales/sales-receipts.tsx`, `add-sales-receipt-dialog.tsx`, `view-sales-receipt-dialog.tsx`.
  - Create dialog: customer picker, receipt date, deposit-to account (BANK accounts), payment method, line items (account, description, qty, unit price, tax code), amounts-are toggle, notes.
  - List: number, date, customer, payment method, total, status; view + void actions.
- `app/(dashboard)/sales/refund-receipts/page.tsx` + matching components; create dialog adds "refund from" account and optional reference field.

## Sidebar (`components/chart-of-accounts/sidebar.tsx`)

In `SalesNavItem`, after Quotes:

- `Sales Receipts` → `/sales/receipts` (Receipt icon)
- `Refund Receipts` → `/sales/refund-receipts` (RotateCcw icon)
- `Customer Statements` → `/sales/statements` (FileText icon)

## Error handling

- Reject: no lines, zero/negative totals, unknown/inactive deposit account (`resolveDepositAccount` throws), contact not a CUSTOMER/BOTH, void of an already-void receipt.
- Doc-number collisions retried via `withDocNumberRetry`; surfaced as a friendly error after retries exhausted.
- All posting happens in one transaction: document row + lines + journal + status flip commit or roll back together.

## Testing

Match the existing test conventions used for `documents.ts` posting logic:

- Journal balance and account targets for sales receipt (exclusive, inclusive, no-VAT, with discount).
- Refund receipt mirrors correctly.
- Void posts today-dated reversal and flips status; double-void rejected.
- Numbering sequence and collision retry.
- Org scoping: actions reject cross-org accounts/contacts.

## Out of scope

- Linking refunds to source documents with amount validation.
- Retro-fitting ledger posting onto the existing Credit Notes stub.
- Printable/PDF receipt templates (can follow the invoice print route later).
- Emailing receipts to customers.
