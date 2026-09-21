# Invoice & Bill Feature Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 11 confirmed gaps in invoice/bill creation and the bills payment flow: void paid bills, bank picker on bill payment, template-overwrite warning, inline chart-account creation, persisted VAT-registration gating, bill tax parity, payment terms, payment method, shipping fees, outstanding-transactions panel, and inline-editable contact details.

**Architecture:** All document logic lives in `lib/accounting/documents.ts` (pure functions taking `(prisma, organizationId, actorUserId, ...)`), called by thin `"use server"` actions in `app/(dashboard)/sales/invoices/actions.ts` and `app/(dashboard)/purchases/actions.ts`, consumed by React-Query hooks (`use-invoices.ts`, `use-purchases.ts`) feeding client components. Bills/invoices are written with raw SQL inside `$transaction` (to tolerate schema drift); journals are the ledger of record (no Payment model — payments are `Journal` rows with `sourceType: "bill_payment"` / `"invoice_payment"`). Bank accounts are `ChartAccount` rows with `accountType: ASSET, reportCategory: BANK`.

**Tech Stack:** Next.js 16.2.4 (custom build — see Global Constraints), React 19, Prisma 7 (Postgres/Supabase), TanStack Query 5, vitest 4 (integration tests against a real database via `tests/fixtures.ts`), sonner toasts, shadcn-style UI components.

## Global Constraints

- **NEVER run `git commit` or `git push`.** The user commits manually. Each task ends with a **CHECKPOINT** step: stop, summarize what changed, and let the user review/commit before continuing.
- **This is NOT the Next.js you know** (repo AGENTS.md). Before writing any Next-specific code (server actions, revalidatePath, routing), read the relevant guide in `node_modules/next/dist/docs/`. In practice: copy the exact patterns already used in the file you are editing.
- All money is **BigInt minor units** (`totalMinor`, pence). Never use floats for stored amounts.
- Bills/invoices writes use **raw SQL** inside `prisma.$transaction` with `tenancy:safe:` comments where the org scoping is not visible within 12 lines (there is a lint test: `tests/tenancy/raw-query-lint.test.ts`). Mirror the existing comments exactly.
- Migrations are **hand-authored SQL**: create `prisma/migrations/<UTC timestamp>_<name>/migration.sql` (e.g. `20260706090000_org_vat_registered`), edit `prisma/schema.prisma` to match, run `pnpm prisma migrate deploy` then `pnpm prisma generate`. If `migrate deploy` fails against the dev database, STOP and ask the user how they apply migrations.
- Verification commands: `pnpm typecheck` (tsc), `pnpm vitest run tests/<file>.test.ts` (single file), `pnpm test` (full suite). Tests hit the real database configured in `.env` — fixtures create and cascade-drop throwaway orgs.
- Existing UI conventions: sonner `toast(...)` with `action`/`cancel` for confirmations (see `components/purchases/purchases.tsx:494`), shadcn `Select`/`Dialog`/`Button`, slate/blue Tailwind palette. Match them.
- Tax codes are plain strings (`"vat_20"`, `"no_vat"`); `TaxRate` rows are system (`organizationId: null`) OR org-custom — always query with `OR: [{ organizationId: null }, { organizationId }]`.

## Execution order

