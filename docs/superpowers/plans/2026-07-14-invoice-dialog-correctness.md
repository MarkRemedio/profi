# Invoice-Dialog Correctness Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the correctness defects in the invoice/bill dialog layer surfaced by the 2026-07-13 invoices audit that are still present in HEAD `00e9ad0` — silent duplicate invoices, corrupted numbering, contact detachment, missing due-date validation, un-voidable paid invoices (plus a latent posting-reversal gap), and a mislabelled "Approve & email" that writes no audit trail.

**Architecture:** The posting engine (`lib/accounting/documents.ts`) is healthy — journals, VAT, org isolation, BigInt money math are correct. Every defect here lives in the *dialog/entry layer* (`components/sales/*`, `app/(dashboard)/sales/invoices/actions.ts`) dropping or faking data, plus two server guards that are missing. Fixes are surgical: add server guards where a testable seam exists (edit-guard, void posting-reversal, sent audit event) with TDD; correct client behaviour where no component-test harness exists and verify by build + the `/verify` skill.

**Tech Stack:** Next.js 16, React 19, Prisma 7 + Postgres, TypeScript, Vitest. Package manager: **pnpm**. Money is `BigInt` minor units. Contacts/invoices are org-scoped.

## Global Constraints

- **Package manager is pnpm** (`pnpm@11.1.1`). Run scripts with `pnpm <script>` / `pnpm exec <bin>`. Never introduce npm/yarn lockfiles.
- **All amounts are minor units as `BigInt`** server-side; never use floats for money.
- **Every DB query must be org-scoped** (`organizationId` in the `where`). Follow the `tenancy:safe` comment convention already in `documents.ts`.
- **Server tests require a running Postgres.** `tests/fixtures.ts` `createTestOrg()`/`dropTestOrg()` hit a real DB. Run them with the project's test DB env configured; if the DB is unavailable, the task is not verifiable — do not mark it passing.
- **No React component-test harness exists** (no `@testing-library/react` in `package.json`). Client-only changes are verified by `pnpm typecheck && pnpm lint && pnpm build` **and** the `/verify` skill (drive the dialog in a browser). Do not fabricate red-first component tests.
- **Invoice statuses:** `DRAFT | APPROVED | SENT | VOID` (`prisma/schema.prisma` `InvoiceStatus`). There is **no** `PAID` status — "paid" is derived from `amountPaidMinor >= totalMinor`.
- **Test single-file command:** `pnpm exec vitest run tests/<file>.test.ts`. Full suite: `pnpm test`.
- **Commit after each task** (frequent commits). The user commits/pushes manually per their preference — create the commit, do not push.
- **Shipping is already fixed** (commit `0a9bb87`, `withShippingLine` + `tests/invoice-shipping.test.ts`). It is **not** in scope here — do not touch it.

---

## File Structure

- `lib/accounting/documents.ts` — add the non-draft edit guard in `saveInvoiceDraft`; widen the void posting-reversal gate in `voidInvoice`; add a testable `markInvoiceSent()` lib function. This file is large but established; follow its existing patterns, do not restructure.
- `app/(dashboard)/sales/invoices/actions.ts` — route the "sent" transition through the new `markInvoiceSent()` so it writes an audit event.
- `components/sales/add-invoice-dialog.tsx` — remove the `Date.now()` invoice-number fallback; stop the customer-name box detaching the contact; require a due date on non-cash invoices; relabel "Approve & email".
- `tests/invoice-edit-guard.test.ts` (new) — non-draft edit throws.
- `tests/invoice-numbering-contract.test.ts` (new) — empty `documentNo` → gapless sequential assignment (regression guard for the client fix).
- `tests/invoice-void-paid.test.ts` (new) — voiding a `SENT` invoice reverses its posting journal.
- `tests/invoice-mark-sent.test.ts` (new) — `markInvoiceSent` flips status and writes an audit event.

---

## Task 1: Guard against editing a non-draft invoice (server, TDD)

