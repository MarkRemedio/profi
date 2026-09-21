# Payroll → Ledger Posting (A1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Approving a payroll run posts a balanced double-entry journal (wage expense, PAYE/NI + pension liabilities, net-pay cash), with a reverse action that backs it out, so payroll reaches the P&L and balance sheet.

**Architecture:** A new `lib/payroll/posting.ts` builds and posts the journals, reusing the invoice/POS engine's `resolveSystemAccount` + `assertJournalBalances` + `assertPeriodOpen` and the DRAFT→POSTED flip. The two payroll liability accounts (2200, 2210) are created per-org on first use via a new `resolveOrCreateSystemAccount`, so no migration. Linkage uses the pre-existing `PayrollRun.journal_id` column plus `journal.sourceType`+`sourceId` — no schema change.

**Tech Stack:** TypeScript, Prisma (tenancy-guarded extended client), Vitest (real dev-DB fixtures), Next.js server actions.

**Spec:** [`docs/superpowers/specs/2026-07-01-payroll-ledger-posting-design.md`](../specs/2026-07-01-payroll-ledger-posting-design.md)

## Global Constraints

- Money is integer minor units as `bigint`. Run totals satisfy `gross = tax + NI + pension + net`.
- Accounts: **7000 Payroll Expenses** (EXPENSE) and **1000 Bank** (ASSET) are pre-seeded → resolve with `resolveSystemAccount` (throws if missing). **2200 PAYE & NI Payable** and **2210 Pension Payable** (LIABILITY / CURRENT_LIABILITY) are created lazily with `resolveOrCreateSystemAccount`.
- Prisma enum values are uppercase: `AccountType.LIABILITY`, `AccountReportCategory.CURRENT_LIABILITY`.
- Posted journals are immutable (DB triggers): create DRAFT, then `update` to POSTED — never a direct POSTED insert with lines.
- Every Journal/JournalLine/ChartAccount/AuditEvent/PayrollRun query and write carries an explicit `organizationId` (except update-by-unique-id, which the tenancy guard passes through).
- The approve journal is dated `run.payDate`; the reversal is dated **today**.
- `PayrollRun.journal_id` is the Prisma field name (no camel alias); read with `select: { journal_id: true }`, write with `data: { journal_id: ... }`.
- Do NOT run `git add`/`git commit` — the user commits manually. Leave changes in the working tree.

---

### Task 1: `resolveOrCreateSystemAccount`

**Files:**
- Modify: `lib/accounting/documents.ts` (add next to `resolveSystemAccount`, ~line 416)
- Test: `tests/accounting/resolve-or-create.test.ts` (new)

**Interfaces:**
- Produces: `export async function resolveOrCreateSystemAccount(tx: TransactionClient, organizationId: string, target: { code: string; name: string; accountType: AccountType; reportCategory: AccountReportCategory }): Promise<string>` — returns the id of the matching active chart account, creating it (`isSystem: true`, `isActive: true`, `taxCode: "no_vat"`, `taxRate: "0"`) if absent.

- [ ] **Step 1: Write the failing test**

Create `tests/accounting/resolve-or-create.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveOrCreateSystemAccount } from "@/lib/accounting/documents";
import { createTestOrg, dropTestOrg, type TestOrg } from "../fixtures";

let testOrg: TestOrg;
beforeEach(async () => { testOrg = await createTestOrg(); });
afterEach(async () => { await dropTestOrg(testOrg.orgId); });

const target = {
  code: "2200",
  name: "PAYE & NI Payable",
  accountType: "LIABILITY" as const,
  reportCategory: "CURRENT_LIABILITY" as const,
};

describe("resolveOrCreateSystemAccount", () => {
  it("creates the account when absent and returns its id", async () => {
    const id = await resolveOrCreateSystemAccount(prisma, testOrg.orgId, target);
    const account = await prisma.chartAccount.findFirstOrThrow({
      where: { organizationId: testOrg.orgId, code: "2200" },
    });
    expect(account.id).toBe(id);
    expect(account.accountType).toBe("LIABILITY");
    expect(account.reportCategory).toBe("CURRENT_LIABILITY");
    expect(account.isSystem).toBe(true);
  });

  it("is idempotent — returns the same id and does not duplicate", async () => {
    const first = await resolveOrCreateSystemAccount(prisma, testOrg.orgId, target);
    const second = await resolveOrCreateSystemAccount(prisma, testOrg.orgId, target);
    expect(second).toBe(first);
    const count = await prisma.chartAccount.count({ where: { organizationId: testOrg.orgId, code: "2200" } });
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/accounting/resolve-or-create.test.ts`
Expected: FAIL — `resolveOrCreateSystemAccount` is not exported (import error / not a function).

