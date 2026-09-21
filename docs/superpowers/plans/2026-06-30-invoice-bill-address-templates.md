# Editable Document Address + Save-as-Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the invoice & bill create forms, add an editable per-document address snapshot (prefilled from the contact, contact untouched) and let accountants save/load reusable document templates.

**Architecture:** Feature 1 adds a nullable `billing_address` column to `invoices`/`bills`, threads `billingAddress` through the existing `DocumentDraftInput` → `saveInvoiceDraft`/`saveBillDraft` raw-SQL paths and the read mappers, and renders an editable address block on the two forms. Feature 2 adds one unified `document_templates` table (kind = invoice|bill), a `lib/accounting/templates.ts` DAL, thin server actions, and Save/Load controls on the two forms.

**Tech Stack:** Next.js (server actions, `"use server"`), Prisma 7 (raw SQL for document writes; client for templates), Postgres, Vitest (real-Postgres integration tests via `tests/fixtures.ts`).

## Global Constraints

- Money is stored in **minor units (pence)** as `BigInt`; templates store **no monetary amounts** (lines carry `unitPrice`/`discount` as entered strings, recomputed at save).
- Org-scoped models use the Prisma field name **`organizationId`** with `@map("org_id")`; such models MUST be listed in `ORG_SCOPED` (`lib/tenancy/scoped-models.ts`) or the dmmf-completeness test fails.
- The address edit is a **document snapshot** — never write back to `Contact`.
- Template `kind` is the string union **`"invoice" | "bill"`** (stored as a `text` column with a `CHECK (kind IN ('invoice','bill'))`; no new Postgres enum type, to minimise migration surface on the drifted history).
- Migrations are delivered as a **hand-written SQL file** under `prisma/migrations/<timestamp>_invoice_bill_address_and_templates/migration.sql`, applied to the dev DB via `pnpm prisma db execute`, plus `schema.prisma` edits + `pnpm prisma generate` (mirrors W2-3; the repo's migrate history is drifted). All DDL uses `IF NOT EXISTS` so re-running is safe.
- Test command: `pnpm test <file>` (Vitest). Typecheck: `pnpm typecheck`. Both green at every task boundary.
- Tests run serially against the shared dev Postgres; always clean up via `dropTestOrg`.
- **Commits:** the repo owner commits manually. Each "Commit" step is a checkpoint — stage the listed files (`git add`) and pause; do not run `git commit` unless the owner authorises it for the session.

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/migrations/<ts>_invoice_bill_address_and_templates/migration.sql` (create) | DDL: address columns + `document_templates` table. |
| `prisma/schema.prisma` (modify) | `Invoice.billingAddress`, `Bill.billingAddress`, new `DocumentTemplate` model + back-relations on `Organization`/`Contact`. |
| `lib/tenancy/scoped-models.ts` (modify) | Register `DocumentTemplate` in `ORG_SCOPED`. |
| `lib/accounting/documents.ts` (modify) | `DocumentDraftInput.billingAddress`, `ContactSummary.billingAddress`, `InvoiceWithLines`/`BillWithLines.billingAddress`; persist + read-back in `save*Draft`/`list*`/`map*`/`getDocumentOptions`. |
| `lib/accounting/templates.ts` (create) | Template DAL: `saveDocumentTemplate`/`listDocumentTemplates`/`getDocumentTemplate`/`deleteDocumentTemplate` + types + error classes. |
| `app/(dashboard)/sales/invoices/actions.ts` (modify) | Invoice template server actions (kind=invoice). |
| `app/(dashboard)/purchases/actions.ts` (modify) | Bill template server actions (kind=bill). |
| `components/sales/add-invoice-dialog.tsx` (modify) | Address block + template Save/Load controls (invoice). |
| `components/purchases/add-bill-dialog.tsx` (modify) | Address block + template Save/Load controls (bill). |
| `tests/fixtures.ts` (modify) | `dropTestOrg` cleans `document_templates`. |
| `tests/document-address.test.ts` (create) | Address persistence + contact-unchanged + null. |
| `tests/document-templates.test.ts` (create) | Template CRUD + payload + unique-name + tenant isolation. |

Order: **Task 1** (address backend) → **Task 2/3** (address UI invoice/bill) → **Task 4** (templates schema) → **Task 5** (templates DAL) → **Task 6** (template actions) → **Task 7** (template UI) → **Task 8** (final verification).

---

### Task 1: Address snapshot — schema, migration, persistence, read-back

**Files:**
- Create: `prisma/migrations/20260630120000_invoice_bill_address_and_templates/migration.sql` (address columns portion; the templates table is added in Task 4 to the SAME file)
- Modify: `prisma/schema.prisma` (Invoice + Bill)
- Modify: `lib/accounting/documents.ts`
- Test: `tests/document-address.test.ts` (create)

**Interfaces:**
- Produces: `DocumentDraftInput.billingAddress?: string`; `ContactSummary.billingAddress: string | null`; `InvoiceWithLines.billingAddress: string | null`; `BillWithLines.billingAddress: string | null`. `saveInvoiceDraft`/`saveBillDraft` persist it; `listInvoices`/`listBills` + `getDocumentOptions` return it.

- [ ] **Step 1: Create the migration SQL (address columns)**

Create `prisma/migrations/20260630120000_invoice_bill_address_and_templates/migration.sql`:

```sql
-- Feature 1: per-document address snapshot
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_address text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS billing_address text;
```

- [ ] **Step 2: Apply the SQL to the dev DB**

Run: `pnpm prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260630120000_invoice_bill_address_and_templates/migration.sql`
Expected: completes with no error (idempotent via `IF NOT EXISTS`).

- [ ] **Step 3: Add the Prisma fields**

In `prisma/schema.prisma`, add to `model Invoice` (next to the other scalar fields, e.g. after `discountMinor`):

```prisma
  billingAddress  String?        @map("billing_address")
```

Add to `model Bill` likewise:

```prisma
  billingAddress  String?        @map("billing_address")
```

- [ ] **Step 4: Regenerate the client**

Run: `pnpm prisma generate`
Expected: client regenerated; `billingAddress` now known on `invoice`/`bill` delegates.

- [ ] **Step 5: Write the failing test** `tests/document-address.test.ts`

```ts
import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { saveInvoiceDraft, saveBillDraft, type DocumentDraftInput } from "@/lib/accounting/documents";
import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

let org: TestOrg;
beforeEach(async () => { org = await createTestOrg(); });
afterEach(async () => { await dropTestOrg(org.orgId); });

async function revenueAccountId(orgId: string): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: orgId, accountType: "REVENUE", reportCategory: "SALES" },
    select: { id: true },
  });
  return row.id;
}
async function expenseAccountId(orgId: string): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: orgId, accountType: "EXPENSE" },
    select: { id: true },
  });
  return row.id;
}