Phase A (quick wins): Tasks 1–5 · Phase B (VAT cluster): Tasks 6–8 · Phase C (document fields): Tasks 9–11 · Phase D (contact context): Tasks 12–13. Tasks within a phase are independent of each other unless noted; phases B and C depend on nothing in A except Task 3 (Task 10 extends Task 3's dialog).

---

### Task 1: Allow voiding a PAID bill from the UI

The backend `voidBill` (`lib/accounting/documents.ts:1823`) already reverses both the payment journal and the posting journal for paid bills. Only the UI blocks it.

**Files:**
- Test: `tests/bill-void-paid.test.ts` (create)
- Modify: `components/purchases/purchases.tsx:511-535`

**Interfaces:**
- Consumes: `voidBill(prisma, orgId, userId, billId)` from `lib/accounting/documents.ts` (unchanged); `voidBill(id)` from `usePurchases()` (unchanged).
- Produces: nothing new — UI enablement only.

- [ ] **Step 1: Write the characterization test** (locks in the backend behavior we now expose)

```ts
// tests/bill-void-paid.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BillStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  approveBill,
  payBill,
  saveBillDraft,
  voidBill,
  type DocumentDraftInput,
} from "@/lib/accounting/documents";

import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

let testOrg: TestOrg;

beforeEach(async () => {
  testOrg = await createTestOrg();
});

afterEach(async () => {
  await dropTestOrg(testOrg.orgId);
});

async function expenseAccountId(): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: testOrg.orgId, accountType: "EXPENSE", reportCategory: "EXPENSE" },
    select: { id: true },
  });
  return row.id;
}

function buildBillDraft(accountId: string): DocumentDraftInput {
  return {
    contactId: testOrg.supplierId,
    contactName: "",
    documentNo: `BILL-${Math.random().toString(36).slice(2, 8)}`,
    issueDate: "2026-07-01",
    dueDate: "",
    currency: "GBP",
    lines: [
      {
        accountId,
        description: "Void paid bill test",
        quantity: "1.00",
        unitPrice: "50.00",
        taxCode: "no_vat",
      },
    ],
  };
}

describe("voidBill on a PAID bill", () => {
  it("reverses the payment journal AND the posting journal, then marks the bill void", async () => {
    const accountId = await expenseAccountId();
    const billId = await saveBillDraft(prisma, testOrg.orgId, testOrg.userId, buildBillDraft(accountId));
    await approveBill(prisma, testOrg.orgId, testOrg.userId, billId);
    await payBill(prisma, testOrg.orgId, testOrg.userId, billId);

    await voidBill(prisma, testOrg.orgId, testOrg.userId, billId);

    const bill = await prisma.bill.findFirstOrThrow({
      where: { id: billId, organizationId: testOrg.orgId },
    });
    expect(bill.status).toBe(BillStatus.VOID);
    expect(bill.paidJournalId).toBeNull();

    const paymentReversal = await prisma.journal.findFirst({
      where: { organizationId: testOrg.orgId, sourceType: "bill_payment_void", sourceId: billId },
    });
    const postingReversal = await prisma.journal.findFirst({
      where: { organizationId: testOrg.orgId, sourceType: "bill_void", sourceId: billId },
    });
    expect(paymentReversal).not.toBeNull();
    expect(postingReversal).not.toBeNull();
  });
});
```

Note: if `DocumentDraftInput`'s line type rejects `unitPrice`, open `lib/accounting/documents.ts` and check the `DocumentLineInput` type near line 30; use its exact field names (the invoice test `tests/invoice-deposit-account.test.ts:47-55` uses `unitPrice`, so this should match).

- [ ] **Step 2: Run the test — expect PASS** (the backend already supports this; the test is a safety net for the UI change)

Run: `pnpm vitest run tests/bill-void-paid.test.ts`
Expected: PASS. If it FAILS, stop — the investigation's premise is wrong; report the failure instead of patching.

- [ ] **Step 3: Enable Void for paid bills with a confirmation toast**

In `components/purchases/purchases.tsx`, replace the Void menu item (currently lines 523-535):

```tsx
<DropdownMenuItem
  className="cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
  disabled={!canManage || saving || bill.status === "void"}
  onClick={() => {
    if (bill.status === "paid") {
      toast(
        "Void this paid bill? The payment and the posted journal entry will both be reversed.",
        {
          position: "top-center",
          action: { label: "Void bill", onClick: () => voidBill(bill.id) },
          cancel: { label: "Cancel", onClick: () => {} },
        }
      );
      return;
    }
    voidBill(bill.id);
  }}
>
  <XCircle className="size-4 mr-2" />
  Void
</DropdownMenuItem>
```

(`toast` is already imported in this file — it's used by the revert-to-draft confirm at line 494.)

- [ ] **Step 4: Verify**

Run: `pnpm typecheck` → expect no errors.
Run: `pnpm vitest run tests/bill-void-paid.test.ts` → PASS.

- [ ] **Step 5: CHECKPOINT** — stop; tell the user Task 1 is done (files changed: `tests/bill-void-paid.test.ts`, `components/purchases/purchases.tsx`) so they can review and commit.

---

### Task 2: `payBill` accepts a payment bank account (server)

Mirror `payInvoice`'s `depositAccountId` support (`lib/accounting/documents.ts:2042-2071`).

**Files:**
- Test: `tests/bill-payment-account.test.ts` (create)
- Modify: `lib/accounting/documents.ts:1578-1597` (`payBill`)
- Modify: `app/(dashboard)/purchases/actions.ts:163-173` (`payBillDocument`)

**Interfaces:**
- Consumes: `resolveDepositAccount(tx, organizationId, accountId)` (`documents.ts:479`) — validates active `ASSET`+`BANK` accounts, throws `"...not a valid bank account..."` otherwise.
- Produces: `payBill(prisma, orgId, userId, billId, paymentAccountId?: string)` and server action `payBillDocument(billId: string, paymentAccountId?: string)`. Task 3 builds the UI on these exact signatures.

- [ ] **Step 1: Write the failing test**

```ts
// tests/bill-payment-account.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  approveBill,
  payBill,
  saveBillDraft,
  type DocumentDraftInput,
} from "@/lib/accounting/documents";

import {
  createTestBankAccount,
  createTestOrg,
  dropTestOrg,
  type TestOrg,
} from "./fixtures";

let testOrg: TestOrg;

beforeEach(async () => {
  testOrg = await createTestOrg();
});

afterEach(async () => {
  await dropTestOrg(testOrg.orgId);
});

async function accountIdByWhere(
  orgId: string,
  where: { code?: string; accountType?: "EXPENSE" | "ASSET" }
): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: orgId, ...where },
    select: { id: true },
  });
  return row.id;
}

function buildBillDraft(accountId: string): DocumentDraftInput {
  return {
    contactId: testOrg.supplierId,
    contactName: "",
    documentNo: `BILL-${Math.random().toString(36).slice(2, 8)}`,
    issueDate: "2026-07-01",
    dueDate: "",
    currency: "GBP",
    lines: [
      {
        accountId,
        description: "Bill payment account test",
        quantity: "1.00",
        unitPrice: "100.00",
        taxCode: "no_vat",
      },
    ],
  };
}

// Creates and approves a 10000p bill, returning its id.
async function approvedBillId(): Promise<string> {
  const expenseId = await accountIdByWhere(testOrg.orgId, { accountType: "EXPENSE" });
  const billId = await saveBillDraft(
    prisma,
    testOrg.orgId,
    testOrg.userId,
    buildBillDraft(expenseId)
  );
  await approveBill(prisma, testOrg.orgId, testOrg.userId, billId);
  return billId;
}

async function paymentJournalLines(billId: string) {
  const journal = await prisma.journal.findFirstOrThrow({
    where: {
      organizationId: testOrg.orgId,
      sourceType: "bill_payment",
      sourceId: billId,
    },
    select: { lines: { select: { accountId: true, debitMinor: true, creditMinor: true } } },
  });
  return journal.lines;
}

describe("payBill payment account selection", () => {
  it("credits the chosen bank account and debits AP for the same amount", async () => {
    const billId = await approvedBillId();
    const { chartAccountId } = await createTestBankAccount(testOrg.orgId);
    const apAccountId = await accountIdByWhere(testOrg.orgId, { code: "2000" });

    await payBill(prisma, testOrg.orgId, testOrg.userId, billId, chartAccountId);

    const lines = await paymentJournalLines(billId);
    const credit = lines.find((line) => Number(line.creditMinor) > 0);
    const debit = lines.find((line) => Number(line.debitMinor) > 0);

    expect(credit?.accountId).toBe(chartAccountId);
    expect(debit?.accountId).toBe(apAccountId);
    expect(Number(credit?.creditMinor)).toBe(10000);
    expect(Number(debit?.debitMinor)).toBe(10000);
  });

  it("falls back to the system bank account (1000) when no account is given", async () => {
    const billId = await approvedBillId();
    const mainBankId = await accountIdByWhere(testOrg.orgId, { code: "1000" });

    await payBill(prisma, testOrg.orgId, testOrg.userId, billId);

    const lines = await paymentJournalLines(billId);
    const credit = lines.find((line) => Number(line.creditMinor) > 0);
    expect(credit?.accountId).toBe(mainBankId);
  });

  it("rejects a bank account belonging to another organization", async () => {
    const billId = await approvedBillId();
    const otherOrg = await createTestOrg();
    try {
      const { chartAccountId: foreignBankId } = await createTestBankAccount(otherOrg.orgId);

      await expect(
        payBill(prisma, testOrg.orgId, testOrg.userId, billId, foreignBankId)
      ).rejects.toThrow(/not a valid bank account/i);
    } finally {
      await dropTestOrg(otherOrg.orgId);
    }
  });

  it("rejects non-bank accounts", async () => {
    const billId = await approvedBillId();
    const expenseId = await accountIdByWhere(testOrg.orgId, { accountType: "EXPENSE" });

    await expect(
      payBill(prisma, testOrg.orgId, testOrg.userId, billId, expenseId)
    ).rejects.toThrow(/not a valid bank account/i);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (payBill takes no 5th argument yet; the first test fails because the credit lands on account 1000)

Run: `pnpm vitest run tests/bill-payment-account.test.ts`
Expected: FAIL on "credits the chosen bank account".

- [ ] **Step 3: Extend `payBill`**

In `lib/accounting/documents.ts`, change the `payBill` signature and bank resolution (lines 1578-1597):

```ts
export async function payBill(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  billId: string,
  paymentAccountId?: string
): Promise<PostingResult> {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findFirstOrThrow({
      where: { id: billId, organizationId, status: BillStatus.APPROVED },
      select: {
        id: true,
        invoiceNo: true,
        totalMinor: true,
        contactId: true,
        contact: { select: { name: true } },
      },
    });

    const apAccountId = await resolveSystemAccount(tx, organizationId, payableAccount);
    const bankAccountId = paymentAccountId
      ? await resolveDepositAccount(tx, organizationId, paymentAccountId)
      : await resolveSystemAccount(tx, organizationId, bankAccount);
```

(The rest of the function body is unchanged.)

- [ ] **Step 4: Thread it through the server action**

In `app/(dashboard)/purchases/actions.ts` replace `payBillDocument` (lines 163-173):

```ts
export async function payBillDocument(billId: string, paymentAccountId?: string) {
  const workspace = await requireAccountantRole();
  const result = await payBill(
    prisma,
    workspace.organizationId,
    workspace.userId,
    billId,
    paymentAccountId
  );
  revalidateBillViews();
  return result;
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm vitest run tests/bill-payment-account.test.ts` → all 4 PASS.
Run: `pnpm typecheck` → no errors.
Run: `pnpm vitest run tests/bill-discount.test.ts tests/bill-void-paid.test.ts` → still PASS (no regression in existing payBill callers).

- [ ] **Step 6: CHECKPOINT** — stop for user review/commit (files: `tests/bill-payment-account.test.ts`, `lib/accounting/documents.ts`, `app/(dashboard)/purchases/actions.ts`).

---

### Task 3: "Mark as paid" dialog with bank picker (UI)

**Files:**
- Modify: `app/(dashboard)/purchases/actions.ts:43-68` (`getBillWorkspace` — add `bankAccounts`)
- Modify: `components/purchases/purchase-types.ts` (add `bankAccounts` to `BillWorkspaceData`)
- Modify: `components/purchases/use-purchases.ts` (pay mutation signature + expose `bankAccounts`)
- Create: `components/purchases/pay-bill-dialog.tsx`
- Modify: `components/purchases/purchases.tsx` (open dialog from "Mark as paid")

**Interfaces:**
- Consumes: `payBillDocument(billId, paymentAccountId?)` from Task 2; `ChartAccountOption` from `lib/accounting/documents`.
- Produces: `usePurchases().payBill(id: string, paymentAccountId?: string)`, `usePurchases().bankAccounts: ChartAccountOption[]`, `<PayBillDialog bill bankAccounts saving onOpenChange onConfirm />`. Task 10 adds a method select to this dialog.

- [ ] **Step 1: Add bank accounts to the bill workspace payload**

In `app/(dashboard)/purchases/actions.ts`, inside the `return` of `getBillWorkspace` (after the `accounts:` filter, before `taxRates:`), add — mirroring `getInvoiceWorkspace` (`app/(dashboard)/sales/invoices/actions.ts:52-58`):

```ts
    // Payment sources for "mark as paid". Must mirror the server-side check in
    // resolveDepositAccount (documents.ts): active BANK-category accounts only.
    bankAccounts: options.accounts.filter(
      (account) => account.reportCategory === "bank"
    ),
```

- [ ] **Step 2: Extend the types and hook**

`components/purchases/purchase-types.ts` — add to `BillWorkspaceData`:

```ts
export type BillWorkspaceData = {
  bills: Bill[];
  contacts: ContactSummary[];
  accounts: ChartAccountOption[];
  bankAccounts: ChartAccountOption[];
  taxRates: TaxRateOption[];
  canManage: boolean;
};
```

`components/purchases/use-purchases.ts` — change the pay mutation (lines 59-62) and its exposed wrapper (line 128), and expose `bankAccounts`:

```ts
  const payMutation = useMutation({
    mutationFn: (input: { id: string; paymentAccountId?: string }) =>
      payBillDocument(input.id, input.paymentAccountId),
    onSuccess: () => toast.success("Bill marked as paid."),
  });
```

```ts
    bankAccounts: data?.bankAccounts ?? [],
```
(add next to `accounts:` in the return object)

```ts
    payBill: (id: string, paymentAccountId?: string) =>
      runMutation(() => payMutation.mutateAsync({ id, paymentAccountId })),
```

- [ ] **Step 3: Create the dialog**

```tsx
// components/purchases/pay-bill-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { Banknote, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatGbpMinor } from "@/lib/accounting/money";
import type { ChartAccountOption } from "@/lib/accounting/documents";
import type { Bill } from "./purchase-types";

type PayBillDialogProps = {
  bill: Bill | null;
  bankAccounts: ChartAccountOption[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (billId: string, paymentAccountId?: string) => Promise<boolean>;
};

export function PayBillDialog({
  bill,
  bankAccounts,
  saving,
  onOpenChange,
  onConfirm,
}: PayBillDialogProps) {
  const [paymentAccountId, setPaymentAccountId] = useState<string>("");

  // Default to the main bank (1000), or the first bank account, per opened bill.
  const billId = bill?.id ?? null;
  useEffect(() => {
    if (billId && bankAccounts.length > 0) {
      const main = bankAccounts.find((account) => account.code === "1000");
      setPaymentAccountId((main ?? bankAccounts[0]).id);
    }
  }, [billId, bankAccounts]);

  async function handleConfirm() {
    if (!bill) return;
    const ok = await onConfirm(bill.id, paymentAccountId || undefined);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={Boolean(bill)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark bill as paid</DialogTitle>
          <DialogDescription>
            {bill
              ? `Pay ${formatGbpMinor(bill.totalMinor)} to ${bill.contactName} for bill ${bill.invoiceNo}.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            Pay from bank account
          </label>
          <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
            <SelectTrigger className="h-10 w-full bg-white">
              <SelectValue placeholder="Select bank account..." />
            </SelectTrigger>
            <SelectContent>
              {bankAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bankAccounts.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              No bank accounts found — the payment will use the default bank account (1000).
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            disabled={saving || (bankAccounts.length > 0 && !paymentAccountId)}
            onClick={handleConfirm}
          >
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Banknote className="mr-2 size-4" />}
            Confirm payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Wire it into the bills table**

In `components/purchases/purchases.tsx`:
1. Import: `import { PayBillDialog } from "./pay-bill-dialog";`
2. Destructure `bankAccounts` from `usePurchases()` alongside the existing fields.
3. Add state near the other dialog state: `const [payingBill, setPayingBill] = useState<Bill | null>(null);`
4. Change the "Mark as paid" item (line 485) from `onClick={() => payBill(bill.id)}` to `onClick={() => setPayingBill(bill)}`.
5. Render the dialog once, next to the component's other dialogs/at the bottom of the JSX:

```tsx
<PayBillDialog
  bill={payingBill}
  bankAccounts={bankAccounts}
  saving={saving}
  onOpenChange={(open) => { if (!open) setPayingBill(null); }}
  onConfirm={(billId, paymentAccountId) => payBill(billId, paymentAccountId)}
/>
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck` → no errors.
Manual: `pnpm dev` → Purchases → approve a draft bill → "Mark as paid" → dialog shows bank select defaulting to `1000 - ...` → confirm → toast "Bill marked as paid." → Accounting → Journals shows the payment credited to the chosen account.

- [ ] **Step 6: CHECKPOINT** — stop for user review/commit.

---

### Task 4: Warn before a template overwrites filled fields

Selecting a template currently wipes the form silently (`components/sales/add-invoice-dialog.tsx:421-442` and `components/purchases/add-bill-dialog.tsx:251-270`, triggers at `:726` / `:528`).

**Files:**
- Modify: `components/sales/add-invoice-dialog.tsx`
- Modify: `components/purchases/add-bill-dialog.tsx`

**Interfaces:**
- Consumes: existing `handleLoadTemplate(id)` in both files; `toast` from sonner (already imported in both).
- Produces: `requestLoadTemplate(id)` guard in both forms.

- [ ] **Step 1: Add the guard to the invoice form**

In `components/sales/add-invoice-dialog.tsx`, directly above `handleLoadTemplate` (line 421), add:

```tsx
  // A template load replaces contact, due date, and ALL line items. Guard it
  // when the user has already typed something so work isn't silently lost.
  function formHasUserInput() {
    const hasLineInput = form.lines.some(
      (l: any) => (l.description ?? "").trim() !== "" || (l.unitPrice ?? "").trim() !== ""
    );
    return hasLineInput || Boolean(form.contactId) || (form.contactName ?? "").trim() !== "";
  }

  function requestLoadTemplate(id: string) {
    if (!formHasUserInput()) {
      handleLoadTemplate(id);
      return;
    }
    toast("Load this template? Your current line items and selections will be replaced.", {
      position: "top-center",
      action: { label: "Load template", onClick: () => handleLoadTemplate(id) },
      cancel: { label: "Keep my changes", onClick: () => {} },
    });
  }
```

Then change the template select trigger (line 726) to call the guard, and pin the select's value so a cancelled load doesn't leave a stale selection showing:

```tsx
<Select value="" onValueChange={(id) => { if (id) requestLoadTemplate(id); }}>
```

- [ ] **Step 2: Same change in the bill form**

In `components/purchases/add-bill-dialog.tsx`, above `handleLoadTemplate` (line 251):

```tsx
  function formHasUserInput() {
    const hasLineInput = form.lines.some(
      (l) => (l.description ?? "").trim() !== "" || ((l as LineForm).unitPrice ?? "").trim() !== ""
    );
    return hasLineInput || Boolean(form.contactId);
  }

  function requestLoadTemplate(id: string) {
    if (!formHasUserInput()) {
      handleLoadTemplate(id);
      return;
    }
    toast("Load this template? Your current line items and selections will be replaced.", {
      position: "top-center",
      action: { label: "Load template", onClick: () => handleLoadTemplate(id) },
      cancel: { label: "Keep my changes", onClick: () => {} },
    });
  }
```

Change the trigger (line 528):

```tsx
<Select value="" onValueChange={(id) => { if (id) requestLoadTemplate(id); }}>
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck` → no errors.
Manual: create invoice → type a description → pick a template → confirm the toast appears; "Keep my changes" leaves the form intact; "Load template" replaces it. Repeat on an empty form → template loads with no prompt. Repeat for bills.

- [ ] **Step 4: CHECKPOINT** — stop for user review/commit.

---

### Task 5: Inline "Create new account" from line-item account selects

The pattern already exists: customer select has "Add new customer…" (`add-invoice-dialog.tsx:552-555`), tax select has "Manage taxes…" (`:945-950`). Accounts get the same treatment via a lightweight dialog + a new server-backed create path (the Chart of Accounts page currently inserts via the Supabase browser client — `components/chart-of-accounts/use-chart-of-accounts.ts:251` — which we do NOT reuse here; a server action is the pattern for these forms).

**Files:**
- Test: `tests/chart-account-create.test.ts` (create)
- Create: `lib/accounting/chart-accounts.ts`
- Modify: `app/(dashboard)/accounting/chart-of-accounts/actions.ts` (new `createChartAccount` action)
- Create: `components/shared/quick-add-account-dialog.tsx`
- Modify: `components/sales/add-invoice-dialog.tsx` (account select + dialog wiring)
- Modify: `components/purchases/add-bill-dialog.tsx` (account select + dialog wiring)

**Interfaces:**
- Consumes: `requireAccountantRole()` from `@/lib/accounting/dal`; `ExtendedPrismaClient` (use the same prisma parameter type as the exported functions in `lib/accounting/documents.ts` — check its import at the top of that file and copy it).
- Produces:
  - `createChartAccountRecord(prisma, organizationId, actorUserId, input: { code; name; description?; accountType: AccountType; reportCategory: AccountReportCategory; taxCode?; taxRate? }) => Promise<{ id; code; name; accountType; reportCategory; taxCode }>`
  - server action `createChartAccount(input: QuickCreateAccountInput)` returning a `ChartAccountOption`-shaped object
  - `<QuickAddAccountDialog open kind onOpenChange onCreated />` where `kind: "income" | "purchase"`.

- [ ] **Step 1: Write the failing test for the lib function**

```ts
// tests/chart-account-create.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createChartAccountRecord } from "@/lib/accounting/chart-accounts";

import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

let testOrg: TestOrg;

beforeEach(async () => {
  testOrg = await createTestOrg();
});

afterEach(async () => {
  await dropTestOrg(testOrg.orgId);
});

describe("createChartAccountRecord", () => {
  it("creates a custom, active, non-system account", async () => {
    const account = await createChartAccountRecord(prisma, testOrg.orgId, testOrg.userId, {
      code: "6150",
      name: "Software subscriptions",
      accountType: "EXPENSE",
      reportCategory: "EXPENSE",
    });

    const row = await prisma.chartAccount.findFirstOrThrow({
      where: { id: account.id, organizationId: testOrg.orgId },
    });
    expect(row.code).toBe("6150");
    expect(row.isSystem).toBe(false);
    expect(row.isActive).toBe(true);
    expect(row.taxCode).toBe("no_vat");
  });

  it("rejects a duplicate code within the organization", async () => {
    await expect(
      createChartAccountRecord(prisma, testOrg.orgId, testOrg.userId, {
        code: "1000", // starter template claims 1000
        name: "Dup",
        accountType: "ASSET",
        reportCategory: "CURRENT_ASSET",
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("rejects a non-numeric code", async () => {
    await expect(
      createChartAccountRecord(prisma, testOrg.orgId, testOrg.userId, {
        code: "61A0",
        name: "Bad code",
        accountType: "EXPENSE",
        reportCategory: "EXPENSE",
      })
    ).rejects.toThrow(/numbers only/i);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`lib/accounting/chart-accounts.ts` does not exist)

Run: `pnpm vitest run tests/chart-account-create.test.ts`

- [ ] **Step 3: Implement the lib function**

```ts
// lib/accounting/chart-accounts.ts
import {
  AuditAction,
  type AccountReportCategory,
  type AccountType,
} from "@prisma/client";

// Use the same prisma param type as lib/accounting/documents.ts — copy its
// import line for ExtendedPrismaClient (or the equivalent type it uses).
import type { ExtendedPrismaClient } from "@/lib/prisma";

export type CreateChartAccountInput = {
  code: string;
  name: string;
  description?: string;
  accountType: AccountType;
  reportCategory: AccountReportCategory;
  taxCode?: string;
  taxRate?: number;
};

export async function createChartAccountRecord(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  input: CreateChartAccountInput
) {
  const code = input.code.trim();
  const name = input.name.trim();

  if (!/^\d+$/.test(code)) {
    throw new Error("Account code must contain numbers only.");
  }
  if (!name) {
    throw new Error("Account name is required.");
  }

  const existing = await prisma.chartAccount.findFirst({
    where: { organizationId, code },
    select: { id: true },
  });
  if (existing) {
    throw new Error("This account code already exists.");
  }

  const account = await prisma.chartAccount.create({
    data: {
      organizationId,
      code,
      name,
      description: input.description?.trim() || null,
      accountType: input.accountType,
      reportCategory: input.reportCategory,
      taxCode: input.taxCode ?? "no_vat",
      taxRate: (input.taxRate ?? 0).toFixed(2),
      isSystem: false,
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      accountType: true,
      reportCategory: true,
      taxCode: true,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId,
      actorUserId,
      entityType: "chart_account",
      entityId: account.id,
      action: AuditAction.CREATE,
      after: { code: account.code, name: account.name },
    },
  });

  return account;
}
```

Note: if `AuditAction.CREATE` doesn't exist, check the `AuditAction` enum in `prisma/schema.prisma` and use its insert/create member; the audit event must not be dropped.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm vitest run tests/chart-account-create.test.ts`

- [ ] **Step 5: Add the server action**

In `app/(dashboard)/accounting/chart-of-accounts/actions.ts`, add (reusing the file's existing `accountTypeMap`/`reportCategoryMap`):

```ts
export type QuickCreateAccountInput = {
  code: string;
  name: string;
  account_type: AccountTypeInput;
  report_category: AccountReportCategoryInput;
};

export async function createChartAccount(input: QuickCreateAccountInput) {
  const workspace = await requireAccountantRole();

  const accountType = ensureEnumValue(input.account_type, accountTypeValues, "account type");
  const reportCategory = ensureEnumValue(
    input.report_category,
    reportCategoryValues,
    "report category"
  );

  const account = await createChartAccountRecord(
    prisma,
    workspace.organizationId,
    workspace.userId,
    {
      code: input.code,
      name: input.name,
      accountType: accountTypeMap[accountType],
      reportCategory: reportCategoryMap[reportCategory],
    }
  );

  revalidatePath("/accounting/chart-of-accounts");

  // Shape matches ChartAccountOption (lib/accounting/documents.ts:74-81)
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    accountType: account.accountType.toLowerCase(),
    reportCategory: account.reportCategory.toLowerCase(),
    taxCode: account.taxCode,
  };
}
```

Add the import at the top: `import { createChartAccountRecord } from "@/lib/accounting/chart-accounts";`

- [ ] **Step 6: Create the quick-add dialog**

```tsx
// components/shared/quick-add-account-dialog.tsx
"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createChartAccount } from "@/app/(dashboard)/accounting/chart-of-accounts/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChartAccountOption } from "@/lib/accounting/documents";

// Category choices depend on which form launched the dialog: invoice lines
// map to income accounts, bill lines to purchase/expense accounts. These
// pairs must stay inside the filters used by getInvoiceWorkspace /
// getBillWorkspace so the new account appears in the select immediately.
const CATEGORY_CHOICES = {
  income: [
    { value: "sales", label: "Sales", accountType: "revenue" },
    { value: "other_income", label: "Other income", accountType: "revenue" },
  ],
  purchase: [
    { value: "expense", label: "Expense", accountType: "expense" },
    { value: "cost_of_sales", label: "Cost of sales", accountType: "expense" },
    { value: "current_asset", label: "Current asset", accountType: "asset" },
    { value: "fixed_asset", label: "Fixed asset", accountType: "asset" },
  ],
} as const;

type QuickAddAccountDialogProps = {
  open: boolean;
  kind: "income" | "purchase";
  onOpenChange: (open: boolean) => void;
  onCreated: (account: ChartAccountOption) => void;
};

export function QuickAddAccountDialog({
  open,
  kind,
  onOpenChange,
  onCreated,
}: QuickAddAccountDialogProps) {
  const choices = CATEGORY_CHOICES[kind];
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(choices[0].value);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const choice = choices.find((c) => c.value === category) ?? choices[0];
    setSaving(true);
    try {
      const account = await createChartAccount({
        code,
        name,
        account_type: choice.accountType,
        report_category: choice.value,
      });
      toast.success(`Account ${account.code} - ${account.name} created.`);
      onCreated(account as ChartAccountOption);
      setCode("");
      setName("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create a new account</DialogTitle>
            <DialogDescription>
              Adds an account to your chart of accounts and selects it on this line.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="space-y-4 py-4">
            <Field>
              <FieldLabel htmlFor="quick-account-code">Account code</FieldLabel>
              <input
                id="quick-account-code"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={kind === "income" ? "4200" : "6200"}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="quick-account-name">Account name</FieldLabel>
              <input
                id="quick-account-name"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                placeholder={kind === "income" ? "Consulting income" : "Software subscriptions"}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Category</FieldLabel>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !code.trim() || !name.trim()}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Wire into the invoice form**

In `components/sales/add-invoice-dialog.tsx`:

1. Import: `import { QuickAddAccountDialog } from "@/components/shared/quick-add-account-dialog";`
2. State (next to the manage-taxes state at line 137):

```tsx
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [addAccountLineIndex, setAddAccountLineIndex] = useState<number | null>(null);
```

3. In the line-item account select (lines 812-826), intercept the sentinel and add the item as the last child of `SelectContent`:

```tsx
<Select
  value={line.accountId}
  onValueChange={(value) => {
    if (value === "add-new-account") {
      setAddAccountLineIndex(index);
      setIsAddAccountOpen(true);
      return;
    }
    updateLine(index, { accountId: value });
  }}
>
  <SelectTrigger className="h-10 w-full min-w-0 bg-white">
    <SelectValue placeholder="Income account" />
  </SelectTrigger>
  <SelectContent>
    {incomeAccounts.map((account) => (
      <SelectItem key={account.id} value={account.id}>
        {account.code} - {account.name}
      </SelectItem>
    ))}
    <SelectItem
      value="add-new-account"
      className="text-blue-600 font-semibold focus:text-blue-700 focus:bg-blue-50"
    >
      <Plus className="size-3.5 inline mr-2" />
      Create new account...
    </SelectItem>
  </SelectContent>
</Select>
```

4. Render the dialog next to `ManageTaxesDialog` (after line 1250):

```tsx
<QuickAddAccountDialog
  open={isAddAccountOpen}
  kind="income"
  onOpenChange={setIsAddAccountOpen}
  onCreated={(account) => {
    if (addAccountLineIndex !== null) {
      updateLine(addAccountLineIndex, { accountId: account.id });
    }
    // Account options render from the invoice workspace query — refetch so
    // the new account appears in every line select without a reload.
    queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
  }}
/>
```

(`queryClient` and `queryKeys` are already in scope in this file.)

- [ ] **Step 8: Wire into the bill form**

In `components/purchases/add-bill-dialog.tsx` — same pattern with `kind="purchase"`:

1. Imports:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { QuickAddAccountDialog } from "@/components/shared/quick-add-account-dialog";
```

2. Inside the component: `const queryClient = useQueryClient();` plus the two state hooks (`isAddAccountOpen`, `addAccountLineIndex`) as in Step 7.
3. Account select (lines 585-599): intercept `"add-new-account"` in `onValueChange` and append the same "Create new account..." `SelectItem` after the `accounts.map(...)`.
4. Render before the closing `</div>` of the component:

```tsx
<QuickAddAccountDialog
  open={isAddAccountOpen}
  kind="purchase"
  onOpenChange={setIsAddAccountOpen}
  onCreated={(account) => {
    if (addAccountLineIndex !== null) {
      updateLine(addAccountLineIndex, { accountId: account.id });
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.billWorkspace });
  }}
/>
```

- [ ] **Step 9: Verify**

Run: `pnpm typecheck` → no errors.
Run: `pnpm vitest run tests/chart-account-create.test.ts` → PASS.
Manual: create invoice → line account select → "Create new account..." → create `4200 Consulting income` (Sales) → dialog closes, line now shows the new account, and it appears in other lines' selects. Repeat on a bill with an Expense account.

- [ ] **Step 10: CHECKPOINT** — stop for user review/commit.

---

### Task 6: Persist the onboarding "VAT registered" answer

Today `formData.vatRegistered` exists only as wizard state (`app/onboarding/success/post-setup-client.tsx:42`, radio at `:384-395`) — it is never written to the database, and `vatScheme` is never derived from it (latent bug: the post-setup wizard leaves `vatScheme` at `"none"` → null even when the user answers "yes").

**Files:**
- Create: `prisma/migrations/20260706090000_org_vat_registered/migration.sql`
- Modify: `prisma/schema.prisma` (Organization, next to line 42 `vatScheme`)
- Modify: `app/onboarding/actions.ts` (`updateWorkspaceSettings` lines 162-181; free-plan create lines 94-110)
- Modify: `lib/onboarding/checkout.ts` (+ its test `tests/onboarding-checkout.test.ts`)
- Modify: `app/api/webhooks/stripe/route.ts` (org create, lines 66-77)

**Interfaces:**
- Produces: `Organization.vatRegistered: Boolean @default(false)` — Task 7 reads this field. `OnboardingFormData.vatRegistered?: string` (`"yes" | "no"`), `CheckoutMetadata.vatRegistered: string`.

- [ ] **Step 1: Migration**

```sql
-- prisma/migrations/20260706090000_org_vat_registered/migration.sql
-- Whether the company answered "yes" to UK VAT registration during onboarding.
-- Consumed by invoice/bill forms to hide VAT options for unregistered companies.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vat_registered boolean NOT NULL DEFAULT false;
```

Schema (`prisma/schema.prisma`, insert directly below line 42 `vatScheme`):

```prisma
  vatRegistered         Boolean           @default(false) @map("vat_registered")
```

Run: `pnpm prisma migrate deploy` then `pnpm prisma generate`. If deploy fails, STOP and ask the user.

- [ ] **Step 2: Extend the checkout metadata helpers + test first**

In `tests/onboarding-checkout.test.ts` (read it first; extend in its existing style): wherever a `buildCheckoutMetadata` result is asserted, add the expectation `vatRegistered: "yes"` (or `"no"` for defaults) after adding the input field to the test's form-data literal. Add one new assertion: omitted `vatRegistered` defaults to `"no"`.

Run: `pnpm vitest run tests/onboarding-checkout.test.ts` → FAIL (property missing).

Then in `lib/onboarding/checkout.ts`:
- `OnboardingFormData`: add `vatRegistered?: string; // "yes" | "no"` after `vatScheme?`.
- `CheckoutMetadata`: add `vatRegistered: string;` after `vatScheme: string;`.
- `buildCheckoutMetadata` return: add `vatRegistered: formData.vatRegistered ?? "no",` after the `vatScheme` line.

Run: `pnpm vitest run tests/onboarding-checkout.test.ts` → PASS.

- [ ] **Step 3: Write the answer in `updateWorkspaceSettings`**

In `app/onboarding/actions.ts` (lines 165-181), inside the `data:` object replace the `vatScheme` line with:

```ts
        // "yes"/"no" from the Tax & Compliance step. A registered company with
        // no explicit scheme defaults to the standard scheme; an unregistered
        // company stores no scheme at all.
        vatRegistered: formData.vatRegistered === "yes",
        vatScheme:
          formData.vatRegistered === "yes"
            ? formData.vatScheme && formData.vatScheme !== "none"
              ? formData.vatScheme
              : "standard"
            : null,
```

- [ ] **Step 4: Write it on the free-plan create path and the webhook race path**

`app/onboarding/actions.ts` free-plan `prisma.organization.create` (line 95-110): add after `vatScheme: formData.vatScheme,`:

```ts
            vatRegistered: formData.vatRegistered === "yes",
```

`app/api/webhooks/stripe/route.ts` org create (lines 66-77): add after `businessStructure: ...,`:

```ts
                vatRegistered: meta.vatRegistered === "yes",
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck` → no errors.
Run: `pnpm vitest run tests/onboarding-checkout.test.ts` → PASS.
Manual (if a dev DB user exists): run the post-setup wizard answering "Yes, I am registered" → `select vat_registered, vat_scheme from organizations where id = '<org>'` → `true, standard`.

- [ ] **Step 6: CHECKPOINT** — stop for user review/commit.

---

### Task 7: Hide VAT options in Add Invoice / Add Bill for unregistered companies

Depends on Task 6. The invoice form already has a complete `no_vat` render path (locked "No VAT" line cells at `add-invoice-dialog.tsx:920-923`, totals handling at `:250-278`) — for unregistered orgs we force `amountsAre: "no_vat"` and hide the treatment selector, and the rest follows.

**Files:**
- Modify: `lib/accounting/documents.ts:905-957` (`getDocumentOptions` — return `vatRegistered`)
- Modify: `app/(dashboard)/sales/invoices/actions.ts:37-62` and `app/(dashboard)/purchases/actions.ts:43-68` (pass it through)
- Modify: `components/sales/invoice-types.ts` and `components/purchases/purchase-types.ts` (workspace types)
- Modify: `components/sales/use-invoices.ts` and `components/purchases/use-purchases.ts` (expose it)
- Modify: `components/sales/invoices.tsx` and `components/purchases/purchases.tsx` (prop into create views)
- Modify: `components/sales/add-invoice-dialog.tsx`, `components/purchases/add-bill-dialog.tsx`

**Interfaces:**
- Consumes: `Organization.vatRegistered` (Task 6).
- Produces: `getDocumentOptions(...)` return gains `vatRegistered: boolean`; both workspace payloads and both create-view components gain a `vatRegistered: boolean` prop (default `true` so nothing hides while data loads).

- [ ] **Step 1: Server plumbing**

`lib/accounting/documents.ts` `getDocumentOptions`: add a fourth parallel query and return field:

```ts
  const [contacts, accounts, taxRates, organization] = await Promise.all([
    // ...existing three queries unchanged...
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { vatRegistered: true },
    }),
  ]);
```

and in the return object: `vatRegistered: organization.vatRegistered,`

`app/(dashboard)/sales/invoices/actions.ts` `getInvoiceWorkspace` return: add `vatRegistered: options.vatRegistered,`
`app/(dashboard)/purchases/actions.ts` `getBillWorkspace` return: add `vatRegistered: options.vatRegistered,`

- [ ] **Step 2: Types + hooks**

`components/sales/invoice-types.ts` `InvoiceWorkspaceData`: add `vatRegistered: boolean;`
`components/purchases/purchase-types.ts` `BillWorkspaceData`: add `vatRegistered: boolean;`
`components/sales/use-invoices.ts` and `components/purchases/use-purchases.ts`: expose `vatRegistered: data?.vatRegistered ?? true,` in the returned object (find where `taxRates` is returned and add beside it).

- [ ] **Step 3: Invoice form gating**

`components/sales/invoices.tsx`: destructure `vatRegistered` from `useInvoices()` and pass `vatRegistered={vatRegistered}` where `<CreateInvoiceView ...>` is rendered (line ~379-390).

`components/sales/add-invoice-dialog.tsx`:
1. Props: add `vatRegistered?: boolean;` to `CreateInvoiceViewProps` and destructure with default: `vatRegistered = true,`.
2. `emptyLine` (line 84): add a third parameter and gate the default tax code:

```ts
function emptyLine(
  accounts: ChartAccountOption[],
  taxRates: TaxRateOption[],
  vatRegistered: boolean = true
): LineForm {
  return {
    accountId: accounts[0]?.id ?? "",
    description: "",
    quantity: "1.00",
    unitPrice: "",
    amount: "0.00",
    discount: "",
    discountMode: "amount",
    discountPercent: "",
    taxCode: vatRegistered
      ? (taxRates.find((tax) => tax.code === "vat_20")?.code ?? "no_vat")
      : "no_vat",
  };
}
```

Update every `emptyLine(accounts, taxRates)` call in this file to `emptyLine(accounts, taxRates, vatRegistered)` (initial state line 237, save-and-add-another reset line 380, "Add Line Item" button line 985).
3. Initial `amountsAre` for new invoices (line 230): `amountsAre: vatRegistered ? "exclusive" : "no_vat",` — and same in the save-and-add-another reset (line 373).
4. Force the treatment for unregistered orgs regardless of stale drafts (replace line 249):

```ts
  const amountsAre: "exclusive" | "inclusive" | "no_vat" = vatRegistered
    ? (form.amountsAre ?? "exclusive")
    : "no_vat";
```

5. Hide the "Amounts are" selector block (lines 767-784) and its helper text when unregistered — wrap both in `{vatRegistered && ( ... )}`. Everything else (locked per-line "No VAT" cells, totals "No VAT applied") already keys off `amountsAre === "no_vat"`.

- [ ] **Step 4: Bill form gating**

`components/purchases/purchases.tsx`: pass `vatRegistered={vatRegistered}` into `<CreateBillView ...>` (destructure it from `usePurchases()`).

`components/purchases/add-bill-dialog.tsx`:
1. Props: `vatRegistered?: boolean;` with default `true` in destructuring.
2. `emptyLine` (line 72): same third-parameter gating as the invoice version; update its call sites (initial state line 167, "Add Line Item" line 709).
3. Totals (lines 171-188): zero the rate when unregistered:

```ts
        const taxRate = vatRegistered
          ? (taxRates.find((tax) => tax.code === line.taxCode)?.rate ?? 0)
          : 0;
```

(add `vatRegistered` to the `useMemo` dependency array)
4. Per-line tax select (lines 662-677): render a locked cell when unregistered:

```tsx
{!vatRegistered ? (
  <div className="flex h-10 w-full min-w-0 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-400">
    No VAT
  </div>
) : (
  <Select ... > {/* existing select unchanged */} </Select>
)}
```

5. Totals block VAT row (line 721): wrap in `{vatRegistered ? ( ... ) : null}`.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck` → no errors.
Manual: set `update organizations set vat_registered = false where id = '<dev org>'` → Add Invoice shows no "Amounts are" selector, lines show locked "No VAT", totals show "No VAT applied"; Add Bill lines show locked "No VAT" and no VAT total row. Set back to `true` → everything returns.

- [ ] **Step 6: CHECKPOINT** — stop for user review/commit.

---

### Task 8: Bill tax parity — `amountsAre` treatment + "Manage taxes…" on Add Bill

Bills currently compute tax as exclusive-only (`add-bill-dialog.tsx:171-188`) and `saveBillDraft` never passes a VAT treatment to `normalizeLines` (`documents.ts:1128-1138`), while invoices support exclusive/inclusive/no_vat end to end.

**Files:**
- Create: `prisma/migrations/20260706100000_bill_amounts_are/migration.sql`
- Modify: `prisma/schema.prisma` (Bill model, line ~329)
- Modify: `lib/accounting/documents.ts` (`BillWithLines`, `saveBillDraft`, `mapBill`)
- Modify: `components/purchases/add-bill-dialog.tsx`
- Test: `tests/bill-vat-treatment.test.ts` (create — mirror `tests/invoice-vat-treatment.test.ts`)

**Interfaces:**
- Consumes: `VatTreatment` type and `normalizeLines(tx, orgId, lines, accountFilter, amountsAre)` (`documents.ts` — the invoice call at `:972-981` shows the 5-arg form); `ManageTaxesDialog` from `components/sales/manage-taxes-dialog`.
- Produces: `Bill.amountsAre` column; `DocumentDraftInput.amountsAre` honored by `saveBillDraft`; `BillWithLines.amountsAre: VatTreatment`.

- [ ] **Step 1: Migration + schema**

```sql
-- prisma/migrations/20260706100000_bill_amounts_are/migration.sql
-- VAT treatment for bill line amounts (parity with invoices):
--   exclusive: entered amounts are net, VAT is added on top (historic behavior)
--   inclusive: entered amounts are gross, VAT is backed out
--   no_vat:    no VAT is calculated at all
ALTER TABLE bills ADD COLUMN IF NOT EXISTS amounts_are text NOT NULL DEFAULT 'exclusive';
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_amounts_are_check;
ALTER TABLE bills ADD CONSTRAINT bills_amounts_are_check
  CHECK (amounts_are IN ('exclusive', 'inclusive', 'no_vat'));
```

`prisma/schema.prisma` Bill model — add after `billingAddress` (line 329):

```prisma
  amountsAre      String        @default("exclusive") @map("amounts_are")
```

Run: `pnpm prisma migrate deploy && pnpm prisma generate`.

- [ ] **Step 2: Write the failing server test**

First read `tests/invoice-vat-treatment.test.ts` and mirror its structure/amount expectations for bills:

```ts
// tests/bill-vat-treatment.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { saveBillDraft, type DocumentDraftInput } from "@/lib/accounting/documents";

import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

let testOrg: TestOrg;

beforeEach(async () => {
  testOrg = await createTestOrg();
});

afterEach(async () => {
  await dropTestOrg(testOrg.orgId);
});

async function expenseAccountId(): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: testOrg.orgId, accountType: "EXPENSE", reportCategory: "EXPENSE" },
    select: { id: true },
  });
  return row.id;
}

function draft(
  accountId: string,
  amountsAre: DocumentDraftInput["amountsAre"],
  unitPrice: string,
  taxCode: string
): DocumentDraftInput {
  return {
    contactId: testOrg.supplierId,
    contactName: "",
    documentNo: `BILL-${Math.random().toString(36).slice(2, 8)}`,
    issueDate: "2026-07-01",
    dueDate: "",
    currency: "GBP",
    amountsAre,
    lines: [{ accountId, description: "VAT treatment", quantity: "1.00", unitPrice, taxCode }],
  };
}

describe("saveBillDraft VAT treatment", () => {
  it("exclusive: adds VAT on top of the net amount", async () => {
    const accountId = await expenseAccountId();
    const billId = await saveBillDraft(
      prisma, testOrg.orgId, testOrg.userId,
      draft(accountId, "exclusive", "100.00", "vat_20")
    );
    const bill = await prisma.bill.findFirstOrThrow({ where: { id: billId, organizationId: testOrg.orgId } });
    expect(Number(bill.taxMinor)).toBe(2000);
    expect(Number(bill.totalMinor)).toBe(12000);
    expect(bill.amountsAre).toBe("exclusive");
  });

  it("inclusive: backs VAT out of the gross amount", async () => {
    const accountId = await expenseAccountId();
    const billId = await saveBillDraft(
      prisma, testOrg.orgId, testOrg.userId,
      draft(accountId, "inclusive", "120.00", "vat_20")
    );
    const bill = await prisma.bill.findFirstOrThrow({ where: { id: billId, organizationId: testOrg.orgId } });
    expect(Number(bill.taxMinor)).toBe(2000);
    expect(Number(bill.totalMinor)).toBe(12000);
    expect(bill.amountsAre).toBe("inclusive");
  });

  it("no_vat: stores zero tax regardless of the line's tax code", async () => {
    const accountId = await expenseAccountId();
    const billId = await saveBillDraft(
      prisma, testOrg.orgId, testOrg.userId,
      draft(accountId, "no_vat", "100.00", "vat_20")
    );
    const bill = await prisma.bill.findFirstOrThrow({ where: { id: billId, organizationId: testOrg.orgId } });
    expect(Number(bill.taxMinor)).toBe(0);
    expect(Number(bill.totalMinor)).toBe(10000);
    expect(bill.amountsAre).toBe("no_vat");
  });
});
```

If the invoice test's expected numbers differ from these (e.g. subtotal conventions for inclusive), match THAT file's conventions — invoices are the source of truth for the maths.

Run: `pnpm vitest run tests/bill-vat-treatment.test.ts` → FAIL (inclusive/no_vat cases).

- [ ] **Step 3: Thread the treatment through `saveBillDraft`**

In `lib/accounting/documents.ts` `saveBillDraft`:

1. After `resolveContact` (line 1127), add:

```ts
    const amountsAre: VatTreatment = input.amountsAre ?? "exclusive";
```

2. Pass it as the 5th argument to `normalizeLines` (line 1128-1138), exactly as the invoice path does at `:972-981`:

```ts
    const normalized = await normalizeLines(
      tx,
      organizationId,
      input.lines,
      {
        accountTypes: ["EXPENSE", "ASSET"],
        reportCategories: [
          "COST_OF_SALES",
          "EXPENSE",
          "DEPRECIATION",
          "CURRENT_ASSET",
          "FIXED_ASSET",
          "NON_CURRENT_ASSET",
        ],
      },
      amountsAre
    );
```

3. Persist it — UPDATE branch (lines 1174-1189): add `amounts_are = ${amountsAre},` after `billing_address = ${billingAddressStr},`. INSERT branch (lines 1192-1212): add `amounts_are` to the column list after `billing_address` and `${amountsAre},` after `${billingAddressStr},`.
4. `BillWithLines` type (line 136-155): add `amountsAre: VatTreatment;` after `billingAddress`.
5. Find `mapBill` (search the file; the bills list query is around line 860-903) and add `amountsAre: (bill.amountsAre ?? "exclusive") as VatTreatment,` mirroring how `mapInvoice` maps the invoice's field.

Run: `pnpm vitest run tests/bill-vat-treatment.test.ts` → PASS.
Run: `pnpm vitest run tests/bill-discount.test.ts tests/invoice-vat-treatment.test.ts` → PASS (no regressions).

- [ ] **Step 4: Bill form UI — treatment selector, inclusive maths, Manage taxes**

In `components/purchases/add-bill-dialog.tsx`:

1. Form state: add `amountsAre` to both branches of the `useState` initializer — edit branch: `amountsAre: (bill as any)?.amountsAre ?? "exclusive",`; new branch: `amountsAre: "exclusive",` (Task 7's gating changes this to `vatRegistered ? "exclusive" : "no_vat"` if both tasks land — reconcile whichever is already merged). Extend `NewBillInput` usage: `DocumentDraftInput` already carries `amountsAre`, so no type change is needed.
2. Derive the treatment above `totals`:

```ts
  const amountsAre: "exclusive" | "inclusive" | "no_vat" = form.amountsAre ?? "exclusive";
```

3. Replace the `totals` useMemo body with the invoice's three-treatment maths (`add-invoice-dialog.tsx:250-278` is the reference), keeping this file's `lineSubtotalMinor(line)` in place of the invoice's `amountToMinor(line.amount)`:

```ts
  const totals = useMemo(() => {
    const lineTotals = form.lines.reduce(
      (acc, line) => {
        const subtotal = lineSubtotalMinor(line as LineForm);
        const discount = amountToMinor((line as LineForm).discount ?? "");
        const net = Math.max(subtotal - discount, 0);
        const taxRate = taxRates.find((tax) => tax.code === line.taxCode)?.rate ?? 0;

        let tax = 0;
        if (amountsAre === "exclusive") {
          tax = Math.round((net * taxRate) / 100);
        } else if (amountsAre === "inclusive") {
          tax = Math.round((net * taxRate) / (100 + taxRate));
        }

        acc.subtotal += subtotal;
        acc.discount += discount;
        acc.tax += tax;
        return acc;
      },
      { subtotal: 0, discount: 0, tax: 0 }
    );
    const net = lineTotals.subtotal - lineTotals.discount;
    const total = amountsAre === "exclusive" ? net + lineTotals.tax : net;
    return { subtotal: lineTotals.subtotal, discount: lineTotals.discount, tax: lineTotals.tax, total };
  }, [form.lines, taxRates, amountsAre]);
```

4. Add the "Amounts are" selector above the line-items grid (copy the invoice block at `add-invoice-dialog.tsx:765-793`, dropping the `sm` layout tweaks as needed):

```tsx
<div className="flex flex-wrap items-center justify-between gap-3">
  <h3 className="text-sm font-semibold text-slate-900">Line items</h3>
  <div className="flex items-center gap-2">
    <span className="text-xs font-semibold text-slate-500">Amounts are</span>
    <Select
      value={amountsAre}
      onValueChange={(value) =>
        setForm((current) => ({ ...current, amountsAre: value as typeof amountsAre }))
      }
    >
      <SelectTrigger className="h-9 w-44 bg-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="exclusive">Exclusive of VAT</SelectItem>
        <SelectItem value="inclusive">Inclusive of VAT</SelectItem>
        <SelectItem value="no_vat">No VAT</SelectItem>
      </SelectContent>
    </Select>
  </div>
</div>
```

5. Per-line tax cell: when `amountsAre === "no_vat"` render the locked "No VAT" div (same as invoice `:920-923`); otherwise render the existing select **plus** a trailing "Manage taxes..." item that opens `ManageTaxesDialog`:

```tsx
<Select
  value={line.taxCode}
  onValueChange={(value) => {
    if (value === "manage-taxes") {
      setManageTaxesLineIndex(index);
      setIsManageTaxesOpen(true);
      return;
    }
    updateLine(index, { taxCode: value as TaxRateOption["code"] });
  }}
>
  ...
  <SelectContent>
    {taxRates.map((tax) => (
      <SelectItem key={tax.code} value={tax.code}>{tax.name}</SelectItem>
    ))}
    <SelectItem value="manage-taxes" className="text-blue-600 font-semibold focus:text-blue-700 focus:bg-blue-50">
      Manage taxes...
    </SelectItem>
  </SelectContent>
</Select>
```

with state + dialog mirroring the invoice wiring (`add-invoice-dialog.tsx:137-138` and `:1237-1250`):

```tsx
import { ManageTaxesDialog } from "@/components/sales/manage-taxes-dialog";
// state:
const [isManageTaxesOpen, setIsManageTaxesOpen] = useState(false);
const [manageTaxesLineIndex, setManageTaxesLineIndex] = useState<number | null>(null);
// render (bottom of component):
<ManageTaxesDialog
  open={isManageTaxesOpen}
  onOpenChange={setIsManageTaxesOpen}
  onCreated={(code) => {
    if (manageTaxesLineIndex !== null) {
      updateLine(manageTaxesLineIndex, { taxCode: code as TaxRateOption["code"] });
    }
  }}
  onChanged={() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.billWorkspace });
  }}
/>
```

(`queryClient`/`queryKeys` imports arrive with Task 5 Step 8; add them here if Task 5 hasn't run yet.)
6. Totals display: mirror the invoice's conditional rows (`add-invoice-dialog.tsx:992-1012`) — "Subtotal (incl. VAT)" label when inclusive, "Includes VAT" row when inclusive, "No VAT applied" when no_vat.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck` → no errors.
Run: `pnpm vitest run tests/bill-vat-treatment.test.ts tests/bill-discount.test.ts` → PASS.
Manual: create a bill with a £120 line, treatment "Inclusive of VAT", vat_20 → totals show VAT £20, Total £120; save → reopen draft → treatment restored. "Manage taxes..." opens the dialog and a created rate is selectable.

- [ ] **Step 6: CHECKPOINT** — stop for user review/commit.

---

### Task 9: Payment terms on invoices and bills

Terms currently exist only as `Contact.paymentTermsDays` driving a read-only invoice due-date label (`add-invoice-dialog.tsx:242-245, 687-693`); bills ignore terms entirely. Add an editable per-document terms select that (a) auto-computes the due date and (b) is persisted on the document.

**Files:**
- Create: `prisma/migrations/20260706110000_document_payment_terms/migration.sql`
- Modify: `prisma/schema.prisma` (Invoice + Bill)
- Modify: `lib/accounting/documents.ts` (`DocumentDraftInput`, `saveInvoiceDraft`, `saveBillDraft`, `mapInvoice`, `mapBill`, `BillWithLines`)
- Modify: `components/sales/add-invoice-dialog.tsx`, `components/purchases/add-bill-dialog.tsx`
- Test: `tests/document-payment-terms.test.ts` (create)

**Interfaces:**
- Consumes: `paymentTermsLabel(days)` + `PAYMENT_TERMS_LABELS` from `components/sales/invoice-types.ts:13-25`.
- Produces: `Invoice.paymentTermsDays: Int?`, `Bill.paymentTermsDays: Int?`, `DocumentDraftInput.paymentTermsDays?: number | null`. `InvoiceWithLines.paymentTermsDays` (already exists at `documents.ts:120`) now prefers the document value, falling back to the contact's.

- [ ] **Step 1: Migration + schema**

```sql
-- prisma/migrations/20260706110000_document_payment_terms/migration.sql
-- Per-document payment terms snapshot (days until due). NULL = not set;
-- the contact's default terms remain the fallback for display.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms_days integer;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_terms_days integer;
```

`prisma/schema.prisma` — add to BOTH the Invoice model (after `amountsAre`, line 270) and the Bill model (after `billingAddress` / the Task 8 `amountsAre` line):

```prisma
  paymentTermsDays Int?          @map("payment_terms_days")
```

Run: `pnpm prisma migrate deploy && pnpm prisma generate`.

- [ ] **Step 2: Failing persistence test**

```ts
// tests/document-payment-terms.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  saveBillDraft,
  saveInvoiceDraft,
  type DocumentDraftInput,
} from "@/lib/accounting/documents";

import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

let testOrg: TestOrg;

beforeEach(async () => {
  testOrg = await createTestOrg();
});

afterEach(async () => {
  await dropTestOrg(testOrg.orgId);
});

async function accountId(accountType: "REVENUE" | "EXPENSE"): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: testOrg.orgId, accountType },
    select: { id: true },
  });
  return row.id;
}

function draft(contactId: string, lineAccountId: string): DocumentDraftInput {
  return {
    contactId,
    contactName: "",
    documentNo: `DOC-${Math.random().toString(36).slice(2, 8)}`,
    issueDate: "2026-07-01",
    dueDate: "2026-08-15",
    currency: "GBP",
    paymentTermsDays: 45,
    lines: [
      {
        accountId: lineAccountId,
        description: "Terms test",
        quantity: "1.00",
        unitPrice: "10.00",
        taxCode: "no_vat",
      },
    ],
  };
}

describe("document payment terms persistence", () => {
  it("stores paymentTermsDays on invoices", async () => {
    const invoiceId = await saveInvoiceDraft(
      prisma, testOrg.orgId, testOrg.userId,
      draft(testOrg.customerId, await accountId("REVENUE"))
    );
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { id: invoiceId, organizationId: testOrg.orgId },
    });
    expect(invoice.paymentTermsDays).toBe(45);
  });

  it("stores paymentTermsDays on bills", async () => {
    const billId = await saveBillDraft(
      prisma, testOrg.orgId, testOrg.userId,
      draft(testOrg.supplierId, await accountId("EXPENSE"))
    );
    const bill = await prisma.bill.findFirstOrThrow({
      where: { id: billId, organizationId: testOrg.orgId },
    });
    expect(bill.paymentTermsDays).toBe(45);
  });
});
```

Run: `pnpm vitest run tests/document-payment-terms.test.ts` → FAIL.

- [ ] **Step 3: Persist in both save functions**

`lib/accounting/documents.ts`:
1. `DocumentDraftInput`: add `paymentTermsDays?: number | null;` after `amountsAre?`.
2. In `saveInvoiceDraft` and `saveBillDraft`, compute once near the other normalized values:

```ts
    const paymentTermsDays =
      typeof input.paymentTermsDays === "number" && Number.isFinite(input.paymentTermsDays)
        ? Math.max(0, Math.round(input.paymentTermsDays))
        : null;
```

3. Add `payment_terms_days = ${paymentTermsDays},` to both raw UPDATEs and `payment_terms_days` + `${paymentTermsDays},` to both raw INSERT column/value lists (same placement pattern as Task 8's `amounts_are`).
4. DTO mapping: in `mapInvoice`, change the existing `paymentTermsDays` mapping to prefer the document: `paymentTermsDays: invoice.paymentTermsDays ?? contact.paymentTermsDays` (match the local variable names actually used in that mapper). In `mapBill` + `BillWithLines`, add `paymentTermsDays: number | null` and map `bill.paymentTermsDays ?? null`.

Run: `pnpm vitest run tests/document-payment-terms.test.ts` → PASS. Also `pnpm vitest run tests/document-address.test.ts` → PASS (same code paths).

- [ ] **Step 4: Invoice form — editable Terms select**

In `components/sales/add-invoice-dialog.tsx`:
1. Add `paymentTermsDays` to form state: edit branch `paymentTermsDays: (invoice as any)?.paymentTermsDays ?? null,`; new branch `paymentTermsDays: null,` (both `useState` branches and the save-and-add-another reset).
2. When a customer is selected (the `onValueChange` at line 532-546), also set `paymentTermsDays: termsDays,`.
3. When the issue date changes (line 671-680), compute the due date from `current.paymentTermsDays ?? currentPaymentTermsDays`.
4. Replace the read-only label next to "Due date" (lines 687-693) with a Terms select rendered as a fourth grid field beside Due date (change the grid to `sm:grid-cols-4` or add a nested pair — keep the layout tidy):

```tsx
<Field>
  <FieldLabel>Terms</FieldLabel>
  <Select
    value={String(form.paymentTermsDays ?? currentPaymentTermsDays)}
    onValueChange={(value) => {
      const days = Number(value);
      setForm((current: any) => ({
        ...current,
        paymentTermsDays: days,
        dueDate: addDays(current.issueDate || today(), days),
      }));
    }}
  >
    <SelectTrigger className="h-10 w-full bg-white">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {[0, 7, 15, 30, 45, 60, 90].map((days) => (
        <SelectItem key={days} value={String(days)}>
          {paymentTermsLabel(days)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</Field>
```

(`paymentTermsLabel` is already imported at line 34. Manually editing the due date afterwards stays allowed and does not reset the terms — due date remains the source of truth for aging.)

- [ ] **Step 5: Bill form — same select + due-date auto-fill**

In `components/purchases/add-bill-dialog.tsx`:
1. Form state: `paymentTermsDays: (bill as any)?.paymentTermsDays ?? null` (edit) / `null` (new).
2. Supplier select `onValueChange` (lines 318-327): also set terms + due date from the contact:

```ts
const contact = contacts.find((item) => item.id === value);
const termsDays = contact?.paymentTermsDays ?? 30;
setSupplierError(null);
setForm((current) => ({
  ...current,
  contactId: value,
  contactName: contact?.name ?? "",
  billingAddress: contact?.billingAddress ?? "",
  paymentTermsDays: termsDays,
  dueDate: addDays(current.issueDate || today(), termsDays),
}));
```

3. Add the same Terms `<Select>` as Step 4 next to the Due date field (import `paymentTermsLabel` from `"@/components/sales/invoice-types"`), using `String(form.paymentTermsDays ?? 30)` as the value.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck`; `pnpm vitest run tests/document-payment-terms.test.ts` → PASS.
Manual: invoice → pick customer with Net 30 → Terms shows "Net 30", due date +30d; switch Terms to Net 7 → due date moves; save draft, reopen → Terms restored. Same on a bill.

- [ ] **Step 7: CHECKPOINT** — stop for user review/commit.

---

### Task 10: Payment method (Cash / Cheque / Bank transfer) on payments

Payments are journals; record the method on the journal row.

**Files:**
- Create: `prisma/migrations/20260706120000_journal_payment_method/migration.sql`
- Modify: `prisma/schema.prisma` (Journal model)
- Modify: `lib/accounting/documents.ts` (`payInvoice`, `payBill`)
- Modify: `app/(dashboard)/sales/invoices/actions.ts` (`payInvoiceDocument`), `app/(dashboard)/purchases/actions.ts` (`payBillDocument`)
- Modify: `components/sales/view-invoice-dialog.tsx`, `components/purchases/pay-bill-dialog.tsx` (from Task 3), plus the `onRecordPayment` threading in `components/sales/invoices.tsx` / `components/sales/use-invoices.ts` and `payBill` threading in `components/purchases/use-purchases.ts` / `purchases.tsx`
- Test: extend `tests/bill-payment-account.test.ts` and `tests/invoice-deposit-account.test.ts`

**Interfaces:**
- Produces: `export type PaymentMethod = "cash" | "cheque" | "bank_transfer";` in `lib/accounting/documents.ts`; `payInvoice(..., paymentAmountMinor?, depositAccountId?, paymentMethod?)`; `payBill(..., paymentAccountId?, paymentMethod?)`; `Journal.paymentMethod: String?`.

- [ ] **Step 1: Migration + schema**

```sql
-- prisma/migrations/20260706120000_journal_payment_method/migration.sql
-- How a payment journal was settled. Only set on payment journals
-- (source_type invoice_payment / bill_payment); NULL elsewhere.
ALTER TABLE journals ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE journals DROP CONSTRAINT IF EXISTS journals_payment_method_check;
ALTER TABLE journals ADD CONSTRAINT journals_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'cheque', 'bank_transfer'));
```

`prisma/schema.prisma` Journal model (line ~196): add `paymentMethod String? @map("payment_method")` among its scalar fields.
Run: `pnpm prisma migrate deploy && pnpm prisma generate`.

- [ ] **Step 2: Failing tests**

Append to `tests/bill-payment-account.test.ts`:

```ts
  it("stores the payment method on the payment journal", async () => {
    const billId = await approvedBillId();

    await payBill(prisma, testOrg.orgId, testOrg.userId, billId, undefined, "cheque");

    const journal = await prisma.journal.findFirstOrThrow({
      where: { organizationId: testOrg.orgId, sourceType: "bill_payment", sourceId: billId },
      select: { paymentMethod: true },
    });
    expect(journal.paymentMethod).toBe("cheque");
  });
```

Append the invoice twin to `tests/invoice-deposit-account.test.ts` (inside the `payInvoice` describe, reusing its helpers):

```ts
  it("stores the payment method on the payment journal", async () => {
    const invoiceId = await approvedInvoiceId();

    await payInvoice(prisma, testOrg.orgId, testOrg.userId, invoiceId, undefined, undefined, "cash");

    const journal = await prisma.journal.findFirstOrThrow({
      where: { organizationId: testOrg.orgId, sourceType: "invoice_payment", sourceId: invoiceId },
      select: { paymentMethod: true },
    });
    expect(journal.paymentMethod).toBe("cash");
  });
```

Run both files → FAIL (extra args rejected / column never written).

- [ ] **Step 3: Implement in `documents.ts`**

1. Near `VatTreatment` (line 47) add:

```ts
export type PaymentMethod = "cash" | "cheque" | "bank_transfer";
```

2. `payBill`: add final param `paymentMethod?: PaymentMethod` and include `paymentMethod: paymentMethod ?? null,` in the `tx.journal.create` data (next to `sourceType`).
3. `payInvoice`: add final param `paymentMethod?: PaymentMethod` after `depositAccountId` and include the same field in its `tx.journal.create` data.

Run the two test files → PASS.

- [ ] **Step 4: Thread through actions and UI**

Actions:

```ts
// app/(dashboard)/purchases/actions.ts
export async function payBillDocument(
  billId: string,
  paymentAccountId?: string,
  paymentMethod?: PaymentMethod
) {
  const workspace = await requireAccountantRole();
  const result = await payBill(
    prisma,
    workspace.organizationId,
    workspace.userId,
    billId,
    paymentAccountId,
    paymentMethod
  );
  revalidateBillViews();
  return result;
}
```

```ts
// app/(dashboard)/sales/invoices/actions.ts
export async function payInvoiceDocument(
  invoiceId: string,
  amountMinor?: number,
  depositAccountId?: string,
  paymentMethod?: PaymentMethod
) {
  const workspace = await requireAccountantRole();
  const result = await payInvoice(
    prisma,
    workspace.organizationId,
    workspace.userId,
    invoiceId,
    amountMinor ? BigInt(amountMinor) : undefined,
    depositAccountId,
    paymentMethod
  );
  revalidateInvoiceViews();
  return result;
}
```

(import `type PaymentMethod` from `@/lib/accounting/documents` in both.)

UI — bill side: in `components/purchases/pay-bill-dialog.tsx` add below the bank select:

```tsx
const [paymentMethod, setPaymentMethod] = useState<"cash" | "cheque" | "bank_transfer">("bank_transfer");
```

```tsx
<div className="pt-3">
  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Payment method</label>
  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
    <SelectTrigger className="h-10 w-full bg-white"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="bank_transfer">Bank transfer</SelectItem>
      <SelectItem value="cash">Cash</SelectItem>
      <SelectItem value="cheque">Cheque</SelectItem>
    </SelectContent>
  </Select>
</div>
```

Extend the dialog's `onConfirm` prop to `(billId, paymentAccountId?, paymentMethod?)` and pass `paymentMethod` in `handleConfirm`. Update `use-purchases.ts` pay mutation input to `{ id, paymentAccountId?, paymentMethod? }` and `payBill(id, paymentAccountId?, paymentMethod?)`; update the `purchases.tsx` `onConfirm` passthrough.

UI — invoice side: in `components/sales/view-invoice-dialog.tsx` add the same method state + select inside the Record Payment box (below "Deposit into"), extend `onRecordPayment` to `(invoiceId, amountMinor, depositAccountId?, paymentMethod?)`, pass it at line 163. Then follow the `depositAccountId` threading (grep for `onRecordPayment` in `components/sales/invoices.tsx` and the pay call in `components/sales/use-invoices.ts`) and add the fourth argument end-to-end into `payInvoiceDocument`.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck`; `pnpm vitest run tests/bill-payment-account.test.ts tests/invoice-deposit-account.test.ts` → PASS.
Manual: record an invoice payment as "Cheque" → `select payment_method from journals where source_type = 'invoice_payment' order by created_at desc limit 1` → `cheque`. Same for a bill.

- [ ] **Step 6: CHECKPOINT** — stop for user review/commit.

---

### Task 11: Shipping fees on invoices and bills

Design: shipping is an ordinary **document line** posted to a dedicated system account, NOT a new schema column. This keeps VAT treatment, journal posting, discounts, printing, and reports working with zero changes to the posting engine — a UK-correct choice since delivery charges carry VAT like the goods. A server action ensures the account exists on demand.

**Files:**
- Modify: `lib/accounting/chart-accounts.ts` (add `ensureShippingAccount`)
- Modify: `app/(dashboard)/sales/invoices/actions.ts`, `app/(dashboard)/purchases/actions.ts` (thin actions)
- Modify: `components/sales/add-invoice-dialog.tsx`, `components/purchases/add-bill-dialog.tsx` ("Add shipping" button)
- Test: `tests/shipping-account.test.ts` (create)

**Interfaces:**
- Consumes: `resolveOrCreateSystemAccount(tx, organizationId, { code, name, accountType, reportCategory })` (`lib/accounting/documents.ts:504`).
- Produces: `ensureShippingAccount(prisma, organizationId, kind: "income" | "expense")` returning `{ id, code, name }`; actions `ensureInvoiceShippingAccount()` / `ensureBillShippingAccount()`.

**Account codes:** shipping income `4900` ("Shipping Income", REVENUE / OTHER_INCOME) and shipping cost `5900` ("Shipping & Delivery", EXPENSE / EXPENSE). Before implementing, check `lib/accounting/account-templates.ts` (and the `account_templates` seed) — if either code is already claimed by a template with a different meaning, pick the nearest free code in the same range and use it consistently.

- [ ] **Step 1: Failing test**

```ts
// tests/shipping-account.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { ensureShippingAccount } from "@/lib/accounting/chart-accounts";

import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

let testOrg: TestOrg;

beforeEach(async () => {
  testOrg = await createTestOrg();
});

afterEach(async () => {
  await dropTestOrg(testOrg.orgId);
});

describe("ensureShippingAccount", () => {
  it("creates the shipping income account once and is idempotent", async () => {
    const first = await ensureShippingAccount(prisma, testOrg.orgId, "income");
    const second = await ensureShippingAccount(prisma, testOrg.orgId, "income");

    expect(first.id).toBe(second.id);
    const count = await prisma.chartAccount.count({
      where: { organizationId: testOrg.orgId, code: first.code },
    });
    expect(count).toBe(1);
  });

  it("creates a shipping expense account for bills", async () => {
    const account = await ensureShippingAccount(prisma, testOrg.orgId, "expense");
    const row = await prisma.chartAccount.findFirstOrThrow({
      where: { id: account.id, organizationId: testOrg.orgId },
    });
    expect(row.accountType).toBe("EXPENSE");
  });
});
```

Run: `pnpm vitest run tests/shipping-account.test.ts` → FAIL (function missing).

- [ ] **Step 2: Implement in `lib/accounting/chart-accounts.ts`**

```ts
import { resolveOrCreateSystemAccount } from "@/lib/accounting/documents";

// Shipping is modelled as an ordinary document line against these accounts so
// VAT, posting, and reports need no special cases. Codes chosen outside the
// starter-template ranges — verify against account-templates before changing.
const SHIPPING_ACCOUNTS = {
  income: {
    code: "4900",
    name: "Shipping Income",
    accountType: "REVENUE",
    reportCategory: "OTHER_INCOME",
  },
  expense: {
    code: "5900",
    name: "Shipping & Delivery",
    accountType: "EXPENSE",
    reportCategory: "EXPENSE",
  },
} as const;

export async function ensureShippingAccount(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  kind: keyof typeof SHIPPING_ACCOUNTS
) {
  const target = SHIPPING_ACCOUNTS[kind];
  const id = await resolveOrCreateSystemAccount(prisma, organizationId, {
    code: target.code,
    name: target.name,
    accountType: target.accountType as AccountType,
    reportCategory: target.reportCategory as AccountReportCategory,
  });
  return { id, code: target.code, name: target.name };
}
```

Note: `resolveOrCreateSystemAccount`'s first parameter is a `Tx` — check its actual signature at `documents.ts:504`; if it only accepts a transaction client, wrap: `prisma.$transaction((tx) => resolveOrCreateSystemAccount(tx, ...))`, or pass `prisma` directly if the `Tx` type structurally accepts it (the existing test `tests/accounting/resolve-or-create.test.ts` shows the working call form — mirror it).

Run: `pnpm vitest run tests/shipping-account.test.ts` → PASS.

- [ ] **Step 3: Server actions**

`app/(dashboard)/sales/invoices/actions.ts`:

```ts
export async function ensureInvoiceShippingAccount() {
  const workspace = await requireAccountantRole();
  const account = await ensureShippingAccount(prisma, workspace.organizationId, "income");
  revalidateInvoiceViews();
  return account;
}
```

`app/(dashboard)/purchases/actions.ts` — same with `"expense"` and `revalidateBillViews()`, named `ensureBillShippingAccount`. Import `ensureShippingAccount` in both.

- [ ] **Step 4: "Add shipping" buttons**

`components/sales/add-invoice-dialog.tsx` — next to the "Add Line Item" button (line 978-991), add:

```tsx
<Button
  type="button"
  variant="outline"
  className="bg-white hover:bg-slate-50"
  onClick={async () => {
    const account = await ensureInvoiceShippingAccount();
    await queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
    setForm((current: any) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          ...emptyLine(accounts, taxRates),
          accountId: account.id,
          description: "Shipping",
        },
      ],
    }));
  }}
>
  <Plus className="mr-2 size-4" />
  Add shipping
</Button>
```

(import `ensureInvoiceShippingAccount` from the actions file; if Task 7 landed, call `emptyLine(accounts, taxRates, vatRegistered)`.)

`components/purchases/add-bill-dialog.tsx` — same button beside its "Add Line Item" (line 702-715) using `ensureBillShippingAccount` and `queryKeys.billWorkspace`.

The user then types the shipping amount/qty and picks the VAT code exactly like any other line — which is the correct UK treatment.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck`; `pnpm vitest run tests/shipping-account.test.ts` → PASS.
Manual: invoice → "Add shipping" → a "Shipping" line appears mapped to `4900 - Shipping Income` (visible in the account select); enter £10 with vat_20 → totals include it; approve → journal posts shipping to 4900. Same for a bill against `5900`.

- [ ] **Step 6: CHECKPOINT** — stop for user review/commit.

---

### Task 12: Outstanding transactions panel when selecting a customer/supplier

Show the contact's unpaid posted documents inside the create form (the gap is also noted in `docs/priority/ledger-correctness/invoice-status-outstanding-display.md` — read it first; if it prescribes a specific approach, follow it over this task's sketch).

**Files:**
- Test: `tests/contact-outstanding.test.ts` (create)
- Modify: `lib/accounting/documents.ts` (add `listContactOutstanding`)
- Modify: `app/(dashboard)/sales/invoices/actions.ts` (+`getCustomerOutstanding`), `app/(dashboard)/purchases/actions.ts` (+`getSupplierOutstanding`)
- Create: `components/shared/outstanding-transactions.tsx`
- Modify: `components/sales/add-invoice-dialog.tsx`, `components/purchases/add-bill-dialog.tsx`

**Interfaces:**
- Consumes: `getAmountPaidMap` from `lib/accounting/payments.ts` (read its exact signature at lines 10-34 before use — it sums payment journals per document).
- Produces:

```ts
export type OutstandingDocument = {
  id: string;
  documentNo: string;
  issueDate: string;
  dueDate: string | null;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
};
export async function listContactOutstanding(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  contactId: string,
  kind: "invoice" | "bill"
): Promise<OutstandingDocument[]>
```

- [ ] **Step 1: Failing test**

```ts
// tests/contact-outstanding.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  approveBill,
  approveInvoice,
  listContactOutstanding,
  payBill,
  payInvoice,
  saveBillDraft,
  saveInvoiceDraft,
  type DocumentDraftInput,
} from "@/lib/accounting/documents";

import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

let testOrg: TestOrg;

beforeEach(async () => {
  testOrg = await createTestOrg();
});

afterEach(async () => {
  await dropTestOrg(testOrg.orgId);
});

async function accountId(accountType: "REVENUE" | "EXPENSE"): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: testOrg.orgId, accountType },
    select: { id: true },
  });
  return row.id;
}

function draft(contactId: string, lineAccountId: string, unitPrice: string): DocumentDraftInput {
  return {
    contactId,
    contactName: "",
    documentNo: `DOC-${Math.random().toString(36).slice(2, 8)}`,
    issueDate: "2026-07-01",
    dueDate: "",
    currency: "GBP",
    lines: [
      { accountId: lineAccountId, description: "x", quantity: "1.00", unitPrice, taxCode: "no_vat" },
    ],
  };
}

describe("listContactOutstanding", () => {
  it("returns only unpaid posted invoices with balances (drafts and paid excluded)", async () => {
    const revenueId = await accountId("REVENUE");

    // draft — excluded
    await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, draft(testOrg.customerId, revenueId, "10.00"));

    // approved unpaid — included
    const unpaidId = await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, draft(testOrg.customerId, revenueId, "50.00"));
    await approveInvoice(prisma, testOrg.orgId, testOrg.userId, unpaidId);

    // approved then fully paid — excluded
    const paidId = await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, draft(testOrg.customerId, revenueId, "30.00"));
    await approveInvoice(prisma, testOrg.orgId, testOrg.userId, paidId);
    await payInvoice(prisma, testOrg.orgId, testOrg.userId, paidId);

    const outstanding = await listContactOutstanding(prisma, testOrg.orgId, testOrg.customerId, "invoice");

    expect(outstanding).toHaveLength(1);
    expect(outstanding[0].id).toBe(unpaidId);
    expect(outstanding[0].balanceMinor).toBe(5000);
  });

  it("returns approved unpaid bills only", async () => {
    const expenseId = await accountId("EXPENSE");

    const unpaidBill = await saveBillDraft(prisma, testOrg.orgId, testOrg.userId, draft(testOrg.supplierId, expenseId, "40.00"));
    await approveBill(prisma, testOrg.orgId, testOrg.userId, unpaidBill);

    const paidBill = await saveBillDraft(prisma, testOrg.orgId, testOrg.userId, draft(testOrg.supplierId, expenseId, "20.00"));
    await approveBill(prisma, testOrg.orgId, testOrg.userId, paidBill);
    await payBill(prisma, testOrg.orgId, testOrg.userId, paidBill);

    const outstanding = await listContactOutstanding(prisma, testOrg.orgId, testOrg.supplierId, "bill");

    expect(outstanding).toHaveLength(1);
    expect(outstanding[0].id).toBe(unpaidBill);
    expect(outstanding[0].balanceMinor).toBe(4000);
  });
});
```

Run → FAIL (function missing).

- [ ] **Step 2: Implement `listContactOutstanding`**

Add to `lib/accounting/documents.ts` (near `getDocumentOptions`). Invoices: `status IN (APPROVED, SENT)`, balance = `totalMinor - paid` from `getAmountPaidMap`, keep rows with balance > 0. Bills: `status = APPROVED` (bills are binary-paid, so approved == outstanding; paid = 0).

```ts
export type OutstandingDocument = {
  id: string;
  documentNo: string;
  issueDate: string;
  dueDate: string | null;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
};

export async function listContactOutstanding(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  contactId: string,
  kind: "invoice" | "bill"
): Promise<OutstandingDocument[]> {
  if (kind === "bill") {
    const bills = await prisma.bill.findMany({
      where: { organizationId, contactId, status: BillStatus.APPROVED },
      orderBy: { issueDate: "asc" },
      select: { id: true, invoiceNo: true, issueDate: true, dueDate: true, totalMinor: true },
    });
    return bills.map((bill) => ({
      id: bill.id,
      documentNo: bill.invoiceNo,
      issueDate: bill.issueDate.toISOString().slice(0, 10),
      dueDate: bill.dueDate ? bill.dueDate.toISOString().slice(0, 10) : null,
      totalMinor: Number(bill.totalMinor),
      paidMinor: 0,
      balanceMinor: Number(bill.totalMinor),
    }));
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      contactId,
      status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
    },
    orderBy: { issueDate: "asc" },
    select: { id: true, invoiceNo: true, issueDate: true, dueDate: true, totalMinor: true },
  });

  // getAmountPaidMap sums posted invoice_payment journals per invoice — read
  // lib/accounting/payments.ts:10-34 and call it with its exact signature.
  const paidMap = await getAmountPaidMap(
    prisma,
    organizationId,
    invoices.map((invoice) => invoice.id)
  );

  return invoices
    .map((invoice) => {
      const totalMinor = Number(invoice.totalMinor);
      const paidMinor = Number(paidMap.get(invoice.id) ?? 0);
      return {
        id: invoice.id,
        documentNo: invoice.invoiceNo,
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
        totalMinor,
        paidMinor,
        balanceMinor: totalMinor - paidMinor,
      };
    })
    .filter((row) => row.balanceMinor > 0);
}
```

(Adjust the `getAmountPaidMap` call — signature, return shape (Map vs Record), import — to what `lib/accounting/payments.ts` actually exports. Add the import at the top of `documents.ts` if not present; check for circular-import issues — if `payments.ts` imports from `documents.ts`, inline the same journal-sum query here instead.)

Run: `pnpm vitest run tests/contact-outstanding.test.ts` → PASS.

- [ ] **Step 3: Server actions**

```ts
// app/(dashboard)/sales/invoices/actions.ts
export async function getCustomerOutstanding(contactId: string) {
  const workspace = await requireAccountingWorkspace();
  return listContactOutstanding(prisma, workspace.organizationId, contactId, "invoice");
}
```

```ts
// app/(dashboard)/purchases/actions.ts
export async function getSupplierOutstanding(contactId: string) {
  const workspace = await requireAccountingWorkspace();
  return listContactOutstanding(prisma, workspace.organizationId, contactId, "bill");
}
```

- [ ] **Step 4: Shared panel component**

```tsx
// components/shared/outstanding-transactions.tsx
"use client";