**Bug:** In `saveInvoiceDraft`, `existingInvoice` is looked up with `status: InvoiceStatus.DRAFT` filter (`documents.ts:1064-1069`). When `input.id` points at an APPROVED/SENT/VOID invoice, the lookup returns `null`, control falls into the `else` INSERT branch (`documents.ts:1099-1124`), and a **silent duplicate draft** is created (logged misleadingly as an UPDATE). Fix: if `input.id` refers to an existing non-draft invoice, throw instead of inserting.

**Files:**
- Modify: `lib/accounting/documents.ts` (inside `saveInvoiceDraft`, immediately before the `existingInvoice` lookup at line 1064)
- Test: `tests/invoice-edit-guard.test.ts`

**Interfaces:**
- Consumes: `saveInvoiceDraft(prisma, organizationId, actorUserId, input: DocumentDraftInput)`, `approveInvoice(prisma, organizationId, actorUserId, invoiceId)` — both already exported from `lib/accounting/documents.ts`.
- Produces: no new signature; `saveInvoiceDraft` now rejects with an Error whose message matches `/cannot be edited/i` when `input.id` is a non-draft invoice.

- [ ] **Step 1: Write the failing test**

Create `tests/invoice-edit-guard.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  approveInvoice,
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

async function revenueAccountId(orgId: string): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: orgId, accountType: "REVENUE", reportCategory: "SALES" },
    select: { id: true },
  });
  return row.id;
}

function draft(orgAccountId: string): DocumentDraftInput {
  return {
    contactName: "",
    contactId: "", // set by caller
    documentNo: "",
    issueDate: "2026-05-10",
    dueDate: "2026-06-10",
    currency: "GBP",
    amountsAre: "exclusive",
    lines: [
      { accountId: orgAccountId, description: "Goods", quantity: "1.00", unitPrice: "100.00", taxCode: "vat_20" },
    ],
  };
}

describe("saveInvoiceDraft non-draft edit guard", () => {
  it("throws when editing an approved invoice instead of creating a duplicate", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const base = { ...draft(accountId), contactId: testOrg.customerId };

    const invoiceId = await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, base);
    await approveInvoice(prisma, testOrg.orgId, testOrg.userId, invoiceId);

    await expect(
      saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, { ...base, id: invoiceId })
    ).rejects.toThrow(/cannot be edited/i);

    // And no duplicate was created.
    const count = await prisma.invoice.count({ where: { organizationId: testOrg.orgId } });
    expect(count).toBe(1);
  });

  it("still allows editing a genuine draft", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const base = { ...draft(accountId), contactId: testOrg.customerId };

    const invoiceId = await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, base);
    const sameId = await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, {
      ...base,
      id: invoiceId,
      lines: [{ accountId, description: "Goods v2", quantity: "2.00", unitPrice: "100.00", taxCode: "vat_20" }],
    });

    expect(sameId).toBe(invoiceId);
    const count = await prisma.invoice.count({ where: { organizationId: testOrg.orgId } });
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/invoice-edit-guard.test.ts`
Expected: the first test FAILS (no throw — a duplicate is created, so `rejects.toThrow` fails and/or `count` is 2). The second test passes.

- [ ] **Step 3: Write minimal implementation**

In `lib/accounting/documents.ts`, inside `saveInvoiceDraft`, insert this block **immediately before** the `const existingInvoice = input.id ? ...` lookup (currently line 1064):

