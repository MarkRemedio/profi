# POS → Ledger Posting (A2, sales-side) — Design

> **Status:** approved 2026-07-01 · **Audit ref:** A2 (Critical) in [`PROJECT-STATUS.md`](../../PROJECT-STATUS.md)
> **Related:** [`2026-06-30-pos-security-hardening-design.md`](2026-06-30-pos-security-hardening-design.md) (S1, prerequisite — POS is now authenticated + org-scoped)

## Problem

POS sales record `pos_sales` + `pos_sale_items` and decrement `pos_products.stock_qty`, but post **nothing** to the double-entry ledger. Retail revenue, output VAT, and cash received are invisible to the P&L, balance sheet, and VAT return. This makes the financials wrong for any business that uses POS.

## Scope

**In scope (sales-side):** every completed POS sale posts a balanced journal recording revenue, output VAT, and cash. Refunds and deletes post reversing journals. POS sales gain an `AuditEvent` trail.

**Out of scope (deferred to A2b):** COGS-per-sale and inventory capitalization. There is no Inventory GL account and no path that debits inventory when stock is received, so booking `DR COGS / CR Inventory` per sale would drift the (non-existent) inventory balance negative. Inventory stays perpetual in `pos_products.stock_qty`; COGS is recognised via a period-end adjustment until A2b builds a proper inventory subledger.

## Decisions (locked)

