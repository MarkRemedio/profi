# Payroll → Ledger Posting (A1) — Design

> **Status:** approved 2026-07-01 · **Audit ref:** A1 (Critical) in [`PROJECT-STATUS.md`](../../PROJECT-STATUS.md)
> **Sibling:** [`2026-07-01-pos-ledger-posting-design.md`](2026-07-01-pos-ledger-posting-design.md) (A2 — same posting pattern)

## Problem

Payroll runs record `PayrollRun` + `PayrollRunEmployee` rows but post **nothing** to the double-entry ledger. Wages, PAYE, NI, pension liabilities, and net-pay cash never reach the P&L or balance sheet. Approving a run (`approvePayrollRun`) only flips its status; the `PayrollRun.journal_id` column exists but is never populated.

## Scope

**In scope:** approving a payroll run posts a balanced journal recording the wage expense, the PAYE/NI and pension liabilities, and the net cash paid. A reverse action backs it out. The 2 payroll liability accounts are created lazily.

**Out of scope (A1b):** accurate UK statutory PAYE/NI/pension calculation and moving the calc server-side (today PAYE = `gross × 0.15`, NI = `gross × 0.08` are computed in the browser and client-trusted — [components/payroll/run-payroll-view.tsx:110](../../../components/payroll/run-payroll-view.tsx#L110)). A1 posts whatever figures the run already stored; those figures are estimates until A1b. Also out of scope: employer-NI / employer-pension **cost** expense lines, and an accrue-then-pay two-step (net is treated as paid from Bank on the pay date).

## Decisions (locked)

1. **Figures:** post the run's stored totals (`totalGrossMinor`, `totalTaxMinor`, `totalNIMinor`, `totalPensionMinor`, `totalNetMinor`). Accuracy is A1b.
2. **Journal shape:** proper liabilities (below), net treated as disbursed from Bank on the pay date.
3. **New accounts:** created lazily per-org (no migration).
4. **Trigger:** post on `approvePayrollRun`; a `reversePayrollRun` action backs it out.

## Chart of accounts

| Code | Name | Type / category | Status |
|------|------|-----------------|--------|
| 7000 | Payroll Expenses | expense / expense | existing (seed) |
| 1000 | Bank Current Account | asset / bank | existing (seed) |
| 2200 | PAYE & NI Payable | liability / current_liability | **created lazily** |
| 2210 | Pension Payable | liability / current_liability | **created lazily** |

2000 (AP) and 2100 (VAT Payable) already occupy those codes; 2200/2210 are free in the liability range.

## Journal shapes

Run totals satisfy the identity `gross = tax + NI + pension + net` (net is `gross − tax − NI − pension` by construction in `createPayrollRun`).

### Approve (`sourceType: "payroll_run"`, `sourceId: run.id`, `journalDate: run.payDate`)

```
DR 7000 Payroll Expenses      totalGrossMinor
   CR 2200 PAYE & NI Payable      totalTaxMinor + totalNIMinor   ← omitted when 0
   CR 2210 Pension Payable        totalPensionMinor              ← omitted when 0
   CR 1000 Bank                   totalNetMinor
```

`assertJournalBalances("Payroll run", run.name, lines)` runs before posting. If a run's stored figures don't satisfy the identity, posting fails loudly rather than writing an unbalanced journal.

### Reverse (`sourceType: "payroll_run_void"`, `reversedJournalId` = approve journal, `sourceId: run.id`, `journalDate: today`)

Mirror of the approve journal with debits/credits swapped. Dated **today**, so it never posts into a closed period.

## Components

### `lib/payroll/posting.ts` (new)

- `postPayrollRunJournal(tx, orgId, userId, run)` where `run = { runId, name, payDate, grossMinor, taxMinor, niMinor, pensionMinor, netMinor }`. Idempotent: no-ops if the `PayrollRun` already has a `journal_id`, or if a `payroll_run` journal already exists for `runId`. Builds the approve journal, `assertPeriodOpen(tx, orgId, payDate)`, `assertJournalBalances`, creates DRAFT → flips POSTED, writes the `journal_id` back onto the run, writes an `AuditEvent` (`entityType: "payroll_run"`, `action: POST`). Returns the journal id.
- `reversePayrollRunJournal(tx, orgId, userId, runId)`. Loads the original `payroll_run` journal for `runId`; no-ops if absent or a reversal already exists. `assertPeriodOpen(tx, orgId, today)`, posts the mirror (DRAFT → POSTED), clears the run's `journal_id`, writes an `AuditEvent` (`action: REVERSE`).

Depends only on the passed `tx`, ids, and the run's money figures — testable in isolation.

### `lib/accounting/documents.ts` (add + export)

`resolveOrCreateSystemAccount(tx, orgId, { code, name, accountType, reportCategory })` — like `resolveSystemAccount`, but if the account is absent it creates a `chartAccount` (`isSystem: true`, `isActive: true`, `taxCode: "no_vat"`, `taxRate: "0"`) and returns its id. Used for 2200/2210. `resolveSystemAccount` (throwing) is still used for the pre-seeded 7000/1000.

### `app/(dashboard)/payroll/actions.ts` (integrate)

- `approvePayrollRun(id)`: wrap the existing status update in `prisma.$transaction`. Load the run's totals, set `status = "APPROVED"`, call `postPayrollRunJournal`. `requireAccountantRole` already gates it (owners/accountants only) and establishes tenant context.
- New `reversePayrollRun(id)`: `requireAccountantRole`, `prisma.$transaction`, call `reversePayrollRunJournal`, set `status = "DRAFT"`. `revalidatePath`.

### Linkage & idempotency

Uses the existing `PayrollRun.journal_id` column (no schema change) plus `journal.sourceType`+`sourceId`. Idempotency guards check both before posting/reversing.

### Tenancy

`approvePayrollRun`/`reversePayrollRun` run under `requireAccountantRole` → scoped context. `Journal`/`JournalLine`/`AuditEvent`/`ChartAccount` are org-scoped and auto-guarded; every read/write carries an explicit `organizationId`.

## Error handling

- Missing 7000/1000 system account → `resolveSystemAccount` throws (descriptive); transaction rolls back.
- Unbalanced stored figures → `assertJournalBalances` throws before posting.
- Pay date in a closed period → `assertPeriodOpen` throws.
- Double-approve / double-reverse → idempotency guards short-circuit.

## Testing (TDD, real-DB fixtures via `createTestOrg`)

The posting functions are tested directly (the `approvePayrollRun` action calls `requireAccountantRole` → Supabase auth and is not unit-testable, mirroring how A2 tested `postPosSaleJournal` not `processSale`). A helper seeds a `PayrollRun` via `prisma.payrollRun.create` with explicit totals.

1. Approve posts a balanced journal: `DR 7000 = gross`, `CR 2200 = tax + NI`, `CR 1000 = net`; debits == credits.
2. The `2200`/`2210` accounts are lazily created in the org's chart on first posting.
3. A run with `totalPensionMinor = 0` omits the 2210 line.
4. `reversePayrollRunJournal` posts a reversal that nets the run's ledger impact to zero and clears `journal_id`.
5. Re-posting a run that already has a `journal_id` is a no-op (idempotency).
6. A run whose stored figures violate `gross = tax + NI + pension + net` fails to post (unbalanced).

## Definition of done

Code changed · `pnpm typecheck` exits 0 · the tests above added and passing · full suite green · `PROJECT-STATUS.md` A1 row updated (and A1b recorded). Independent accountant-auditor review of the posting math before marking complete.