```ts
// A document may only be edited while it is a draft. If the caller passes an id
// that resolves to a non-draft invoice, the historic code silently fell through
// to the INSERT branch and created a duplicate draft. Reject instead.
if (input.id) {
  const current = await tx.invoice.findFirst({
    where: { id: input.id, organizationId },
    select: { status: true },
  });
  if (current && current.status !== InvoiceStatus.DRAFT) {
    throw new Error(
      `Invoice cannot be edited once it is ${current.status.toLowerCase()}. Revert it to draft first.`
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/invoice-edit-guard.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Verify no regression in existing invoice tests**

Run: `pnpm exec vitest run tests/invoice-shipping.test.ts tests/invoice-vat-treatment.test.ts tests/invoice-balance-vat.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/accounting/documents.ts tests/invoice-edit-guard.test.ts
git commit -m "fix(invoices): reject editing a non-draft invoice instead of duplicating"
```

---

## Task 2: Stop the client minting invoice numbers from `Date.now()` (client + server-contract test)

**Bug:** When the invoice-number box is blank, `handleSubmit` fabricates `INV-${Date.now().toString().slice(-6)}` (`add-invoice-dialog.tsx:359-361`) and sends it as a non-empty `documentNo`. The server honours any non-empty `documentNo` verbatim, so the gapless `nextInvoiceNumber` path is bypassed and the fabricated number pollutes `computeNextNumber`'s max, permanently gapping the sequence. Fix: send an empty `documentNo` when the box is blank; the server already assigns the correct sequential number in that case (`documents.ts:1054-1055`).

**Files:**
- Modify: `components/sales/add-invoice-dialog.tsx:359-383` (remove the `Date.now()` fallback; fix the localStorage key that depended on it)
- Test: `tests/invoice-numbering-contract.test.ts` (regression guard for the server contract the fix relies on)

**Interfaces:**
- Consumes: `saveInvoiceDraft(prisma, organizationId, actorUserId, input)` with `input.documentNo === ""`.
- Produces: the client now submits `documentNo: form.documentNo.trim()` (may be `""`).

- [ ] **Step 1: Write the server-contract test**

Create `tests/invoice-numbering-contract.test.ts`. This locks the behaviour the client fix depends on (empty `documentNo` → gapless sequential). It also proves the sequence is not polluted by a later blank save.

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { saveInvoiceDraft, type DocumentDraftInput } from "@/lib/accounting/documents";

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

function blankNumberedDraft(accountId: string, customerId: string): DocumentDraftInput {
  return {
    contactName: "",
    contactId: customerId,
    documentNo: "", // blank => server assigns
    issueDate: "2026-05-10",
    dueDate: "2026-06-10",
    currency: "GBP",
    amountsAre: "exclusive",
    lines: [
      { accountId, description: "Goods", quantity: "1.00", unitPrice: "100.00", taxCode: "vat_20" },
    ],
  };
}

describe("blank invoice number => gapless sequential assignment", () => {
  it("assigns INV-0001, INV-0002 on successive blank saves", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);

    const firstId = await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, blankNumberedDraft(accountId, testOrg.customerId));
    const secondId = await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, blankNumberedDraft(accountId, testOrg.customerId));

    const first = await prisma.invoice.findFirstOrThrow({ where: { id: firstId }, select: { invoiceNo: true } });
    const second = await prisma.invoice.findFirstOrThrow({ where: { id: secondId }, select: { invoiceNo: true } });

    expect(first.invoiceNo).toBe("INV-0001");
    expect(second.invoiceNo).toBe("INV-0002");
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm exec vitest run tests/invoice-numbering-contract.test.ts`
Expected: PASS immediately — the server already assigns sequential numbers for blank `documentNo`. (This test is a regression guard, not a red-first test: the bug being fixed is on the client, which has no unit harness. State this in the commit body.)

- [ ] **Step 3: Fix the client — remove the `Date.now()` fallback**

In `components/sales/add-invoice-dialog.tsx`, replace lines 359-374:

```tsx
    const isApproving = saveAction.startsWith("approve");

    const finalDocumentNo = form.documentNo.trim() !== "" 
      ? form.documentNo 
      : `INV-${Date.now().toString().slice(-6)}`;

    const submissionData = {
      ...form,
      amountsAre,
      documentNo: finalDocumentNo,
      // Shipping is entered in a dedicated footer field (separate from `form`),
      // so pass it explicitly. The server materialises it as an ordinary line.
      shippingAmount,
      shippingTaxCode,
      status: saveAction === "approve-email" ? "sent" : isApproving ? "approved" : "draft",
      isCashSale,
      depositAccountId: isCashSale ? depositAccountId : null
    } as any;
```

with:

```tsx
    const isApproving = saveAction.startsWith("approve");

    // Leave the number blank when the user did not type one: the server assigns
    // the next gapless sequential INV-#### itself. Never fabricate a number here
    // — a client-minted value pollutes the numbering sequence permanently.
    const trimmedDocumentNo = form.documentNo.trim();

    const submissionData = {
      ...form,
      amountsAre,
      documentNo: trimmedDocumentNo,
      // Shipping is entered in a dedicated footer field (separate from `form`),
      // so pass it explicitly. The server materialises it as an ordinary line.
      shippingAmount,
      shippingTaxCode,
      status: saveAction === "approve-email" ? "sent" : isApproving ? "approved" : "draft",
      isCashSale,
      depositAccountId: isCashSale ? depositAccountId : null
    } as any;
```

