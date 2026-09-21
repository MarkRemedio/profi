# Bulk Mark-as-Paid — Design Spec

**Date:** 2026-07-15
**Status:** Approved (brainstorming) — ready for implementation planning
**Branch:** `feature/bulk-mark-paid`

## Goal

Let a user select multiple invoices in the invoices table and record payment for all of them in one pass, via a right-hand side sheet: each invoice defaults to its full outstanding balance (editable per row), paid into one shared bank account (overridable per row), with a shared payment method dated today. Each invoice is settled independently and the user gets a per-invoice result summary.

## Context — what already exists (reuse, don't rebuild)

- **Multi-select UI is already built** in `components/sales/invoices.tsx`: `selectedInvoices` Set state, a select-all header checkbox, per-row checkboxes, and a **bulk-action toolbar** that appears when ≥1 is selected. Its **"Mark Paid" button currently only shows a "coming soon" toast** ([invoices.tsx:685](../../../components/sales/invoices.tsx#L685)) — this is the trigger to wire up.
- **Payment primitive exists and is tested:** `payInvoice(prisma, orgId, actorUserId, invoiceId, paymentAmountMinor?, depositAccountId?, paymentMethod?)` ([lib/accounting/documents.ts:2202](../../../lib/accounting/documents.ts#L2202)) posts a payment journal (debit bank / credit AR), defaults to the full total when no amount is given, resolves the deposit account (or falls back to system bank `1000`), and calls `assertPeriodOpen`. It only pays invoices with status `APPROVED` or `SENT`.
- **Single-invoice server action:** `payInvoiceDocument(invoiceId, amountMinor, depositAccountId?, paymentMethod?)` ([app/(dashboard)/sales/invoices/actions.ts](../../../app/(dashboard)/sales/invoices/actions.ts)) wraps `payInvoice` behind `requireAccountantRole()` and revalidates views.
- **Bank accounts already loaded** for this view: `use-invoices.ts` exposes `bankAccounts` ([use-invoices.ts:299](../../../components/sales/use-invoices.ts#L299)); the single-payment dialog defaults the deposit account to code `1000` or the first available.
- **UI primitives available:** `components/ui/{dialog,accordion,select,checkbox}.tsx`. There is **no** `sheet`/`drawer` primitive.
- **Money is `BigInt` minor units**; all queries org-scoped; `PaymentMethod = "cash" | "cheque" | "bank_transfer"`.

## Settled decisions (from brainstorming)

1. **Amounts:** default each row to its full outstanding balance, **editable per row** (supports partial payments in bulk).
2. **Bank account:** one shared "Paid into" picker (default `1000`) applied to all, with **per-row override**.
3. **Method & date:** one shared method (default `bank_transfer`) for the batch; payments dated **today** (no date picker — matches current behavior; no `payInvoice` date-model change).
4. **Batch semantics:** **independent per invoice** — auto-skip non-payable rows, pay the rest each in its own transaction, one failure never rolls back the others; end with a per-invoice result summary.
5. **Execution:** **Approach B** — a single new `bulkPayInvoices` server action loops the existing `payInvoice` primitive server-side and returns a per-invoice result array; one revalidation.

## Architecture

```
invoices.tsx (existing multi-select + toolbar)
   │  "Mark Paid" button → opens
   ▼
BulkMarkPaidSheet (NEW client component)
   │  builds validated items[] + shared method
   ▼
bulkPayInvoices(items, paymentMethod)  (NEW server action)
   │  loops → payInvoice() per item (each its own txn), try/catch
   ▼
returns BulkPayResult[]  → sheet renders summary
```

### UI — `components/sales/bulk-mark-paid-sheet.tsx` (new)

- **Container:** a right-anchored panel built on the existing Radix `dialog` primitive styled to slide in from the right (no new dependency). If a reusable `Sheet` wrapper is warranted, add a thin `components/ui/sheet.tsx` over the same primitive — decide during planning; either way it is a right-side overlay.
- **Props:** `open`, `onOpenChange`, `invoices` (the selected invoice rows, already in memory in `invoices.tsx`), `bankAccounts`, and an `onSubmit(items, method)` callback that calls the new action.
- **Header:** "Mark N invoices as paid".
- **Shared controls (top):** `Paid into` — `Select` of `bankAccounts`, default code `1000` (or first); `Method` — `Select` of the three `PaymentMethod` values, default `bank_transfer`.
- **Payable rows:** an `accordion`, one item per *payable* selected invoice (`APPROVED`/`SENT` with outstanding balance > 0):
  - Collapsed: invoice no · customer name · outstanding balance · **amount input pre-filled to the outstanding balance (editable)**.
  - Expanded: per-row **deposit-account override** `Select` (defaults to the shared account).
  - A per-row include toggle (checkbox) so a user can drop a row without deselecting it in the table.
- **Skipped section:** selected-but-not-payable invoices (draft / void / zero-balance) listed muted with the reason; excluded from `items[]`.
- **Footer:** running total "Recording £X across N invoices" + **Confirm**. Confirm is disabled when there are no included payable rows or any included row's amount is invalid.
- **Client-side validation per row:** amount > 0 and ≤ that invoice's outstanding balance.

### Backend — `bulkPayInvoices` server action (in `app/(dashboard)/sales/invoices/actions.ts`)

- **Signature:** `bulkPayInvoices(items: { invoiceId: string; amountMinor: number; depositAccountId?: string }[], paymentMethod?: PaymentMethod): Promise<BulkPayResult[]>`.
- **Auth:** `requireAccountantRole()` (same gate as the single path).
- **Per item** (in declaration order), independently:
  1. Re-fetch the invoice org-scoped; derive its outstanding balance (`totalMinor - amountPaidMinor`).
  2. If not `APPROVED`/`SENT` or balance ≤ 0 → result `{ status: "skipped", reason }` (do not post).
  3. **Overpayment guard:** if `amountMinor` ≤ 0 or `amountMinor` > outstanding balance → `{ status: "failed", reason: "amount exceeds balance" }`. (Closes a gap: `payInvoice` itself does not currently guard overpayment.)
  4. Otherwise call `payInvoice(prisma, orgId, userId, invoiceId, BigInt(amountMinor), depositAccountId, paymentMethod)` inside a try/catch → `{ status: "paid", journalId }` or `{ status: "failed", reason: error.message }` (e.g. period closed).
- **Revalidate views once** after the loop.
- **Result type:** `type BulkPayResult = { invoiceId: string; status: "paid" | "skipped" | "failed"; reason?: string; journalId?: string }`.

### Data flow / post-submit UX

- Sheet builds `items[]` from included, validated rows and calls `bulkPayInvoices`.
- On return: render a summary toast + inline per-row status ("N paid · N skipped · N failed (reason)").
- **On full success:** close sheet, clear the table selection.
- **On partial failure:** keep the sheet open showing per-row statuses; **leave failed/skipped invoices selected** in the table so the user can retry or open them individually. Successfully-paid rows are removed from selection.

## Edge cases & correctness

- Only `APPROVED`/`SENT` with positive balance are payable; drafts/voids/zero-balance are skipped with a reason, never posted.
- Overpayment blocked in both the client (row validation) and the server (guard) — belt and suspenders, since money.
- One failure (period closed, race, etc.) surfaces as `failed` for that row only; other rows still post (each `payInvoice` is its own `$transaction`).
- Concurrency: the overpayment guard is **best-effort / snapshot-based** — the paid balance is read once before the loop and refreshed in-memory after each successful payment, so a duplicate `invoiceId` *within one batch* cannot double-pay. It does **not** protect against a cross-session race: two concurrent batches/sessions paying the same invoice could each pass their guard, because `payInvoice` does not re-check the outstanding balance inside its transaction. This is a **pre-existing property of the single-invoice `payInvoice`/`payInvoiceDocument` path** — this feature adds no per-invoice risk beyond it. Hardening it (pushing the outstanding-balance check into `payInvoice`'s transaction) is a separate follow-up that would improve both paths at once.
- Permissions: `requireAccountantRole()` — non-accountants cannot bulk-pay, same as single.

## Testing strategy

- **Server (TDD):** a `bulkPayInvoices` test with a mixed batch — two payable (one full, one partial), one already-paid (→ skipped), one with an over-balance amount (→ failed) — asserting: the returned per-invoice statuses; that paid invoices received correct payment journals and updated `amountPaidMinor`; and that skipped/failed invoices were left untouched (no journal, unchanged balance). Real Postgres via `tests/fixtures.ts`.
- **Client:** no React component-test harness in this repo → verify via `pnpm typecheck` + `pnpm build` + the `/verify` skill (drive the sheet).

## Out of scope (explicitly not now)

- A payment-date picker / back-dating (would require extending `payInvoice`'s date model) — deferred.
- Bulk actions other than mark-as-paid (bulk void, bulk send) — not part of this spec.
- Bulk payment for **bills** (AP side) — mirror later if wanted.
- Changing the existing single-invoice payment dialog.

## Open items to resolve in the implementation plan

- Whether to add a reusable `components/ui/sheet.tsx` wrapper or inline the right-panel styling on `dialog` for this one use — trivial, decide in the plan.
- Exact copy for the summary toast and skipped-reason labels.
