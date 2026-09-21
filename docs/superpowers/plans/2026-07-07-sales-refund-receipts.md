# Sales Receipt & Refund Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sales Receipts (sale paid immediately, no AR) and Refund Receipts (money refunded to a customer) as full features, plus three new Sales sidebar links (including the already-built Customer Statements page).

**Architecture:** Two new document model pairs (`SalesReceipt`/`SalesReceiptLine`, `RefundReceipt`/`RefundReceiptLine`) shaped like `Invoice`/`InvoiceLine`. A new `lib/accounting/receipts.ts` posts one journal per receipt on save (no draft state): Sales Receipt = DR bank / CR revenue / CR Output VAT; Refund Receipt = the mirror. Void posts a today-dated reversal journal. UI follows the invoices pattern: server actions + react-query client components, with one shared generic view component for both receipt kinds.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + hand-written SQL migrations, vitest (tests hit a real database via `tests/fixtures.ts`), TanStack Query, Tailwind, lucide-react, sonner.

**Spec:** `docs/superpowers/specs/2026-07-07-sales-refund-receipts-design.md`

## Global Constraints

- **Do NOT run `git commit`** — the user commits manually. Stop at the end of each task and report; never commit.
- All money amounts are **minor units** (`BigInt` in the DB/lib layer, `number` in DTOs sent to the client — server actions must never return `BigInt`).
- Journals must be created `status: DRAFT` then flipped to `POSTED` in a second `update` (bypasses the DB immutability trigger). Never create a posted journal with lines directly.
- Every query/mutation is org-scoped: `organizationId` in every `where` and on every created row. `organizationId` comes from `requireAccountantRole()` / `requireAccountingWorkspace()` — never from the client.
- `Journal.paymentMethod` has a DB CHECK: only `'cash' | 'cheque' | 'bank_transfer'` or NULL. Clamp at the action layer.
- Receipt statuses are the strings `"posted"` and `"void"` (DB CHECK enforced; no new Prisma enum).
- New journal `sourceType` values: `"sales_receipt"`, `"sales_receipt_void"`, `"refund_receipt"`, `"refund_receipt_void"`.
- Document numbers: `SR-0001`… and `RR-0001`… via the existing `computeNextNumber` + `withDocNumberRetry` pattern.
- This repo pins a nonstandard Next.js — do not introduce Next APIs beyond the patterns already used in the files this plan copies from.
- Run commands with `pnpm` (repo uses pnpm@11).

---

### Task 1: Prisma schema, SQL migration, and test-fixture teardown

**Files:**
- Modify: `prisma/schema.prisma` (Journal ~line 197, Contact, ChartAccount, Organization models; append new models after `InvoiceLine` ~line 309)
- Create: `prisma/migrations/20260707090000_sales_refund_receipts/migration.sql`
- Modify: `tests/fixtures.ts:59-80` (`dropTestOrg`)

**Interfaces:**
- Produces: Prisma delegates `prisma.salesReceipt`, `prisma.salesReceiptLine`, `prisma.refundReceipt`, `prisma.refundReceiptLine` used by Task 2/3. Field names exactly as in the models below.

- [ ] **Step 1: Add the four new models to `prisma/schema.prisma`**

Append after the `InvoiceLine` model (~line 309):

```prisma
model SalesReceipt {
  id               String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId   String        @map("org_id") @db.Uuid
  receiptNo        String        @map("receipt_no")
  status           String        @default("posted")
  contactId        String        @map("contact_id") @db.Uuid
  receiptDate      DateTime      @map("receipt_date") @db.Date
  currency         CurrencyCode  @default(GBP)
  amountsAre       String        @default("exclusive") @map("amounts_are")
  paymentMethod    String?       @map("payment_method")
  depositAccountId String        @map("deposit_account_id") @db.Uuid
  subtotalMinor    BigInt        @default(0) @map("subtotal_minor")
  discountMinor    BigInt        @default(0) @map("discount_minor")
  taxMinor         BigInt        @default(0) @map("tax_minor")
  totalMinor       BigInt        @default(0) @map("total_minor")
  notes            String?
  postedJournalId  String?       @unique @map("posted_journal_id") @db.Uuid
  voidJournalId    String?       @unique @map("void_journal_id") @db.Uuid
  createdAt        DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime      @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  lines            SalesReceiptLine[]
  contact          Contact       @relation(fields: [contactId], references: [id], onUpdate: NoAction)
  depositAccount   ChartAccount  @relation("SalesReceiptDepositAccount", fields: [depositAccountId], references: [id], onUpdate: NoAction)
  postedJournal    Journal?      @relation("SalesReceiptPostedJournal", fields: [postedJournalId], references: [id], onDelete: Restrict, onUpdate: NoAction)
  voidJournal      Journal?      @relation("SalesReceiptVoidJournal", fields: [voidJournalId], references: [id], onDelete: Restrict, onUpdate: NoAction)
  organization     Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([organizationId, receiptNo])
  @@index([organizationId, contactId])
  @@index([organizationId, status])
  @@map("sales_receipts")
  @@schema("public")
}

model SalesReceiptLine {
  id              String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId  String       @map("org_id") @db.Uuid
  salesReceiptId  String       @map("sales_receipt_id") @db.Uuid
  accountId       String       @map("account_id") @db.Uuid
  description     String
  quantity        Decimal      @default(1) @db.Decimal(12, 2)
  unitAmountMinor BigInt       @default(0) @map("unit_amount_minor")
  discountMinor   BigInt       @default(0) @map("discount_minor")
  subtotalMinor   BigInt       @default(0) @map("subtotal_minor")
  taxCode         String       @default("no_vat") @map("tax_code")
  taxRate         Decimal      @default(0) @map("tax_rate") @db.Decimal(5, 2)
  taxMinor        BigInt       @default(0) @map("tax_minor")
  totalMinor      BigInt       @default(0) @map("total_minor")
  createdAt       DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  account         ChartAccount @relation(fields: [accountId], references: [id], onUpdate: NoAction)
  salesReceipt    SalesReceipt @relation(fields: [salesReceiptId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([organizationId, salesReceiptId])
  @@index([organizationId, accountId])
  @@map("sales_receipt_lines")
  @@schema("public")
}

model RefundReceipt {
  id                  String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId      String        @map("org_id") @db.Uuid
  receiptNo           String        @map("receipt_no")
  status              String        @default("posted")
  contactId           String        @map("contact_id") @db.Uuid
  receiptDate         DateTime      @map("receipt_date") @db.Date
  currency            CurrencyCode  @default(GBP)
  amountsAre          String        @default("exclusive") @map("amounts_are")
  paymentMethod       String?       @map("payment_method")
  refundFromAccountId String        @map("refund_from_account_id") @db.Uuid
  reference           String?
  subtotalMinor       BigInt        @default(0) @map("subtotal_minor")
  discountMinor       BigInt        @default(0) @map("discount_minor")
  taxMinor            BigInt        @default(0) @map("tax_minor")
  totalMinor          BigInt        @default(0) @map("total_minor")
  notes               String?
  postedJournalId     String?       @unique @map("posted_journal_id") @db.Uuid
  voidJournalId       String?       @unique @map("void_journal_id") @db.Uuid
  createdAt           DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime      @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  lines               RefundReceiptLine[]
  contact             Contact       @relation(fields: [contactId], references: [id], onUpdate: NoAction)
  refundFromAccount   ChartAccount  @relation("RefundReceiptFromAccount", fields: [refundFromAccountId], references: [id], onUpdate: NoAction)
  postedJournal       Journal?      @relation("RefundReceiptPostedJournal", fields: [postedJournalId], references: [id], onDelete: Restrict, onUpdate: NoAction)
  voidJournal         Journal?      @relation("RefundReceiptVoidJournal", fields: [voidJournalId], references: [id], onDelete: Restrict, onUpdate: NoAction)
  organization        Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([organizationId, receiptNo])
  @@index([organizationId, contactId])
  @@index([organizationId, status])
  @@map("refund_receipts")
  @@schema("public")
}

model RefundReceiptLine {
  id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId  String        @map("org_id") @db.Uuid
  refundReceiptId String        @map("refund_receipt_id") @db.Uuid
  accountId       String        @map("account_id") @db.Uuid
  description     String
  quantity        Decimal       @default(1) @db.Decimal(12, 2)
  unitAmountMinor BigInt        @default(0) @map("unit_amount_minor")
  discountMinor   BigInt        @default(0) @map("discount_minor")
  subtotalMinor   BigInt        @default(0) @map("subtotal_minor")
  taxCode         String        @default("no_vat") @map("tax_code")
  taxRate         Decimal       @default(0) @map("tax_rate") @db.Decimal(5, 2)
  taxMinor        BigInt        @default(0) @map("tax_minor")
  totalMinor      BigInt        @default(0) @map("total_minor")
  createdAt       DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  account         ChartAccount  @relation(fields: [accountId], references: [id], onUpdate: NoAction)
  refundReceipt   RefundReceipt @relation(fields: [refundReceiptId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  organization    Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([organizationId, refundReceiptId])
  @@index([organizationId, accountId])
  @@map("refund_receipt_lines")
  @@schema("public")
}
```

- [ ] **Step 2: Add the back-relations Prisma requires on existing models**

In the `Journal` model (after `postedInvoices Invoice? @relation("InvoicePostedJournal")`, ~line 215) add:

```prisma
  postedSalesReceipt  SalesReceipt?  @relation("SalesReceiptPostedJournal")
  voidSalesReceipt    SalesReceipt?  @relation("SalesReceiptVoidJournal")
  postedRefundReceipt RefundReceipt? @relation("RefundReceiptPostedJournal")
  voidRefundReceipt   RefundReceipt? @relation("RefundReceiptVoidJournal")
```

