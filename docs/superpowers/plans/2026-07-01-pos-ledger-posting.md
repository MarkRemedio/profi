# POS → Ledger Posting (A2, sales-side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every completed POS sale post a balanced double-entry journal (revenue + output VAT + cash), with reversing journals on refund and delete, so retail trade reaches the P&L, balance sheet, and VAT return.

**Architecture:** A new `lib/pos/posting.ts` builds and posts the journals, reusing the invoice engine's `resolveSystemAccount` + `assertJournalBalances` (exported from `lib/accounting/documents.ts`) and the DRAFT→POSTED flip pattern that satisfies the journal immutability triggers. Posting calls are made inside the existing `$transaction` blocks of `processSale`/`refundSale`/`deleteSale` in `lib/pos/dal.ts`, so a posting failure rolls the whole operation back. Sale↔journal linkage rides on `journal.sourceType` + `journal.sourceId` — no `pos_sales` schema change, no migration.

**Tech Stack:** TypeScript, Prisma (extended client with the tenancy guard), Vitest (real dev-DB fixtures), Next.js server actions.

**Spec:** [`docs/superpowers/specs/2026-07-01-pos-ledger-posting-design.md`](../specs/2026-07-01-pos-ledger-posting-design.md)

## Global Constraints

- Money is integer minor units (`bigint` on journal lines). `net = subtotal − discount`, `total = net + taxTotal`.
- Accounts (existing starter seed, `is_system = true`): **1000 Bank** (ASSET), **4000 Sales** (REVENUE), **2100 VAT Payable** (LIABILITY).
- Posted journals are immutable (DB triggers `journals_prevent_posted_delete` / `journal_lines_prevent_posted_changes`). Create as `DRAFT`, then `update` to `POSTED` — never insert a POSTED journal with lines directly.
- `Journal`/`JournalLine` are org-scoped and auto-guarded by the tenancy extension; every query/write here carries an explicit `organizationId`, so it is safe with or without an ambient scoped context.
- Sale journals are dated `soldAt`; reversal journals are dated **today**.
- Reuse, do not duplicate: `resolveSystemAccount`, `assertJournalBalances` (both from `documents.ts`), `assertPeriodOpen` (already exported from `period-close.ts`).
- Manual-commit environment: the implementer runs the `git commit` steps; do not add extra commits.

---

### Task 1: Export & generalize the shared posting helpers

**Files:**
- Modify: `lib/accounting/documents.ts` (`resolveSystemAccount` ~line 416; `assertJournalBalances` ~line 358; its two callers at ~1210 and ~1392)

**Interfaces:**
- Produces: `export async function resolveSystemAccount(tx: TransactionClient, organizationId: string, target: { code: string; accountType: AccountType }): Promise<string>`
- Produces: `export function assertJournalBalances(label: string, ref: string, lines: Array<{ debitMinor: bigint; creditMinor: bigint }>): void` — throws if debits ≠ credits or total is zero. `label` is used verbatim in the message (e.g. `"Invoice"`, `"Bill"`, `"POS sale"`).

- [ ] **Step 1: Add `export` to `resolveSystemAccount`**

Change its declaration (currently `async function resolveSystemAccount(`) to:

```typescript
export async function resolveSystemAccount(
  tx: Tx,
  organizationId: string,
  target: { code: string; accountType: AccountType }
) {
```

- [ ] **Step 2: Generalize and export `assertJournalBalances`**

Replace the whole function (lines ~358-377) with a label-based signature so it can name any document kind:

```typescript
export function assertJournalBalances(
  label: string,
  ref: string,
  lines: Array<{ debitMinor: bigint; creditMinor: bigint }>
) {
  const debitTotal = lines.reduce((sum, line) => sum + line.debitMinor, BigInt(0));
  const creditTotal = lines.reduce((sum, line) => sum + line.creditMinor, BigInt(0));

  if (debitTotal !== creditTotal) {
    throw new Error(
      `${label} ${ref} journal is unbalanced: debits (${debitTotal}) do not equal credits (${creditTotal}).`
    );
  }

  if (debitTotal === BigInt(0)) {
    throw new Error(
      `${label} ${ref} journal has zero total and cannot be posted.`
    );
  }
}
```