it("persists an edited invoice address snapshot without touching the contact", async () => {
  const accountId = await revenueAccountId(org.orgId);
  const before = await prisma.contact.findFirstOrThrow({ where: { id: org.customerId }, select: { billingAddress: true } });
  const draft: DocumentDraftInput = {
    contactName: "", contactId: org.customerId, documentNo: "INV-ADDR-1",
    issueDate: "2026-05-10", dueDate: "", currency: "GBP",
    billingAddress: "  12 Edited Street\nLondon\nE1 6AN  ",
    lines: [{ accountId, description: "Line", quantity: "1.00", unitPrice: "10.00", taxCode: "no_vat" }],
  };
  const id = await saveInvoiceDraft(prisma, org.orgId, org.userId, draft);
  const inv = await prisma.invoice.findFirstOrThrow({ where: { id, organizationId: org.orgId }, select: { billingAddress: true } });
  expect(inv.billingAddress).toBe("12 Edited Street\nLondon\nE1 6AN"); // trimmed
  const after = await prisma.contact.findFirstOrThrow({ where: { id: org.customerId }, select: { billingAddress: true } });
  expect(after.billingAddress).toBe(before.billingAddress); // contact unchanged
});

it("persists NULL when the invoice address is blank", async () => {
  const accountId = await revenueAccountId(org.orgId);
  const id = await saveInvoiceDraft(prisma, org.orgId, org.userId, {
    contactName: "", contactId: org.customerId, documentNo: "INV-ADDR-2",
    issueDate: "2026-05-10", dueDate: "", currency: "GBP", billingAddress: "   ",
    lines: [{ accountId, description: "Line", quantity: "1.00", unitPrice: "10.00", taxCode: "no_vat" }],
  });
  const inv = await prisma.invoice.findFirstOrThrow({ where: { id, organizationId: org.orgId }, select: { billingAddress: true } });
  expect(inv.billingAddress).toBeNull();
});