In the `Contact` model (next to its `invoices Invoice[]`-style back-relations) add:

```prisma
  salesReceipts  SalesReceipt[]
  refundReceipts RefundReceipt[]
```

In the `ChartAccount` model add:

```prisma
  salesReceiptDeposits SalesReceipt[]      @relation("SalesReceiptDepositAccount")
  refundReceiptSources RefundReceipt[]     @relation("RefundReceiptFromAccount")
  salesReceiptLines    SalesReceiptLine[]
  refundReceiptLines   RefundReceiptLine[]
```

In the `Organization` model add:

```prisma
  salesReceipts      SalesReceipt[]
  salesReceiptLines  SalesReceiptLine[]
  refundReceipts     RefundReceipt[]
  refundReceiptLines RefundReceiptLine[]
```

- [ ] **Step 3: Validate the schema**

Run: `pnpm exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid` (fix any missing back-relation errors it reports — the error message names the exact model/field).

- [ ] **Step 4: Write the migration SQL**

Create `prisma/migrations/20260707090000_sales_refund_receipts/migration.sql`:

```sql
-- Sales receipts: sale + immediate payment in one document (no AR).
CREATE TABLE IF NOT EXISTS sales_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  receipt_no text NOT NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  receipt_date date NOT NULL,
  currency currency_code NOT NULL DEFAULT 'GBP',
  amounts_are text NOT NULL DEFAULT 'exclusive',
  payment_method text CHECK (payment_method IN ('cash','cheque','bank_transfer')),
  deposit_account_id uuid NOT NULL REFERENCES chart_accounts(id),
  subtotal_minor bigint NOT NULL DEFAULT 0,
  discount_minor bigint NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL DEFAULT 0,
  total_minor bigint NOT NULL DEFAULT 0,
  notes text,
  posted_journal_id uuid UNIQUE REFERENCES journals(id) ON DELETE RESTRICT,
  void_journal_id uuid UNIQUE REFERENCES journals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_receipts_org_no_unique UNIQUE (org_id, receipt_no)
);
CREATE INDEX IF NOT EXISTS sales_receipts_org_contact_idx ON sales_receipts (org_id, contact_id);
CREATE INDEX IF NOT EXISTS sales_receipts_org_status_idx ON sales_receipts (org_id, status);

CREATE TABLE IF NOT EXISTS sales_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sales_receipt_id uuid NOT NULL REFERENCES sales_receipts(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES chart_accounts(id),
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_amount_minor bigint NOT NULL DEFAULT 0,
  discount_minor bigint NOT NULL DEFAULT 0,
  subtotal_minor bigint NOT NULL DEFAULT 0,
  tax_code text NOT NULL DEFAULT 'no_vat',
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL DEFAULT 0,
  total_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_receipt_lines_org_receipt_idx ON sales_receipt_lines (org_id, sales_receipt_id);
CREATE INDEX IF NOT EXISTS sales_receipt_lines_org_account_idx ON sales_receipt_lines (org_id, account_id);

-- Refund receipts: money refunded to a customer out of a bank/cash account.
CREATE TABLE IF NOT EXISTS refund_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  receipt_no text NOT NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  receipt_date date NOT NULL,
  currency currency_code NOT NULL DEFAULT 'GBP',
  amounts_are text NOT NULL DEFAULT 'exclusive',
  payment_method text CHECK (payment_method IN ('cash','cheque','bank_transfer')),
  refund_from_account_id uuid NOT NULL REFERENCES chart_accounts(id),
  reference text,
  subtotal_minor bigint NOT NULL DEFAULT 0,
  discount_minor bigint NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL DEFAULT 0,
  total_minor bigint NOT NULL DEFAULT 0,
  notes text,
  posted_journal_id uuid UNIQUE REFERENCES journals(id) ON DELETE RESTRICT,
  void_journal_id uuid UNIQUE REFERENCES journals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_receipts_org_no_unique UNIQUE (org_id, receipt_no)
);
CREATE INDEX IF NOT EXISTS refund_receipts_org_contact_idx ON refund_receipts (org_id, contact_id);
CREATE INDEX IF NOT EXISTS refund_receipts_org_status_idx ON refund_receipts (org_id, status);

CREATE TABLE IF NOT EXISTS refund_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  refund_receipt_id uuid NOT NULL REFERENCES refund_receipts(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES chart_accounts(id),
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_amount_minor bigint NOT NULL DEFAULT 0,
  discount_minor bigint NOT NULL DEFAULT 0,
  subtotal_minor bigint NOT NULL DEFAULT 0,
  tax_code text NOT NULL DEFAULT 'no_vat',
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL DEFAULT 0,
  total_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refund_receipt_lines_org_receipt_idx ON refund_receipt_lines (org_id, refund_receipt_id);
CREATE INDEX IF NOT EXISTS refund_receipt_lines_org_account_idx ON refund_receipt_lines (org_id, account_id);
```

- [ ] **Step 5: Apply the migration and regenerate the client**

Run: `pnpm exec prisma migrate deploy && pnpm exec prisma generate`
Expected: migration `20260707090000_sales_refund_receipts` applied; client generated without errors.

- [ ] **Step 6: Add teardown for the new tables in `tests/fixtures.ts`**

In `dropTestOrg`, `session_replication_role = 'replica'` disables ALL triggers — including the FK/cascade machinery — so every child table must be deleted explicitly or rows leak. Add these four lines right after `await tx.journal.deleteMany(...)` (line 65):

```ts
    await tx.salesReceiptLine.deleteMany({ where: { organizationId: orgId } });
    await tx.salesReceipt.deleteMany({ where: { organizationId: orgId } });
    await tx.refundReceiptLine.deleteMany({ where: { organizationId: orgId } });
    await tx.refundReceipt.deleteMany({ where: { organizationId: orgId } });
```

- [ ] **Step 7: Verify nothing broke**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; existing test suite passes (no new tests yet).

---

### Task 2: Sales Receipt posting logic (`lib/accounting/receipts.ts`) — TDD

**Files:**
- Modify: `lib/accounting/documents.ts` (add `export` to existing declarations: `normalizeLines` line 595, `resolveDepositAccount` line 485, `computeNextNumber` line 365, and the consts `bankAccount` line 178, `outputVatAccount` line 190, `salesDiscountAccount` line 195)
- Create: `lib/accounting/receipts.ts`
- Test: `tests/sales-receipts.test.ts`

**Interfaces:**
- Consumes: Prisma delegates from Task 1; from `documents.ts`: `normalizeLines(tx, organizationId, lines, allowed, amountsAre)`, `resolveDepositAccount(tx, organizationId, accountId)`, `resolveSystemAccount(tx, organizationId, {code, accountType})`, `computeNextNumber(prefix, existing)`, `withDocNumberRetry(fn)`, `assertJournalBalances(label, ref, lines)`, `bankAccount`, `outputVatAccount`, `salesDiscountAccount`, types `DocumentLineInput`, `PaymentMethod`, `VatTreatment`.
- Produces (used by Tasks 3–5):
  - `type ReceiptDraftInput = { contactId: string; receiptDate: string; currency?: CurrencyCode; amountsAre?: VatTreatment; paymentMethod?: PaymentMethod | null; bankAccountId?: string | null; reference?: string; notes?: string; lines: DocumentLineInput[] }`
  - `type ReceiptPostingResult = { documentId: string; documentNo: string; journalId: string }`
  - `type ReceiptLineDto` and `type ReceiptDto` (all-`number` money fields; see code)
  - `createSalesReceipt(prisma: ExtendedPrismaClient, organizationId: string, actorUserId: string, input: ReceiptDraftInput): Promise<ReceiptPostingResult>`
  - `voidSalesReceipt(prisma, organizationId, actorUserId, receiptId: string): Promise<ReceiptPostingResult>`
  - `listSalesReceipts(prisma, organizationId): Promise<ReceiptDto[]>`

- [ ] **Step 1: Export the shared helpers from `documents.ts`**

Add the `export` keyword to the six declarations listed above (no other changes — e.g. `async function normalizeLines(` becomes `export async function normalizeLines(`, `const bankAccount = {` becomes `export const bankAccount = {`).

- [ ] **Step 2: Write the failing tests**

