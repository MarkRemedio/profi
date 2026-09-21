# Contact Display Name Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each contact choose whether it displays as its business name (`contacts.name`) or its primary person's name (`first_name` + `last_name`), and honour that choice everywhere the contact is shown.

**Architecture:** One new column `contacts.display_name_preference` (`'business' | 'primary'`, defaulting to `'business'`), plus a single pure resolver `contactDisplayName()` in `lib/accounting/contact-name.ts`. Six DTO mappers carry the resolver to ~30 downstream render sites; ~11 components read `contact.name` directly and are edited individually. Twelve Prisma selects must be widened to fetch the fields the resolver needs.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 7 + PostgreSQL (Supabase), TypeScript, vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-15-contact-display-name-design.md`

## Global Constraints

These apply to **every** task below.

- **Commit each task on the feature branch `feature/contact-display-name`. NEVER push, and never commit to `master`.** The repo owner merges to master manually. Each task ends with one commit of that task's work, using the project's `feat:` / `refactor:` message convention.
- **No tests in this run.** Task 12 (the testing pass) is SKIPPED by the owner's decision. Tasks 1–11 verify via `pnpm typecheck`, a `pnpm lint` baseline check, and the grep sweeps that prove no Prisma select was left un-widened. Do not write tests. Do not run `pnpm test` (the suite has two known pre-existing failures on master unrelated to this work).
- **`pnpm typecheck` must pass cleanly.** This is a real gate — it is expected to be green.
- **`pnpm lint` does NOT pass on this repo and never has.** Verified 2026-07-15: `master` and this branch both report exactly **141 problems (117 errors, 24 warnings)**, almost all `@typescript-eslint/no-require-imports` in `scripts/*.cjs`. Do not try to fix them; they are out of scope. The gate is **"no NEW problems"**: run `pnpm lint 2>&1 | grep problems` and confirm the count is still 141, and that no error names a file you touched. A rising count is a task failure.
- **The grep verification steps are mandatory, not optional.** They are the only automated check on this design's silent failure mode (see "Notes for the reviewer"). A grep step that returns unexpected output is a task failure, not a curiosity.
- **Package manager is `pnpm`** (v11.1.1). Never use `npm` or `yarn`.
- **Preference values are exactly the strings `'business'` and `'primary'`.** No other value is valid anywhere.
- **The resolver takes snake_case fields** (`first_name`, `last_name`, `display_name_preference`) because both the Prisma `Contact` model and the Supabase client rows use snake_case for these specific fields. Do not "normalise" them to camelCase.
- **Never change already-posted journal memos.** New memos use the display name; historical memo text is an audit record and stays as posted.
- **Read before editing.** Line numbers in this plan were captured on 2026-07-15 and may drift. Always locate the code by its content, not by trusting the line number.

---

### Task 1: Database column and Prisma model

**Files:**
- Create: `prisma/migrations/20260715120000_contact_display_name_preference/migration.sql`
- Modify: `prisma/schema.prisma` (the `Contact` model, ~line 178-216)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the column `contacts.display_name_preference` and the Prisma field `Contact.display_name_preference: string`. Every later task depends on both existing.

- [ ] **Step 1: Write the migration**

Create `prisma/migrations/20260715120000_contact_display_name_preference/migration.sql`:

```sql
-- Which name a contact displays: its business name (contacts.name) or its
-- primary person (first_name + last_name). Consumed by contactDisplayName()
-- in lib/accounting/contact-name.ts. Defaults to 'business', which is the
-- behaviour that existed before this column, so no backfill is needed.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS display_name_preference text NOT NULL DEFAULT 'business';

ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_display_name_preference_check;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_display_name_preference_check
    CHECK (display_name_preference IN ('business', 'primary'));
```

The `IF NOT EXISTS` / `DROP ... IF EXISTS` pairing follows the existing convention in `prisma/migrations/20260706090000_org_vat_registered/migration.sql` and makes the migration safe to re-run.

- [ ] **Step 2: Add the field to the Prisma Contact model**

In `prisma/schema.prisma`, find the `Contact` model. It currently contains this run of snake_case fields:

```prisma
  first_name          String?
  last_name           String?
  account_number      String?
```

Add the new field immediately after `last_name`, so it sits with the other snake_case columns:

```prisma
  first_name              String?
  last_name               String?
  display_name_preference String    @default("business")
  account_number          String?
```

Note it is **non-nullable with a default** — matching the SQL. Do not make it `String?`.

- [ ] **Step 3: Apply the migration**

Run: `pnpm prisma migrate deploy`

Expected: output includes `Applying migration '20260715120000_contact_display_name_preference'` and ends with no error.

If the environment has no database connection, stop and report — every later task depends on this column existing.

- [ ] **Step 4: Regenerate the Prisma client**

Run: `pnpm prisma generate`

Expected: `Generated Prisma Client ... in NNNms`.

- [ ] **Step 5: Verify the column exists and defaults correctly**

Run:

```bash
pnpm prisma db execute --stdin <<'SQL'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'contacts' AND column_name = 'display_name_preference';
SQL
```

Expected: one row, `data_type` = `text`, `is_nullable` = `NO`, `column_default` = `'business'::text`.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`

Expected: no errors. (Nothing references the field yet; this confirms the generated client is valid.)

- [ ] **Step 7: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master). Report: migration applied, column verified, Prisma field added.

---

### Task 2: The resolver

**Files:**
- Create: `lib/accounting/contact-name.ts`

**Interfaces:**
- Consumes: `Contact.display_name_preference` from Task 1.
- Produces:
  - `export type ContactNameParts = { name: string; first_name?: string | null; last_name?: string | null; display_name_preference?: string | null }`
  - `export function contactDisplayName(c: ContactNameParts): string`
  - `export const CONTACT_NAME_SELECT` — a Prisma select fragment, spread into every `contact: { select: ... }` that feeds the resolver.

  Every task from 3 onward imports from this file.

- [ ] **Step 1: Write the resolver**

Create `lib/accounting/contact-name.ts`:

```ts
// Single source of truth for which name a contact displays.
//
// A contact's `name` is its business name ("Acme Ltd"); `first_name` /
// `last_name` describe the primary person at that contact ("Jane Smith").
// `display_name_preference` chooses between them.
//
// NOTE: the rule is duplicated as a SQL CASE expression in
// lib/accounting/reports.ts (the general-ledger raw query cannot call this
// function). Change both together.

export type ContactNameParts = {
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name_preference?: string | null;
};

/**
 * Resolve the name to display for a contact.
 *
 * Anything other than the exact string "primary" resolves to the business
 * name, so a null/unknown preference degrades to the pre-feature behaviour
 * rather than throwing.
 *
 * Falls back to the business name when the preference is "primary" but no
 * primary person has been entered — a contact never renders blank.
 */
