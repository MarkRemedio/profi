# Bulk Mark-as-Paid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user multi-select invoices and record payment for all of them in one pass via a right-hand side sheet — default-full/editable amounts, one shared bank account with per-row override, shared method dated today, each invoice settled independently with a per-invoice result summary.

**Architecture:** Reuse the existing multi-select toolbar and the tested `payInvoice` primitive. Add (1) one server action `bulkPayInvoices` that loops `payInvoice` server-side with an overpayment guard and returns per-invoice results, and (2) one client side-sheet component wired to the existing "Mark Paid" toolbar button. No schema changes.

**Tech Stack:** Next.js 16 server actions, React 19, Prisma 7 + Postgres, TanStack Query, Vitest. Money is `BigInt` minor units. Package manager: **pnpm**.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-15-bulk-mark-paid-design.md` — the binding source of truth.
- **Package manager is pnpm.** Scripts: `pnpm exec vitest run tests/<f>.test.ts` (server tests, need Postgres, ~40s), `pnpm typecheck`, `pnpm build`.
- **Money is `BigInt` minor units** server-side; never floats. **All DB queries org-scoped** (`organizationId` in `where`).
- **Payable = status `APPROVED` or `SENT` with outstanding balance > 0.** Outstanding is DERIVED (there is no `amountPaidMinor` column) via `getAmountPaidMap(prisma, orgId, "invoice_payment")` → `Map<invoiceId, paidMinor:bigint>` ([lib/accounting/payments.ts:10](../../../lib/accounting/payments.ts#L10)).
- **`payInvoice` does NOT guard overpayment** — the new action must, using the derived outstanding balance.
- **Auth:** `requireAccountantRole()` (same gate as `payInvoiceDocument`).
- **No React component-test harness** exists — client tasks are verified by `pnpm typecheck` + `pnpm build` + the `/verify` skill, not unit tests. `pnpm lint` fails repo-wide (~108 pre-existing errors); standard is "no NEW lint errors on touched files."
- **Process note:** per the team's current preference, test *runs* may be batched into a consolidated testing pass at the end rather than run per-task. Tests are still authored where specified (Task 1 is TDD). Confirm at execution kickoff.
- **Commit after each task** on branch `feature/bulk-mark-paid`.

## File Structure

- `app/(dashboard)/sales/invoices/actions.ts` — add `bulkPayInvoices` server action + `BulkPayResult` type (append near `payInvoiceDocument`).
- `tests/bulk-pay-invoices.test.ts` (new) — server TDD for the action.
- `components/sales/bulk-mark-paid-sheet.tsx` (new) — the side-sheet client component.
- `components/sales/use-invoices.ts` — add a `bulkMarkPaid` mutation wrapping the action; expose it.
- `components/sales/invoices.tsx` — open the sheet from the existing "Mark Paid" button; pass selected invoices + bankAccounts; handle the result (summary toast + selection update).

---

## Task 1: `bulkPayInvoices` server action (server, TDD)

**Files:**
- Modify: `app/(dashboard)/sales/invoices/actions.ts`
- Test: `tests/bulk-pay-invoices.test.ts`

**Interfaces:**
- Consumes: `payInvoice`, `PaymentMethod` (already imported in actions.ts), `requireAccountantRole`, `prisma`, `revalidateInvoiceViews` (local, actions.ts:31); `getAmountPaidMap` from `@/lib/accounting/payments`; `InvoiceStatus` from `@prisma/client`.
- Produces:
  ```ts
  export type BulkPayResult = {
    invoiceId: string;
    status: "paid" | "skipped" | "failed";
    reason?: string;
    journalId?: string;
  };
  export async function bulkPayInvoices(
    items: { invoiceId: string; amountMinor: number; depositAccountId?: string }[],
    paymentMethod?: PaymentMethod
  ): Promise<BulkPayResult[]>
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/bulk-pay-invoices.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  approveInvoice,
  payInvoice,
  saveInvoiceDraft,
  type DocumentDraftInput,
} from "@/lib/accounting/documents";
import { bulkPayInvoices } from "@/app/(dashboard)/sales/invoices/actions";

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