- [ ] **Step 3: Implement the helper**

In `lib/accounting/documents.ts`, add `AccountReportCategory` to the existing `@prisma/client` type import (it already imports `type AccountReportCategory` — confirm; if not, add it). Then add immediately after `resolveSystemAccount` (~line 438):

```typescript
export async function resolveOrCreateSystemAccount(
  tx: Tx,
  organizationId: string,
  target: { code: string; name: string; accountType: AccountType; reportCategory: AccountReportCategory }
) {
  const existing = await tx.chartAccount.findFirst({
    where: { organizationId, isActive: true, code: target.code, accountType: target.accountType },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.chartAccount.create({
    data: {
      organizationId,
      code: target.code,
      name: target.name,
      accountType: target.accountType,
      reportCategory: target.reportCategory,
      taxCode: "no_vat",
      taxRate: "0",
      isSystem: true,
      isActive: true,
    },
    select: { id: true },
  });
  return created.id;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/accounting/resolve-or-create.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit** — SKIP (manual-commit environment). Leave changes staged in the working tree.

---

### Task 2: `postPayrollRunJournal` + wire `approvePayrollRun`

**Files:**
- Create: `lib/payroll/posting.ts`
- Modify: `app/(dashboard)/payroll/actions.ts` (`approvePayrollRun`, ~line 452)
- Test: `tests/payroll/ledger-posting.test.ts` (new)

**Interfaces:**
- Consumes: `resolveSystemAccount`, `resolveOrCreateSystemAccount`, `assertJournalBalances` (from `@/lib/accounting/documents`); `assertPeriodOpen` (from `@/lib/accounting/period-close`); `TransactionClient` (from `@/lib/prisma`); `AuditAction`, `JournalStatus` (from `@prisma/client`).
- Produces: `export async function postPayrollRunJournal(tx: TransactionClient, orgId: string, userId: string, runId: string): Promise<string | null>` — loads the run, posts the approve journal, stores `journal_id`, returns the journal id (or `null` if already posted / run missing).

- [ ] **Step 1: Write the failing test**

Create `tests/payroll/ledger-posting.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { postPayrollRunJournal } from "@/lib/payroll/posting";
import { createTestOrg, dropTestOrg, type TestOrg } from "../fixtures";

let testOrg: TestOrg;
beforeEach(async () => { testOrg = await createTestOrg(); });
afterEach(async () => { await dropTestOrg(testOrg.orgId); });

// Seed a PayrollRun with explicit totals. Identity: gross = tax + ni + pension + net.
async function seedRun(orgId: string, totals: {
  gross: number; tax: number; ni: number; pension: number; net: number;
}) {
  const day = new Date("2026-06-30T00:00:00.000Z");
  return prisma.payrollRun.create({
    data: {
      organizationId: orgId,
      name: "June payroll",
      payDate: day,
      pay_period_start: day,
      pay_period_end: day,
      status: "DRAFT",
      totalGrossMinor: BigInt(totals.gross),
      totalTaxMinor: BigInt(totals.tax),
      totalNIMinor: BigInt(totals.ni),
      totalPensionMinor: BigInt(totals.pension),
      totalNetMinor: BigInt(totals.net),
    },
    select: { id: true },
  });
}