Create `tests/sales-receipts.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  createSalesReceipt,
  listSalesReceipts,
  voidSalesReceipt,
  type ReceiptDraftInput,
} from "@/lib/accounting/receipts";

import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

let testOrg: TestOrg;

beforeEach(async () => {
  testOrg = await createTestOrg();
});

afterEach(async () => {
  await dropTestOrg(testOrg.orgId);
});

async function revenueAccountId(orgId: string): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: orgId, accountType: "REVENUE", reportCategory: "SALES" },
    select: { id: true },
  });
  return row.id;
}

async function systemAccountId(orgId: string, code: string): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: orgId, code, isActive: true },
    select: { id: true },
  });
  return row.id;
}

function buildReceipt(accountId: string, overrides: Partial<ReceiptDraftInput> = {}): ReceiptDraftInput {
  return {
    contactId: testOrg.customerId,
    receiptDate: "2026-05-10",
    lines: [
      {
        accountId,
        description: "Test cash sale",
        quantity: "1.00",
        unitPrice: "100.00",
        taxCode: "vat_20",
      },
    ],
    ...overrides,
  };
}

describe("createSalesReceipt", () => {
  it("posts one balanced journal: DR bank total, CR revenue net, CR output VAT — no AR", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const result = await createSalesReceipt(prisma, testOrg.orgId, testOrg.userId, buildReceipt(accountId));

    expect(result.documentNo).toBe("SR-0001");

    const receipt = await prisma.salesReceipt.findFirstOrThrow({
      where: { id: result.documentId, organizationId: testOrg.orgId },
    });
    expect(receipt.status).toBe("posted");
    expect(Number(receipt.subtotalMinor)).toBe(10000);
    expect(Number(receipt.taxMinor)).toBe(2000);
    expect(Number(receipt.totalMinor)).toBe(12000);
    expect(receipt.postedJournalId).toBe(result.journalId);

    const journal = await prisma.journal.findFirstOrThrow({
      where: { id: result.journalId, organizationId: testOrg.orgId },
      include: { lines: true },
    });
    expect(journal.status).toBe("POSTED");
    expect(journal.sourceType).toBe("sales_receipt");
    expect(journal.sourceId).toBe(result.documentId);

    const bankId = await systemAccountId(testOrg.orgId, "1000");
    const vatId = await systemAccountId(testOrg.orgId, "2100");
    const arId = await systemAccountId(testOrg.orgId, "1100");

    const bankLine = journal.lines.find((l) => l.accountId === bankId);
    const revenueLine = journal.lines.find((l) => l.accountId === accountId);
    const vatLine = journal.lines.find((l) => l.accountId === vatId);
    expect(Number(bankLine?.debitMinor)).toBe(12000);
    expect(Number(revenueLine?.creditMinor)).toBe(10000);
    expect(Number(vatLine?.creditMinor)).toBe(2000);
    expect(journal.lines.some((l) => l.accountId === arId)).toBe(false);
  });

  it("stores paymentMethod on both the receipt and the journal", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const result = await createSalesReceipt(
      prisma,
      testOrg.orgId,
      testOrg.userId,
      buildReceipt(accountId, { paymentMethod: "cash" })
    );

    const receipt = await prisma.salesReceipt.findFirstOrThrow({ where: { id: result.documentId } });
    const journal = await prisma.journal.findFirstOrThrow({ where: { id: result.journalId } });
    expect(receipt.paymentMethod).toBe("cash");
    expect(journal.paymentMethod).toBe("cash");
  });

  it("inclusive VAT: the document total equals what the user typed", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const result = await createSalesReceipt(
      prisma,
      testOrg.orgId,
      testOrg.userId,
      buildReceipt(accountId, {
        amountsAre: "inclusive",
        lines: [
          { accountId, description: "Gross sale", quantity: "1.00", unitPrice: "120.00", taxCode: "vat_20" },
        ],
      })
    );

    const receipt = await prisma.salesReceipt.findFirstOrThrow({ where: { id: result.documentId } });
    expect(Number(receipt.totalMinor)).toBe(12000);
    expect(Number(receipt.taxMinor)).toBe(2000);
    expect(Number(receipt.subtotalMinor)).toBe(10000);
  });

  it("increments the receipt number per organization", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const first = await createSalesReceipt(prisma, testOrg.orgId, testOrg.userId, buildReceipt(accountId));
    const second = await createSalesReceipt(prisma, testOrg.orgId, testOrg.userId, buildReceipt(accountId));
    expect(first.documentNo).toBe("SR-0001");
    expect(second.documentNo).toBe("SR-0002");
  });

  it("rejects a deposit account that is not a BANK account", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    await expect(
      createSalesReceipt(
        prisma,
        testOrg.orgId,
        testOrg.userId,
        buildReceipt(accountId, { bankAccountId: accountId })
      )
    ).rejects.toThrow(/not a valid bank account/i);
  });

  it("rejects a supplier contact", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    await expect(
      createSalesReceipt(
        prisma,
        testOrg.orgId,
        testOrg.userId,
        buildReceipt(accountId, { contactId: testOrg.supplierId })
      )
    ).rejects.toThrow(/customer/i);
  });
});

describe("voidSalesReceipt", () => {
  it("posts a today-dated mirror journal and flips status to void; double void rejects", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const created = await createSalesReceipt(prisma, testOrg.orgId, testOrg.userId, buildReceipt(accountId));

    const voided = await voidSalesReceipt(prisma, testOrg.orgId, testOrg.userId, created.documentId);

    const receipt = await prisma.salesReceipt.findFirstOrThrow({ where: { id: created.documentId } });
    expect(receipt.status).toBe("void");
    expect(receipt.voidJournalId).toBe(voided.journalId);

    const reversal = await prisma.journal.findFirstOrThrow({
      where: { id: voided.journalId },
      include: { lines: true },
    });
    expect(reversal.sourceType).toBe("sales_receipt_void");
    expect(reversal.reversedJournalId).toBe(created.journalId);
    expect(reversal.journalDate.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));

    const bankId = await systemAccountId(testOrg.orgId, "1000");
    const bankLine = reversal.lines.find((l) => l.accountId === bankId);
    expect(Number(bankLine?.creditMinor)).toBe(12000);

    await expect(
      voidSalesReceipt(prisma, testOrg.orgId, testOrg.userId, created.documentId)
    ).rejects.toThrow(/already void/i);
  });
});

describe("listSalesReceipts", () => {
  it("returns plain-number DTOs with contact and account names", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    await createSalesReceipt(prisma, testOrg.orgId, testOrg.userId, buildReceipt(accountId));

    const receipts = await listSalesReceipts(prisma, testOrg.orgId);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].receiptNo).toBe("SR-0001");
    expect(receipts[0].status).toBe("posted");
    expect(receipts[0].totalMinor).toBe(12000);
    expect(typeof receipts[0].contactName).toBe("string");
    expect(receipts[0].lines).toHaveLength(1);
    expect(receipts[0].lines[0].subtotalMinor).toBe(10000);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/sales-receipts.test.ts`
Expected: FAIL — `Cannot find module '@/lib/accounting/receipts'` (or equivalent).

- [ ] **Step 4: Implement `lib/accounting/receipts.ts` (sales-receipt half)**

