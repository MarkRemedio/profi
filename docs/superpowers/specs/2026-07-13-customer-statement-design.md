# Customer Statement — Design Spec

**Date:** 2026-07-13
**Status:** Phases 0/2/3 implemented (statement shipped); Phase 1 (credit-note rebuild) split to its own fast-follow spec
**Reviewed by:** `accountant-auditor` (senior-accountant pass on the feature list, 2026-07-13)

## Verification done
- `lib/accounting/customer-statement.ts` calc core: 11 unit tests passing
  (`tests/customer-statement.test.ts`) — opening-balance period continuity, partial
  payments (part-early/part-late), draft/void exclusion, null due date, aging buckets,
  as-of payment filtering, informational docs, GBP guard, same-day ordering.
- `tsc --noEmit` clean, `eslint` clean on all changed files.
- `next build` succeeds; `/sales/statements` is a dynamic route and the server/client
  boundary holds (pure calc runs client-side, loader stays server-only).
- NOT yet driven live in a browser (needs a running DB + authenticated session).

## Goal

Turn the current customer "statement" (a flat invoice list with an inferred paid figure)
into a real **statement of account**: opening balance → dated transactions with a running
balance → closing balance, with overdue/aging, per-payment days-late/early, and
expandable line-item detail.

## In scope

1. **Opening balance** (balance brought forward) + running balance + balance carried forward.
2. **Overdue state** per open item (`today − dueDate`, computed off the *outstanding* remainder).
3. **Days late** per payment event (`paidAt − dueDate`).
4. **Days early** per payment event (`dueDate − paidAt`).
5. **Transparency**: expandable per-invoice line detail (description, qty, unit, per-line VAT, discount).
6. **Two views**: activity/date-range (default) + outstanding-items-only (toggle).

## Explicitly out of scope (future specs)

- Customizable statement templates / branding.
- Automatic weekly/monthly statement email (no email or scheduler infra exists yet).
  - Constraint honoured now: the calculation core takes an explicit `asOfDate`, so a future
    scheduled job can reuse it unchanged.

## Delivery: one spec, four ordered phases

Each phase is independently testable/reviewable.

### Phase 0 — Foundation fixes (prerequisites, no new UI)

The current statements page has two live defects that every requested feature depends on:

- **Auth/org isolation.** `app/(dashboard)/sales/statements/page.tsx` calls
  `prisma.organization.findFirst()` with no session/role check — it serves the first org in
  the whole database. Fix to match every other sales page: `requireAccountantRole()` + the
  caller's real org.
- **Payment-blindness.** The page fetches invoice headers only — no `amountPaidMinor`,
  no `payments[]`, no `lines`. Result: a fully-paid invoice renders as fully outstanding.
  Fetch the payment-aware, line-inclusive invoice shape (the same one `use-invoices` /
  `documents.ts` already produce).

### Phase 1 — Credit-note GL posting — SPLIT OUT to its own spec (decided 2026-07-13)

**Scope discovery:** the `CreditNote` model (`prisma/schema.prisma:1445`) stores only a gross
`totalMinor` + free-text `invoiceRef` — no line items, no VAT split, no revenue account, and no
`postedJournalId`/`voidJournalId`. It cannot be posted correctly as-is: a correct journal
(`Dr Revenue / Dr Output VAT / Cr AR`) needs a revenue account and a VAT portion the model
doesn't record. "Fix posting" therefore means **rebuilding the credit note into a real
line-itemed, VAT-aware, posted document** (new `CreditNoteLine`, tax + journal-link fields, a
migration, reworked create UI) — a project on the scale of the 2026-07-07 refund-receipt
feature, for which `receipts.ts` is a near-exact template (a credit note credits AR instead of
the bank).

**Decision:** ship the statement first; do the credit-note rebuild as a separate fast-follow
spec/plan. Until it lands, credit notes appear on the statement as **informational** lines
(flagged "not yet reflected in balance") and do **not** move the running balance.