import { useQuery } from "@tanstack/react-query";

import { formatGbpMinor } from "@/lib/accounting/money";
import type { OutstandingDocument } from "@/lib/accounting/documents";

type OutstandingTransactionsProps = {
  contactId: string;
  kind: "invoice" | "bill";
  fetcher: (contactId: string) => Promise<OutstandingDocument[]>;
};

export function OutstandingTransactions({ contactId, kind, fetcher }: OutstandingTransactionsProps) {
  const { data, isPending } = useQuery({
    queryKey: ["contact-outstanding", kind, contactId],
    queryFn: () => fetcher(contactId),
    enabled: Boolean(contactId),
  });

  if (!contactId || isPending || !data || data.length === 0) return null;

  const totalBalance = data.reduce((sum, row) => sum + row.balanceMinor, 0);
  const noun = kind === "invoice" ? "invoice" : "bill";

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Outstanding {noun}s
        </span>
        <span className="text-xs font-bold text-amber-800">{formatGbpMinor(totalBalance)}</span>
      </div>
      <ul className="mt-2 space-y-1">
        {data.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 text-xs text-amber-900">
            <span className="truncate font-medium">
              {row.documentNo}
              {row.dueDate ? <span className="ml-2 font-normal text-amber-700">due {row.dueDate}</span> : null}
            </span>
            <span className="shrink-0 font-semibold">{formatGbpMinor(row.balanceMinor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Wire into both forms**

`components/sales/add-invoice-dialog.tsx` — directly below the Billing Address block (after line 621):

```tsx
{form.contactId && (
  <OutstandingTransactions
    contactId={form.contactId}
    kind="invoice"
    fetcher={getCustomerOutstanding}
  />
)}
```

with imports `OutstandingTransactions` and `getCustomerOutstanding`.

`components/purchases/add-bill-dialog.tsx` — below the Supplier Address block (after line 442), `kind="bill"` and `fetcher={getSupplierOutstanding}`.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck`; `pnpm vitest run tests/contact-outstanding.test.ts` → PASS.
Manual: approve an invoice for a customer, leave unpaid → create a new invoice, select that customer → amber "Outstanding invoices" panel lists it with the balance; paying it makes the panel disappear on next open.

- [ ] **Step 7: CHECKPOINT** — stop for user review/commit.

---

### Task 13: Editable customer/supplier details inside the forms

Today only the per-document address snapshot is editable (`add-invoice-dialog.tsx:583-621`). Add an "Edit contact" panel that updates the actual Contact record (name, email, phone, terms) and refreshes the workspace.

**Files:**
- Test: `tests/contact-update.test.ts` (create)
- Create: `lib/accounting/contacts.ts`
- Modify: `app/(dashboard)/sales/invoices/actions.ts` (+`updateCustomerDetails`), `app/(dashboard)/purchases/actions.ts` (+`updateSupplierDetails`)
- Create: `components/shared/edit-contact-panel.tsx`
- Modify: `components/sales/add-invoice-dialog.tsx`, `components/purchases/add-bill-dialog.tsx`

**Interfaces:**
- Produces:

```ts
export type ContactDetailsPatch = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  paymentTermsDays?: number;
};
export async function updateContactRecord(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  contactId: string,
  patch: ContactDetailsPatch
): Promise<ContactSummary>
```

- [ ] **Step 1: Failing test**

```ts
// tests/contact-update.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { updateContactRecord } from "@/lib/accounting/contacts";

import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

let testOrg: TestOrg;

beforeEach(async () => {
  testOrg = await createTestOrg();
});

afterEach(async () => {
  await dropTestOrg(testOrg.orgId);
});

describe("updateContactRecord", () => {
  it("updates the contact's details", async () => {
    const updated = await updateContactRecord(
      prisma, testOrg.orgId, testOrg.userId, testOrg.customerId,
      { email: "billing@acme.test", phone: "+44 1234 567890", paymentTermsDays: 14, billingAddress: "1 High St" }
    );

    expect(updated.paymentTermsDays).toBe(14);
    const row = await prisma.contact.findFirstOrThrow({
      where: { id: testOrg.customerId, organizationId: testOrg.orgId },
    });
    expect(row.email).toBe("billing@acme.test");
    expect(row.billingAddress).toBe("1 High St");
  });

  it("rejects a contact belonging to another organization", async () => {
    const otherOrg = await createTestOrg();
    try {
      await expect(
        updateContactRecord(prisma, testOrg.orgId, testOrg.userId, otherOrg.customerId, { email: "x@y.z" })
      ).rejects.toThrow();
    } finally {
      await dropTestOrg(otherOrg.orgId);
    }
  });

  it("rejects blanking the name", async () => {
    await expect(
      updateContactRecord(prisma, testOrg.orgId, testOrg.userId, testOrg.customerId, { name: "   " })
    ).rejects.toThrow(/name/i);
  });
});
```

Run → FAIL (module missing).

- [ ] **Step 2: Implement `lib/accounting/contacts.ts`**

```ts
import { AuditAction } from "@prisma/client";

import type { ExtendedPrismaClient } from "@/lib/prisma"; // match documents.ts's import
import type { ContactSummary } from "@/lib/accounting/documents";

export type ContactDetailsPatch = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  paymentTermsDays?: number;
};

export async function updateContactRecord(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  contactId: string,
  patch: ContactDetailsPatch
): Promise<ContactSummary> {
  const current = await prisma.contact.findFirstOrThrow({
    where: { id: contactId, organizationId },
    select: { id: true, name: true, email: true, phone: true, billingAddress: true, paymentTermsDays: true, contactType: true },
  });

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Contact name is required.");
    data.name = name;
  }
  if (patch.email !== undefined) data.email = patch.email?.trim() || null;
  if (patch.phone !== undefined) data.phone = patch.phone?.trim() || null;
  if (patch.billingAddress !== undefined) data.billingAddress = patch.billingAddress?.trim() || null;
  if (patch.paymentTermsDays !== undefined) {
    data.paymentTermsDays = Math.max(0, Math.round(patch.paymentTermsDays));
  }
  if (Object.keys(data).length === 0) throw new Error("Nothing to update.");

  const updated = await prisma.contact.update({
    where: { id: current.id },
    data,
    select: { id: true, name: true, contactType: true, paymentTermsDays: true, billingAddress: true },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId,
      actorUserId,
      entityType: "contact",
      entityId: current.id,
      action: AuditAction.UPDATE,
      before: { name: current.name, email: current.email, phone: current.phone, billingAddress: current.billingAddress, paymentTermsDays: current.paymentTermsDays },
      after: data,
    },
  });

  return {
    id: updated.id,
    name: updated.name,
    contactType: updated.contactType.toLowerCase(),
    paymentTermsDays: updated.paymentTermsDays,
    billingAddress: updated.billingAddress ?? null,
  };
}
```

Run: `pnpm vitest run tests/contact-update.test.ts` → PASS.

- [ ] **Step 3: Server actions**

`app/(dashboard)/sales/invoices/actions.ts`:

```ts
export async function updateCustomerDetails(contactId: string, patch: ContactDetailsPatch) {
  const workspace = await requireAccountantRole();
  const contact = await updateContactRecord(prisma, workspace.organizationId, workspace.userId, contactId, patch);
  revalidateInvoiceViews();
  return contact;
}
```

`app/(dashboard)/purchases/actions.ts` — `updateSupplierDetails`, same body with `revalidateBillViews()`. Import `updateContactRecord, type ContactDetailsPatch` in both.

- [ ] **Step 4: Edit-contact panel component**

```tsx
// components/shared/edit-contact-panel.tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ContactDetailsPatch } from "@/lib/accounting/contacts";
import type { ContactSummary } from "@/lib/accounting/documents";