```ts
import "server-only";

import {
  AuditAction,
  ContactType,
  CurrencyCode,
  JournalStatus,
} from "@prisma/client";

import { assertPeriodOpen } from "@/lib/accounting/period-close";
import {
  assertJournalBalances,
  bankAccount,
  computeNextNumber,
  normalizeLines,
  outputVatAccount,
  resolveDepositAccount,
  resolveSystemAccount,
  salesDiscountAccount,
  withDocNumberRetry,
  type DocumentLineInput,
  type PaymentMethod,
  type VatTreatment,
} from "@/lib/accounting/documents";
import type { ExtendedPrismaClient, TransactionClient } from "@/lib/prisma";

type Tx = TransactionClient;

export type ReceiptDraftInput = {
  contactId: string;
  receiptDate: string; // YYYY-MM-DD
  currency?: CurrencyCode;
  amountsAre?: VatTreatment;
  paymentMethod?: PaymentMethod | null;
  // Deposit-to account for sales receipts, refund-from account for refund
  // receipts. Falls back to the system bank account (1000) when omitted.
  bankAccountId?: string | null;
  reference?: string;
  notes?: string;
  lines: DocumentLineInput[];
};

export type ReceiptPostingResult = {
  documentId: string;
  documentNo: string;
  journalId: string;
};

export type ReceiptLineDto = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string;
  quantity: string;
  unitPriceMinor: number;
  discountMinor: number;
  subtotalMinor: number;
  taxCode: string;
  taxRate: number;
  taxMinor: number;
  totalMinor: number;
};

export type ReceiptDto = {
  id: string;
  receiptNo: string;
  status: "posted" | "void";
  contactId: string;
  contactName: string;
  receiptDate: string;
  currency: CurrencyCode;
  amountsAre: VatTreatment;
  paymentMethod: PaymentMethod | null;
  bankAccountId: string;
  bankAccountName: string;
  reference: string | null;
  notes: string | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  postedJournalId: string | null;
  createdAt: string;
  lines: ReceiptLineDto[];
};

// Revenue lines only, same rule as invoices.
const receiptLineRules = {
  accountTypes: ["REVENUE" as const],
  reportCategories: ["SALES" as const, "OTHER_INCOME" as const],
};

function toDate(value: string) {
  if (!value) return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  return new Date(`${value}T00:00:00.000Z`);
}

async function resolveCustomer(tx: Tx, organizationId: string, contactId: string) {
  const contact = await tx.contact.findFirst({
    where: {
      id: contactId,
      organizationId,
      isActive: true,
      contactType: { in: [ContactType.CUSTOMER, ContactType.BOTH] },
    },
    select: { id: true, name: true },
  });
  if (!contact) {
    throw new Error("Selected contact is not an active customer of this organization.");
  }
  return contact;
}

async function resolveReceiptBankAccount(
  tx: Tx,
  organizationId: string,
  bankAccountId?: string | null
) {
  return bankAccountId
    ? resolveDepositAccount(tx, organizationId, bankAccountId)
    : resolveSystemAccount(tx, organizationId, bankAccount);
}

/** Post a DRAFT journal with the given lines, then flip it to POSTED
 *  (two steps to bypass the DB immutability trigger on posted journals). */
async function postJournal(
  tx: Tx,
  args: {
    organizationId: string;
    actorUserId: string;
    journalDate: Date;
    memo: string;
    sourceType: string;
    sourceId: string;
    paymentMethod: PaymentMethod | null;
    reversedJournalId?: string;
    lines: Array<{
      organizationId: string;
      accountId: string;
      contactId: string | null;
      debitMinor: bigint;
      creditMinor: bigint;
      memo: string;
    }>;
  }
) {
  const journal = await tx.journal.create({
    data: {
      organizationId: args.organizationId,
      status: JournalStatus.DRAFT,
      journalDate: args.journalDate,
      memo: args.memo,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      paymentMethod: args.paymentMethod,
      reversedJournalId: args.reversedJournalId ?? null,
      createdByUserId: args.actorUserId,
      lines: { create: args.lines },
    },
    select: { id: true },
  });

  await tx.journal.update({
    where: { id: journal.id },
    data: {
      status: JournalStatus.POSTED,
      postedByUserId: args.actorUserId,
      postedAt: new Date(),
    },
  });

  return journal.id;
}

export async function createSalesReceipt(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  input: ReceiptDraftInput
): Promise<ReceiptPostingResult> {
  return withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const contact = await resolveCustomer(tx, organizationId, input.contactId);
      const receiptDate = toDate(input.receiptDate);
      await assertPeriodOpen(tx, organizationId, receiptDate);

      const amountsAre = input.amountsAre ?? "exclusive";
      const normalized = await normalizeLines(
        tx,
        organizationId,
        input.lines,
        receiptLineRules,
        amountsAre
      );

      const depositAccountId = await resolveReceiptBankAccount(tx, organizationId, input.bankAccountId);
      const vatAccountId =
        normalized.taxMinor > BigInt(0)
          ? await resolveSystemAccount(tx, organizationId, outputVatAccount)
          : null;
      const discountAccountId =
        normalized.discountMinor > BigInt(0)
          ? await resolveSystemAccount(tx, organizationId, salesDiscountAccount)
          : null;

      const rows = await tx.salesReceipt.findMany({
        where: { organizationId, receiptNo: { startsWith: "SR-" } },
        select: { receiptNo: true },
      });
      const receiptNo = computeNextNumber("SR-", rows.map((row) => row.receiptNo));

      const receipt = await tx.salesReceipt.create({
        data: {
          organizationId,
          receiptNo,
          status: "posted",
          contactId: contact.id,
          receiptDate,
          currency: input.currency ?? CurrencyCode.GBP,
          amountsAre,
          paymentMethod: input.paymentMethod ?? null,
          depositAccountId,
          subtotalMinor: normalized.subtotalMinor,
          discountMinor: normalized.discountMinor,
          taxMinor: normalized.taxMinor,
          totalMinor: normalized.totalMinor,
          notes: input.notes?.trim() || null,
          lines: {
            create: normalized.lines.map((line) => ({
              organizationId,
              accountId: line.accountId,
              description: line.description,
              quantity: line.quantity,
              unitAmountMinor: line.unitAmountMinor,
              discountMinor: line.discountMinor,
              subtotalMinor: line.subtotalMinor,
              taxCode: line.taxCode,
              taxRate: line.taxRate,
              taxMinor: line.taxMinor,
              totalMinor: line.totalMinor,
            })),
          },
        },
        select: { id: true },
      });

      // DR bank (total) / CR revenue (net per line) / CR output VAT / DR discount.
      // Same shape as an approved cash-sale invoice with AR netted out.
      const journalLines = [
        {
          organizationId,
          accountId: depositAccountId,
          contactId: contact.id,
          debitMinor: normalized.totalMinor,
          creditMinor: BigInt(0),
          memo: `Sales receipt ${receiptNo}`,
        },
        ...normalized.lines.map((line) => ({
          organizationId,
          accountId: line.accountId,
          contactId: contact.id,
          debitMinor: BigInt(0),
          creditMinor: line.subtotalMinor,
          memo: line.description,
        })),
        ...(vatAccountId
          ? [
              {
                organizationId,
                accountId: vatAccountId,
                contactId: contact.id,
                debitMinor: BigInt(0),
                creditMinor: normalized.taxMinor,
                memo: `VAT on sales receipt ${receiptNo}`,
              },
            ]
          : []),
        ...(discountAccountId
          ? [
              {
                organizationId,
                accountId: discountAccountId,
                contactId: contact.id,
                debitMinor: normalized.discountMinor,
                creditMinor: BigInt(0),
                memo: `Discount on sales receipt ${receiptNo}`,
              },
            ]
          : []),
      ];

      assertJournalBalances("Sales receipt", receiptNo, journalLines);

      const journalId = await postJournal(tx, {
        organizationId,
        actorUserId,
        journalDate: receiptDate,
        memo: `Sales receipt ${receiptNo} - ${contact.name}`,
        sourceType: "sales_receipt",
        sourceId: receipt.id,
        paymentMethod: input.paymentMethod ?? null,
        lines: journalLines,
      });

      await tx.salesReceipt.update({
        where: { id: receipt.id },
        data: { postedJournalId: journalId },
      });

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          entityType: "sales_receipt",
          entityId: receipt.id,
          action: AuditAction.POST,
          after: { journalId, receiptNo, totalMinor: normalized.totalMinor.toString() },
        },
      });

      return { documentId: receipt.id, documentNo: receiptNo, journalId };
    })
  );
}

export async function voidSalesReceipt(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  receiptId: string
): Promise<ReceiptPostingResult> {
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.salesReceipt.findFirstOrThrow({
      where: { id: receiptId, organizationId },
      select: {
        id: true,
        receiptNo: true,
        status: true,
        postedJournalId: true,
        contact: { select: { name: true } },
      },
    });

    if (receipt.status !== "posted" || !receipt.postedJournalId) {
      throw new Error(`Sales receipt ${receipt.receiptNo} is already void.`);
    }

    // Reversal is dated today so it never lands in a closed period.
    const reversalDate = new Date();
    await assertPeriodOpen(tx, organizationId, reversalDate);

    const originalLines = await tx.journalLine.findMany({
      where: { journalId: receipt.postedJournalId, organizationId },
      select: { accountId: true, contactId: true, debitMinor: true, creditMinor: true },
    });

    const reversalLines = originalLines.map((line) => ({
      organizationId,
      accountId: line.accountId,
      contactId: line.contactId,
      debitMinor: line.creditMinor,
      creditMinor: line.debitMinor,
      memo: `Void sales receipt ${receipt.receiptNo}`,
    }));

    assertJournalBalances("Sales receipt void", receipt.receiptNo, reversalLines);

    const journalId = await postJournal(tx, {
      organizationId,
      actorUserId,
      journalDate: reversalDate,
      memo: `Void sales receipt ${receipt.receiptNo} - ${receipt.contact.name}`,
      sourceType: "sales_receipt_void",
      sourceId: receipt.id,
      paymentMethod: null,
      reversedJournalId: receipt.postedJournalId,
      lines: reversalLines,
    });

    await tx.salesReceipt.update({
      where: { id: receipt.id },
      data: { status: "void", voidJournalId: journalId },
    });

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "sales_receipt",
        entityId: receipt.id,
        action: AuditAction.VOID,
        after: { journalId, receiptNo: receipt.receiptNo },
      },
    });

    return { documentId: receipt.id, documentNo: receipt.receiptNo, journalId };
  });
}

type ReceiptRowForMapper = {
  id: string;
  receiptNo: string;
  status: string;
  contactId: string;
  contact: { name: string } | null;
  receiptDate: Date;
  currency: CurrencyCode;
  amountsAre: string;
  paymentMethod: string | null;
  reference?: string | null;
  notes: string | null;
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  postedJournalId: string | null;
  createdAt: Date;
  bankAccount: { id: string; name: string };
  lines: Array<{
    id: string;
    accountId: string;
    account: { code: string; name: string };
    description: string;
    quantity: unknown;
    unitAmountMinor: bigint;
    discountMinor: bigint;
    subtotalMinor: bigint;
    taxCode: string;
    taxRate: unknown;
    taxMinor: bigint;
    totalMinor: bigint;
  }>;
};

function mapReceipt(row: ReceiptRowForMapper): ReceiptDto {
  return {
    id: row.id,
    receiptNo: row.receiptNo,
    status: row.status === "void" ? "void" : "posted",
    contactId: row.contactId,
    contactName: row.contact?.name ?? "Unknown customer",
    receiptDate: row.receiptDate.toISOString().slice(0, 10),
    currency: row.currency,
    amountsAre: (row.amountsAre as VatTreatment) ?? "exclusive",
    paymentMethod: (row.paymentMethod as PaymentMethod | null) ?? null,
    bankAccountId: row.bankAccount.id,
    bankAccountName: row.bankAccount.name,
    reference: row.reference ?? null,
    notes: row.notes,
    subtotalMinor: Number(row.subtotalMinor),
    discountMinor: Number(row.discountMinor),
    taxMinor: Number(row.taxMinor),
    totalMinor: Number(row.totalMinor),
    postedJournalId: row.postedJournalId,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      accountId: line.accountId,
      accountCode: line.account.code,
      accountName: line.account.name,
      description: line.description,
      quantity: String(line.quantity),
      unitPriceMinor: Number(line.unitAmountMinor),
      discountMinor: Number(line.discountMinor),
      subtotalMinor: Number(line.subtotalMinor),
      taxCode: line.taxCode,
      taxRate: Number(String(line.taxRate)),
      taxMinor: Number(line.taxMinor),
      totalMinor: Number(line.totalMinor),
    })),
  };
}

const receiptLineInclude = {
  account: { select: { code: true, name: true } },
} as const;

export async function listSalesReceipts(
  prisma: ExtendedPrismaClient,
  organizationId: string
): Promise<ReceiptDto[]> {
  const receipts = await prisma.salesReceipt.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      contact: { select: { name: true } },
      depositAccount: { select: { id: true, name: true } },
      lines: { include: receiptLineInclude, orderBy: { createdAt: "asc" } },
    },
  });

  return receipts.map((receipt) =>
    mapReceipt({ ...receipt, bankAccount: receipt.depositAccount })
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run tests/sales-receipts.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Typecheck and run the full suite**

Run: `pnpm typecheck && pnpm test`
Expected: clean; no existing test regressions from the new `export` keywords.

---

### Task 3: Refund Receipt posting logic — TDD

**Files:**
- Modify: `lib/accounting/receipts.ts`
- Test: `tests/refund-receipts.test.ts`

**Interfaces:**
- Consumes: everything Task 2 built (`ReceiptDraftInput`, `ReceiptPostingResult`, `ReceiptDto`, `postJournal`, `resolveCustomer`, `resolveReceiptBankAccount`, `mapReceipt`, `receiptLineRules`, `receiptLineInclude`, `toDate`).
- Produces:
  - `createRefundReceipt(prisma, organizationId, actorUserId, input: ReceiptDraftInput): Promise<ReceiptPostingResult>` — honors `input.reference`
  - `voidRefundReceipt(prisma, organizationId, actorUserId, receiptId): Promise<ReceiptPostingResult>`
  - `listRefundReceipts(prisma, organizationId): Promise<ReceiptDto[]>`

- [ ] **Step 1: Write the failing tests**

Create `tests/refund-receipts.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  createRefundReceipt,
  listRefundReceipts,
  voidRefundReceipt,
  type ReceiptDraftInput,
} from "@/lib/accounting/receipts";

