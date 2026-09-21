# Invoice payment deposit account — design

**Date:** 2026-07-02
**Status:** Approved

## Problem

Recording a payment against an invoice (Record Payment box in the invoice
slide-out panel) always debits the hardcoded system bank account `1000 —
Business Bank Account` (`payInvoice` in `lib/accounting/documents.ts`). Orgs
with more than one bank account cannot record which account the money actually
arrived in, which breaks bank reconciliation. The cash-sale path on the invoice
form already lets the user pick a deposit account; the pay-later path does not.

## Decision

The bank account is chosen **at payment time** (not on the invoice). The bank
is a property of the payment: each partial payment can land in a different
account. This matches the existing cash-sale pattern and standard accounting
UX (Xero/QuickBooks "Paid into").

## Changes

1. **UI — `components/sales/view-invoice-dialog.tsx`**
   New "Deposit into" Select above the amount row in the Record Payment box.
   Options: org's bank-eligible accounts (asset accounts excluding AR `1100`
   and VAT control `1200` — same filter as the cash-sale flow). Pre-selected
   to the `1000` account so the common case needs no extra clicks. Accounts
   arrive via a new `accounts` prop from `invoices.tsx` (already available
   from `useInvoices`).

2. **Wiring** — thread optional `depositAccountId` through:
   `ViewInvoiceDialog.onRecordPayment(invoiceId, amountMinor, depositAccountId)`
   → `useInvoices.payInvoice` → `payInvoiceDocument` server action
   → `payInvoice()` in `lib/accounting/documents.ts`.

3. **Ledger — `payInvoice()`**
   Optional `depositAccountId` parameter. If provided, validate server-side
   via a shared `resolveDepositAccount` helper: belongs to the org, active,
   asset type, report category BANK (a semantic filter rather than a code
   deny-list, so control accounts and non-liquid assets stay excluded as the
   chart grows) — otherwise throw. If absent, fall back to
   `resolveSystemAccount(bankAccount)` exactly as today, so existing callers
   are unaffected.

## Discovered and fixed during implementation

- **Cash-sale deposit select was broken**: `getInvoiceWorkspace` sends only
  income accounts to the client, so `CreateInvoiceView`'s bank filter always
  produced an empty list. The workspace payload now includes a dedicated
  `bankAccounts` list (BANK-category accounts) consumed by both the cash-sale
  select and the new payment select.
- **Cash-sale deposit id was unvalidated** (security): `approveInvoice()`
  previously posted the client-supplied `depositAccountId` straight into the
  journal with no org/type check. It now goes through `resolveDepositAccount`.
- **Cash-sale select had no default/guard**: it now defaults to account 1000
  and submit is blocked while a cash sale has no deposit account selected.
- The invoice slide-out panel's overlay was lowered from `z-[100]` to `z-50`
  so the new Select dropdown (portaled to body at `z-50`) renders above it —
  same layering fix as the chart-of-accounts dialog.

## Out of scope

- No default-bank field on the invoice form.
- Bill payments have the same hardcoded-bank gap on the purchases side —
  separate follow-up.

## Verification

Typecheck; full vitest suite including new `tests/invoice-deposit-account.test.ts`
(7 tests): debit = chosen bank / credit = AR with equal amounts, fallback to
`1000` when omitted, rejection of foreign-org, inactive, revenue, and AR
control accounts for both `payInvoice` and the cash-sale path.