- [ ] **Step 4: Fix the localStorage key that referenced `finalDocumentNo`**

In the same file, the extras `localStorage.setItem` (lines 376-383) used `finalDocumentNo`. A blank number would make the key `invoice_extras_` and collide. Replace `finalDocumentNo` in that key with a stable fallback:

```tsx
    localStorage.setItem(`invoice_extras_${trimmedDocumentNo || form.id || "new"}`, JSON.stringify({
      isRecurring: form.isRecurring,
      recurrenceFrequency: form.recurrenceFrequency,
      recurrenceDuration: form.recurrenceDuration,
      linkedItemType: form.linkedItemType,
      inventoryItem: form.inventoryItem,
      quantityMoved: form.quantityMoved,
    }));
```

(Also update the `approve-print-pdf` branch at line 398, `invoiceNo: submissionData.documentNo` — it already reads `submissionData.documentNo`, which is now `trimmedDocumentNo`; no change needed. Confirm there are no other references to `finalDocumentNo` in the file with a search before building.)

- [ ] **Step 5: Verify types, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all succeed; no remaining reference to `finalDocumentNo`.

- [ ] **Step 6: Verify behaviour with the /verify skill**

Use the `/verify` skill to drive the dialog: create an invoice leaving the number blank, save, and confirm the persisted invoice gets the next `INV-####` (not an `INV-######` epoch value). Record the observed number.

- [ ] **Step 7: Commit**

```bash
git add components/sales/add-invoice-dialog.tsx tests/invoice-numbering-contract.test.ts
git commit -m "fix(invoices): send blank invoice number so server assigns gapless sequence

The client fabricated INV-<epoch> for blank numbers, polluting the sequence.
No component-test harness exists; added a server-contract regression test and
verified the dialog via the verify skill."
```

---

## Task 3: Stop the customer-name box detaching the selected contact (client)

**Bug:** The free-text "Customer name" input clears `contactId` to `""` on every keystroke (`add-invoice-dialog.tsx:715-721`). Editing a selected contact's name therefore drops the id, and the server's `resolveContact` falls through to its name-based lookup/create branch (`documents.ts:544-599`), silently creating a **duplicate contact**. A correct rename path already exists via the pencil button + `handleRenameCustomer` (`add-invoice-dialog.tsx:184-204, 692-704`), which keeps `contactId` and calls `updateContact`.

**Fix (decision):** When a contact is selected (`contactId` set), the name box becomes **read-only** — renaming goes through the existing pencil button. When no contact is selected (entering a brand-new customer), the box stays editable and `contactId` stays `""`. This removes the silent-detach path entirely without changing the new-customer flow.

**Files:**
- Modify: `components/sales/add-invoice-dialog.tsx:708-723`

**Interfaces:**
- Consumes/produces: no server change. Client no longer nulls `contactId` from the name box.

- [ ] **Step 1: Apply the fix**

Replace the `Customer name` field (lines 708-723):

```tsx
              <Field>
                <FieldLabel htmlFor="invoice-customer-name">Customer name</FieldLabel>
                <input
                  id="invoice-customer-name"
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  required
                  value={form.contactName}
                  onChange={(event) =>
                    setForm((current: any) => ({
                      ...current,
                      contactId: "",
                      contactName: event.target.value,
                    }))
                  }
                />
              </Field>
```

with:

```tsx
              <Field>
                <FieldLabel htmlFor="invoice-customer-name">Customer name</FieldLabel>
                <input
                  id="invoice-customer-name"
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 read-only:bg-slate-50 read-only:text-slate-500"
                  required
                  // When a contact is selected, the name is read-only: renaming goes
                  // through the pencil button (handleRenameCustomer), which keeps the
                  // contactId and updates the existing contact. Typing here previously
                  // nulled contactId and silently created a duplicate contact.
                  readOnly={!!form.contactId}
                  value={form.contactName}
                  onChange={(event) =>
                    setForm((current: any) => ({
                      ...current,
                      contactName: event.target.value,
                    }))
                  }
                />
                {form.contactId ? (
                  <p className="mt-1 text-xs text-slate-400">
                    Use the edit (pencil) button next to the customer to rename this contact.
                  </p>
                ) : null}
              </Field>
```