import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

let testOrg: TestOrg;

beforeEach(async () => {
  testOrg = await createTestOrg();
});

afterEach(async () => {
  await dropTestOrg(testOrg.orgId);
});

async function revenueAccountId(orgId: string): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: orgId, accountType: "REVENUE", reportCategory: "SALES" },
    select: { id: true },
  });
  return row.id;
}

async function systemAccountId(orgId: string, code: string): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: orgId, code, isActive: true },
    select: { id: true },
  });
  return row.id;
}

function buildRefund(accountId: string, overrides: Partial<ReceiptDraftInput> = {}): ReceiptDraftInput {
  return {
    contactId: testOrg.customerId,
    receiptDate: "2026-05-12",
    reference: "INV-0042",
    lines: [
      {
        accountId,
        description: "Refund for returned goods",
        quantity: "1.00",
        unitPrice: "100.00",
        taxCode: "vat_20",
      },
    ],
    ...overrides,
  };
}

describe("createRefundReceipt", () => {
  it("posts the mirror journal: CR bank total, DR revenue net, DR output VAT", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const result = await createRefundReceipt(prisma, testOrg.orgId, testOrg.userId, buildRefund(accountId));

    expect(result.documentNo).toBe("RR-0001");

    const refund = await prisma.refundReceipt.findFirstOrThrow({
      where: { id: result.documentId, organizationId: testOrg.orgId },
    });
    expect(refund.status).toBe("posted");
    expect(refund.reference).toBe("INV-0042");
    expect(Number(refund.totalMinor)).toBe(12000);

    const journal = await prisma.journal.findFirstOrThrow({
      where: { id: result.journalId },
      include: { lines: true },
    });
    expect(journal.sourceType).toBe("refund_receipt");
    expect(journal.status).toBe("POSTED");

    const bankId = await systemAccountId(testOrg.orgId, "1000");
    const vatId = await systemAccountId(testOrg.orgId, "2100");
    const bankLine = journal.lines.find((l) => l.accountId === bankId);
    const revenueLine = journal.lines.find((l) => l.accountId === accountId);
    const vatLine = journal.lines.find((l) => l.accountId === vatId);
    expect(Number(bankLine?.creditMinor)).toBe(12000);
    expect(Number(revenueLine?.debitMinor)).toBe(10000);
    expect(Number(vatLine?.debitMinor)).toBe(2000);
  });

  it("numbers refunds independently of sales receipts", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const first = await createRefundReceipt(prisma, testOrg.orgId, testOrg.userId, buildRefund(accountId));
    const second = await createRefundReceipt(prisma, testOrg.orgId, testOrg.userId, buildRefund(accountId));
    expect(first.documentNo).toBe("RR-0001");
    expect(second.documentNo).toBe("RR-0002");
  });
});

describe("voidRefundReceipt", () => {
  it("reverses the refund journal and flips status; double void rejects", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const created = await createRefundReceipt(prisma, testOrg.orgId, testOrg.userId, buildRefund(accountId));

    const voided = await voidRefundReceipt(prisma, testOrg.orgId, testOrg.userId, created.documentId);

    const refund = await prisma.refundReceipt.findFirstOrThrow({ where: { id: created.documentId } });
    expect(refund.status).toBe("void");

    const reversal = await prisma.journal.findFirstOrThrow({
      where: { id: voided.journalId },
      include: { lines: true },
    });
    expect(reversal.sourceType).toBe("refund_receipt_void");
    expect(reversal.reversedJournalId).toBe(created.journalId);

    const bankId = await systemAccountId(testOrg.orgId, "1000");
    const bankLine = reversal.lines.find((l) => l.accountId === bankId);
    expect(Number(bankLine?.debitMinor)).toBe(12000);

    await expect(
      voidRefundReceipt(prisma, testOrg.orgId, testOrg.userId, created.documentId)
    ).rejects.toThrow(/already void/i);
  });
});

describe("listRefundReceipts", () => {
  it("returns DTOs including the reference", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    await createRefundReceipt(prisma, testOrg.orgId, testOrg.userId, buildRefund(accountId));

    const refunds = await listRefundReceipts(prisma, testOrg.orgId);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].receiptNo).toBe("RR-0001");
    expect(refunds[0].reference).toBe("INV-0042");
    expect(refunds[0].totalMinor).toBe(12000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/refund-receipts.test.ts`
Expected: FAIL — `createRefundReceipt` is not exported.

- [ ] **Step 3: Implement the refund functions in `lib/accounting/receipts.ts`**

Append:

```ts
export async function createRefundReceipt(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  input: ReceiptDraftInput
): Promise<ReceiptPostingResult> {
  return withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const contact = await resolveCustomer(tx, organizationId, input.contactId);
      const receiptDate = toDate(input.receiptDate);
      await assertPeriodOpen(tx, organizationId, receiptDate);

      const amountsAre = input.amountsAre ?? "exclusive";
      const normalized = await normalizeLines(
        tx,
        organizationId,
        input.lines,
        receiptLineRules,
        amountsAre
      );

      const refundFromAccountId = await resolveReceiptBankAccount(
        tx,
        organizationId,
        input.bankAccountId
      );
      const vatAccountId =
        normalized.taxMinor > BigInt(0)
          ? await resolveSystemAccount(tx, organizationId, outputVatAccount)
          : null;
      const discountAccountId =
        normalized.discountMinor > BigInt(0)
          ? await resolveSystemAccount(tx, organizationId, salesDiscountAccount)
          : null;

      const rows = await tx.refundReceipt.findMany({
        where: { organizationId, receiptNo: { startsWith: "RR-" } },
        select: { receiptNo: true },
      });
      const receiptNo = computeNextNumber("RR-", rows.map((row) => row.receiptNo));

      const refund = await tx.refundReceipt.create({
        data: {
          organizationId,
          receiptNo,
          status: "posted",
          contactId: contact.id,
          receiptDate,
          currency: input.currency ?? CurrencyCode.GBP,
          amountsAre,
          paymentMethod: input.paymentMethod ?? null,
          refundFromAccountId,
          reference: input.reference?.trim() || null,
          subtotalMinor: normalized.subtotalMinor,
          discountMinor: normalized.discountMinor,
          taxMinor: normalized.taxMinor,
          totalMinor: normalized.totalMinor,
          notes: input.notes?.trim() || null,
          lines: {
            create: normalized.lines.map((line) => ({
              organizationId,
              accountId: line.accountId,
              description: line.description,
              quantity: line.quantity,
              unitAmountMinor: line.unitAmountMinor,
              discountMinor: line.discountMinor,
              subtotalMinor: line.subtotalMinor,
              taxCode: line.taxCode,
              taxRate: line.taxRate,
              taxMinor: line.taxMinor,
              totalMinor: line.totalMinor,
            })),
          },
        },
        select: { id: true },
      });

      // Mirror of the sales receipt: money leaves the bank, revenue and
      // output VAT are debited back down.
      const journalLines = [
        {
          organizationId,
          accountId: refundFromAccountId,
          contactId: contact.id,
          debitMinor: BigInt(0),
          creditMinor: normalized.totalMinor,
          memo: `Refund receipt ${receiptNo}`,
        },
        ...normalized.lines.map((line) => ({
          organizationId,
          accountId: line.accountId,
          contactId: contact.id,
          debitMinor: line.subtotalMinor,
          creditMinor: BigInt(0),
          memo: line.description,
        })),
        ...(vatAccountId
          ? [
              {
                organizationId,
                accountId: vatAccountId,
                contactId: contact.id,
                debitMinor: normalized.taxMinor,
                creditMinor: BigInt(0),
                memo: `VAT on refund receipt ${receiptNo}`,
              },
            ]
          : []),
        ...(discountAccountId
          ? [
              {
                organizationId,
                accountId: discountAccountId,
                contactId: contact.id,
                debitMinor: BigInt(0),
                creditMinor: normalized.discountMinor,
                memo: `Discount on refund receipt ${receiptNo}`,
              },
            ]
          : []),
      ];

      assertJournalBalances("Refund receipt", receiptNo, journalLines);

      const journalId = await postJournal(tx, {
        organizationId,
        actorUserId,
        journalDate: receiptDate,
        memo: `Refund receipt ${receiptNo} - ${contact.name}`,
        sourceType: "refund_receipt",
        sourceId: refund.id,
        paymentMethod: input.paymentMethod ?? null,
        lines: journalLines,
      });

      await tx.refundReceipt.update({
        where: { id: refund.id },
        data: { postedJournalId: journalId },
      });

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          entityType: "refund_receipt",
          entityId: refund.id,
          action: AuditAction.POST,
          after: { journalId, receiptNo, totalMinor: normalized.totalMinor.toString() },
        },
      });

      return { documentId: refund.id, documentNo: receiptNo, journalId };
    })
  );
}