it("persists a bill address snapshot", async () => {
  const accountId = await expenseAccountId(org.orgId);
  const id = await saveBillDraft(prisma, org.orgId, org.userId, {
    contactName: "", contactId: org.supplierId, documentNo: "BILL-ADDR-1",
    issueDate: "2026-05-10", dueDate: "", currency: "GBP", billingAddress: "Supplier House",
    lines: [{ accountId, description: "Line", quantity: "1.00", unitPrice: "10.00", taxCode: "no_vat" }],
  });
  const bill = await prisma.bill.findFirstOrThrow({ where: { id, organizationId: org.orgId }, select: { billingAddress: true } });
  expect(bill.billingAddress).toBe("Supplier House");
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test tests/document-address.test.ts`
Expected: FAIL — `saveInvoiceDraft` ignores `billingAddress`, so `inv.billingAddress` is `null` (first test) / the field is unknown.

- [ ] **Step 7: Add `billingAddress` to `DocumentDraftInput`**

In `lib/accounting/documents.ts`, in the `DocumentDraftInput` type (currently ends with `depositAccountId?: string | null;`), add:

```ts
  // Per-document address snapshot (prefilled from the contact, edited per document).
  billingAddress?: string;
```

- [ ] **Step 8: Persist in `saveInvoiceDraft`**

In `saveInvoiceDraft`, after `const currencyStr = normalizeCurrency(input.currency);` add:

```ts
    const billingAddressStr = input.billingAddress?.trim() || null;
```

In the UPDATE branch raw SQL, add `billing_address` to the `SET` list (before `updated_at = NOW()`):

```sql
          total_minor = ${totalMinor},
          billing_address = ${billingAddressStr},
          updated_at = NOW()
```

In the INSERT branch, add the column and value (extend the column list and the `VALUES`):

```sql
        INSERT INTO invoices (id, org_id, contact_id, invoice_no, issue_date, due_date, status, currency, subtotal_minor, discount_minor, tax_minor, total_minor, billing_address, created_at, updated_at)
        VALUES (
          gen_random_uuid(),
          ${organizationId}::uuid,
          ${contactId}::uuid,
          ${invoiceNo},
          ${issueDateStr}::date,
          ${dueDateStr}::date,
          'draft'::"invoice_status",
          ${currencyStr}::text::"currency_code",
          ${normalized.subtotalMinor},
          ${normalized.discountMinor},
          ${normalized.taxMinor},
          ${totalMinor},
          ${billingAddressStr},
          NOW(),
          NOW()
        )
        RETURNING id
```

- [ ] **Step 9: Persist in `saveBillDraft`**

In `saveBillDraft`, after `const currencyStr = normalizeCurrency(input.currency);` add the same line:

```ts
    const billingAddressStr = input.billingAddress?.trim() || null;
```

In its UPDATE branch, add to the `SET` list before `updated_at = NOW()`:

```sql
          total_minor = ${normalized.totalMinor},
          billing_address = ${billingAddressStr},
          updated_at = NOW()
```

In its INSERT branch, add `billing_address` to the column list and `${billingAddressStr}` to `VALUES` in the same position (after `total_minor`), mirroring Step 8.

- [ ] **Step 10: Expose on `ContactSummary` (for form prefill)**

In `lib/accounting/documents.ts`, extend `ContactSummary`:

```ts
export type ContactSummary = {
  id: string;
  name: string;
  contactType: string;
  paymentTermsDays: number;
  billingAddress: string | null;
};
```

In `getDocumentOptions`, add `billingAddress: true` to the contact `select`, and map it:

```ts
    contacts: contacts.map((contact): ContactSummary => ({
      id: contact.id,
      name: contact.name,
      contactType: enumToLower(contact.contactType),
      paymentTermsDays: contact.paymentTermsDays,
      billingAddress: contact.billingAddress ?? null,
    })),
```

- [ ] **Step 11: Read back on draft load**

Add `billingAddress: string | null;` to both `InvoiceWithLines` and `BillWithLines`. In `listInvoices` and `listBills`, add `billingAddress: true` to the top-level `select`. In `mapInvoice` add `billingAddress: invoice.billingAddress ?? null,` and in `mapBill` add `billingAddress: bill.billingAddress ?? null,`.

- [ ] **Step 12: Run the test to verify it passes**

Run: `pnpm test tests/document-address.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 13: Typecheck + commit checkpoint**

Run: `pnpm typecheck` → exit 0.

```bash
git add prisma/schema.prisma prisma/migrations lib/accounting/documents.ts tests/document-address.test.ts
# stage only — owner commits manually
```

---

### Task 2: Address UI on the invoice form

**Files:**
- Modify: `components/sales/add-invoice-dialog.tsx`

**Interfaces:**
- Consumes: `contacts[i].billingAddress` (from Task 1's `ContactSummary`); the form's `onSubmit` already spreads `form` into the payload, so adding `billingAddress` to `form` state submits it as `DocumentDraftInput.billingAddress`.

- [ ] **Step 1: Add `billingAddress` to form state**

Read the component to find where the form state object is initialized (the `useState` for `form`, ~line 128) and where an edited invoice seeds it. Add `billingAddress` to the initial object, defaulting from an edited invoice if present, else `""`:

```ts
  billingAddress: (initialInvoice as any)?.billingAddress ?? "",
```

(Use the same source variable the component already uses to seed edit-mode fields; if creating fresh, it is `""`.)

- [ ] **Step 2: Prefill the address when a contact is selected**

In the contact `Select`'s `onValueChange` (the block that sets `contactId`/`contactName`/`dueDate`, ~line 352), also set the address from the chosen contact:

```ts
    setForm((current: any) => ({
      ...current,
      contactId: value,
      contactName: contact?.name ?? "",
      billingAddress: contact?.billingAddress ?? "",
      dueDate: addDays(current.issueDate || today(), termsDays),
    }));
```

- [ ] **Step 3: Render the editable address block**

Directly below the contact `Select` block, add (uses a local `isEditingAddress` state — add `const [isEditingAddress, setIsEditingAddress] = useState(false);` near the other `useState`s):

```tsx
{form.contactId && (
  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billing address</span>
      <div className="flex items-center gap-3">
        <button type="button" className="text-xs font-medium text-blue-600 hover:underline"
          onClick={() => {
            const c = contacts.find((x) => x.id === form.contactId);
            setForm((cur: any) => ({ ...cur, billingAddress: c?.billingAddress ?? "" }));
          }}>
          Reset to contact's address
        </button>
        <button type="button" className="text-xs font-semibold text-blue-600 hover:underline"
          onClick={() => setIsEditingAddress((v) => !v)}>
          {isEditingAddress ? "Done" : "Edit"}
        </button>
      </div>
    </div>
    {isEditingAddress ? (
      <textarea
        className="mt-2 w-full rounded-md border border-slate-200 p-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        rows={3}
        placeholder="No address on file — add one here"
        value={form.billingAddress}
        onChange={(e) => setForm((cur: any) => ({ ...cur, billingAddress: e.target.value }))}
      />
    ) : (
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
        {form.billingAddress?.trim() ? form.billingAddress : <span className="text-slate-400">No address on file — click Edit to add one.</span>}
      </p>
    )}
  </div>
)}
```

- [ ] **Step 4: Verify typecheck + render**

Run: `pnpm typecheck` → exit 0.
Manual: open Create Invoice, pick a customer with an address → address shows; click Edit → editable; change it, save the draft, reopen the draft → edited address persists; the customer record's address is unchanged.

- [ ] **Step 5: Commit checkpoint**

```bash
git add components/sales/add-invoice-dialog.tsx
# stage only
```

---

### Task 3: Address UI on the bill form

**Files:**
- Modify: `components/purchases/add-bill-dialog.tsx`

**Interfaces:**
- Consumes: same as Task 2 but for suppliers; the bill form's submit path passes `form` to `saveBill`.

- [ ] **Step 1: Add `billingAddress` to the bill form state**

Read `components/purchases/add-bill-dialog.tsx`. Mirror Task 2 Step 1: add `billingAddress` to the form `useState` initial object (default from an edited bill if present, else `""`), and add `const [isEditingAddress, setIsEditingAddress] = useState(false);`.

- [ ] **Step 2: Prefill on supplier select**

In the supplier `Select`'s `onValueChange` (the block setting `contactId`/`contactName`, ~line 227), also set `billingAddress: contact?.billingAddress ?? ""` (same shape as Task 2 Step 2).

- [ ] **Step 3: Render the address block**

Below the supplier `Select`, add the SAME JSX as Task 2 Step 3, except change the label text from `Billing address` to `Supplier address` and "Reset to contact's address" stays as-is. (The `contacts` array here is the suppliers list passed to the bill form.)

- [ ] **Step 4: Verify typecheck + render**

Run: `pnpm typecheck` → exit 0.
Manual: Create Bill → pick a supplier → address shows + Edit works; save + reopen draft → edited address persists; supplier record unchanged.

- [ ] **Step 5: Commit checkpoint**

```bash
git add components/purchases/add-bill-dialog.tsx
# stage only
```

---

### Task 4: Templates — schema, migration, registry, teardown

**Files:**
- Modify: `prisma/migrations/20260630120000_invoice_bill_address_and_templates/migration.sql` (append templates DDL)
- Modify: `prisma/schema.prisma` (new `DocumentTemplate` model + back-relations)
- Modify: `lib/tenancy/scoped-models.ts`
- Modify: `tests/fixtures.ts` (`dropTestOrg`)

**Interfaces:**
- Produces: Prisma `documentTemplate` delegate; `DocumentTemplate` registered ORG_SCOPED; `dropTestOrg` cleans the table.

- [ ] **Step 1: Append the templates DDL to the migration file**

Append to `prisma/migrations/20260630120000_invoice_bill_address_and_templates/migration.sql`:

```sql
-- Feature 2: reusable document templates (kind = invoice|bill)
CREATE TABLE IF NOT EXISTS document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invoice','bill')),
  name text NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  currency currency_code NOT NULL DEFAULT 'GBP',
  due_date_offset_days integer,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_templates_org_kind_name_unique UNIQUE (org_id, kind, name)
);
CREATE INDEX IF NOT EXISTS document_templates_org_kind_idx ON document_templates (org_id, kind);
```

> Before running, confirm the organizations table name: `grep -n '@@map("organizations")' prisma/schema.prisma` (the `invoices.org_id` FK references it). If the table is named differently, use that name in the FK.

- [ ] **Step 2: Apply to the dev DB**

Run: `pnpm prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260630120000_invoice_bill_address_and_templates/migration.sql`
Expected: completes (the address `ALTER`s are no-ops via `IF NOT EXISTS`; the table is created).

- [ ] **Step 3: Add the Prisma model + back-relations**

In `prisma/schema.prisma` add:

```prisma
model DocumentTemplate {
  id                String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId    String       @map("org_id") @db.Uuid
  kind              String
  name              String
  contactId         String?      @map("contact_id") @db.Uuid
  currency          CurrencyCode @default(GBP)
  dueDateOffsetDays Int?         @map("due_date_offset_days")
  lines             Json         @default("[]")
  createdByUserId   String?      @map("created_by_user_id") @db.Uuid
  createdAt         DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime     @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  organization      Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  contact           Contact?     @relation(fields: [contactId], references: [id], onDelete: SetNull, onUpdate: NoAction)

  @@unique([organizationId, kind, name])
  @@index([organizationId, kind])
  @@map("document_templates")
  @@schema("public")
}
```

Add the reverse relation field to `model Organization` (alongside its other `[]` relations):

```prisma
  documentTemplates DocumentTemplate[]
```

Add to `model Contact` likewise:

```prisma
  documentTemplates DocumentTemplate[]
```

- [ ] **Step 4: Regenerate the client**

Run: `pnpm prisma generate`
Expected: `prisma.documentTemplate` delegate available.

- [ ] **Step 5: Register in the tenancy guard**

In `lib/tenancy/scoped-models.ts`, add to the `ORG_SCOPED` object (e.g. under a new comment):

```ts
  // Document templates
  DocumentTemplate: "organizationId",
```

- [ ] **Step 6: Clean templates in `dropTestOrg`**

In `tests/fixtures.ts`, inside the `dropTestOrg` transaction (before `tx.contact.deleteMany`), add:

```ts
    await tx.documentTemplate.deleteMany({ where: { organizationId: orgId } });
```

- [ ] **Step 7: Run the tenancy completeness test + typecheck**

Run: `pnpm test tests/tenancy/` then `pnpm typecheck`
Expected: dmmf-completeness test PASS (DocumentTemplate now registered); typecheck exit 0.

- [ ] **Step 8: Commit checkpoint**

```bash
git add prisma/schema.prisma prisma/migrations lib/tenancy/scoped-models.ts tests/fixtures.ts
# stage only
```

---

### Task 5: Templates DAL (`lib/accounting/templates.ts`)

**Files:**
- Create: `lib/accounting/templates.ts`
- Test: `tests/document-templates.test.ts` (create)

**Interfaces:**
- Produces:
  - `type DocumentTemplateKind = "invoice" | "bill"`
  - `type TemplateLineInput = { accountId: string; description: string; quantity: string; unitPrice: string; discount: string; taxCode: string }`
  - `type SaveTemplateInput = { kind: DocumentTemplateKind; name: string; contactId?: string | null; currency?: CurrencyCode; dueDateOffsetDays?: number | null; lines: TemplateLineInput[] }`
  - `saveDocumentTemplate(prisma, orgId, actorUserId, input) => Promise<{ id: string }>`
  - `listDocumentTemplates(prisma, orgId, kind) => Promise<Array<{ id: string; name: string; contactId: string | null; updatedAt: string }>>`
  - `getDocumentTemplate(prisma, orgId, id) => Promise<FullTemplate>` (throws `TemplateNotFoundError`)
  - `deleteDocumentTemplate(prisma, orgId, id) => Promise<void>` (throws `TemplateNotFoundError`)
  - Errors `TemplateValidationError`, `TemplateNotFoundError`.

- [ ] **Step 1: Write the failing test** `tests/document-templates.test.ts`

```ts
import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  saveDocumentTemplate, listDocumentTemplates, getDocumentTemplate, deleteDocumentTemplate,
  TemplateValidationError, TemplateNotFoundError,
} from "@/lib/accounting/templates";
import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

let org: TestOrg;
beforeEach(async () => { org = await createTestOrg(); });
afterEach(async () => { await dropTestOrg(org.orgId); });

async function revenueAccountId(orgId: string): Promise<string> {
  const row = await prisma.chartAccount.findFirstOrThrow({
    where: { organizationId: orgId, accountType: "REVENUE", reportCategory: "SALES" },
    select: { id: true },
  });
  return row.id;
}

function sampleInput(orgContactId: string, accountId: string) {
  return {
    kind: "invoice" as const, name: "Monthly retainer", contactId: orgContactId,
    currency: "GBP" as const, dueDateOffsetDays: 30,
    lines: [{ accountId, description: "Retainer", quantity: "1.00", unitPrice: "500.00", discount: "0", taxCode: "vat_20" }],
  };
}

it("round-trips save → list → get → delete", async () => {
  const accountId = await revenueAccountId(org.orgId);
  const { id } = await saveDocumentTemplate(prisma, org.orgId, org.userId, sampleInput(org.customerId, accountId));
  const list = await listDocumentTemplates(prisma, org.orgId, "invoice");
  expect(list.map((t) => t.name)).toContain("Monthly retainer");
  const full = await getDocumentTemplate(prisma, org.orgId, id);
  expect(full.contactId).toBe(org.customerId);
  expect(full.currency).toBe("GBP");
  expect(full.dueDateOffsetDays).toBe(30);
  expect(full.lines).toHaveLength(1);
  expect(full.lines[0]).toMatchObject({ accountId, description: "Retainer", quantity: "1.00", unitPrice: "500.00", taxCode: "vat_20" });
  expect(full.lines[0]).not.toHaveProperty("amount"); // no monetary amounts stored
  await deleteDocumentTemplate(prisma, org.orgId, id);
  await expect(getDocumentTemplate(prisma, org.orgId, id)).rejects.toBeInstanceOf(TemplateNotFoundError);
});

it("re-saving the same (kind,name) updates rather than duplicates", async () => {
  const accountId = await revenueAccountId(org.orgId);
  await saveDocumentTemplate(prisma, org.orgId, org.userId, sampleInput(org.customerId, accountId));
  await saveDocumentTemplate(prisma, org.orgId, org.userId, { ...sampleInput(org.customerId, accountId), dueDateOffsetDays: 14 });
  const list = await listDocumentTemplates(prisma, org.orgId, "invoice");
  expect(list.filter((t) => t.name === "Monthly retainer")).toHaveLength(1);
  const only = await getDocumentTemplate(prisma, org.orgId, list[0].id);
  expect(only.dueDateOffsetDays).toBe(14);
});

it("rejects an empty name or empty line set", async () => {
  const accountId = await revenueAccountId(org.orgId);
  await expect(saveDocumentTemplate(prisma, org.orgId, org.userId, { ...sampleInput(org.customerId, accountId), name: "  " }))
    .rejects.toBeInstanceOf(TemplateValidationError);
  await expect(saveDocumentTemplate(prisma, org.orgId, org.userId, { ...sampleInput(org.customerId, accountId), lines: [] }))
    .rejects.toBeInstanceOf(TemplateValidationError);
});

it("does not leak templates across orgs", async () => {
  const accountId = await revenueAccountId(org.orgId);
  const { id } = await saveDocumentTemplate(prisma, org.orgId, org.userId, sampleInput(org.customerId, accountId));
  const other = await createTestOrg();
  try {
    expect(await listDocumentTemplates(prisma, other.orgId, "invoice")).toHaveLength(0);
    await expect(getDocumentTemplate(prisma, other.orgId, id)).rejects.toBeInstanceOf(TemplateNotFoundError);
    await expect(deleteDocumentTemplate(prisma, other.orgId, id)).rejects.toBeInstanceOf(TemplateNotFoundError);
    expect(await prisma.documentTemplate.count({ where: { id } })).toBe(1); // untouched
  } finally {
    await dropTestOrg(other.orgId);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test tests/document-templates.test.ts`
Expected: FAIL — `@/lib/accounting/templates` not found.

- [ ] **Step 3: Implement `lib/accounting/templates.ts`**

```ts
import { CurrencyCode } from "@prisma/client";
import type { ExtendedPrismaClient } from "@/lib/prisma";

export type DocumentTemplateKind = "invoice" | "bill";

export type TemplateLineInput = {
  accountId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxCode: string;
};

export type SaveTemplateInput = {
  kind: DocumentTemplateKind;
  name: string;
  contactId?: string | null;
  currency?: CurrencyCode;
  dueDateOffsetDays?: number | null;
  lines: TemplateLineInput[];
};

export type FullTemplate = {
  id: string;
  kind: DocumentTemplateKind;
  name: string;
  contactId: string | null;
  currency: CurrencyCode;
  dueDateOffsetDays: number | null;
  lines: TemplateLineInput[];
  updatedAt: string;
};

export class TemplateValidationError extends Error { code = "VALIDATION" as const; }
export class TemplateNotFoundError extends Error { code = "NOT_FOUND" as const; }

function sanitizeLines(lines: TemplateLineInput[]): TemplateLineInput[] {
  return lines.map((l) => ({
    accountId: l.accountId,
    description: l.description ?? "",
    quantity: String(l.quantity ?? ""),
    unitPrice: String(l.unitPrice ?? ""),
    discount: String(l.discount ?? "0"),
    taxCode: l.taxCode,
  }));
}

export async function saveDocumentTemplate(
  client: ExtendedPrismaClient,
  orgId: string,
  actorUserId: string,
  input: SaveTemplateInput
): Promise<{ id: string }> {
  const name = (input.name ?? "").trim();
  if (!name) throw new TemplateValidationError("Template name is required.");
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new TemplateValidationError("A template needs at least one line.");
  }
  if (input.kind !== "invoice" && input.kind !== "bill") {
    throw new TemplateValidationError("Invalid template kind.");
  }

  const data = {
    contactId: input.contactId ?? null,
    currency: input.currency ?? CurrencyCode.GBP,
    dueDateOffsetDays: input.dueDateOffsetDays ?? null,
    lines: sanitizeLines(input.lines) as unknown as object,
  };

  const existing = await client.documentTemplate.findFirst({
    where: { organizationId: orgId, kind: input.kind, name },
    select: { id: true },
  });

  if (existing) {
    await client.documentTemplate.updateMany({
      where: { id: existing.id, organizationId: orgId },
      data,
    });
    return { id: existing.id };
  }

  const created = await client.documentTemplate.create({
    data: { organizationId: orgId, kind: input.kind, name, createdByUserId: actorUserId, ...data },
    select: { id: true },
  });
  return { id: created.id };
}

export async function listDocumentTemplates(
  client: ExtendedPrismaClient,
  orgId: string,
  kind: DocumentTemplateKind
) {
  const rows = await client.documentTemplate.findMany({
    where: { organizationId: orgId, kind },
    orderBy: { name: "asc" },
    select: { id: true, name: true, contactId: true, updatedAt: true },
  });
  return rows.map((r) => ({
    id: r.id, name: r.name, contactId: r.contactId,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getDocumentTemplate(
  client: ExtendedPrismaClient,
  orgId: string,
  id: string
): Promise<FullTemplate> {
  const row = await client.documentTemplate.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!row) throw new TemplateNotFoundError("Template not found.");
  return {
    id: row.id,
    kind: row.kind as DocumentTemplateKind,
    name: row.name,
    contactId: row.contactId,
    currency: row.currency,
    dueDateOffsetDays: row.dueDateOffsetDays,
    lines: (row.lines as unknown as TemplateLineInput[]) ?? [],
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deleteDocumentTemplate(
  client: ExtendedPrismaClient,
  orgId: string,
  id: string
): Promise<void> {
  const res = await client.documentTemplate.deleteMany({ where: { id, organizationId: orgId } });
  if (res.count === 0) throw new TemplateNotFoundError("Template not found.");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/document-templates.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit checkpoint**

Run: `pnpm typecheck` → exit 0.

```bash
git add lib/accounting/templates.ts tests/document-templates.test.ts
# stage only
```

---

### Task 6: Template server actions

**Files:**
- Modify: `app/(dashboard)/sales/invoices/actions.ts`
- Modify: `app/(dashboard)/purchases/actions.ts`

**Interfaces:**
- Consumes: the Task 5 DAL + `requireAccountantRole` (`@/lib/accounting/dal`) + `prisma`.
- Produces (invoice): `saveInvoiceTemplate(input)`, `listInvoiceTemplates()`, `getInvoiceTemplate(id)`, `deleteInvoiceTemplate(id)` — each forcing `kind: "invoice"`. Analogous `*BillTemplate*` in the purchases file with `kind: "bill"`.

- [ ] **Step 1: Add invoice template actions**

In `app/(dashboard)/sales/invoices/actions.ts`, add imports and actions:

```ts
import {
  saveDocumentTemplate, listDocumentTemplates, getDocumentTemplate, deleteDocumentTemplate,
  type SaveTemplateInput,
} from "@/lib/accounting/templates";

export async function saveInvoiceTemplate(input: Omit<SaveTemplateInput, "kind">) {
  const workspace = await requireAccountantRole();
  return saveDocumentTemplate(prisma, workspace.organizationId, workspace.userId, { ...input, kind: "invoice" });
}
export async function listInvoiceTemplates() {
  const workspace = await requireAccountantRole();
  return listDocumentTemplates(prisma, workspace.organizationId, "invoice");
}
export async function getInvoiceTemplate(id: string) {
  const workspace = await requireAccountantRole();
  return getDocumentTemplate(prisma, workspace.organizationId, id);
}
export async function deleteInvoiceTemplate(id: string) {
  const workspace = await requireAccountantRole();
  await deleteDocumentTemplate(prisma, workspace.organizationId, id);
  return { success: true };
}
```

- [ ] **Step 2: Add bill template actions**

In `app/(dashboard)/purchases/actions.ts`, add the analogous four actions using `kind: "bill"` and names `saveBillTemplate`/`listBillTemplates`/`getBillTemplate`/`deleteBillTemplate`. (Confirm the file already imports `requireAccountantRole` and `prisma`; if not, add them.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck` → exit 0.

- [ ] **Step 4: Commit checkpoint**

```bash
git add "app/(dashboard)/sales/invoices/actions.ts" "app/(dashboard)/purchases/actions.ts"
# stage only
```

---

### Task 7: Template UI (Save / Load) on both forms

**Files:**
- Modify: `components/sales/add-invoice-dialog.tsx`
- Modify: `components/purchases/add-bill-dialog.tsx`

**Interfaces:**
- Consumes: invoice actions from Task 6 (and bill actions for the bill form). Reuses the form's existing `setForm`, `form.lines`, `form.contactId`, `form.currency`, `form.issueDate`, `form.dueDate`.

- [ ] **Step 1: Wire the invoice form's template controls**

In `components/sales/add-invoice-dialog.tsx`, import the actions and add state:

```ts
import { saveInvoiceTemplate, listInvoiceTemplates, getInvoiceTemplate, deleteInvoiceTemplate } from "@/app/(dashboard)/sales/invoices/actions";
// near other useState:
const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
const [templateName, setTemplateName] = useState("");
useEffect(() => { listInvoiceTemplates().then((t) => setTemplates(t)).catch(() => {}); }, []);
```

Add helper handlers inside the component:

```ts
function dueOffsetDays(): number | null {
  if (!form.dueDate || !form.issueDate) return null;
  const ms = new Date(form.dueDate).getTime() - new Date(form.issueDate).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}
async function handleSaveTemplate() {
  const name = templateName.trim();
  if (!name) return;
  await saveInvoiceTemplate({
    name, contactId: form.contactId || null, currency: form.currency,
    dueDateOffsetDays: dueOffsetDays(),
    lines: form.lines.map((l: any) => ({
      accountId: l.accountId, description: l.description, quantity: l.quantity,
      unitPrice: l.unitPrice, discount: l.discount ?? "0", taxCode: l.taxCode,
    })),
  });
  setTemplateName("");
  setTemplates(await listInvoiceTemplates());
}
async function handleLoadTemplate(id: string) {
  const t = await getInvoiceTemplate(id);
  setForm((cur: any) => ({
    ...cur,
    contactId: t.contactId ?? cur.contactId,
    currency: t.currency,
    dueDate: t.dueDateOffsetDays != null ? addDays(cur.issueDate || today(), t.dueDateOffsetDays) : cur.dueDate,
    lines: t.lines.map((l) => ({
      accountId: l.accountId, description: l.description, quantity: l.quantity,
      unitPrice: l.unitPrice, amount: "", discount: l.discount, taxCode: l.taxCode,
    })),
  }));
}
async function handleDeleteTemplate(id: string) {
  await deleteInvoiceTemplate(id);
  setTemplates(await listInvoiceTemplates());
}
```

- [ ] **Step 2: Render the invoice template controls**

Near the top of the form (e.g. above the line-items section), add:

```tsx
<div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
  <Select onValueChange={(id) => { if (id) handleLoadTemplate(id); }}>
    <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Load template…" /></SelectTrigger>
    <SelectContent>
      {templates.length === 0 ? (
        <div className="px-3 py-2 text-xs text-slate-400">No templates yet</div>
      ) : templates.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 pr-2">
          <SelectItem value={t.id} className="flex-1">{t.name}</SelectItem>
          <button type="button" className="text-xs text-red-500 hover:underline" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteTemplate(t.id); }}>Delete</button>
        </div>
      ))}
    </SelectContent>
  </Select>
  <div className="ml-auto flex items-center gap-2">
    <input className="h-9 w-48 rounded-md border border-slate-200 px-2 text-sm" placeholder="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
    <button type="button" className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={!templateName.trim() || form.lines.length === 0} onClick={handleSaveTemplate}>Save as template</button>
  </div>
</div>
```

- [ ] **Step 3: Mirror onto the bill form**

In `components/purchases/add-bill-dialog.tsx`, repeat Steps 1–2 using the BILL actions (`saveBillTemplate`/`listBillTemplates`/`getBillTemplate`/`deleteBillTemplate` from `@/app/(dashboard)/purchases/actions`). The handler bodies and JSX are identical except for the imported action names.

- [ ] **Step 4: Verify typecheck + render**

Run: `pnpm typecheck` → exit 0.
Manual: On Create Invoice, add a customer + lines, type a name, "Save as template" → it appears in the Load dropdown; reset the form, pick the template → contact, lines, currency, and due date prefill; Delete removes it. Repeat on Create Bill with a supplier.

- [ ] **Step 5: Commit checkpoint**

```bash
git add components/sales/add-invoice-dialog.tsx components/purchases/add-bill-dialog.tsx
# stage only
```

---

### Task 8: Full-suite verification

**Files:** none (verification).

- [ ] **Step 1: Run the full suite + typecheck**

Run: `pnpm typecheck` (exit 0) then `pnpm test`.
Expected: previously-green suite still green plus the new `document-address` (3) and `document-templates` (4) tests; tenancy completeness test green with `DocumentTemplate` registered.

- [ ] **Step 2: Confirm the migration is recorded and applied**

Run: `ls prisma/migrations/20260630120000_invoice_bill_address_and_templates/migration.sql` (exists) and confirm the dev DB has the columns/table (`pnpm prisma db execute --schema prisma/schema.prisma --file <the file>` re-runs cleanly via `IF NOT EXISTS`).

- [ ] **Step 3: Stage docs / final checkpoint**

```bash
git add -A
# stage only — owner commits manually
```

---

## Self-review notes

- **Spec coverage:** §4.1 columns → Task 1; §4.2 transport/persist/read-back → Task 1 (Steps 7–11); §4.3 form behaviour → Tasks 2–3; §4.4 tests → Task 1 test; §5.1 schema/registry → Task 4; §5.2 DAL → Task 5; §5.3 actions → Task 6; §5.4 form UI → Task 7; §5.5 tests → Task 5 test; §6 migration strategy → Tasks 1/4 (single SQL file, `db execute`, `IF NOT EXISTS`); §7 isolation → DAL org filters + ORG_SCOPED registration (Task 4/5); §8 DoD → Task 8.
- **Type consistency:** `billingAddress` is `string | null` on read types and `string?` on the input; `DocumentTemplateKind`/`TemplateLineInput`/`SaveTemplateInput`/`FullTemplate` and the four DAL function names are used identically in Tasks 5–7. `dueDateOffsetDays` is `number | null` throughout.
- **Known UI-test limitation (documented, not a gap):** the repo has no React component test harness, so Tasks 2/3/7 are verified by `pnpm typecheck` + manual QA; all data-layer behaviour (persistence, template CRUD, tenant isolation) is covered by Vitest integration tests in Tasks 1 and 5.
- **Migration apply is an environment action:** Steps that run `pnpm prisma db execute` mutate the shared dev DB. This is intentional and mirrors W2-3; flag it to the owner before running in any shared environment.