- [ ] **Step 2: Verify types, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all succeed.

- [ ] **Step 3: Verify behaviour with the /verify skill**

Use `/verify`: (a) select an existing customer, confirm the name box is read-only and the pencil rename still updates the same contact (no duplicate created — check the contacts list count before/after); (b) with no customer selected, type a brand-new name and save, confirm one new contact is created.

- [ ] **Step 4: Commit**

```bash
git add components/sales/add-invoice-dialog.tsx
git commit -m "fix(invoices): make customer-name read-only when a contact is selected

Typing in the free-text name box nulled contactId on the first keystroke and
created silent duplicate contacts. Renaming now goes through the pencil button."
```

---

## Task 4: Require a due date on non-cash invoices (client)

**Bug:** The due-date input has no `required` attribute and `handleSubmit` has no due-date guard (`add-invoice-dialog.tsx:831-842`, submit guard at 352-355). An empty due date passes through, weakening AR aging. Cash sales legitimately have no due date (the field is replaced by the deposit-account field when `isCashSale`).

**Fix:** Block submit when `dueDate` is empty on a non-cash invoice.

**Files:**
- Modify: `components/sales/add-invoice-dialog.tsx` (submit guard around 352-355; and add `required` to the due-date input at 831-842)

- [ ] **Step 1: Add the submit guard**

In `handleSubmit`, after the existing cash-sale guard (lines 352-355), add:

```tsx
    if (!isCashSale && !form.dueDate) {
      toast.error("Set a due date for this invoice (required for credit terms and AR aging).");
      return;
    }
```

- [ ] **Step 2: Mark the input required for discoverability**

In the due-date `<input>` (line ~836), add the `required` attribute (it only renders when `!isCashSale`, so this is safe):

```tsx
                  <input id="invoice-due-date" type="date"
                    className="..."
                    required
                    value={form.dueDate}
                    onChange={(event) => setForm((current: any) => ({ ...current, dueDate: event.target.value }))}
                  />
```

(Keep the existing className — do not change it; only add `required`.)

- [ ] **Step 3: Verify types, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all succeed.

- [ ] **Step 4: Verify behaviour with the /verify skill**

Use `/verify`: attempt to save a non-cash invoice with the due date cleared → blocked with the toast. Confirm a cash sale (which hides the due-date field) still saves without a due date.

- [ ] **Step 5: Commit**

```bash
git add components/sales/add-invoice-dialog.tsx
git commit -m "feat(invoices): require a due date on non-cash invoices"
```

---

## Task 5: Fix void posting-reversal for SENT invoices, then enable void-of-paid in the UI (server TDD + client)

**Bug (latent, server):** `voidInvoice` reverses the original posting journal only when `invoice.status === InvoiceStatus.APPROVED` (`documents.ts:1875`). A fully-paid invoice that went through "Approve & email" has status **SENT**, so voiding it reverses the payment journals but **skips reversing the sale posting** — leaving revenue/AR/VAT on the books for a voided invoice. **Bug (UI):** the Void action is `disabled` whenever `amountPaidMinor > 0` (`invoices.tsx:923-933`), so paid invoices cannot be voided at all — even though the backend supports reversing payments.

**Fix order matters:** correct the server posting-reversal gate *first* (so enabling the UI is safe), then relax the UI disable.

**Files:**
- Modify: `lib/accounting/documents.ts:1875` (widen the gate to APPROVED or SENT)
- Modify: `components/sales/invoices.tsx:923-933` (allow void when paid; keep Revert-to-draft disabled for paid)
- Test: `tests/invoice-void-paid.test.ts`

**Interfaces:**
- Consumes: `saveInvoiceDraft`, `approveInvoice`, `voidInvoice(prisma, organizationId, actorUserId, invoiceId)` — all exported from `documents.ts`.
- Produces: `voidInvoice` now returns a non-null `journalId` (posting reversal) for a SENT invoice too.