export function contactDisplayName(c: ContactNameParts): string {
  if (c.display_name_preference !== "primary") return c.name;
  const primary = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return primary || c.name;
}

/**
 * Prisma select fragment for every field contactDisplayName() reads.
 *
 * Spread this into any `contact: { select: ... }` whose result is passed to
 * contactDisplayName(). Omitting a field does not fail loudly — the resolver
 * just silently returns the business name — so always use this constant
 * instead of listing the fields by hand.
 */
export const CONTACT_NAME_SELECT = {
  name: true,
  first_name: true,
  last_name: true,
  display_name_preference: true,
} as const;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`

Expected: no errors in `lib/accounting/contact-name.ts`.

- [ ] **Step 4: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master). Report the exported signatures so the next task can rely on them.

---

### Task 3: Invoice and bill mappers

**Files:**
- Modify: `lib/accounting/documents.ts` — `documentInclude` (~814), `mapInvoice` (~733), `mapBill` (~776), `listInvoices` select (~843), `listBills` select (~927)

**Interfaces:**
- Consumes: `contactDisplayName`, `CONTACT_NAME_SELECT` from Task 2.
- Produces: no signature changes. `InvoiceWithLines.contactName` and `BillWithLines.contactName` keep type `string`; only their *value* changes.

**Critical context:** `listInvoices` and `listBills` use explicit `select` blocks and then call `invoices.map(mapInvoice as any)`. That `as any` cast means **TypeScript will NOT catch a select you forget to widen** — the code compiles and silently shows the business name forever. Widen every select listed below by hand.

- [ ] **Step 1: Import the resolver**

At the top of `lib/accounting/documents.ts`, add to the existing imports:

```ts
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
```

- [ ] **Step 2: Widen `documentInclude`**

Find:

```ts
const documentInclude = {
  contact: { select: { name: true, paymentTermsDays: true } },
```

Replace with:

```ts
const documentInclude = {
  contact: { select: { ...CONTACT_NAME_SELECT, paymentTermsDays: true } },
```

`InvoiceForMapper` and `BillForMapper` are derived from `documentInclude` via `Prisma.InvoiceGetPayload`, so their types widen automatically.

- [ ] **Step 3: Widen the `listInvoices` select**

Inside `listInvoices`, find:

```ts
      contact: { select: { name: true, paymentTermsDays: true } },
```

Replace with:

```ts
      contact: { select: { ...CONTACT_NAME_SELECT, paymentTermsDays: true } },
```

- [ ] **Step 4: Widen the `listBills` select**

Inside `listBills`, find the identical line:

```ts
      contact: { select: { name: true, paymentTermsDays: true } },
```

Replace with:

```ts
      contact: { select: { ...CONTACT_NAME_SELECT, paymentTermsDays: true } },
```

There are three occurrences of this line in the file in total (`documentInclude`, `listInvoices`, `listBills`). All three must be changed.

- [ ] **Step 5: Use the resolver in `mapInvoice`**

Find:

```ts
    contactName: invoice.contact?.name ?? "Unknown customer",
```

Replace with:

```ts
    contactName: invoice.contact ? contactDisplayName(invoice.contact) : "Unknown customer",
```

- [ ] **Step 6: Use the resolver in `mapBill`**

Find:

```ts
    contactName: bill.contact?.name ?? "Unknown supplier",
```

Replace with:

```ts
    contactName: bill.contact ? contactDisplayName(bill.contact) : "Unknown supplier",
```

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 8: Verify no select was missed**

Run: `grep -n "select: { name: true" lib/accounting/documents.ts`

Expected: **no output.** Any remaining hit is a select that still needs widening.

- [ ] **Step 9: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master). Report which selects were widened.

---

### Task 4: Receipt mappers and memo guards

**Files:**
- Modify: `lib/accounting/receipts.ts` — contact guard select (~115), void-memo selects (~351, ~497, ~680, ~748), receipt mapper (~452)

**Interfaces:**
- Consumes: `contactDisplayName`, `CONTACT_NAME_SELECT` from Task 2.
- Produces: no signature changes. `contactName` on the receipt DTO stays `string`.

- [ ] **Step 1: Import the resolver**

At the top of `lib/accounting/receipts.ts`:

```ts
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
```

- [ ] **Step 2: Widen the contact guard select**

Find:

```ts
    select: { id: true, name: true },
```

(inside the `tx.contact.findFirst` that throws "Selected contact is not an active customer of this organization.")

Replace with:

```ts
    select: { id: true, ...CONTACT_NAME_SELECT },
```

This guard's return value feeds the journal memos in Task 7, which is why it needs the extra fields.

- [ ] **Step 3: Widen every `contact: { select: { name: true } }`**

Run: `grep -n "contact: { select: { name: true } }" lib/accounting/receipts.ts`

Expected: four hits (approximately lines 351, 497, 680, 748).

Replace **each** occurrence with:

```ts
        contact: { select: CONTACT_NAME_SELECT },
```

- [ ] **Step 4: Use the resolver in the receipt mapper**

Find:

```ts
    contactName: row.contact?.name ?? "Unknown customer",
```

Replace with:

```ts
    contactName: row.contact ? contactDisplayName(row.contact) : "Unknown customer",
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 6: Verify no select was missed**

Run: `grep -n "select: { name: true\|select: { id: true, name: true }" lib/accounting/receipts.ts`

Expected: no output.

- [ ] **Step 7: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master).

---

### Task 5: Pickers, statements, and banking options

**Files:**
- Modify: `lib/accounting/documents.ts` — `getDocumentOptions` (~956, ~988)
- Modify: `lib/accounting/customer-statement-loader.ts` (~29, ~122)
- Modify: `lib/banking/dal.ts` (~874)

**Interfaces:**
- Consumes: `contactDisplayName`, `CONTACT_NAME_SELECT` from Task 2.
- Produces: no signature changes. `ContactSummary.name` (defined at `lib/accounting/documents.ts:76`) keeps type `string` — it now carries the *display* name. Do not rename the property; ~6 components destructure it.

- [ ] **Step 1: Widen and resolve in `getDocumentOptions`**

In `lib/accounting/documents.ts`, inside `getDocumentOptions`, find:

```ts
      select: { id: true, name: true, contactType: true, paymentTermsDays: true, billingAddress: true },
```

Replace with:

```ts
      select: {
        id: true,
        ...CONTACT_NAME_SELECT,
        contactType: true,
        paymentTermsDays: true,
        billingAddress: true,
      },
```

Then find, in the same function's return block:

```ts
    contacts: contacts.map((contact): ContactSummary => ({
      id: contact.id,
      name: contact.name,
```

Replace the `name` line only:

```ts
    contacts: contacts.map((contact): ContactSummary => ({
      id: contact.id,
      name: contactDisplayName(contact),
```

Leave `orderBy: { name: "asc" }` alone — sorting stays on the business name. Sorting by display name would require sorting in JS after the query, which is out of scope.

- [ ] **Step 2: Widen and resolve in the statement loader**

In `lib/accounting/customer-statement-loader.ts`, add the import:

```ts
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
```

Find:

```ts
      select: { id: true, name: true, email: true, billingAddress: true },
```

Replace with:

```ts
      select: { id: true, ...CONTACT_NAME_SELECT, email: true, billingAddress: true },
```

Then go to the statement bundle construction (~line 122) where the contact's name is assigned. Read the surrounding code, then wrap the contact-name read in `contactDisplayName(contact)`. The property being assigned keeps its current name and `string` type.

- [ ] **Step 3: Widen and resolve in the banking DAL**

In `lib/banking/dal.ts`, add the import:

```ts
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
```

Find (~line 874):

```ts
      select: { id: true, name: true, contactType: true, email: true },
```

Replace with:

```ts
      select: { id: true, ...CONTACT_NAME_SELECT, contactType: true, email: true },
```

Then find where that result is mapped into contact options and wrap the name read in `contactDisplayName(contact)`. Read the surrounding code first — this feeds the money-in / money-out dropdowns in `components/banking/money-modals.tsx`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 5: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master).