- [ ] **Step 3: Update the two existing callers to pass a display label**

At ~line 1210: `assertJournalBalances("invoice", invoice.invoiceNo, journalLines);` → `assertJournalBalances("Invoice", invoice.invoiceNo, journalLines);`

At ~line 1392: `assertJournalBalances("bill", bill.invoiceNo, journalLines);` → `assertJournalBalances("Bill", bill.invoiceNo, journalLines);`

(The invoice message still contains "unbalanced", so `tests/invoice-balance-vat.test.ts:101`'s `/unbalanced/i` assertion still holds.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Verify existing posting tests still pass (refactor guard)**

Run: `npx vitest run tests/invoice-balance-vat.test.ts tests/bill-discount.test.ts tests/banking-posting.test.ts`
Expected: PASS (no behavior change).

- [ ] **Step 6: Commit**

```bash
git add lib/accounting/documents.ts
git commit -m "refactor(accounting): export resolveSystemAccount + generalize assertJournalBalances for reuse"
```

---

### Task 2: `postPosSaleJournal` — post a balanced journal on each sale

**Files:**
- Create: `lib/pos/posting.ts`
- Modify: `lib/pos/dal.ts` (`processSale`, inside the existing `$transaction`, after stock decrement ~line 185)
- Test: `tests/pos/ledger-posting.test.ts`

**Interfaces:**
- Consumes: `resolveSystemAccount`, `assertJournalBalances` (Task 1); `assertPeriodOpen` from `@/lib/accounting/period-close`; `TransactionClient` from `@/lib/prisma`; `AuditAction`, `JournalStatus`, `AccountType` from `@prisma/client`.
- Produces: `export async function postPosSaleJournal(tx: TransactionClient, orgId: string, userId: string, sale: { saleId: string; saleNumber: string; soldAt: Date; netMinor: bigint; taxMinor: bigint; totalMinor: bigint }): Promise<void>` — idempotent no-op if a `pos_sale` journal already exists for `saleId`.

- [ ] **Step 1: Write the failing test**

Create `tests/pos/ledger-posting.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { processSale } from "@/lib/pos/dal";
import { createTestOrg, dropTestOrg, createTestPosProduct, type TestOrg } from "../fixtures";

let testOrg: TestOrg;

beforeEach(async () => {
  testOrg = await createTestOrg();
});

afterEach(async () => {
  await dropTestOrg(testOrg.orgId);
});

async function saleJournalLines(orgId: string) {
  const journals = await prisma.journal.findMany({
    where: { organizationId: orgId, sourceType: "pos_sale" },
    include: { lines: { include: { account: true } } },
  });
  return { journals, lines: journals.flatMap((j) => j.lines) };
}

function byCode(lines: Array<{ account: { code: string }; debitMinor: bigint; creditMinor: bigint }>, code: string) {
  return lines.find((l) => l.account.code === code);
}

describe("POS sale ledger posting", () => {
  it("posts a balanced DR Bank / CR Sales / CR VAT journal", async () => {
    // £10.00 price, 20% tax, qty 1, no discount => net 1000, tax 200, total 1200
    const product = await createTestPosProduct(testOrg.orgId, { priceMinor: 1000, taxRate: 20, stockQty: 5 });

    await processSale(prisma, { organizationId: testOrg.orgId, userId: testOrg.userId }, {
      receiptNo: "POS-0001",
      paymentMethod: "cash",
      discountPercent: 0,
      cashReceived: 5000,
      lines: [{ productId: product.id, quantity: 1 }],
    });

    const { journals, lines } = await saleJournalLines(testOrg.orgId);
    expect(journals).toHaveLength(1);
    expect(byCode(lines, "1000")!.debitMinor).toBe(BigInt(1200)); // Bank = total
    expect(byCode(lines, "4000")!.creditMinor).toBe(BigInt(1000)); // Sales = net
    expect(byCode(lines, "2100")!.creditMinor).toBe(BigInt(200));  // VAT = tax

    const debits = lines.reduce((s, l) => s + l.debitMinor, BigInt(0));
    const credits = lines.reduce((s, l) => s + l.creditMinor, BigInt(0));
    expect(debits).toBe(credits);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/pos/ledger-posting.test.ts`
Expected: FAIL — 0 journals with `sourceType: "pos_sale"` (posting not wired yet), so `expect(journals).toHaveLength(1)` fails.

- [ ] **Step 3: Implement `lib/pos/posting.ts`**

```typescript
import "server-only";

import { AuditAction, JournalStatus, type AccountType } from "@prisma/client";

import type { TransactionClient } from "@/lib/prisma";
import { resolveSystemAccount, assertJournalBalances } from "@/lib/accounting/documents";
import { assertPeriodOpen } from "@/lib/accounting/period-close";

const bankAccount = { code: "1000", accountType: "ASSET" as AccountType };
const salesAccount = { code: "4000", accountType: "REVENUE" as AccountType };
const outputVatAccount = { code: "2100", accountType: "LIABILITY" as AccountType };

type PosSale = {
  saleId: string;
  saleNumber: string;
  soldAt: Date;
  netMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
};

/**
 * Post the sales-side journal for a completed POS sale:
 *   DR 1000 Bank (total) / CR 4000 Sales (net) / CR 2100 VAT Payable (tax).
 * Idempotent: no-ops if a pos_sale journal already exists for this sale.
 */
export async function postPosSaleJournal(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  sale: PosSale
): Promise<void> {
  const existing = await tx.journal.findFirst({
    where: { organizationId: orgId, sourceType: "pos_sale", sourceId: sale.saleId },
    select: { id: true },
  });
  if (existing) return;

  await assertPeriodOpen(tx, orgId, sale.soldAt);

  const bankId = await resolveSystemAccount(tx, orgId, bankAccount);
  const salesId = await resolveSystemAccount(tx, orgId, salesAccount);
  const vatId = sale.taxMinor > BigInt(0)
    ? await resolveSystemAccount(tx, orgId, outputVatAccount)
    : null;

  const lines = [
    { organizationId: orgId, accountId: bankId, debitMinor: sale.totalMinor, creditMinor: BigInt(0), memo: `POS sale ${sale.saleNumber}` },
    { organizationId: orgId, accountId: salesId, debitMinor: BigInt(0), creditMinor: sale.netMinor, memo: `POS sale ${sale.saleNumber}` },
    ...(vatId
      ? [{ organizationId: orgId, accountId: vatId, debitMinor: BigInt(0), creditMinor: sale.taxMinor, memo: `VAT on POS sale ${sale.saleNumber}` }]
      : []),
  ];

  assertJournalBalances("POS sale", sale.saleNumber, lines);

  const journal = await tx.journal.create({
    data: {
      organizationId: orgId,
      status: JournalStatus.DRAFT,
      journalDate: sale.soldAt,
      memo: `POS sale ${sale.saleNumber}`,
      sourceType: "pos_sale",
      sourceId: sale.saleId,
      createdByUserId: userId,
      lines: { create: lines },
    },
    select: { id: true },
  });

  await tx.journal.update({
    where: { id: journal.id },
    data: { status: JournalStatus.POSTED, postedByUserId: userId, postedAt: new Date() },
  });

  await tx.auditEvent.create({
    data: {
      organizationId: orgId,
      actorUserId: userId,
      entityType: "pos_sale",
      entityId: sale.saleId,
      action: AuditAction.POST,
      after: { journalId: journal.id, totalMinor: sale.totalMinor.toString() },
    },
  });
}
```

- [ ] **Step 4: Wire `postPosSaleJournal` into `processSale`**

In `lib/pos/dal.ts`, add the import at the top:

```typescript
import { postPosSaleJournal } from "@/lib/pos/posting";
```

Inside `processSale`, immediately after the stock-decrement loop (the `for (const [pid, qty] of required)` block, ~line 185) and before `return { ... }`, insert:

```typescript
    await postPosSaleJournal(tx, orgId, actor.userId, {
      saleId,
      saleNumber: sale.sale_number,
      soldAt,
      netMinor: BigInt(subtotal - discount),
      taxMinor: BigInt(taxTotal),
      totalMinor: BigInt(total),
    });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/pos/ledger-posting.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the edge-case tests**

Append to `tests/pos/ledger-posting.test.ts` inside the `describe` block:

```typescript
  it("omits the VAT line for a zero-rated product", async () => {
    const product = await createTestPosProduct(testOrg.orgId, { priceMinor: 1000, taxRate: 0, stockQty: 5 });

    await processSale(prisma, { organizationId: testOrg.orgId, userId: testOrg.userId }, {
      receiptNo: "POS-0002", paymentMethod: "cash", discountPercent: 0, cashReceived: 5000,
      lines: [{ productId: product.id, quantity: 1 }],
    });

    const { lines } = await saleJournalLines(testOrg.orgId);
    expect(byCode(lines, "2100")).toBeUndefined();       // no VAT line
    expect(byCode(lines, "1000")!.debitMinor).toBe(BigInt(1000));
    expect(byCode(lines, "4000")!.creditMinor).toBe(BigInt(1000));
  });

  it("credits Sales at net (after a whole-cart discount)", async () => {
    // £10.00, 20% tax, qty 1, 10% discount => net 900, tax 180, total 1080
    const product = await createTestPosProduct(testOrg.orgId, { priceMinor: 1000, taxRate: 20, stockQty: 5 });

    await processSale(prisma, { organizationId: testOrg.orgId, userId: testOrg.userId }, {
      receiptNo: "POS-0003", paymentMethod: "cash", discountPercent: 10, cashReceived: 5000,
      lines: [{ productId: product.id, quantity: 1 }],
    });

    const { lines } = await saleJournalLines(testOrg.orgId);
    expect(byCode(lines, "4000")!.creditMinor).toBe(BigInt(900));  // net, not 1000
    expect(byCode(lines, "2100")!.creditMinor).toBe(BigInt(180));
    expect(byCode(lines, "1000")!.debitMinor).toBe(BigInt(1080));
  });

  it("carries sourceType and sourceId linkage", async () => {
    const product = await createTestPosProduct(testOrg.orgId, { priceMinor: 1000, taxRate: 20, stockQty: 5 });

    const result = await processSale(prisma, { organizationId: testOrg.orgId, userId: testOrg.userId }, {
      receiptNo: "POS-0004", paymentMethod: "cash", discountPercent: 0, cashReceived: 5000,
      lines: [{ productId: product.id, quantity: 1 }],
    });

    const { journals } = await saleJournalLines(testOrg.orgId);
    expect(journals[0].sourceType).toBe("pos_sale");
    expect(journals[0].sourceId).toBe(result.id);
  });
```

- [ ] **Step 7: Run the full test file**

Run: `npx vitest run tests/pos/ledger-posting.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add lib/pos/posting.ts lib/pos/dal.ts tests/pos/ledger-posting.test.ts
git commit -m "feat(pos): post sales-side journal (revenue + VAT + cash) on each sale"
```

---

### Task 3: `reversePosSaleJournal` — refund & delete reversals

**Files:**
- Modify: `lib/pos/posting.ts` (add `reversePosSaleJournal`)
- Modify: `lib/pos/dal.ts` (`refundSale`, `deleteSale`)
- Test: `tests/pos/ledger-posting.test.ts`

**Interfaces:**
- Consumes: `postPosSaleJournal` and the account/journal machinery from Task 2.
- Produces: `export async function reversePosSaleJournal(tx: TransactionClient, orgId: string, userId: string, saleId: string, reversalSourceType: "pos_refund" | "pos_sale_void"): Promise<void>` — loads the original `pos_sale` journal, posts a mirror (debits↔credits swapped) dated today, writes an `AuditEvent`. No-ops if the sale has no `pos_sale` journal or a reversal already exists.

- [ ] **Step 1: Write the failing test**

Append to `tests/pos/ledger-posting.test.ts`:

```typescript
async function ledgerNet(orgId: string) {
  // Sum of all POS-related journal lines; a sale + its reversal must net to zero.
  const lines = await prisma.journalLine.findMany({
    where: { organizationId: orgId, journal: { sourceType: { in: ["pos_sale", "pos_refund", "pos_sale_void"] } } },
    include: { account: { select: { code: true } } },
  });
  const net: Record<string, bigint> = {};
  for (const l of lines) {
    const c = l.account.code;
    net[c] = (net[c] ?? BigInt(0)) + l.debitMinor - l.creditMinor;
  }
  return net;
}

describe("POS refund & delete reversals", () => {
  it("refund posts a reversal that nets the sale to zero", async () => {
    const product = await createTestPosProduct(testOrg.orgId, { priceMinor: 1000, taxRate: 20, stockQty: 5 });
    const sale = await processSale(prisma, { organizationId: testOrg.orgId, userId: testOrg.userId }, {
      receiptNo: "POS-0100", paymentMethod: "cash", discountPercent: 0, cashReceived: 5000,
      lines: [{ productId: product.id, quantity: 1 }],
    });

    const { refundSale } = await import("@/lib/pos/dal");
    await refundSale(prisma, { organizationId: testOrg.orgId }, sale.id);

    const net = await ledgerNet(testOrg.orgId);
    expect(net["1000"] ?? BigInt(0)).toBe(BigInt(0));
    expect(net["4000"] ?? BigInt(0)).toBe(BigInt(0));
    expect(net["2100"] ?? BigInt(0)).toBe(BigInt(0));

    const reversals = await prisma.journal.count({ where: { organizationId: testOrg.orgId, sourceType: "pos_refund" } });
    expect(reversals).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/pos/ledger-posting.test.ts -t "refund posts a reversal"`
Expected: FAIL — no `pos_refund` journal exists (reversal not wired), so the net for 1000/4000/2100 is non-zero and the count is 0.

- [ ] **Step 3: Implement `reversePosSaleJournal` in `lib/pos/posting.ts`**

Append to `lib/pos/posting.ts`:

```typescript
/**
 * Post a reversing journal for a POS sale (used by refund and delete). Mirrors the
 * original pos_sale journal with debits/credits swapped, dated today so it never
 * lands in a closed period. Idempotent: no-ops if the sale was never posted or a
 * reversal already exists.
 */
export async function reversePosSaleJournal(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  saleId: string,
  reversalSourceType: "pos_refund" | "pos_sale_void"
): Promise<void> {
  const original = await tx.journal.findFirst({
    where: { organizationId: orgId, sourceType: "pos_sale", sourceId: saleId, status: JournalStatus.POSTED },
    include: { lines: true },
  });
  if (!original) return;

  const existingReversal = await tx.journal.findFirst({
    where: {
      organizationId: orgId,
      sourceId: saleId,
      sourceType: { in: ["pos_refund", "pos_sale_void"] },
    },
    select: { id: true },
  });
  if (existingReversal) return;

  const reversedLines = original.lines.map((l) => ({
    organizationId: orgId,
    accountId: l.accountId,
    debitMinor: l.creditMinor,
    creditMinor: l.debitMinor,
    memo: `Reversal of POS sale (${reversalSourceType})`,
  }));

  const reversal = await tx.journal.create({
    data: {
      organizationId: orgId,
      status: JournalStatus.DRAFT,
      journalDate: new Date(),
      memo: `Reversal of POS sale ${saleId}`,
      sourceType: reversalSourceType,
      sourceId: saleId,
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

  await tx.auditEvent.create({
    data: {
      organizationId: orgId,
      actorUserId: userId,
      entityType: "pos_sale",
      entityId: saleId,
      action: AuditAction.REVERSE,
      after: { journalId: reversal.id, reversedJournalId: original.id, kind: reversalSourceType },
    },
  });
}
```

- [ ] **Step 4: Wire the reversal into `refundSale` and `deleteSale`**

In `lib/pos/dal.ts`, update the import from Task 2:

```typescript
import { postPosSaleJournal, reversePosSaleJournal } from "@/lib/pos/posting";
```

`refundSale` needs the actor's `userId`. Its actor param is currently `Pick<PosActor, "organizationId">`; widen it to include `userId`:

```typescript
export async function refundSale(
  client: Db,
  actor: Pick<PosActor, "organizationId" | "userId">,
  saleId: string
): Promise<void> {
```

Inside `refundSale`, after the `pos_sales.updateMany({ ... status: "refunded" })` call, add:

```typescript
    await reversePosSaleJournal(tx, orgId, actor.userId, saleId, "pos_refund");
```

`deleteSale` currently takes `(client, orgId, saleId)` and has no userId. Add a `userId` parameter:

```typescript
export async function deleteSale(client: Db, orgId: string, userId: string, saleId: string): Promise<void> {
```

Inside `deleteSale`, in the `if (sale.status !== "refunded")` branch (the same guard that restores stock), after the stock-restore loop add the reversal — a not-yet-refunded sale still has a live journal:

```typescript
      await reversePosSaleJournal(tx, orgId, userId, saleId, "pos_sale_void");
```

(An already-refunded sale skips this branch, so its existing `pos_refund` reversal is not duplicated.)

- [ ] **Step 5: Update the callers of `refundSale` / `deleteSale`**

In `app/(dashboard)/pos/actions.ts`, find the calls and pass the new arguments. `refundSale` must receive an actor with `userId` (the actions layer already has the `PosActor` from `requirePosManager`/`requirePosAccess` — pass it directly). `deleteSale` must receive `userId`:

```typescript
// refund: pass the full actor (it satisfies { organizationId, userId })
await refundSale(prisma, actor, saleId);
// delete: pass the actor's userId
await deleteSale(prisma, actor.organizationId, actor.userId, saleId);
```

Adjust to match the exact variable names in that file (the actor from `requirePosManager()`).

- [ ] **Step 6: Add the delete tests**

Append to `tests/pos/ledger-posting.test.ts` inside the `"POS refund & delete reversals"` describe:

```typescript
  it("delete of a not-refunded sale posts a reversal", async () => {
    const product = await createTestPosProduct(testOrg.orgId, { priceMinor: 1000, taxRate: 20, stockQty: 5 });
    const sale = await processSale(prisma, { organizationId: testOrg.orgId, userId: testOrg.userId }, {
      receiptNo: "POS-0200", paymentMethod: "cash", discountPercent: 0, cashReceived: 5000,
      lines: [{ productId: product.id, quantity: 1 }],
    });

    const { deleteSale } = await import("@/lib/pos/dal");
    await deleteSale(prisma, testOrg.orgId, testOrg.userId, sale.id);

    const reversals = await prisma.journal.count({ where: { organizationId: testOrg.orgId, sourceType: "pos_sale_void" } });
    expect(reversals).toBe(1);
    const net = await ledgerNet(testOrg.orgId);
    expect(net["1000"] ?? BigInt(0)).toBe(BigInt(0));
  });

  it("delete of an already-refunded sale does not double-reverse", async () => {
    const product = await createTestPosProduct(testOrg.orgId, { priceMinor: 1000, taxRate: 20, stockQty: 5 });
    const sale = await processSale(prisma, { organizationId: testOrg.orgId, userId: testOrg.userId }, {
      receiptNo: "POS-0201", paymentMethod: "cash", discountPercent: 0, cashReceived: 5000,
      lines: [{ productId: product.id, quantity: 1 }],
    });

    const { refundSale, deleteSale } = await import("@/lib/pos/dal");
    await refundSale(prisma, { organizationId: testOrg.orgId, userId: testOrg.userId }, sale.id);
    await deleteSale(prisma, testOrg.orgId, testOrg.userId, sale.id);

    const voids = await prisma.journal.count({ where: { organizationId: testOrg.orgId, sourceType: "pos_sale_void" } });
    expect(voids).toBe(0);           // no second reversal
    const refunds = await prisma.journal.count({ where: { organizationId: testOrg.orgId, sourceType: "pos_refund" } });
    expect(refunds).toBe(1);         // the single refund reversal remains
  });
```

- [ ] **Step 7: Run the test file and typecheck**

Run: `npx vitest run tests/pos/ledger-posting.test.ts`
Expected: PASS (7 tests total).
Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add lib/pos/posting.ts lib/pos/dal.ts "app/(dashboard)/pos/actions.ts" tests/pos/ledger-posting.test.ts
git commit -m "feat(pos): post reversing journals on refund and delete"
```

---

### Task 4: Regression pass, docs, and auditor review

**Files:**
- Modify: `docs/PROJECT-STATUS.md` (A2 row + priorities)

- [ ] **Step 1: Run the full suite**

Run: `pnpm test`
Expected: all files pass; count = previous (155) + 7 new POS posting tests = **162**.

- [ ] **Step 2: Update the status ledger**

In `docs/PROJECT-STATUS.md`, move A2 out of the deferred/critical list: mark the POS deferred-module A2 row `✅ Resolved 2026-07-01 (sales-side)`, note COGS/inventory deferred to A2b, add a completed-section entry summarizing the journal shapes, and update the "Suggested next priorities" so A1 (Payroll→ledger) is the remaining Priority-3 item. Update the test-count line to 162.

- [ ] **Step 3: Commit the docs**

```bash
git add docs/PROJECT-STATUS.md
git commit -m "docs: mark A2 (POS sales-side ledger posting) complete"
```

- [ ] **Step 4: Independent accountant-auditor review**

Dispatch the `accountant-auditor` agent to review the posting math in `lib/pos/posting.ts` and its integration in `lib/pos/dal.ts` against the spec (balanced entries, correct account signs, net-vs-gross revenue, VAT treatment, reversal correctness, tenant scoping). Address any findings before considering A2 done.

---

## Self-Review

**Spec coverage:**
- Sale journal (DR Bank / CR Sales / CR VAT, VAT omitted when 0) → Task 2. ✓
- Reversal journal (refund + delete, dated today) → Task 3. ✓
- `lib/pos/posting.ts` with `postPosSaleJournal` + `reversePosSaleJournal` → Tasks 2, 3. ✓
- Export/reuse `resolveSystemAccount` + `assertJournalBalances` → Task 1. ✓
- Linkage via `sourceType`+`sourceId`, no schema change → Tasks 2, 3. ✓
- Idempotency / no double-post / no double-reverse → Tasks 2, 3 (guards + tests). ✓
- AuditEvent trail → Tasks 2, 3. ✓
- `assertPeriodOpen` guard → Task 2. ✓
- Tenancy (explicit `organizationId` everywhere) → Global Constraints + implementations. ✓
- Tests 1-8 from spec → Tasks 2, 3 (balanced, zero-VAT, discount, refund-nets-zero, delete reverses, delete-already-refunded no double, sourceType/sourceId linkage, idempotency covered by the existing-journal guard + linkage test). ✓
- DoD: typecheck, tests, full suite, status update, auditor review → Task 4. ✓

**Placeholder scan:** none — every code and test block is complete.

**Type consistency:** `postPosSaleJournal(tx, orgId, userId, sale)` and `reversePosSaleJournal(tx, orgId, userId, saleId, reversalSourceType)` signatures match between the Interfaces blocks, the implementations, and the call sites in `dal.ts`. `resolveSystemAccount`/`assertJournalBalances` signatures match Task 1's exports. `refundSale` actor widened to `{ organizationId, userId }`; `deleteSale` gains `userId` — both reflected in Task 3's caller updates (Step 5).