- [ ] **Step 1: Write the failing test**

Create `tests/invoice-void-paid.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  approveInvoice,
  saveInvoiceDraft,
  voidInvoice,
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

async function revenueAccountId(orgId: string): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: orgId, accountType: "REVENUE", reportCategory: "SALES" },
    select: { id: true },
  });
  return row.id;
}

describe("voiding a SENT invoice reverses its posting journal", () => {
  it("reverses the original sale posting when status is SENT", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const draft: DocumentDraftInput = {
      contactName: "",
      contactId: testOrg.customerId,
      documentNo: "",
      issueDate: "2026-05-10",
      dueDate: "2026-06-10",
      currency: "GBP",
      amountsAre: "exclusive",
      lines: [
        { accountId, description: "Goods", quantity: "1.00", unitPrice: "100.00", taxCode: "vat_20" },
      ],
    };

    const invoiceId = await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, draft);
    const approved = await approveInvoice(prisma, testOrg.orgId, testOrg.userId, invoiceId);
    expect(approved.journalId).toBeTruthy();

    // Move it to SENT (as "Approve & email" does).
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "SENT" } });

    const voided = await voidInvoice(prisma, testOrg.orgId, testOrg.userId, invoiceId);

    // The posting journal must have been reversed (non-null journalId), and a
    // reversal journal must reference the original posted journal.
    expect(voided.journalId).toBeTruthy();
    const reversal = await prisma.journal.findFirst({
      where: { organizationId: testOrg.orgId, reversedJournalId: approved.journalId! },
      select: { id: true },
    });
    expect(reversal).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/invoice-void-paid.test.ts`
Expected: FAIL — `voided.journalId` is `null` and no reversal of the posting journal exists, because the gate requires `APPROVED`.

- [ ] **Step 3: Widen the gate**

In `lib/accounting/documents.ts`, change line 1875 from:

```ts
    if (invoice.status === InvoiceStatus.APPROVED && invoice.postedJournalId) {
```

to:

```ts
    if (
      (invoice.status === InvoiceStatus.APPROVED || invoice.status === InvoiceStatus.SENT) &&
      invoice.postedJournalId
    ) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/invoice-void-paid.test.ts`
Expected: PASS.

- [ ] **Step 5: Relax the UI so paid invoices can be voided**