async function makeApprovedInvoice(accountId: string): Promise<string> {
  const draft: DocumentDraftInput = {
    contactName: "",
    contactId: testOrg.customerId,
    documentNo: "",
    issueDate: "2026-05-10",
    dueDate: "2026-06-10",
    currency: "GBP",
    amountsAre: "exclusive",
    lines: [{ accountId, description: "Goods", quantity: "1.00", unitPrice: "100.00", taxCode: "no_vat" }],
  };
  const id = await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, draft);
  await approveInvoice(prisma, testOrg.orgId, testOrg.userId, id);
  return id; // totalMinor = 10000 (no_vat)
}

async function paymentJournalCount(invoiceId: string): Promise<number> {
  return prisma.journal.count({
    where: { organizationId: testOrg.orgId, sourceType: "invoice_payment", sourceId: invoiceId },
  });
}

describe("bulkPayInvoices", () => {
  it("pays full + partial, skips already-paid & drafts, fails over-balance", async () => {
    const accountId = await revenueAccountId(testOrg.orgId);

    const full = await makeApprovedInvoice(accountId);       // pay in full
    const partial = await makeApprovedInvoice(accountId);     // pay 40.00 of 100
    const alreadyPaid = await makeApprovedInvoice(accountId); // pre-pay fully -> skipped
    const over = await makeApprovedInvoice(accountId);        // amount > balance -> failed

    // Draft (never approved) -> skipped as not payable
    const draftId = await saveInvoiceDraft(prisma, testOrg.orgId, testOrg.userId, {
      contactName: "", contactId: testOrg.customerId, documentNo: "", issueDate: "2026-05-10",
      dueDate: "2026-06-10", currency: "GBP", amountsAre: "exclusive",
      lines: [{ accountId, description: "Goods", quantity: "1.00", unitPrice: "100.00", taxCode: "no_vat" }],
    });

    await payInvoice(prisma, testOrg.orgId, testOrg.userId, alreadyPaid, BigInt(10000)); // fully pay

    const results = await bulkPayInvoices(
      [
        { invoiceId: full, amountMinor: 10000 },
        { invoiceId: partial, amountMinor: 4000 },
        { invoiceId: alreadyPaid, amountMinor: 10000 },
        { invoiceId: over, amountMinor: 15000 },
        { invoiceId: draftId, amountMinor: 10000 },
      ],
      "bank_transfer"
    );

    const byId = Object.fromEntries(results.map((r) => [r.invoiceId, r]));
    expect(byId[full].status).toBe("paid");
    expect(byId[partial].status).toBe("paid");
    expect(byId[alreadyPaid].status).toBe("skipped");
    expect(byId[over].status).toBe("failed");
    expect(byId[draftId].status).toBe("skipped");

    // Journals: full & partial got exactly one new payment journal; over & draft none new.
    expect(await paymentJournalCount(full)).toBe(1);
    expect(await paymentJournalCount(partial)).toBe(1);
    expect(await paymentJournalCount(alreadyPaid)).toBe(1); // only the setup payment
    expect(await paymentJournalCount(over)).toBe(0);
    expect(await paymentJournalCount(draftId)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/bulk-pay-invoices.test.ts`
Expected: FAIL — `bulkPayInvoices` is not exported.

- [ ] **Step 3: Implement the action**

In `app/(dashboard)/sales/invoices/actions.ts`: add `InvoiceStatus` to the `@prisma/client` imports (add the import if none exists), and `import { getAmountPaidMap } from "@/lib/accounting/payments";`. Then append near `payInvoiceDocument`:

```ts
export type BulkPayResult = {
  invoiceId: string;
  status: "paid" | "skipped" | "failed";
  reason?: string;
  journalId?: string;
};

export async function bulkPayInvoices(
  items: { invoiceId: string; amountMinor: number; depositAccountId?: string }[],
  paymentMethod?: PaymentMethod
): Promise<BulkPayResult[]> {
  const workspace = await requireAccountantRole();
  const method =
    paymentMethod && (["cash", "cheque", "bank_transfer"] as const).includes(paymentMethod)
      ? paymentMethod
      : undefined;

  const ids = items.map((i) => i.invoiceId);
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: ids }, organizationId: workspace.organizationId },
    select: { id: true, status: true, totalMinor: true },
  });
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  const paidMap = await getAmountPaidMap(prisma, workspace.organizationId, "invoice_payment");

  const results: BulkPayResult[] = [];
  for (const item of items) {
    const inv = byId.get(item.invoiceId);
    if (!inv) {
      results.push({ invoiceId: item.invoiceId, status: "skipped", reason: "not found" });
      continue;
    }
    if (inv.status !== InvoiceStatus.APPROVED && inv.status !== InvoiceStatus.SENT) {
      results.push({
        invoiceId: item.invoiceId,
        status: "skipped",
        reason: `not payable (${String(inv.status).toLowerCase()})`,
      });
      continue;
    }
    const paid = paidMap.get(inv.id) ?? BigInt(0);
    const outstanding = inv.totalMinor - paid;
    if (outstanding <= BigInt(0)) {
      results.push({ invoiceId: item.invoiceId, status: "skipped", reason: "already paid" });
      continue;
    }
    const amount = BigInt(Math.round(item.amountMinor));
    if (amount <= BigInt(0) || amount > outstanding) {
      results.push({ invoiceId: item.invoiceId, status: "failed", reason: "amount exceeds balance" });
      continue;
    }
    try {
      const r = await payInvoice(
        prisma,
        workspace.organizationId,
        workspace.userId,
        item.invoiceId,
        amount,
        item.depositAccountId,
        method
      );
      results.push({ invoiceId: item.invoiceId, status: "paid", journalId: r.journalId ?? undefined });
    } catch (e) {
      results.push({
        invoiceId: item.invoiceId,
        status: "failed",
        reason: e instanceof Error ? e.message : "payment failed",
      });
    }
  }

  revalidateInvoiceViews();
  return results;
}
```

Note: confirm `getAmountPaidMap`'s return type is `Map<string, bigint>`; if it returns numbers, coerce with `BigInt(...)` before the subtraction. Confirm `PostingResult.journalId` is `string | null` (it is) — hence `?? undefined`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/bulk-pay-invoices.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` (clean).
```bash
git add "app/(dashboard)/sales/invoices/actions.ts" tests/bulk-pay-invoices.test.ts
git commit -m "feat(invoices): bulkPayInvoices server action with overpayment guard"
```

---

## Task 2: `BulkMarkPaidSheet` component (client)

**Files:**
- Create: `components/sales/bulk-mark-paid-sheet.tsx`

**Interfaces:**
- Consumes: `BulkPayResult` (import type from the actions file); `ChartAccountOption` (from `@/lib/accounting/documents` or wherever `bankAccounts` items are typed — match the type used by `ViewInvoiceDialog`'s `bankAccounts` prop); UI primitives `components/ui/{dialog,accordion,select,checkbox}`.
- Produces:
  ```ts
  export type BulkPayableInvoice = {
    id: string;
    invoiceNo: string;
    contactName: string;
    totalMinor: number;
    amountPaidMinor: number; // already provided on invoice rows in invoices.tsx
    status: string;          // "approved" | "sent" | "draft" | "void"
  };
  export function BulkMarkPaidSheet(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoices: BulkPayableInvoice[];               // the selected rows
    bankAccounts: { id: string; code: string; name: string }[];
    submitting: boolean;
    results: BulkPayResult[] | null;              // set after submit
    onSubmit: (
      items: { invoiceId: string; amountMinor: number; depositAccountId?: string }[],
      paymentMethod: "cash" | "cheque" | "bank_transfer"
    ) => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Create the component**

Create `components/sales/bulk-mark-paid-sheet.tsx`. Build the panel on the existing `Dialog` primitive styled as a right-anchored sheet (match the visual language of `components/sales/view-invoice-dialog.tsx`). Implement:

- **Partition** `invoices` into `payable` (`status === "approved" || status === "sent"` AND `totalMinor - amountPaidMinor > 0`) and `skipped` (everything else, with a reason string: `draft`/`void`/`already paid`).
- **Shared state:** `sharedAccountId` (default the bank with `code === "1000"`, else `bankAccounts[0]?.id`), `method` (default `"bank_transfer"`).
- **Per-row state** keyed by invoice id: `amountStr` (default `((totalMinor - amountPaidMinor)/100).toFixed(2)`), `accountId` (default `undefined` → uses shared), `included` (default `true`).
- **Validation** per included payable row: parse `amountStr` to minor; valid if `> 0` and `<= (totalMinor - amountPaidMinor)`.
- **Footer:** running total of included valid amounts ("Recording £X across N invoices"); **Confirm** disabled when no included valid payable rows OR any included row invalid OR `submitting`.
- **onConfirm:** build `items = includedValidRows.map(r => ({ invoiceId, amountMinor, depositAccountId: r.accountId ?? sharedAccountId }))` and call `props.onSubmit(items, method)`.
- **Results view:** when `props.results` is non-null, render per-row status badges (paid ✓ / skipped / failed + reason) and a summary line "N paid · N skipped · N failed"; keep the sheet open.

Use `Accordion` for payable rows (collapsed = no · customer · balance · amount input; expanded = per-row account `Select`). Use `Select` for the shared account/method pickers, `Checkbox` for the per-row include toggle. Format money with the existing GBP helper used in `view-invoice-dialog.tsx` (reuse it; do not hand-roll). Keep the component presentational — no server calls, no data fetching; everything comes through props.

- [ ] **Step 2: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: both succeed. Confirm no NEW lint errors on the file (`pnpm exec eslint components/sales/bulk-mark-paid-sheet.tsx` vs a stash baseline).

- [ ] **Step 3: Commit**

```bash
git add components/sales/bulk-mark-paid-sheet.tsx
git commit -m "feat(invoices): bulk mark-as-paid side sheet component"
```

---

## Task 3: Wire the sheet into the invoices view (client)

**Files:**
- Modify: `components/sales/use-invoices.ts` (add `bulkMarkPaid` mutation)
- Modify: `components/sales/invoices.tsx` (open sheet from "Mark Paid" button; pass data; handle results + selection)

**Interfaces:**
- Consumes: `bulkPayInvoices` action, `BulkMarkPaidSheet`, existing `selectedInvoices`/`setSelectedInvoices` state, `bankAccounts`, the invoices array.
- Produces: `bulkMarkPaid` exposed from `use-invoices.ts` (mutation calling `bulkPayInvoices`).

- [ ] **Step 1: Add the mutation to `use-invoices.ts`**

Mirror the existing `payMutation` pattern (`use-invoices.ts:141-153`). Add:

```ts
import { bulkPayInvoices } from "@/app/(dashboard)/sales/invoices/actions";
// ...
const bulkPayMutation = useMutation({
  mutationFn: ({
    items,
    paymentMethod,
  }: {
    items: { invoiceId: string; amountMinor: number; depositAccountId?: string }[];
    paymentMethod?: "cash" | "cheque" | "bank_transfer";
  }) => bulkPayInvoices(items, paymentMethod),
  onSuccess: () => workspaceQuery.refetch(),
});
```

Expose from the hook's return object:
```ts
bulkMarkPaid: (
  items: { invoiceId: string; amountMinor: number; depositAccountId?: string }[],
  paymentMethod?: "cash" | "cheque" | "bank_transfer"
) => bulkPayMutation.mutateAsync({ items, paymentMethod }),
bulkPaying: bulkPayMutation.isPending,
```

- [ ] **Step 2: Open the sheet from the "Mark Paid" button**

In `components/sales/invoices.tsx`:
- Add state: `const [bulkPayOpen, setBulkPayOpen] = useState(false);` and `const [bulkResults, setBulkResults] = useState<BulkPayResult[] | null>(null);`.
- Pull `bulkMarkPaid`, `bulkPaying` from `useInvoices()` (alongside the existing destructured values).
- Replace the "Mark Paid" button's `onClick` (`invoices.tsx:685`, the `toast.info("Bulk mark as paid coming soon"...)`) with `onClick={() => { setBulkResults(null); setBulkPayOpen(true); }}`.

- [ ] **Step 3: Render the sheet and handle results**

Near the existing `<ViewInvoiceDialog .../>` (`invoices.tsx:1077`), render:

```tsx
<BulkMarkPaidSheet
  open={bulkPayOpen}
  onOpenChange={(o) => { setBulkPayOpen(o); if (!o) setBulkResults(null); }}
  invoices={invoices
    .filter((inv) => selectedInvoices.has(inv.id))
    .map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      contactName: inv.contactName,
      totalMinor: inv.totalMinor,
      amountPaidMinor: (inv as any).amountPaidMinor ?? 0,
      status: inv.status,
    }))}
  bankAccounts={bankAccounts}
  submitting={bulkPaying}
  results={bulkResults}
  onSubmit={async (items, paymentMethod) => {
    const res = await bulkMarkPaid(items, paymentMethod);
    setBulkResults(res);
    const paid = res.filter((r) => r.status === "paid").length;
    const skipped = res.filter((r) => r.status === "skipped").length;
    const failed = res.filter((r) => r.status === "failed").length;
    toast.success(`${paid} paid · ${skipped} skipped · ${failed} failed`);
    // Drop successfully-paid invoices from the selection; keep skipped/failed selected.
    const paidIds = new Set(res.filter((r) => r.status === "paid").map((r) => r.invoiceId));
    setSelectedInvoices((prev) => new Set([...prev].filter((id) => !paidIds.has(id))));
    if (failed === 0 && skipped === 0) setBulkPayOpen(false);
  }}