export async function voidRefundReceipt(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  receiptId: string
): Promise<ReceiptPostingResult> {
  return prisma.$transaction(async (tx) => {
    const refund = await tx.refundReceipt.findFirstOrThrow({
      where: { id: receiptId, organizationId },
      select: {
        id: true,
        receiptNo: true,
        status: true,
        postedJournalId: true,
        contact: { select: { name: true } },
      },
    });

    if (refund.status !== "posted" || !refund.postedJournalId) {
      throw new Error(`Refund receipt ${refund.receiptNo} is already void.`);
    }

    const reversalDate = new Date();
    await assertPeriodOpen(tx, organizationId, reversalDate);

    const originalLines = await tx.journalLine.findMany({
      where: { journalId: refund.postedJournalId, organizationId },
      select: { accountId: true, contactId: true, debitMinor: true, creditMinor: true },
    });

    const reversalLines = originalLines.map((line) => ({
      organizationId,
      accountId: line.accountId,
      contactId: line.contactId,
      debitMinor: line.creditMinor,
      creditMinor: line.debitMinor,
      memo: `Void refund receipt ${refund.receiptNo}`,
    }));

    assertJournalBalances("Refund receipt void", refund.receiptNo, reversalLines);

    const journalId = await postJournal(tx, {
      organizationId,
      actorUserId,
      journalDate: reversalDate,
      memo: `Void refund receipt ${refund.receiptNo} - ${refund.contact.name}`,
      sourceType: "refund_receipt_void",
      sourceId: refund.id,
      paymentMethod: null,
      reversedJournalId: refund.postedJournalId,
      lines: reversalLines,
    });

    await tx.refundReceipt.update({
      where: { id: refund.id },
      data: { status: "void", voidJournalId: journalId },
    });

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "refund_receipt",
        entityId: refund.id,
        action: AuditAction.VOID,
        after: { journalId, receiptNo: refund.receiptNo },
      },
    });

    return { documentId: refund.id, documentNo: refund.receiptNo, journalId };
  });
}

export async function listRefundReceipts(
  prisma: ExtendedPrismaClient,
  organizationId: string
): Promise<ReceiptDto[]> {
  const refunds = await prisma.refundReceipt.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      contact: { select: { name: true } },
      refundFromAccount: { select: { id: true, name: true } },
      lines: { include: receiptLineInclude, orderBy: { createdAt: "asc" } },
    },
  });

  return refunds.map((refund) =>
    mapReceipt({ ...refund, bankAccount: refund.refundFromAccount })
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/refund-receipts.test.ts tests/sales-receipts.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

---

### Task 4: Server actions and query keys

**Files:**
- Create: `app/(dashboard)/sales/receipts/actions.ts`
- Create: `app/(dashboard)/sales/refund-receipts/actions.ts`
- Modify: `lib/query-keys.ts`

**Interfaces:**
- Consumes: Task 2/3 lib functions; `requireAccountingWorkspace`/`requireAccountantRole` from `lib/accounting/dal.ts`; `getDocumentOptions` from `lib/accounting/documents.ts` (returns lowercased `contactType`/`reportCategory`).
- Produces (used by Task 5/6):
  - `getSalesReceiptWorkspace(): Promise<{ receipts: ReceiptDto[]; contacts; accounts; bankAccounts; taxRates; vatRegistered; canManage }>`
  - `createSalesReceiptAction(input: ReceiptDraftInput): Promise<ReceiptPostingResult>`
  - `voidSalesReceiptAction(receiptId: string): Promise<ReceiptPostingResult>`
  - Same trio with `RefundReceipt` in the name in the second file.
  - `queryKeys.salesReceiptWorkspace`, `queryKeys.refundReceiptWorkspace`

- [ ] **Step 1: Add query keys**

In `lib/query-keys.ts` add to the `queryKeys` object:

```ts
  salesReceiptWorkspace: ["sales", "receipts", "workspace"] as const,
  refundReceiptWorkspace: ["sales", "refund-receipts", "workspace"] as const,
```

- [ ] **Step 2: Create `app/(dashboard)/sales/receipts/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";

import {
  createSalesReceipt,
  listSalesReceipts,
  voidSalesReceipt,
  type ReceiptDraftInput,
} from "@/lib/accounting/receipts";
import { getDocumentOptions, type PaymentMethod } from "@/lib/accounting/documents";
import {
  requireAccountingWorkspace,
  requireAccountantRole,
} from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma";

function revalidateReceiptViews() {
  revalidatePath("/sales");
  revalidatePath("/sales/receipts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/accounting/journals");
  revalidatePath("/taxes");
}

// Clamp to the allowed enum so an unexpected value stores NULL rather than
// hitting the DB CHECK constraint with a raw, unfriendly error.
function clampPaymentMethod(method?: string | null): PaymentMethod | null {
  return method && (["cash", "cheque", "bank_transfer"] as readonly string[]).includes(method)
    ? (method as PaymentMethod)
    : null;
}

export async function getSalesReceiptWorkspace() {
  const workspace = await requireAccountingWorkspace();
  const [receipts, options] = await Promise.all([
    listSalesReceipts(prisma, workspace.organizationId),
    getDocumentOptions(prisma, workspace.organizationId),
  ]);

  return {
    receipts,
    contacts: options.contacts.filter((contact) =>
      ["customer", "both"].includes(contact.contactType)
    ),
    accounts: options.accounts.filter((account) =>
      ["sales", "other_income"].includes(account.reportCategory)
    ),
    // Must mirror the server-side check in resolveDepositAccount: active
    // BANK-category accounts only.
    bankAccounts: options.accounts.filter(
      (account) => account.reportCategory === "bank"
    ),
    taxRates: options.taxRates,
    vatRegistered: options.vatRegistered,
    canManage: workspace.role === "owner" || workspace.role === "accountant",
  };
}

export async function createSalesReceiptAction(input: ReceiptDraftInput) {
  const workspace = await requireAccountantRole();
  const result = await createSalesReceipt(prisma, workspace.organizationId, workspace.userId, {
    ...input,
    paymentMethod: clampPaymentMethod(input.paymentMethod),
  });
  revalidateReceiptViews();
  return result;
}

export async function voidSalesReceiptAction(receiptId: string) {
  const workspace = await requireAccountantRole();
  const result = await voidSalesReceipt(
    prisma,
    workspace.organizationId,
    workspace.userId,
    receiptId
  );
  revalidateReceiptViews();
  return result;
}
```

- [ ] **Step 3: Create `app/(dashboard)/sales/refund-receipts/actions.ts`**

Identical shape, refund flavor:

```ts
"use server";

import { revalidatePath } from "next/cache";

import {
  createRefundReceipt,
  listRefundReceipts,
  voidRefundReceipt,
  type ReceiptDraftInput,
} from "@/lib/accounting/receipts";
import { getDocumentOptions, type PaymentMethod } from "@/lib/accounting/documents";
import {
  requireAccountingWorkspace,
  requireAccountantRole,
} from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma";

function revalidateRefundReceiptViews() {
  revalidatePath("/sales");
  revalidatePath("/sales/refund-receipts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/accounting/journals");
  revalidatePath("/taxes");
}

function clampPaymentMethod(method?: string | null): PaymentMethod | null {
  return method && (["cash", "cheque", "bank_transfer"] as readonly string[]).includes(method)
    ? (method as PaymentMethod)
    : null;
}

export async function getRefundReceiptWorkspace() {
  const workspace = await requireAccountingWorkspace();
  const [receipts, options] = await Promise.all([
    listRefundReceipts(prisma, workspace.organizationId),
    getDocumentOptions(prisma, workspace.organizationId),
  ]);

  return {
    receipts,
    contacts: options.contacts.filter((contact) =>
      ["customer", "both"].includes(contact.contactType)
    ),
    accounts: options.accounts.filter((account) =>
      ["sales", "other_income"].includes(account.reportCategory)
    ),
    bankAccounts: options.accounts.filter(
      (account) => account.reportCategory === "bank"
    ),
    taxRates: options.taxRates,
    vatRegistered: options.vatRegistered,
    canManage: workspace.role === "owner" || workspace.role === "accountant",
  };
}

export async function createRefundReceiptAction(input: ReceiptDraftInput) {
  const workspace = await requireAccountantRole();
  const result = await createRefundReceipt(prisma, workspace.organizationId, workspace.userId, {
    ...input,
    paymentMethod: clampPaymentMethod(input.paymentMethod),
  });
  revalidateRefundReceiptViews();
  return result;
}

export async function voidRefundReceiptAction(receiptId: string) {
  const workspace = await requireAccountantRole();
  const result = await voidRefundReceipt(
    prisma,
    workspace.organizationId,
    workspace.userId,
    receiptId
  );
  revalidateRefundReceiptViews();
  return result;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: clean. (Actions require an authed session, so they're covered by the lib-layer tests plus manual verification in Task 7.)

---

### Task 5: Shared receipts UI (types + generic view component)

**Files:**
- Create: `components/sales/receipts/receipt-types.ts`
- Create: `components/sales/receipts/receipts-view.tsx`

**Interfaces:**
- Consumes: nothing at runtime (pure client component driven by props).
- Produces:
  - Types `Receipt`, `ReceiptLine`, `ReceiptWorkspaceData`, `NewReceiptInput`, `NewReceiptLine` (client-side mirrors of the server DTOs)
  - `ReceiptsView(props: ReceiptsViewProps)` — generic list + create dialog + view dialog used by both wrappers in Task 6. Props: `{ title, description, numberLabel, bankFieldLabel, showReference, data, isLoading, isCreating, onCreate, onVoid }`.

- [ ] **Step 1: Create `components/sales/receipts/receipt-types.ts`**

```ts
// Client-side mirrors of the server DTOs in lib/accounting/receipts.ts.
// Kept separate because that module is server-only.

export type ReceiptLine = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string;
  quantity: string;
  unitPriceMinor: number;
  discountMinor: number;
  subtotalMinor: number;
  taxCode: string;
  taxRate: number;
  taxMinor: number;
  totalMinor: number;
};