In `components/sales/invoices.tsx`, the Void `DropdownMenuItem` (around lines 929-933) currently has `disabled={!canManage || saving || (invoice.amountPaidMinor || 0) > 0}`. Remove the paid condition from **Void only** (leave Revert-to-draft's paid-guard intact — reverting a paid invoice to draft is not supported). Change the Void item's `disabled` to:

```tsx
                    disabled={!canManage || saving}
```

Leave the Revert-to-draft item's `disabled={!canManage || saving || (invoice.amountPaidMinor || 0) > 0}` unchanged.

- [ ] **Step 6: Verify types, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all succeed.

- [ ] **Step 7: Verify behaviour with the /verify skill**

Use `/verify`: approve + record a full payment on an invoice, then Void it from the row menu → confirm the Void action is enabled, the invoice becomes VOID, and both the payment and the sale posting are reversed (check the journal list / AR balance returns to zero).

- [ ] **Step 8: Commit**

```bash
git add lib/accounting/documents.ts components/sales/invoices.tsx tests/invoice-void-paid.test.ts
git commit -m "fix(invoices): reverse sale posting when voiding a SENT invoice; allow voiding paid invoices"
```

---

## Task 6: Make "Approve & email" honest — relabel and write an audit event (server TDD + client)

**Bug:** "Approve & email" sends no email; it only flips status to SENT via a bare `updateMany` with **no AuditEvent** for the DRAFT→SENT transition (`actions.ts:109-118`), and the client toast claims it was "marked as sent" (`add-invoice-dialog.tsx:388-389`). Per the scope decision, we do **not** build real email now — we relabel the action and close the audit gap. (Real email delivery is a separate future item.)

**Files:**
- Modify: `lib/accounting/documents.ts` (add exported `markInvoiceSent`)
- Modify: `app/(dashboard)/sales/invoices/actions.ts:109-118` (call `markInvoiceSent` instead of bare `updateMany`)
- Modify: `components/sales/add-invoice-dialog.tsx` (relabel the button + toast)
- Test: `tests/invoice-mark-sent.test.ts`

**Interfaces:**
- Produces: `export async function markInvoiceSent(prisma: ExtendedPrismaClient, organizationId: string, actorUserId: string, invoiceId: string): Promise<void>` — flips a non-void invoice to SENT and writes an `AuditEvent`.
- Consumes: `AuditAction` (already imported in `documents.ts`), `InvoiceStatus`.

- [ ] **Step 1: Write the failing test**

Create `tests/invoice-mark-sent.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  approveInvoice,
  markInvoiceSent,
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

async function revenueAccountId(orgId: string): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: orgId, accountType: "REVENUE", reportCategory: "SALES" },
    select: { id: true },
  });
  return row.id;
}

describe("markInvoiceSent", () => {
  it("flips an approved invoice to SENT and writes an audit event", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);
    const draft: DocumentDraftInput = {
      contactName: "",
      contactId: testOrg.customerId,
      documentNo: "",
      issueDate: "2026-05-10",
      dueDate: "2026-06-10",
      currency: "GBP",
      amountsAre: "exclusive",
      lines: [
        { accountId, description: "Goods", quantity: "1.00", unitPrice: "100.00", taxCode: "vat_20" },
      ],
    };

    const invoiceId = await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, draft);
    await approveInvoice(prisma, testOrg.orgId, testOrg.userId, invoiceId);

    await markInvoiceSent(prisma, testOrg.orgId, testOrg.userId, invoiceId);

    const invoice = await prisma.invoice.findFirstOrThrow({ where: { id: invoiceId }, select: { status: true } });
    expect(invoice.status).toBe("SENT");

    const audit = await prisma.auditEvent.findFirst({
      where: { organizationId: testOrg.orgId, entityType: "invoice", entityId: invoiceId, action: "SEND" },
      select: { id: true },
    });
    expect(audit).toBeTruthy();
  });
});
```

Note: this test asserts `action: "SEND"`. Before writing the implementation, confirm the `AuditAction` enum (grep `enum AuditAction` in `prisma/schema.prisma`). If `SEND` does not exist, use the closest existing value (e.g. `UPDATE`) in both the test and the implementation, and record which value was used in the commit body. Do **not** add a migration for a new enum value as part of this task.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/invoice-mark-sent.test.ts`
Expected: FAIL with "markInvoiceSent is not exported" / not a function.

- [ ] **Step 3: Implement `markInvoiceSent`**

In `lib/accounting/documents.ts`, add near the other invoice status mutators (e.g. after `voidInvoice`):

```ts
/**
 * Flip an approved/sent invoice to SENT and record an audit event. Historically
 * the "Approve & email" action flipped the status with a bare updateMany and no
 * audit trail (and sent no email). This keeps the status change but records it.
 */
export async function markInvoiceSent(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  invoiceId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { id: invoiceId, organizationId },
      select: { id: true, status: true },
    });
    if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.DRAFT) {
      throw new Error("Only an approved invoice can be marked as sent.");
    }
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.SENT },
    });
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "invoice",
        entityId: invoice.id,
        action: AuditAction.SEND, // use the value confirmed in Step 1
        after: { status: "SENT" },
      },
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/invoice-mark-sent.test.ts`
Expected: PASS.

- [ ] **Step 5: Route the server action through `markInvoiceSent`**

In `app/(dashboard)/sales/invoices/actions.ts`, add `markInvoiceSent` to the import from `@/lib/accounting/documents`, then replace the `if (targetStatus === "sent") { ... updateMany ... }` block (lines 109-118) with:

```ts
  // If they clicked "Approve & mark sent", flip the status *and* record an audit event.
  if (targetStatus === "sent") {
    await markInvoiceSent(prisma, workspace.organizationId, workspace.userId, invoiceId);
  }