/>
```

Confirm the exact field names on the invoice row (`invoiceNo`, `contactName`, `totalMinor`, `amountPaidMinor`, `status`) against the invoices data shape in this file (the row already reads `amountPaidMinor` at `invoices.tsx:745`/`817`); adjust the mapping if a name differs.

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: both succeed; no new lint errors on the two touched files.

- [ ] **Step 5: Verify end-to-end with the /verify skill**

Use `/verify`: select 2–3 invoices (mix of payable + one draft/paid), open the sheet, confirm the skipped section lists the non-payable ones, edit one amount to a partial value, override one row's bank account, Confirm → observe the summary toast, that paid invoices leave the selection, and that AR/balances update. Record what was observed.

- [ ] **Step 6: Commit**

```bash
git add components/sales/use-invoices.ts components/sales/invoices.tsx
git commit -m "feat(invoices): wire bulk mark-as-paid sheet into the invoices table"
```

---

## Self-Review

**Spec coverage:** side sheet from the existing toolbar button (Task 3) ✓; default-full/editable amounts + per-row override + shared picker/method (Task 2) ✓; independent per-invoice + skipped/failed summary + overpayment guard (Task 1) ✓; keep failed/skipped selected, drop paid (Task 3 Step 3) ✓; server test (Task 1) ✓; date-picker explicitly out of scope ✓.

**Placeholder scan:** none — every step has concrete code or an exact command. Two explicit confirmations (getAmountPaidMap return type in Task 1 Step 3; invoice row field names in Task 3 Step 3) are verification steps, not placeholders.

**Type consistency:** `bulkPayInvoices(items, paymentMethod)` signature identical across the action (Task 1), the hook mutation (Task 3 Step 1), and the sheet's `onSubmit` (Task 2). `BulkPayResult` defined once in actions.ts and imported by the client. `items` shape `{invoiceId, amountMinor, depositAccountId?}` consistent everywhere.

**Known deviation from strict red-first TDD:** Tasks 2–3 are client-only and this repo has no component-test harness — verified by typecheck/build/`/verify`, as stated in Global Constraints. Task 1 is full red-first TDD.