export type Receipt = {
  id: string;
  receiptNo: string;
  status: "posted" | "void";
  contactId: string;
  contactName: string;
  receiptDate: string;
  currency: string;
  amountsAre: "exclusive" | "inclusive" | "no_vat";
  paymentMethod: "cash" | "cheque" | "bank_transfer" | null;
  bankAccountId: string;
  bankAccountName: string;
  reference: string | null;
  notes: string | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  postedJournalId: string | null;
  createdAt: string;
  lines: ReceiptLine[];
};

export type ReceiptWorkspaceData = {
  receipts: Receipt[];
  contacts: Array<{ id: string; name: string; contactType: string }>;
  accounts: Array<{ id: string; code: string; name: string; reportCategory: string; taxCode: string }>;
  bankAccounts: Array<{ id: string; code: string; name: string }>;
  taxRates: Array<{ code: string; name: string; rate: number }>;
  vatRegistered: boolean;
  canManage: boolean;
};

export type NewReceiptLine = {
  accountId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxCode: string;
};

export type NewReceiptInput = {
  contactId: string;
  receiptDate: string;
  amountsAre: "exclusive" | "inclusive" | "no_vat";
  paymentMethod: "cash" | "cheque" | "bank_transfer" | null;
  bankAccountId: string | null;
  reference?: string;
  notes?: string;
  lines: NewReceiptLine[];
};
```

- [ ] **Step 2: Create `components/sales/receipts/receipts-view.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Ban, Eye, Plus, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  NewReceiptInput,
  NewReceiptLine,
  Receipt,
  ReceiptWorkspaceData,
} from "./receipt-types";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  bank_transfer: "Bank Transfer",
};

function formatMinor(minor: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
}

function emptyLine(): NewReceiptLine {
  return { accountId: "", description: "", quantity: "1", unitPrice: "", taxCode: "no_vat" };
}

// Mirrors the server maths in normalizeLines so the dialog totals match
// what will be saved.
function computeTotals(
  lines: NewReceiptLine[],
  amountsAre: NewReceiptInput["amountsAre"],
  taxRates: ReceiptWorkspaceData["taxRates"]
) {
  let subtotal = 0;
  let tax = 0;
  for (const line of lines) {
    const qty = Number(line.quantity || "1");
    const unit = Math.round(Number(line.unitPrice || 0) * 100);
    if (!Number.isFinite(qty) || !Number.isFinite(unit)) continue;
    const gross = Math.round(unit * qty);
    const rate = taxRates.find((t) => t.code === line.taxCode)?.rate ?? 0;
    if (amountsAre === "no_vat") {
      subtotal += gross;
    } else if (amountsAre === "inclusive") {
      const lineTax = Math.round((gross * rate) / (100 + rate));
      tax += lineTax;
      subtotal += gross - lineTax;
    } else {
      subtotal += gross;
      tax += Math.round((gross * rate) / 100);
    }
  }
  // In every mode subtotal holds net and tax holds VAT, so total = net + VAT.
  return { subtotal, tax, total: subtotal + tax };
}

export type ReceiptsViewProps = {
  title: string;
  description: string;
  numberLabel: string;
  bankFieldLabel: string;
  showReference: boolean;
  data: ReceiptWorkspaceData | undefined;
  isLoading: boolean;
  isCreating: boolean;
  onCreate: (input: NewReceiptInput) => Promise<unknown>;
  onVoid: (id: string) => Promise<unknown>;
};