type EditContactPanelProps = {
  contact: ContactSummary;
  noun: "customer" | "supplier";
  onSave: (contactId: string, patch: ContactDetailsPatch) => Promise<ContactSummary>;
  onSaved: (contact: ContactSummary) => void;
  onClose: () => void;
};

export function EditContactPanel({ contact, noun, onSave, onSaved, onClose }: EditContactPanelProps) {
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState(contact.billingAddress ?? "");
  const [terms, setTerms] = useState(String(contact.paymentTermsDays));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(contact.name);
    setAddress(contact.billingAddress ?? "");
    setTerms(String(contact.paymentTermsDays));
  }, [contact]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await onSave(contact.id, {
        name,
        email: email || null,
        phone: phone || null,
        billingAddress: address || null,
        paymentTermsDays: Number(terms) || 0,
      });
      toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} details updated.`);
      onSaved(updated);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update details.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100";

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3 sm:grid-cols-2 animate-in slide-in-from-top-2">
      <label className="text-xs font-semibold text-slate-600">
        Name
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-xs font-semibold text-slate-600">
        Payment terms (days)
        <input className={inputClass} inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value.replace(/[^0-9]/g, ""))} />
      </label>
      <label className="text-xs font-semibold text-slate-600">
        Email
        <input className={inputClass} type="email" placeholder="Leave blank to keep unchanged" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="text-xs font-semibold text-slate-600">
        Phone
        <input className={inputClass} placeholder="Leave blank to keep unchanged" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
        Billing address
        <textarea className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="button" size="sm" disabled={saving || !name.trim()} onClick={handleSave}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Save {noun} details
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
```