---

### Task 6: General ledger raw SQL

**Files:**
- Modify: `lib/accounting/reports.ts` (~198)

**Interfaces:**
- Consumes: nothing at runtime — this task deliberately duplicates the rule in SQL.
- Produces: `contact_name` in the GL row result keeps type `string | null`, now carrying the display name.

**Context:** This is the **only** place the display-name rule exists twice. The GL query is a `Prisma.sql` raw query joining `contacts c`, so it cannot call the TypeScript resolver. The two must be kept in sync by hand — hence the comment.

- [ ] **Step 1: Replace the contact name projection**

In `lib/accounting/reports.ts`, inside the raw SQL template, find:

```sql
      c.name as contact_name,
```

Replace with:

```sql
      -- Mirrors contactDisplayName() in lib/accounting/contact-name.ts.
      -- If you change the rule there, change it here too.
      case when c.display_name_preference = 'primary'
                and nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '') is not null
           then trim(concat_ws(' ', c.first_name, c.last_name))
           else c.name
      end as contact_name,
```

`concat_ws` skips NULLs, and `nullif(trim(...), '')` catches the both-empty case — together these reproduce the resolver's fallback exactly.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 3: Smoke-test the SQL**

Run:

```bash
pnpm prisma db execute --stdin <<'SQL'
SELECT
  case when c.display_name_preference = 'primary'
            and nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '') is not null
       then trim(concat_ws(' ', c.first_name, c.last_name))
       else c.name
  end as contact_name
FROM contacts c
LIMIT 5;
SQL
```