```

- [ ] **Step 6: Relabel the client button and toast**

In `components/sales/add-invoice-dialog.tsx`:
- Button text (line ~1413): change `Approve & email` to `Approve & mark sent`.
- Toast (lines 388-389): change `"Invoice approved and marked as sent."` to `"Invoice approved and marked as sent. (Emailing is not wired up yet.)"`.

Leave the `saveAction` value `"approve-email"` and the `status: "sent"` mapping as-is (renaming the internal action key is out of scope and would ripple through `use-invoices.ts`).

- [ ] **Step 7: Verify everything**

Run: `pnpm exec vitest run tests/invoice-mark-sent.test.ts && pnpm typecheck && pnpm lint && pnpm build`
Expected: test PASSES, all checks succeed.

- [ ] **Step 8: Verify behaviour with the /verify skill**

Use `/verify`: click "Approve & mark sent" on a draft → invoice becomes SENT and an audit event row exists for the transition.

- [ ] **Step 9: Commit**

```bash
git add lib/accounting/documents.ts "app/(dashboard)/sales/invoices/actions.ts" components/sales/add-invoice-dialog.tsx tests/invoice-mark-sent.test.ts
git commit -m "fix(invoices): relabel Approve & email and record a SENT audit event"
```

---

## Carved out — needs its own spec (do NOT build in this plan)

The audit's item #5 ("Recurring Automation" + "Advanced Item Linking" panels are non-functional localStorage-only UI) was chosen to be **built for real**. That is net-new feature work, not a dialog fix, and it has **no existing infrastructure** to slot into:

- **No data model** — `prisma/schema.prisma` has no `Product`/`InventoryItem`/`RecurringInvoice`/`Schedule` model tied to invoices. (An inventory model exists only inside the separate **POS** subsystem, `lib/pos/*` — reusing it means crossing the accounting↔POS boundary, a design decision in itself.)
- **No scheduler** — there is no app-level cron/job runner to "spawn identical client billing ledgers on a periodic schedule." One must be chosen and stood up.
- **Advanced Item Linking** implies moving stock from an invoice line — again a cross-subsystem contract that needs designing.

Per superpowers process, creative feature work must go through **brainstorming → spec → plan**. Bite-sized TDD tasks cannot be written responsibly for these without those decisions. **Recommendation:** run `superpowers:brainstorming` for each of the two features (they are independent) to produce specs, then a separate implementation plan per spec.

**Interim safety (optional, ~15 min):** until the real features land, the panels silently discard everything the user enters and imply working functionality. If that gap will be open for more than a day, consider a tiny follow-up to label both panels "Preview — not saved yet" or disable their inputs, so nothing is silently dropped. This is a stop-gap, not part of the feature build.

---

## Self-Review

**Spec coverage** (audit findings still live in HEAD `00e9ad0`):
- Critical shipping → **already fixed** (`0a9bb87`), excluded by design. ✅
- High: blank number `Date.now()` → **Task 2**. ✅
- High: customer-name detach → **Task 3**. ✅
- High: edit non-draft duplicate → **Task 1**. ✅
- High: non-functional panels → **carved out** to brainstorming/spec (build-for-real decision). ✅
- Medium: no due-date requirement → **Task 4**. ✅
- Medium: paid invoices can't be voided from UI → **Task 5** (plus the latent SENT posting-reversal fix found during planning). ✅
- Medium: "Approve & email" no email + no audit event → **Task 6** (relabel + audit event; email deferred). ✅

**Placeholder scan:** No `TBD`/`handle edge cases`/"similar to Task N" — every code step shows the exact edit. The two conditional confirmations (AuditAction enum value in Task 6 Step 1; no stray `finalDocumentNo` refs in Task 2 Step 4) are explicit verification steps, not placeholders.

**Type consistency:** `markInvoiceSent` signature matches between its definition (Task 6 Step 3) and call site (Step 5). `DocumentDraftInput` field usage in tests matches the real type (`shippingAmount`/`shippingTaxCode` optional; `contactId`/`contactName` present). `voidInvoice`/`approveInvoice`/`saveInvoiceDraft` signatures used in tests match `documents.ts`.

**Known deviation from strict red-first TDD:** Tasks 2, 3, 4 and the client half of 5/6 change client-only behaviour, and this repo has no React component-test harness. Those are verified by `pnpm typecheck/lint/build` + the `/verify` skill, and (where a server contract underpins the fix) a server-side regression test. This is called out in Global Constraints and per-task rather than faked with red tests.