1. **Inventory/COGS:** sales-side only (above).
2. **Asset account:** all POS proceeds debit **1000 Bank Current Account**, regardless of payment method (cash/card/mobile/split). Consistent with the existing invoice cash-sale flow; no new accounts, no migration. Till/card-clearing separation is a possible fast-follow.
3. **Reversal lifecycle:** "reverse, don't delete" (the app's established principle — immutable posted journals, invoice voids, A3 reversing entries). Refund posts a reversal; delete posts a reversal too, unless the sale was already refunded (its reversal already exists).

## Chart of accounts (existing starter seed — no changes)

| Code | Name | Type | Role in POS posting |
|------|------|------|---------------------|
| 1000 | Bank Current Account | asset (bank) | DR on sale (cash in) |
| 2100 | VAT Payable | liability | CR on sale (output VAT owed) |
| 4000 | Sales | revenue (sales) | CR on sale (net revenue) |

All three are seeded `is_system = true` for every org, so `resolveSystemAccount` finds them.

## Journal shapes

Money is computed server-side in `processSale` today (already hardened in S1): `subtotal`, `discount`, `taxTotal`, `total`, with `net = subtotal − discount` and `total = net + taxTotal`.

### Sale (`sourceType: "pos_sale"`, `sourceId: saleId`, `journalDate: soldAt`)

```
DR 1000 Bank            total
   CR 4000 Sales            net       (= subtotal − discount)
   CR 2100 VAT Payable      taxTotal  ← omitted when taxTotal === 0
```

Balances by construction: `net + taxTotal = total`. `assertJournalBalances` is asserted before posting as a safety net.

### Reversal (refund → `sourceType: "pos_refund"`; delete → `sourceType: "pos_sale_void"`; `reversedJournalId` = sale journal id; `sourceId: saleId`; `journalDate: today`)

```
DR 4000 Sales            net
DR 2100 VAT Payable      taxTotal  ← omitted when taxTotal === 0
   CR 1000 Bank              total
```

Reversals are dated **today** (like `voidInvoice`), so a reversal never posts into a closed period even if the original sale is old.

## Components

### `lib/pos/posting.ts` (new)

- `postPosSaleJournal(tx, orgId, userId, sale)` — builds the sale journal above, creates it `DRAFT` then flips to `POSTED` (immutability trigger only fires on the draft→posted transition), writes the `AuditEvent`. Idempotent: **no-ops (skips)** if a `pos_sale` journal already exists for `saleId` (a retry must never double-post revenue).
- `reversePosSaleJournal(tx, orgId, userId, saleId, reversalSourceType)` — loads the original `pos_sale` journal for `saleId`, builds the mirror journal, posts it, writes the `AuditEvent`. No-ops if a reversal already exists for that sale.
- `sale` input carries the already-derived `netMinor`, `taxMinor`, `totalMinor` (passed from `processSale`, which already computes them) plus `saleId`, `saleNumber`, `soldAt`.

The module depends only on the passed `tx` client, `orgId`, `userId`, and the money figures — no I/O beyond Prisma. It can be understood and tested in isolation.

### Reuse from `lib/accounting/documents.ts` (export, do not duplicate)

- `resolveSystemAccount(tx, orgId, { code, accountType })` — currently module-private; export it.
- `assertJournalBalances(kind, ref, lines)` — currently module-private; export it.

A POS-local `salesAccount = { code: "4000", accountType: "REVENUE" }` constant is defined in `posting.ts` (documents.ts has `bankAccount` 1000 and `outputVatAccount` 2100 but no sales constant, because invoices carry a per-line revenue account).

### `lib/pos/dal.ts` (integrate — all inside the existing `$transaction` blocks)

- `processSale`: after creating `pos_sales` + items and decrementing stock, call `postPosSaleJournal`. Atomic — a posting failure rolls back the whole sale.
- `refundSale`: after restoring stock and setting `status = "refunded"`, call `reversePosSaleJournal(..., "pos_refund")`.
- `deleteSale`: mirror the existing double-restore stock guard — if `status !== "refunded"`, call `reversePosSaleJournal(..., "pos_sale_void")` before deleting the rows; if already refunded, the reversal exists, so just delete.

### Linkage & idempotency

No `pos_sales` schema change (avoids the known migration-drift risk). The link is `journal.sourceType ∈ {pos_sale, pos_refund, pos_sale_void}` + `journal.sourceId = saleId`. Idempotency guards query these before posting.

### Audit

Each posting/reversal writes an `AuditEvent` (`entityType: "pos_sale"`, `action: POST`), recording `journalId` and `totalMinor`. Closes the "POS writes no AuditEvent rows" gap noted in the status ledger.

### Tenancy

`processSale`/`refundSale`/`deleteSale` run under `requirePosAccess`/`requirePosManager`, which call `requireAccountingWorkspace` and establish the scoped tenant context. `Journal`/`JournalLine` are org-scoped and auto-guarded by the tenancy extension, so `organizationId` is injected/verified on every journal write. The `pos_*` tables remain manually org-scoped as before.

## Error handling

- Sale money is invalid / lines empty → existing `PosValidationError` (unchanged; posting is downstream of validation).
- A required system account (1000/2100/4000) missing → `resolveSystemAccount` throws its existing descriptive error; the transaction rolls back, so no partial sale.
- Sale date in a closed period → `assertPeriodOpen` throws (sales are dated "now", so this is a guard, not an expected path).
- Debits ≠ credits (drift) → `assertJournalBalances` throws before posting.
- Double-post / double-reverse → idempotency guards short-circuit.

## Testing (TDD, real-DB fixtures via `createTestPosProduct` + `createTestOrg`)

1. A completed sale posts a balanced journal: `DR 1000 = total`, `CR 4000 = net`, `CR 2100 = taxTotal`; debits == credits.
2. A zero-VAT sale (product `tax_rate = 0`) omits the VAT line.
3. A whole-cart discount reduces the 4000 Sales credit to `net` (not `subtotal`).
4. `refundSale` posts a reversal that nets the sale's ledger impact to zero.
5. `deleteSale` on a not-refunded sale posts a reversal.
6. `deleteSale` on an already-refunded sale does **not** double-reverse.
7. The sale journal carries `sourceType = "pos_sale"` and `sourceId = saleId`.
8. Re-posting the same sale is a no-op (idempotency).

## Definition of done

Code changed · `pnpm typecheck` exits 0 · the tests above added and passing · full suite green · `PROJECT-STATUS.md` A2 row updated. Independent accountant-auditor review of the posting math before marking complete.