Expected: runs without a SQL error. (With no `primary` contacts yet, every row returns the business name — that is correct.)

- [ ] **Step 4: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master). Flag explicitly that the rule now exists in two places.

---

### Task 7: Journal memos

**Files:**
- Modify: `lib/accounting/documents.ts` (~1381 select, and memos at ~1463, ~1647, ~1720, ~2246)
- Modify: `lib/accounting/receipts.ts` (memos at ~309, ~383, ~638, ~711)

**Interfaces:**
- Consumes: `contactDisplayName`, `CONTACT_NAME_SELECT` from Task 2; the widened guard select from Task 4 Step 2.
- Produces: nothing new.

**Context:** Memos bake the name into `journals.memo` at post time. New memos use the display name. **Already-posted memos are never rewritten** — they are audit records. Do not write any backfill.

- [ ] **Step 1: Widen ALL FOUR memo selects in `documents.ts`**

**Corrected 2026-07-15 during execution:** an earlier draft of this plan said there was one such select at ~1381. There are **four**. Task 3 verified them at lines 1382, 1572, 1703, and 2225 — they feed the journal memos in `approveInvoice`, bill approval, `payBill`, and invoice-payment posting respectively. All four must be widened.

Run: `grep -n "contact: { select: { name: true } }" lib/accounting/documents.ts`

Expected: exactly four hits.

Replace **each** of the four with:

```ts
        contact: { select: CONTACT_NAME_SELECT },
```

If grep returns a number other than four, stop and report rather than guessing.

- [ ] **Step 2: Resolve the name in each memo in `documents.ts`**

Run: `grep -n "contact.name\|contact?.name" lib/accounting/documents.ts`

For each remaining hit inside a memo template string (approximately lines 1463, 1647, 1720, 2246), read the surrounding code and replace the name read with `contactDisplayName(contact)`. The memo text format is unchanged — for example:

```ts
        memo: `Invoice ${invoiceNo} - ${contact.name}`,
```

becomes:

```ts
        memo: `Invoice ${invoiceNo} - ${contactDisplayName(contact)}`,
```

Match whatever local variable holds the contact at each site; it is not always called `contact`.

- [ ] **Step 3: Resolve the name in each memo in `receipts.ts`**

Run: `grep -n "contact.name\|contact?.name\|receipt.contact" lib/accounting/receipts.ts`

For each hit inside a memo template string (approximately lines 309, 383, 638, 711), apply the same change.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 5: Verify `lib/` is clean — this is the run's most important check**

Task 7 is the last task to touch `lib/`, so these two greps are the point at which `lib/` must come out clean. Earlier tasks could not satisfy them (their leftovers were this task's work); there is no later task to defer to.

Run: `grep -rn "contact?.name\|contact\.name" lib/`

Expected: **no output.** Every contact-name read in `lib/` now goes through `contactDisplayName`. (`lib/accounting/reports.ts` composes the name in SQL, so it will not appear in this pattern.)

Run: `grep -rn "select: { name: true\|select: { id: true, name: true }\|contact: { select: { name: true } }" lib/`

Expected: **no output.** Any hit is a Prisma select still feeding the resolver an input with no `display_name_preference`, which fails silently.

If either grep returns output, that is a task failure — fix it or report it. Do not proceed while either is dirty.

- [ ] **Step 6: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master).

---

### Task 8: Sales, purchases, and banking components

**Files:**
- Modify: `components/sales/customers.tsx` (~450, ~453)
- Modify: `components/sales/view-customer-dialog.tsx` (~22)
- Modify: `components/purchases/suppliers.tsx` (~282, ~285)
- Modify: `components/banking/money-modals.tsx` (~330, ~475)

**Interfaces:**
- Consumes: `contactDisplayName` from Task 2.
- Produces: nothing new.

**Context:** These four read `contact.name` directly from a Supabase row rather than through a DTO mapper. The Supabase queries use `.select("*")`, so all the fields the resolver needs are already present — no query changes required here.

Note that `customers.tsx:450` and `suppliers.tsx:282` compute **avatar initials** from the name. Those must derive from the display name too, or a contact shows "JS" next to "Acme Ltd".

- [ ] **Step 1: Update the customer table**

In `components/sales/customers.tsx`, add:

```ts
import { contactDisplayName } from "@/lib/accounting/contact-name";
```

Read lines ~445-460. There are two reads: one building initials, one rendering the name. Introduce a single local before them and use it for both:

```tsx
const displayName = contactDisplayName(contact);
```

Then replace the initials source and the rendered name with `displayName`. Match the existing initials logic exactly — only its *input* changes, not how it slices characters.

- [ ] **Step 2: Update the view-customer dialog**

In `components/sales/view-customer-dialog.tsx`, add the same import. At ~line 22 the name appears twice: in the `<h2>` and as a `title` tooltip. Replace both with `contactDisplayName(contact)`.

- [ ] **Step 3: Update the supplier table**

In `components/purchases/suppliers.tsx`, apply the same treatment as Step 1 (initials + name from one `displayName` local).

- [ ] **Step 4: Update the banking modals**

In `components/banking/money-modals.tsx` (~330, ~475), these render contact dropdown options. Task 5 already resolves the name in `lib/banking/dal.ts`, so **check first**: if the option objects already carry a resolved name from the DAL, change nothing here and note that in the report. Only if a component reads a raw `contact.name` off a full row does it need the resolver.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`

Expected: no errors.

- [ ] **Step 6: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master). State whether Step 4 required a change.

---

### Task 9: Print clients, and the stale vendor fix

**Files:**
- Modify: `app/print/invoice/[id]/print-client.tsx` (~133)
- Modify: `app/print/bill/[id]/print-client.tsx` (~92)

**Interfaces:**
- Consumes: `contactDisplayName` from Task 2.
- Produces: nothing new.

**Context:** Both print pages load with `include: { contact: true }`, so the full contact row is already available — no select widening needed.

`bill.vendor` is a legacy denormalised snapshot column. Today the bill print reads `bill.contact?.name || bill.vendor || "Unknown Vendor"`, so a renamed supplier can print a stale name. This is a pre-existing bug, but left alone it would silently override the new display name. Fixing it is in scope (see spec, "Incidental fix").

- [ ] **Step 1: Fix the invoice print**

In `app/print/invoice/[id]/print-client.tsx`, add:

```ts
import { contactDisplayName } from "@/lib/accounting/contact-name";
```

Find (~line 133):

```tsx
            <p className="font-bold text-slate-800 text-base">{invoice.contact?.name || invoice.contactName || "Unknown Customer"}</p>
```

Replace with:

```tsx
            <p className="font-bold text-slate-800 text-base">{invoice.contact ? contactDisplayName(invoice.contact) : invoice.contactName || "Unknown Customer"}</p>
```

The live contact now wins outright; `contactName` remains only as the no-contact fallback.

- [ ] **Step 2: Fix the bill print and the stale vendor fallback**

In `app/print/bill/[id]/print-client.tsx`, add the same import.

Find (~line 92):

```tsx
            <p className="font-bold text-slate-800 text-base">{bill.contact?.name || bill.vendor || "Unknown Vendor"}</p>
```

Replace with:

```tsx
            {/* Prefer the live contact. `bill.vendor` is a legacy denormalised
                snapshot that goes stale when a supplier is renamed, so it is
                only a fallback for bills with no contact at all. */}
            <p className="font-bold text-slate-800 text-base">{bill.contact ? contactDisplayName(bill.contact) : bill.vendor || "Unknown Vendor"}</p>
```

The behaviour change: previously a supplier with a contact row whose `name` was empty string would fall through to `vendor`; now the live contact always wins when it exists. That is the intended fix.

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`

Expected: no errors.

- [ ] **Step 4: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master).

---

### Task 10: Payroll employee names

**Files:**
- Modify: `app/(dashboard)/payroll/employees/[id]/page.tsx` (~105, ~203)
- Modify: `app/(dashboard)/payroll/employees/page.tsx` (~78)
- Modify: `app/(dashboard)/payroll/actions.ts` (~606)
- Modify: `components/payroll/timesheets-view.tsx` (~113)
- Modify: `components/payroll/run-payroll-view.tsx` (~115)

**Interfaces:**
- Consumes: `contactDisplayName`, `CONTACT_NAME_SELECT` from Task 2.
- Produces: nothing new.

**Context:** Employees are `contacts` rows joined via `Employee.contact`, so the preference applies. Employees are people, so `primary` is the likely choice for them.

**Do NOT touch `components/payroll/myprofile.tsx:196`** — that reads an emergency-contact name unrelated to the `contacts` table.

- [ ] **Step 1: Find every payroll contact-name read and its select**

Run: `grep -rn "contact?.name\|contact\.name" app/\(dashboard\)/payroll/ components/payroll/`

For each hit **except** `myprofile.tsx`, note whether the query feeding it uses a partial `select` on `contact`.

- [ ] **Step 2: Widen any partial payroll selects**

For each query found in Step 1 that selects `contact: { select: { name: true } }` (or similar), widen it:

```ts
        contact: { select: CONTACT_NAME_SELECT },
```

adding the import `import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";` to that file.

If a query uses `include: { contact: true }`, it already has every field — no change needed.

- [ ] **Step 3: Apply the resolver at each read**

Replace each read. For example, `app/(dashboard)/payroll/employees/page.tsx:78`:

```ts
    name: dbEmployee.contact?.name ?? "Unknown employee",
```

becomes:

```ts
    name: dbEmployee.contact ? contactDisplayName(dbEmployee.contact) : "Unknown employee",
```

Apply the equivalent change at each site, preserving each one's existing fallback string (`"Unknown employee"`, `"Unnamed Employee"`, `"Unknown"`, `"Unknown Personnel"` — they differ per site; do not unify them).

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`

Expected: no errors.

- [ ] **Step 5: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master).

---

### Task 11: Contact type wiring and the dialog control

**Files:**
- Modify: `components/sales/use-customers.ts` — `Contact` type (~8-37), `NewContactInput` type (~38-59), `addContact` insert (~184-207)
- Modify: `components/sales/add-customer-dialog.tsx` — imports, form state, the "Contact details" section (~94-112), `handleSubmit` (~48-67)

**Interfaces:**
- Consumes: `contactDisplayName` from Task 2; the DB column from Task 1.
- Produces: `Contact.display_name_preference: string` and `NewContactInput.display_name_preference?: string` on the client types.

**Context:** `updateContact` passes its `Partial<NewContactInput>` straight to `.update(input)`, so it needs no change once the type carries the field. `addContact` lists every column explicitly and **does** need the new line.

- [ ] **Step 1: Add the field to the client types**

In `components/sales/use-customers.ts`, in the `Contact` type, after `last_name: string | null;`:

```ts
  display_name_preference: string;
```

In the `NewContactInput` type, after `last_name?: string;`:

```ts
  display_name_preference?: string;
```

- [ ] **Step 2: Persist the field in `addContact`**

In `addContact`'s `.insert({ ... })`, after the `last_name` line:

```ts
      display_name_preference: input.display_name_preference || "business",
```

The `|| "business"` guards against an undefined input rather than relying on the DB default, so the inserted row is explicit.

- [ ] **Step 3: Add form state to the dialog**

In `components/sales/add-customer-dialog.tsx`, add the import:

```ts
import { contactDisplayName } from "@/lib/accounting/contact-name";
```

The radio options live-preview the current name values, so the dialog must watch three inputs that are currently uncontrolled `defaultValue` fields. Add state alongside the existing `phone` state:

```tsx
  const [namePreference, setNamePreference] = useState(
    contact?.display_name_preference === "primary" ? "primary" : "business"
  );
  const [businessName, setBusinessName] = useState(contact?.name || "");
  const [firstName, setFirstName] = useState(contact?.first_name || "");
  const [lastName, setLastName] = useState(contact?.last_name || "");
```

Extend the existing `useEffect` that resets `phone` on a `contact` change so it resets these too — otherwise reopening the dialog on a different contact shows the previous one's values:

```tsx
  useEffect(() => {
    setPhone((contact?.phone || "").replace(/\s+/g, ""));
    setNamePreference(contact?.display_name_preference === "primary" ? "primary" : "business");
    setBusinessName(contact?.name || "");
    setFirstName(contact?.first_name || "");
    setLastName(contact?.last_name || "");
  }, [contact]);
```

- [ ] **Step 4: Make the three name inputs controlled**

Change the `contact_name` input (~line 102) from `defaultValue={contact?.name || ""}` to:

```tsx
value={businessName}
onChange={(e) => setBusinessName(e.target.value)}
```

Change the `first_name` input (~line 120) from `defaultValue={contact?.first_name || ""}` to:

```tsx
value={firstName}
onChange={(e) => setFirstName(e.target.value)}
```

Change the `last_name` input (~line 124) from `defaultValue={contact?.last_name || ""}` to:

```tsx
value={lastName}
onChange={(e) => setLastName(e.target.value)}
```

Keep every other attribute on those inputs exactly as-is (`name`, `required`, `disabled`, `className`, `placeholder`). The `name` attributes must stay — `handleSubmit` still reads them via `FormData`.

- [ ] **Step 5: Add the radio control**

In the "Contact details" `<section>`, immediately after the `<div>` containing the `contact_name` input and before the `account_number` div, insert:

```tsx
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Name to display
                  </label>
                  <p className="mb-2 text-[11px] text-slate-500">
                    Choose which name appears on invoices, statements and lists for this contact.
                  </p>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer transition hover:border-slate-300 has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50/50">
                      <input
                        type="radio"
                        name="display_name_preference"
                        value="business"
                        checked={namePreference === "business"}
                        onChange={() => setNamePreference("business")}
                        disabled={readOnly}
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">Business name</span>
                        <span className="block truncate text-xs text-slate-500">
                          {businessName.trim() || "—"}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer transition hover:border-slate-300 has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50/50">
                      <input
                        type="radio"
                        name="display_name_preference"
                        value="primary"
                        checked={namePreference === "primary"}
                        onChange={() => setNamePreference("primary")}
                        disabled={readOnly}
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">Primary person</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[firstName, lastName].filter(Boolean).join(" ").trim() ||
                            "no primary person entered — will use business name"}
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
```

The primary option stays selectable when no names are entered — the hint text carries the fallback, matching the spec. Do not add validation, and do not disable the option.

- [ ] **Step 6: Submit the field**

In `handleSubmit`, in the `newCustomer` object after the `last_name` line:

```ts
      display_name_preference: namePreference,