async function runJournalLines(orgId: string) {
  const journals = await prisma.journal.findMany({
    where: { organizationId: orgId, sourceType: "payroll_run" },
    include: { lines: { include: { account: true } } },
  });
  return { journals, lines: journals.flatMap((j) => j.lines) };
}

function byCode(lines: Array<{ account: { code: string }; debitMinor: bigint; creditMinor: bigint }>, code: string) {
  return lines.find((l) => l.account.code === code);
}

describe("payroll run ledger posting", () => {
  it("posts a balanced DR Expense / CR PAYE-NI Payable / CR Bank journal", async () => {
    // gross 300000, tax 45000, ni 24000, pension 0, net 231000
    const run = await seedRun(testOrg.orgId, { gross: 300000, tax: 45000, ni: 24000, pension: 0, net: 231000 });

    const journalId = await postPayrollRunJournal(prisma, testOrg.orgId, testOrg.userId, run.id);
    expect(journalId).toBeTruthy();

    const { journals, lines } = await runJournalLines(testOrg.orgId);
    expect(journals).toHaveLength(1);
    expect(byCode(lines, "7000")!.debitMinor).toBe(BigInt(300000));  // Payroll Expenses = gross
    expect(byCode(lines, "2200")!.creditMinor).toBe(BigInt(69000));  // PAYE & NI Payable = tax + ni
    expect(byCode(lines, "1000")!.creditMinor).toBe(BigInt(231000)); // Bank = net

    const debits = lines.reduce((s, l) => s + l.debitMinor, BigInt(0));
    const credits = lines.reduce((s, l) => s + l.creditMinor, BigInt(0));
    expect(debits).toBe(credits);

    // journal_id stored back on the run
    const updated = await prisma.payrollRun.findFirstOrThrow({ where: { id: run.id }, select: { journal_id: true } });
    expect(updated.journal_id).toBe(journals[0].id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/payroll/ledger-posting.test.ts`
Expected: FAIL — `postPayrollRunJournal` module/function not found.

- [ ] **Step 3: Implement `lib/payroll/posting.ts`**

```typescript
import "server-only";

import { AuditAction, JournalStatus, type AccountType, type AccountReportCategory } from "@prisma/client";

import type { TransactionClient } from "@/lib/prisma";
import { resolveSystemAccount, resolveOrCreateSystemAccount, assertJournalBalances } from "@/lib/accounting/documents";
import { assertPeriodOpen } from "@/lib/accounting/period-close";

const payrollExpenseAccount = { code: "7000", accountType: "EXPENSE" as AccountType };
const bankAccount = { code: "1000", accountType: "ASSET" as AccountType };
const payeNiPayableAccount = {
  code: "2200", name: "PAYE & NI Payable",
  accountType: "LIABILITY" as AccountType, reportCategory: "CURRENT_LIABILITY" as AccountReportCategory,
};
const pensionPayableAccount = {
  code: "2210", name: "Pension Payable",
  accountType: "LIABILITY" as AccountType, reportCategory: "CURRENT_LIABILITY" as AccountReportCategory,
};

/**
 * Post the payroll journal for an approved run:
 *   DR 7000 Payroll Expenses (gross)
 *      CR 2200 PAYE & NI Payable (tax + NI)   [omitted if 0]
 *      CR 2210 Pension Payable (pension)        [omitted if 0]
 *      CR 1000 Bank (net)
 * Idempotent: no-ops (returns null) if the run already has a journal_id or is missing.
 */
export async function postPayrollRunJournal(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  runId: string
): Promise<string | null> {
  const run = await tx.payrollRun.findFirst({
    where: { id: runId, organizationId: orgId },
    select: {
      journal_id: true, name: true, payDate: true,
      totalGrossMinor: true, totalTaxMinor: true, totalNIMinor: true,
      totalPensionMinor: true, totalNetMinor: true,
    },
  });
  if (!run || run.journal_id) return null;

  await assertPeriodOpen(tx, orgId, run.payDate);

  const payableMinor = run.totalTaxMinor + run.totalNIMinor;

  const expenseId = await resolveSystemAccount(tx, orgId, payrollExpenseAccount);
  const bankId = await resolveSystemAccount(tx, orgId, bankAccount);
  const payeNiId = payableMinor > BigInt(0)
    ? await resolveOrCreateSystemAccount(tx, orgId, payeNiPayableAccount) : null;
  const pensionId = run.totalPensionMinor > BigInt(0)
    ? await resolveOrCreateSystemAccount(tx, orgId, pensionPayableAccount) : null;

  const lines = [
    { organizationId: orgId, accountId: expenseId, debitMinor: run.totalGrossMinor, creditMinor: BigInt(0), memo: `Payroll ${run.name}` },
    ...(payeNiId
      ? [{ organizationId: orgId, accountId: payeNiId, debitMinor: BigInt(0), creditMinor: payableMinor, memo: `PAYE & NI for ${run.name}` }]
      : []),
    ...(pensionId
      ? [{ organizationId: orgId, accountId: pensionId, debitMinor: BigInt(0), creditMinor: run.totalPensionMinor, memo: `Pension for ${run.name}` }]
      : []),
    { organizationId: orgId, accountId: bankId, debitMinor: BigInt(0), creditMinor: run.totalNetMinor, memo: `Net pay for ${run.name}` },
  ];

  assertJournalBalances("Payroll run", run.name, lines);

  const journal = await tx.journal.create({
    data: {
      organizationId: orgId,
      status: JournalStatus.DRAFT,
      journalDate: run.payDate,
      memo: `Payroll ${run.name}`,
      sourceType: "payroll_run",
      sourceId: runId,
      createdByUserId: userId,
      lines: { create: lines },
    },
    select: { id: true },
  });

  await tx.journal.update({
    where: { id: journal.id },
    data: { status: JournalStatus.POSTED, postedByUserId: userId, postedAt: new Date() },
  });

  await tx.payrollRun.update({ where: { id: runId }, data: { journal_id: journal.id } });

  await tx.auditEvent.create({
    data: {
      organizationId: orgId,
      actorUserId: userId,
      entityType: "payroll_run",
      entityId: runId,
      action: AuditAction.POST,
      after: { journalId: journal.id, totalGrossMinor: run.totalGrossMinor.toString() },
    },
  });

  return journal.id;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/payroll/ledger-posting.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `postPayrollRunJournal` into `approvePayrollRun`**

In `app/(dashboard)/payroll/actions.ts`, add the import near the top:

```typescript
import { postPayrollRunJournal } from "@/lib/payroll/posting";
```

Replace the existing `approvePayrollRun` (~line 452) with:

```typescript
export async function approvePayrollRun(id: string) {
  const workspace = await requireAccountantRole();
  const orgId = workspace.organizationId;

  await prisma.$transaction(async (tx) => {
    await postPayrollRunJournal(tx, orgId, workspace.userId, id);
    await tx.payrollRun.update({
      where: { id, organizationId: orgId },
      data: { status: "APPROVED" },
    });
  });

  revalidatePath("/payroll/run-payroll");
  revalidatePath("/payroll");
  return { id };
}
```

(Note: `payrollRun.update` with `where: { id, organizationId }` — Prisma's `update` accepts only unique selectors in `where`; if the client rejects the extra `organizationId`, use `where: { id }` and rely on the tenancy passthrough. Verify against how other single-record updates in this file are written and match that style.)

- [ ] **Step 6: Add the remaining posting tests**

Append to `tests/payroll/ledger-posting.test.ts` inside the `describe`:

```typescript
  it("lazily creates the 2200 PAYE & NI Payable account", async () => {
    const before = await prisma.chartAccount.count({ where: { organizationId: testOrg.orgId, code: "2200" } });
    expect(before).toBe(0);

    const run = await seedRun(testOrg.orgId, { gross: 100000, tax: 15000, ni: 8000, pension: 0, net: 77000 });
    await postPayrollRunJournal(prisma, testOrg.orgId, testOrg.userId, run.id);

    const after = await prisma.chartAccount.count({ where: { organizationId: testOrg.orgId, code: "2200" } });
    expect(after).toBe(1);
  });

  it("omits the pension line when pension is zero", async () => {
    const run = await seedRun(testOrg.orgId, { gross: 100000, tax: 15000, ni: 8000, pension: 0, net: 77000 });
    await postPayrollRunJournal(prisma, testOrg.orgId, testOrg.userId, run.id);

    const { lines } = await runJournalLines(testOrg.orgId);
    expect(byCode(lines, "2210")).toBeUndefined();
    expect(byCode(lines, "7000")!.debitMinor).toBe(BigInt(100000));
    expect(byCode(lines, "2200")!.creditMinor).toBe(BigInt(23000)); // 15000 + 8000
    expect(byCode(lines, "1000")!.creditMinor).toBe(BigInt(77000));
  });

  it("is idempotent — a run with a journal_id does not double-post", async () => {
    const run = await seedRun(testOrg.orgId, { gross: 100000, tax: 15000, ni: 8000, pension: 0, net: 77000 });
    await postPayrollRunJournal(prisma, testOrg.orgId, testOrg.userId, run.id);
    const second = await postPayrollRunJournal(prisma, testOrg.orgId, testOrg.userId, run.id);

    expect(second).toBeNull();
    const { journals } = await runJournalLines(testOrg.orgId);
    expect(journals).toHaveLength(1);
  });

  it("refuses to post a run whose figures do not balance", async () => {
    // net deliberately wrong: gross != tax + ni + pension + net
    const run = await seedRun(testOrg.orgId, { gross: 100000, tax: 15000, ni: 8000, pension: 0, net: 99999 });
    await expect(
      postPayrollRunJournal(prisma, testOrg.orgId, testOrg.userId, run.id)
    ).rejects.toThrow(/unbalanced/i);
  });
```

- [ ] **Step 7: Run the test file + typecheck**

Run: `npx vitest run tests/payroll/ledger-posting.test.ts`
Expected: PASS (5 tests).
Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit** — SKIP (manual-commit). Leave staged.

---

### Task 3: `reversePayrollRunJournal` + `reversePayrollRun` action

**Files:**
- Modify: `lib/payroll/posting.ts` (add `reversePayrollRunJournal`)
- Modify: `app/(dashboard)/payroll/actions.ts` (new `reversePayrollRun`)
- Test: `tests/payroll/ledger-posting.test.ts`

**Interfaces:**
- Produces: `export async function reversePayrollRunJournal(tx: TransactionClient, orgId: string, userId: string, runId: string): Promise<void>` — mirrors the `payroll_run` journal (debits/credits swapped, dated today), clears the run's `journal_id`. No-ops if not posted or already reversed.
- Produces: `export async function reversePayrollRun(id: string)` server action.

- [ ] **Step 1: Write the failing test**

Append to `tests/payroll/ledger-posting.test.ts`:

```typescript
describe("payroll run reversal", () => {
  it("reverses the journal, nets ledger to zero, and clears journal_id", async () => {
    const run = await seedRun(testOrg.orgId, { gross: 300000, tax: 45000, ni: 24000, pension: 0, net: 231000 });
    await postPayrollRunJournal(prisma, testOrg.orgId, testOrg.userId, run.id);

    const { reversePayrollRunJournal } = await import("@/lib/payroll/posting");
    await reversePayrollRunJournal(prisma, testOrg.orgId, testOrg.userId, run.id);

    const lines = await prisma.journalLine.findMany({
      where: { organizationId: testOrg.orgId, journal: { sourceType: { in: ["payroll_run", "payroll_run_void"] } } },
      include: { account: { select: { code: true } } },
    });
    const net: Record<string, bigint> = {};
    for (const l of lines) {
      net[l.account.code] = (net[l.account.code] ?? BigInt(0)) + l.debitMinor - l.creditMinor;
    }
    expect(net["7000"] ?? BigInt(0)).toBe(BigInt(0));
    expect(net["2200"] ?? BigInt(0)).toBe(BigInt(0));
    expect(net["1000"] ?? BigInt(0)).toBe(BigInt(0));

    const updated = await prisma.payrollRun.findFirstOrThrow({ where: { id: run.id }, select: { journal_id: true } });
    expect(updated.journal_id).toBeNull();

    const voids = await prisma.journal.count({ where: { organizationId: testOrg.orgId, sourceType: "payroll_run_void" } });
    expect(voids).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/payroll/ledger-posting.test.ts -t "reverses the journal"`
Expected: FAIL — `reversePayrollRunJournal` not exported.

- [ ] **Step 3: Implement `reversePayrollRunJournal`**

Append to `lib/payroll/posting.ts`:

```typescript
/**
 * Reverse an approved payroll run's journal. Mirrors the original with debits/credits
 * swapped, dated today so it never lands in a closed period. Clears the run's journal_id.
 * Idempotent: no-ops if the run was never posted or a reversal already exists.
 */
export async function reversePayrollRunJournal(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  runId: string
): Promise<void> {
  const original = await tx.journal.findFirst({
    where: { organizationId: orgId, sourceType: "payroll_run", sourceId: runId, status: JournalStatus.POSTED },
    include: { lines: true },
  });
  if (!original) return;

  const existingReversal = await tx.journal.findFirst({
    where: { organizationId: orgId, sourceType: "payroll_run_void", sourceId: runId },
    select: { id: true },
  });
  if (existingReversal) return;

  await assertPeriodOpen(tx, orgId, new Date());

  const reversedLines = original.lines.map((l) => ({
    organizationId: orgId,
    accountId: l.accountId,
    debitMinor: l.creditMinor,
    creditMinor: l.debitMinor,
    memo: "Reversal of payroll run",
  }));

  const reversal = await tx.journal.create({
    data: {
      organizationId: orgId,
      status: JournalStatus.DRAFT,
      journalDate: new Date(),
      memo: `Reversal of payroll run ${runId}`,
      sourceType: "payroll_run_void",
      sourceId: runId,
      reversedJournalId: original.id,
      createdByUserId: userId,
      lines: { create: reversedLines },
    },
    select: { id: true },
  });

  await tx.journal.update({
    where: { id: reversal.id },
    data: { status: JournalStatus.POSTED, postedByUserId: userId, postedAt: new Date() },
  });

  await tx.payrollRun.update({ where: { id: runId }, data: { journal_id: null } });

  await tx.auditEvent.create({
    data: {
      organizationId: orgId,
      actorUserId: userId,
      entityType: "payroll_run",
      entityId: runId,
      action: AuditAction.REVERSE,
      after: { journalId: reversal.id, reversedJournalId: original.id },
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/payroll/ledger-posting.test.ts -t "reverses the journal"`
Expected: PASS.

- [ ] **Step 5: Add the `reversePayrollRun` server action**

In `app/(dashboard)/payroll/actions.ts`, update the import to include the reversal:

```typescript
import { postPayrollRunJournal, reversePayrollRunJournal } from "@/lib/payroll/posting";
```

Add after `approvePayrollRun`:

```typescript
export async function reversePayrollRun(id: string) {
  const workspace = await requireAccountantRole();
  const orgId = workspace.organizationId;

  await prisma.$transaction(async (tx) => {
    await reversePayrollRunJournal(tx, orgId, workspace.userId, id);
    await tx.payrollRun.update({
      where: { id, organizationId: orgId },
      data: { status: "DRAFT" },
    });
  });

  revalidatePath("/payroll/run-payroll");
  revalidatePath("/payroll");
  return { id };
}
```

(Match the `where` style — `{ id }` vs `{ id, organizationId }` — to whatever Step 5 of Task 2 settled on.)

- [ ] **Step 6: Run the full test file + typecheck**

Run: `npx vitest run tests/payroll/ledger-posting.test.ts`
Expected: PASS (6 tests total).
Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit** — SKIP (manual-commit). Leave staged.

---

### Task 4: Regression pass, docs

**Files:**
- Modify: `docs/PROJECT-STATUS.md`

- [ ] **Step 1: Run the full suite**

Run: `pnpm test`
Expected: all files pass; count = prior (164) + 2 (Task 1) + 6 (Tasks 2-3) = **172**.

- [ ] **Step 2: Update the status ledger**

In `docs/PROJECT-STATUS.md`: mark the deferred-module A1 row `✅ Resolved 2026-07-01 (ledger posting)`; add an **A1b** pending row (accurate UK statutory PAYE/NI/pension calc + server-side recompute — note today's figures are client-sourced estimates); add a completed-section entry summarizing the payroll journal shape and lazy 2200/2210 accounts; update the test-count line to 172; drop A1 from "Suggested next priorities".

- [ ] **Step 3: Commit** — SKIP (manual-commit). Leave staged.

- [ ] **Step 4: Independent accountant-auditor review**

Dispatch the `accountant-auditor` agent to review `lib/payroll/posting.ts` and its integration in `app/(dashboard)/payroll/actions.ts` against the spec (balanced entries, correct account signs — expense debit / liability credit / bank credit, net-vs-gross, reversal correctness, closed-period guard on both post and reverse, lazy-account correctness, tenant scoping). Address any Critical/Important findings before considering A1 done.

---

## Self-Review

**Spec coverage:**
- Approve journal (DR 7000 / CR 2200 / CR 2210 / CR 1000, liability/pension lines omitted when 0) → Task 2. ✓
- Reversal (dated today, clears `journal_id`) → Task 3. ✓
- Lazy 2200/2210 via `resolveOrCreateSystemAccount` → Task 1, used in Task 2. ✓
- `postPayrollRunJournal` + `reversePayrollRunJournal` in `lib/payroll/posting.ts` → Tasks 2, 3. ✓
- `approvePayrollRun` posts; new `reversePayrollRun` → Tasks 2, 3. ✓
- Linkage via `journal_id` + `sourceType`/`sourceId`, no schema change → Tasks 2, 3. ✓
- Idempotency (journal_id guard; existing-reversal guard) → Tasks 2, 3 + tests. ✓
- `assertJournalBalances` guards unbalanced runs → Task 2 + test. ✓
- `assertPeriodOpen` on post (payDate) and reverse (today) → Tasks 2, 3. ✓
- AuditEvent (`payroll_run`, POST/REVERSE) → Tasks 2, 3. ✓
- Tenancy (explicit organizationId) → Global Constraints + implementations. ✓
- Spec tests 1-6 → Tasks 2, 3. ✓
- DoD: typecheck, tests, full suite, status update, auditor review → Task 4. ✓

**Placeholder scan:** none — every code and test block is complete. The two `where: { id, organizationId }` notes are explicit verification steps (match existing file style), not placeholders.

**Type consistency:** `postPayrollRunJournal(tx, orgId, userId, runId): Promise<string | null>` and `reversePayrollRunJournal(tx, orgId, userId, runId): Promise<void>` match between Interfaces, implementations, and the action call sites. `resolveOrCreateSystemAccount` signature matches Task 1's export. Account constants (`7000`/`1000` via `resolveSystemAccount`, `2200`/`2210` via `resolveOrCreateSystemAccount`) are consistent with the spec.