export function ReceiptsView({
  title,
  description,
  numberLabel,
  bankFieldLabel,
  showReference,
  data,
  isLoading,
  isCreating,
  onCreate,
  onVoid,
}: ReceiptsViewProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<Receipt | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const receipts = data?.receipts ?? [];

  const handleVoid = async (receipt: Receipt) => {
    if (!window.confirm(`Void ${receipt.receiptNo}? A reversal journal dated today will be posted.`)) {
      return;
    }
    setVoidingId(receipt.id);
    try {
      await onVoid(receipt.id);
    } finally {
      setVoidingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        {data?.canManage && (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-blue-700"
          >
            <Plus className="size-4" /> New {title.replace(/s$/, "")}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">{numberLabel}</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && receipts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Nothing here yet.
                </td>
              </tr>
            )}
            {receipts.map((receipt) => (
              <tr key={receipt.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 font-semibold text-slate-900">{receipt.receiptNo}</td>
                <td className="px-4 py-3 text-slate-600">{receipt.receiptDate}</td>
                <td className="px-4 py-3 text-slate-600">{receipt.contactName}</td>
                <td className="px-4 py-3 text-slate-600">
                  {receipt.paymentMethod ? PAYMENT_METHOD_LABELS[receipt.paymentMethod] : "—"}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {formatMinor(receipt.totalMinor, receipt.currency)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
                      receipt.status === "posted"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-400 line-through"
                    )}
                  >
                    {receipt.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setViewReceipt(receipt)}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      title="View"
                    >
                      <Eye className="size-4" />
                    </button>
                    {data?.canManage && receipt.status === "posted" && (
                      <button
                        type="button"
                        onClick={() => handleVoid(receipt)}
                        disabled={voidingId === receipt.id}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Void"
                      >
                        <Ban className="size-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isCreateOpen && data && (
        <CreateReceiptDialog
          data={data}
          bankFieldLabel={bankFieldLabel}
          showReference={showReference}
          isCreating={isCreating}
          onClose={() => setIsCreateOpen(false)}
          onCreate={async (input) => {
            await onCreate(input);
            setIsCreateOpen(false);
          }}
        />
      )}

      {viewReceipt && (
        <ViewReceiptDialog
          receipt={viewReceipt}
          bankFieldLabel={bankFieldLabel}
          showReference={showReference}
          onClose={() => setViewReceipt(null)}
        />
      )}
    </div>
  );
}

function CreateReceiptDialog({
  data,
  bankFieldLabel,
  showReference,
  isCreating,
  onClose,
  onCreate,
}: {
  data: ReceiptWorkspaceData;
  bankFieldLabel: string;
  showReference: boolean;
  isCreating: boolean;
  onClose: () => void;
  onCreate: (input: NewReceiptInput) => Promise<void>;
}) {
  const [contactId, setContactId] = useState("");
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = useState(data.bankAccounts[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<NewReceiptInput["paymentMethod"]>("cash");
  const [amountsAre, setAmountsAre] = useState<NewReceiptInput["amountsAre"]>(
    data.vatRegistered ? "exclusive" : "no_vat"
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<NewReceiptLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(
    () => computeTotals(lines, amountsAre, data.taxRates),
    [lines, amountsAre, data.taxRates]
  );

  const updateLine = (index: number, patch: Partial<NewReceiptLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!contactId) return setError("Choose a customer.");
    if (!bankAccountId) return setError("Choose a bank account.");
    const usable = lines.filter((l) => l.accountId && l.description.trim() && Number(l.unitPrice) > 0);
    if (usable.length === 0) return setError("Add at least one line with an account, description and amount.");
    try {
      await onCreate({
        contactId,
        receiptDate,
        amountsAre,
        paymentMethod,
        bankAccountId,
        reference: showReference ? reference.trim() || undefined : undefined,
        notes: notes.trim() || undefined,
        lines: usable,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">New {showReference ? "Refund Receipt" : "Sales Receipt"}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
            Customer
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            >
              <option value="">Select customer…</option>
              {data.contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
            Date
            <input
              type="date"
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
            {bankFieldLabel}
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            >
              {data.bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
            Payment method
            <select
              value={paymentMethod ?? ""}
              onChange={(e) => setPaymentMethod((e.target.value || null) as NewReceiptInput["paymentMethod"])}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            >
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
            Amounts are
            <select
              value={amountsAre}
              onChange={(e) => setAmountsAre(e.target.value as NewReceiptInput["amountsAre"])}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            >
              <option value="exclusive">Tax exclusive</option>
              <option value="inclusive">Tax inclusive</option>
              <option value="no_vat">No VAT</option>
            </select>
          </label>

          {showReference && (
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
              Reference (original invoice / receipt)
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. INV-0042"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
              />
            </label>
          )}
        </div>

        <div className="mt-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Lines</p>
          <div className="flex flex-col gap-2">
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-[1fr_1.2fr_70px_100px_110px_32px] items-center gap-2">
                <select
                  value={line.accountId}
                  onChange={(e) => updateLine(index, { accountId: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                >
                  <option value="">Account…</option>
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Description"
                  value={line.description}
                  onChange={(e) => updateLine(index, { description: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unit price"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
                <select
                  value={line.taxCode}
                  onChange={(e) => updateLine(index, { taxCode: e.target.value })}
                  disabled={amountsAre === "no_vat"}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {data.taxRates.map((t) => (
                    <option key={t.code} value={t.code}>{t.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  disabled={lines.length === 1}
                  className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
            className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <Plus className="size-4" /> Add line
          </button>
        </div>

        <div className="mt-6 flex flex-col items-end gap-1 border-t border-slate-100 pt-4 text-sm">
          <p className="text-slate-500">Subtotal: <span className="font-semibold text-slate-900">{formatMinor(totals.subtotal, "GBP")}</span></p>
          <p className="text-slate-500">VAT: <span className="font-semibold text-slate-900">{formatMinor(totals.tax, "GBP")}</span></p>
          <p className="text-base font-black text-slate-900">Total: {formatMinor(totals.total, "GBP")}</p>
        </div>

        <label className="mt-4 flex flex-col gap-1 text-xs font-bold text-slate-500">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
          />
        </label>

        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isCreating}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50"
          >
            {isCreating ? "Saving…" : "Save & Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewReceiptDialog({
  receipt,
  bankFieldLabel,
  showReference,
  onClose,
}: {
  receipt: Receipt;
  bankFieldLabel: string;
  showReference: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">{receipt.receiptNo}</h2>
            <p className="text-sm text-slate-500">{receipt.contactName} · {receipt.receiptDate}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><dt className="text-xs font-bold text-slate-400">Status</dt><dd className="font-semibold uppercase">{receipt.status}</dd></div>
          <div><dt className="text-xs font-bold text-slate-400">{bankFieldLabel}</dt><dd>{receipt.bankAccountName}</dd></div>
          <div><dt className="text-xs font-bold text-slate-400">Payment method</dt><dd>{receipt.paymentMethod ? PAYMENT_METHOD_LABELS[receipt.paymentMethod] : "—"}</dd></div>
          {showReference && (
            <div><dt className="text-xs font-bold text-slate-400">Reference</dt><dd>{receipt.reference ?? "—"}</dd></div>
          )}
        </dl>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-2">Description</th>
              <th className="py-2">Account</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Net</th>
              <th className="py-2 text-right">VAT</th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((line) => (
              <tr key={line.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2 text-slate-900">{line.description}</td>
                <td className="py-2 text-slate-500">{line.accountCode} — {line.accountName}</td>
                <td className="py-2 text-right text-slate-600">{line.quantity}</td>
                <td className="py-2 text-right text-slate-900">{formatMinor(line.subtotalMinor, receipt.currency)}</td>
                <td className="py-2 text-right text-slate-600">{formatMinor(line.taxMinor, receipt.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex flex-col items-end gap-1 border-t border-slate-100 pt-3 text-sm">
          <p className="text-slate-500">Subtotal: <span className="font-semibold text-slate-900">{formatMinor(receipt.subtotalMinor, receipt.currency)}</span></p>
          <p className="text-slate-500">VAT: <span className="font-semibold text-slate-900">{formatMinor(receipt.taxMinor, receipt.currency)}</span></p>
          <p className="text-base font-black text-slate-900">Total: {formatMinor(receipt.totalMinor, receipt.currency)}</p>
        </div>

        {receipt.notes && (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{receipt.notes}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean.

---

### Task 6: Wrapper components and pages

**Files:**
- Create: `components/sales/receipts/sales-receipts.tsx`
- Create: `components/sales/receipts/refund-receipts.tsx`
- Create: `app/(dashboard)/sales/receipts/page.tsx`
- Create: `app/(dashboard)/sales/refund-receipts/page.tsx`

**Interfaces:**
- Consumes: Task 4 actions, Task 5 `ReceiptsView` + types, `queryKeys.salesReceiptWorkspace` / `queryKeys.refundReceiptWorkspace`.
- Produces: `<SalesReceipts />` and `<RefundReceipts />` client components; two routes rendering them.

- [ ] **Step 1: Create `components/sales/receipts/sales-receipts.tsx`**

```tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createSalesReceiptAction,
  getSalesReceiptWorkspace,
  voidSalesReceiptAction,
} from "@/app/(dashboard)/sales/receipts/actions";
import { queryKeys } from "@/lib/query-keys";

import { ReceiptsView } from "./receipts-view";
import type { NewReceiptInput, ReceiptWorkspaceData } from "./receipt-types";

export function SalesReceipts() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.salesReceiptWorkspace,
    queryFn: () => getSalesReceiptWorkspace(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.salesReceiptWorkspace });

  const createMutation = useMutation({
    mutationFn: (input: NewReceiptInput) => createSalesReceiptAction(input),
    onSuccess: (result) => {
      toast.success(`Sales receipt ${result.documentNo} posted.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidSalesReceiptAction(id),
    onSuccess: (result) => {
      toast.success(`Sales receipt ${result.documentNo} voided.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <ReceiptsView
      title="Sales Receipts"
      description="Record sales paid on the spot — posts straight to the ledger, no invoice needed."
      numberLabel="Receipt #"
      bankFieldLabel="Deposit to"
      showReference={false}
      data={query.data as ReceiptWorkspaceData | undefined}
      isLoading={query.isLoading}
      isCreating={createMutation.isPending}
      onCreate={(input) => createMutation.mutateAsync(input)}
      onVoid={(id) => voidMutation.mutateAsync(id)}
    />
  );
}
```

- [ ] **Step 2: Create `components/sales/receipts/refund-receipts.tsx`**

```tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createRefundReceiptAction,
  getRefundReceiptWorkspace,
  voidRefundReceiptAction,
} from "@/app/(dashboard)/sales/refund-receipts/actions";
import { queryKeys } from "@/lib/query-keys";

import { ReceiptsView } from "./receipts-view";
import type { NewReceiptInput, ReceiptWorkspaceData } from "./receipt-types";

export function RefundReceipts() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.refundReceiptWorkspace,
    queryFn: () => getRefundReceiptWorkspace(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.refundReceiptWorkspace });

  const createMutation = useMutation({
    mutationFn: (input: NewReceiptInput) => createRefundReceiptAction(input),
    onSuccess: (result) => {
      toast.success(`Refund receipt ${result.documentNo} posted.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidRefundReceiptAction(id),
    onSuccess: (result) => {
      toast.success(`Refund receipt ${result.documentNo} voided.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <ReceiptsView
      title="Refund Receipts"
      description="Record money refunded to customers straight out of a bank or cash account."
      numberLabel="Refund #"
      bankFieldLabel="Refund from"
      showReference
      data={query.data as ReceiptWorkspaceData | undefined}
      isLoading={query.isLoading}
      isCreating={createMutation.isPending}
      onCreate={(input) => createMutation.mutateAsync(input)}
      onVoid={(id) => voidMutation.mutateAsync(id)}
    />
  );
}
```

- [ ] **Step 3: Create the two pages**

`app/(dashboard)/sales/receipts/page.tsx` (auth/org resolution happens inside the workspace server action, like the client components used elsewhere):

```tsx
import { SalesReceipts } from "@/components/sales/receipts/sales-receipts";

export default function SalesReceiptsPage() {
  return <SalesReceipts />;
}
```

`app/(dashboard)/sales/refund-receipts/page.tsx`:

```tsx
import { RefundReceipts } from "@/components/sales/receipts/refund-receipts";

export default function RefundReceiptsPage() {
  return <RefundReceipts />;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

---

### Task 7: Sidebar links + final verification

**Files:**
- Modify: `components/chart-of-accounts/sidebar.tsx:347-356` (`SalesNavItem` sub-links)

**Interfaces:**
- Consumes: routes from Task 6 plus the pre-existing `/sales/statements` page. Icons `Receipt`, `RotateCcw`, `FileText` are already imported in this file.

- [ ] **Step 1: Add the three sub-links**

In `SalesNavItem`, after the `Credit Notes` SubLink (line 352) and before the divider, add:

```tsx
            <SubLink href="/sales/receipts" label="Sales Receipts" icon={Receipt} pathname={pathname} />
            <SubLink href="/sales/refund-receipts" label="Refund Receipts" icon={RotateCcw} pathname={pathname} />
            <SubLink href="/sales/statements" label="Customer Statements" icon={FileText} pathname={pathname} />
```

- [ ] **Step 2: Full verification**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: all clean, full suite green.

- [ ] **Step 3: Manual smoke test**

Run `pnpm dev`, sign in, and verify:
1. Sales dropdown shows Sales Receipts, Refund Receipts, Customer Statements.
3. **Unit Tests**: Ran `pnpm test` successfully (all 221 tests passing).
4. **Dev Server & Scoping Fixes**:
   - Fixed a dev server crash at the login page (`app/(public)/login/page.tsx`) by updating table name `"UserRole"` to `"user_roles"` and column `"userId"` to `"user_id"` in the raw SQL query.
   - Fixed a `TenantContextError` crash during hot-reloads (`components/chart-of-accounts/use-chart-of-accounts.ts`) by caching the tenancy `AsyncLocalStorage` instance on `globalThis`.
   - Updated administrative bypass queries to include `// tenancy:safe:` annotations in `app/(admin)/admin/(protected)/clients/actions.ts`.
2. Create a sales receipt with a VAT-20 line → toast shows `SR-0001`; row appears as `posted`; the journal shows under Accounting → Manual Journals with DR bank / CR revenue / CR VAT.
3. Void it → status flips to `void`, reversal journal dated today exists.
4. Create and void a refund receipt (`RR-0001`) the same way — bank credited on create, debited on void.
5. Customer Statements link renders the existing statements page.