```

Use the state value rather than `allData.display_name_preference` — the radio is controlled, and reading state avoids an unchecked-radio edge case where `FormData` omits the key entirely.

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`

Expected: no errors.

- [ ] **Step 8: Verify in the running app**

Run: `pnpm dev`

Then, in the browser:
1. Open Sales → Customers → Add New Contact. Confirm "Name to display" appears under Contact name, defaults to Business name, and the previews update live as you type in Contact name / First name / Last name.
2. Create a contact with business name "Acme Ltd", first name "Jane", last name "Smith", preference **Primary person**, and a billing address.
3. Confirm the customers table now shows "Jane Smith" with initials "JS", not "Acme Ltd".
4. Reopen that contact for edit. Confirm the radio reflects the saved "Primary person" choice.
5. Switch it to Business name, save, confirm the table shows "Acme Ltd".
6. Create a second contact with a business name and preference Primary person but **no** first/last name. Confirm it displays the business name and nothing renders blank.

Expected: all six confirmations pass. Report any that do not.

- [ ] **Step 9: Final sweep for missed sites**

This is the last automated check in the run (Task 12 is skipped), so it is mandatory.

Run: `grep -rn "contact?.name\|contact\.name" lib/ components/ app/ --include=*.ts --include=*.tsx`

Expected: the only hit is `components/payroll/myprofile.tsx` (an unrelated emergency contact). Any other hit is a display site that was missed — fix it before reporting done, or explain in the report why it is legitimately not a display site.

Run also: `grep -rn "select: { name: true\|select: { id: true, name: true }" lib/`

Expected: no output. Any hit is a Prisma select that still needs widening.

- [ ] **Step 10: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master).

---

### Task 12: Consolidated testing pass — SKIPPED

> **STATUS: SKIPPED by the repo owner's decision on 2026-07-15. Do not execute this task.**
>
> It is retained here in full because it is the only automated check on this
> design's silent failure mode, and because the tests below are already written
> — if a wrong name ever shows up on a document, start by running this task.
>
> Task 12 Step 7 (the final grep sweep) is NOT skipped; it runs as the last
> step of Task 11 instead.

**Files:**
- Create: `tests/contact-display-name.test.ts`
- Modify: `tests/fixtures.ts` (add an options parameter to `createTestOrg`)

**Interfaces:**
- Consumes: everything from Tasks 1-11.
- Produces: test coverage. No production interfaces.

**Context:** This is the project's single testing pass, per convention. Unit tests cover the resolver's four cases; integration tests cover the mappers, and specifically catch a Prisma select someone forgot to widen — the design's quiet failure mode. A unit-only suite would not catch that, which is the entire point of the integration half.

Tests run against a real database (see `tests/fixtures.ts`).

- [ ] **Step 1: Let fixtures create a primary-name contact**

In `tests/fixtures.ts`, the customer is created with a hardcoded shape. Add an optional parameter so tests can opt into a primary-name customer. Change the signature:

```ts
export async function createTestOrg(opts: {
  customerFirstName?: string;
  customerLastName?: string;
  customerDisplayNamePreference?: "business" | "primary";
} = {}): Promise<TestOrg> {
```

and the customer create:

```ts
  const customer = await prisma.contact.create({
    data: {
      organizationId: org.id,
      contactType: ContactType.CUSTOMER,
      name: `Test Customer ${orgName}`,
      first_name: opts.customerFirstName ?? null,
      last_name: opts.customerLastName ?? null,
      display_name_preference: opts.customerDisplayNamePreference ?? "business",
    },
    select: { id: true },
  });
```

The default argument keeps all ~20 existing `createTestOrg()` callers working unchanged.

- [ ] **Step 2: Write the tests**