**Known limitation (documented, not built):** there is no `PaymentAllocation` table and no
on-account/credit-balance concept — every payment is hard-linked to one invoice
(`sourceId → invoice`). So a customer cannot hold an unapplied credit/overpayment, and a
refund cannot reduce a credit balance (Scenario 2 of the classic refund model is unreachable).
Refund receipts are therefore always informational on the statement here.

### Phase 2 — Statement calculation core (pure, unit-tested, no UI)

New pure function in `lib/accounting/`, e.g. `customer-statement.ts`:

```
buildCustomerStatement(contactId, { fromDate, toDate, asOfDate }) => {
  openingBalanceMinor,          // net AR position of all A/R txns dated < fromDate
  rows: StatementRow[],         // dated, ordered, each with runningBalanceMinor
  closingBalanceMinor,
  aging: { current, d1_30, d31_60, d61_90, d90plus },   // as at asOfDate, reuse ar-aging thresholds
  outstandingItems: OpenItem[], // for the outstanding-only view; each with daysOverdue on remainder
}
```

Correctness rules (from the accountant review — these are the reason this phase is pure & tested):

- **Ledger contract (what moves the balance):**
  | Document | On statement | Moves balance |
  |---|---|---|
  | Invoice (not VOID) | yes | +increases |
  | Payment (against invoice, `paidAt`) | yes | −decreases |
  | Credit note | yes | informational badge, no change (until the credit-note rebuild lands) |
  | Sales receipt (standalone) | yes | informational badge, no change |
  | Refund receipt | yes | informational badge, no change |
- **Opening balance** = Σ(invoice totals issued `< fromDate`, not VOID) − Σ(payments with
  `paidAt < fromDate`) − Σ(credit notes dated `< fromDate`). Filter payments by `paidAt`, **not**
  by parent-invoice date. Invariant: closing balance of period N == opening balance of period N+1.
- **Status is derived, never stored.** `InvoiceStatus` is only `DRAFT|APPROVED|SENT|VOID` — there
  is no `PAID`. "Paid"/"outstanding" is always `totalMinor − amountPaidMinor`, computed per invoice.
  Never treat an APPROVED/SENT invoice as fully owed.
- **Overdue** is computed off the **outstanding remainder**, not the gross total, and only for
  items with remainder > 0.
- **Days late / days early are per-payment-event, not per-invoice** (partial/multiple payments mean
  one invoice can be part-early, part-late). Shown on payment rows in the drill-down.
- **`asOfDate`** drives all date-relative maths; defaults to today but is never hardcoded.
- **`dueDate` nullable policy:** a missing due date ⇒ not overdue, shown under "Current".
- **Currency:** GBP-only guard. If a non-GBP invoice is encountered, exclude it and surface a
  warning rather than summing mixed minor units silently.
- **Voids:** VOID invoices excluded from opening balance, running balance, aging, and totals;
  if shown at all in the activity list they carry a clear VOID treatment and don't affect balance.
- **Reversed payments** already excluded upstream by `getPaymentDetailsMap`; rely on that.

### Phase 3 — Statement UI

Rebuild `components/sales/customer-statements.tsx`:

- Date-range activity view (default) with "Balance brought forward" → rows → "Balance carried
  forward"; period presets + custom range.
- Toggle to outstanding-items-only view (each item with days-overdue on its remainder).
- Expandable invoice rows revealing line-item detail with per-line VAT (respect `amountsAre`).
- Overdue badges; informational "Paid at time of sale / no balance impact" badges for cash
  sales & refunds.
- Aging summary footer (Current / 1–30 / 31–60 / 61–90 / 90+), reusing the existing
  `ar-aging-view` thresholds.
- Preserve existing print support.

## Testing

- Phase 1: journal correctness via `accountant-auditor` + any existing accounting tests.
- Phase 2: unit tests over fixtures — opening-balance period continuity, partial payments,
  credit notes, voids, null due dates, days-late/early edge cases, GBP guard.
- Phase 3: drive the real page (per project `verify` conventions) to confirm numbers render.

## Project constraints

- **Next.js is customized** (`AGENTS.md`): read `node_modules/next/dist/docs/` for the relevant
  API before writing server-component / data-fetching / server-action code.
- **No auto-commit** (user preference): implementation is left uncommitted for manual commit.