Caveat: email/phone start blank because `ContactSummary` doesn't carry them — blank means "keep unchanged" (the patch sends `null` only when the user types then clears; acceptable v1). If the user wants prefilled email/phone, extend `ContactSummary` + `getDocumentOptions` `select` to include them — note this to the user at the checkpoint.

- [ ] **Step 5: Wire into both forms**

`components/sales/add-invoice-dialog.tsx` — in the Billing Address block header (next to the "Edit" address toggle, line 598-604), add an "Edit contact" button and panel:

```tsx
const [isEditingContact, setIsEditingContact] = useState(false);
```

```tsx
<button
  type="button"
  className="text-xs font-semibold text-blue-600 hover:underline"
  onClick={() => setIsEditingContact((v) => !v)}
>
  Edit contact
</button>
```

and below the block:

```tsx
{isEditingContact && currentContact && (
  <EditContactPanel
    contact={currentContact}
    noun="customer"
    onSave={updateCustomerDetails}
    onSaved={(updated) => {
      setForm((cur: any) => ({
        ...cur,
        contactName: updated.name,
        billingAddress: updated.billingAddress ?? "",
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
    }}
    onClose={() => setIsEditingContact(false)}
  />
)}
```

(`currentContact` already exists at line 241.)

`components/purchases/add-bill-dialog.tsx` — same wiring in the Supplier Address block with `noun="supplier"`, `onSave={updateSupplierDetails}`, a locally derived `const currentContact = contacts.find((c) => c.id === form.contactId);`, and `queryKeys.billWorkspace`.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck`; `pnpm vitest run tests/contact-update.test.ts` → PASS.
Manual: invoice → select customer → "Edit contact" → change name + terms → save → select clears/re-renders with the new name; the contact row in Customers reflects it.

- [ ] **Step 7: CHECKPOINT + full regression**

Run: `pnpm test` (full suite) and `pnpm typecheck` → all green. Report results to the user for the final commit.