Create `tests/contact-display-name.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { contactDisplayName } from "@/lib/accounting/contact-name";
import { listInvoices } from "@/lib/accounting/documents";
import { prisma } from "@/lib/prisma";
import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

describe("contactDisplayName", () => {
  it("returns the business name when the preference is business", () => {
    expect(
      contactDisplayName({
        name: "Acme Ltd",
        first_name: "Jane",
        last_name: "Smith",
        display_name_preference: "business",
      })
    ).toBe("Acme Ltd");
  });

  it("returns the primary person when the preference is primary", () => {
    expect(
      contactDisplayName({
        name: "Acme Ltd",
        first_name: "Jane",
        last_name: "Smith",
        display_name_preference: "primary",
      })
    ).toBe("Jane Smith");
  });

  it("returns a single name without stray whitespace when only one part exists", () => {
    expect(
      contactDisplayName({
        name: "Acme Ltd",
        first_name: "Jane",
        last_name: null,
        display_name_preference: "primary",
      })
    ).toBe("Jane");

    expect(
      contactDisplayName({
        name: "Acme Ltd",
        first_name: null,
        last_name: "Smith",
        display_name_preference: "primary",
      })
    ).toBe("Smith");
  });

  it("falls back to the business name when primary is chosen but no person is entered", () => {
    expect(
      contactDisplayName({
        name: "Acme Ltd",
        first_name: null,
        last_name: null,
        display_name_preference: "primary",
      })
    ).toBe("Acme Ltd");
  });

  it("treats a null or unknown preference as business", () => {
    expect(
      contactDisplayName({ name: "Acme Ltd", first_name: "Jane", display_name_preference: null })
    ).toBe("Acme Ltd");

    expect(
      contactDisplayName({ name: "Acme Ltd", first_name: "Jane", display_name_preference: "nonsense" })
    ).toBe("Acme Ltd");
  });
});

describe("display name through the invoice mapper", () => {
  let org: TestOrg;

  beforeEach(async () => {
    org = await createTestOrg({
      customerFirstName: "Jane",
      customerLastName: "Smith",
      customerDisplayNamePreference: "primary",
    });
  });

  afterEach(async () => {
    await dropTestOrg(org.orgId);
  });

  // This is the test that catches a Prisma select someone forgot to widen:
  // if `first_name` / `display_name_preference` are missing from the select,
  // the resolver silently returns the business name and this fails.
  it("surfaces the primary name on the invoice DTO", async () => {
    await prisma.invoice.create({
      data: {
        organizationId: org.orgId,
        contactId: org.customerId,
        invoiceNo: "INV-DISPLAY-1",
        issueDate: new Date("2026-07-15T00:00:00.000Z"),
        status: "DRAFT",
        currency: "GBP",
        subtotalMinor: BigInt(0),
        taxMinor: BigInt(0),
        totalMinor: BigInt(0),
      },
    });

    const invoices = await listInvoices(prisma, org.orgId);
    const invoice = invoices.find((i: { invoiceNo: string }) => i.invoiceNo === "INV-DISPLAY-1");

    expect(invoice).toBeDefined();
    expect(invoice!.contactName).toBe("Jane Smith");
  });

  it("surfaces the business name when the preference is switched back", async () => {
    await prisma.contact.update({
      where: { id: org.customerId },
      data: { display_name_preference: "business" },
    });

    await prisma.invoice.create({
      data: {
        organizationId: org.orgId,
        contactId: org.customerId,
        invoiceNo: "INV-DISPLAY-2",
        issueDate: new Date("2026-07-15T00:00:00.000Z"),
        status: "DRAFT",
        currency: "GBP",
        subtotalMinor: BigInt(0),
        taxMinor: BigInt(0),
        totalMinor: BigInt(0),
      },
    });

    const invoices = await listInvoices(prisma, org.orgId);
    const invoice = invoices.find((i: { invoiceNo: string }) => i.invoiceNo === "INV-DISPLAY-2");

    expect(invoice!.contactName).toMatch(/^Test Customer /);
  });
});
```

**Note on the invoice `create` calls:** the exact required fields may differ from the above — read the `Invoice` model in `prisma/schema.prisma` and copy the field shape used by an existing test such as `tests/invoice-numbering-contract.test.ts`. Adjust rather than fighting the compiler.

- [ ] **Step 3: Run the new tests**

Run: `pnpm exec vitest run tests/contact-display-name.test.ts`

Expected: all tests pass.

If an integration test fails with the business name where "Jane Smith" was expected, the cause is almost certainly a select that was not widened — go back to Task 3.

- [ ] **Step 4: Add a bill DTO test**

Following the same pattern as the invoice test, add a test asserting `listBills` surfaces the primary name for a supplier set to `primary`. Use `org.supplierId`, and extend the `createTestOrg` options in Step 1 with `supplierFirstName` / `supplierLastName` / `supplierDisplayNamePreference` to seed it. Copy the `Bill` create shape from an existing bill test such as `tests/bill-discount.test.ts`.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`

Expected: the whole suite passes, including the ~20 tests that call `createTestOrg()` with no arguments.

If any pre-existing test fails, the default-argument change in Step 1 is the first suspect.

- [ ] **Step 6: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`

Expected: all three clean.

- [ ] **Step 7: Final sweep for missed sites**

Run: `grep -rn "contact?.name\|contact\.name" lib/ components/ app/ --include=*.ts --include=*.tsx`

Expected: the only hit is `components/payroll/myprofile.tsx` (an unrelated emergency contact). Any other hit is a display site that was missed — fix it before reporting done.

- [ ] **Step 8: Report**

Commit this task's work on the `feature/contact-display-name` branch (never push, never commit to master). Report: test results, the grep sweep result, and anything left outstanding.

---

## Notes for the reviewer

- **The quiet failure mode.** The resolver returns the business name when its input lacks `display_name_preference`. A forgotten Prisma select therefore produces no error, no type failure (`mapInvoice as any` erases the check), and no visible difference from the old behaviour. The Task 12 integration tests and the Task 3/4/7 grep steps exist specifically to catch this.
- **The rule lives in two places.** `contactDisplayName()` and the SQL CASE in `lib/accounting/reports.ts`. Both carry comments pointing at each other.
- **Sorting is unchanged.** Contact lists still sort by `contacts.name` (the business name) even when displaying a primary name. Sorting by display name would need JS-side sorting after the query and is deliberately out of scope.
- **Journal memos are point-in-time.** Renaming a contact or flipping its preference does not rewrite posted memos. This is correct for an audit trail.
