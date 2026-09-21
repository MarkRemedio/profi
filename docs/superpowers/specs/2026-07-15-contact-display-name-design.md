# Contact display name preference

**Date:** 2026-07-15
**Status:** Approved, ready for implementation plan

## Problem

`contacts.name` is a single required field holding either a business name or a
person's name ("A business or person's name" is literally the placeholder). The
separate `first_name` / `last_name` fields describe the "Primary person" at that
contact. Today every customer-facing and internal surface renders `contact.name`
and nothing else, so a contact stored as "Acme Ltd" can never be shown as "Jane
Smith" — even when the person is who you actually deal with.

Users need to choose, per contact, which of the two names is displayed.

## Scope

App-wide. The chosen name appears **everywhere the contact is shown** — printed
invoices and bills, invoice/bill/quote/credit-note tables, customer and supplier
lists, AR/AP aging, statements, banking modals, pickers and dropdowns, CSV
exports, and payroll employee screens.

Explicitly **in** scope:

- Payroll employee names (employees are contacts; a person-shaped contact is
  arguably where this feature helps most).
- New journal memos, which bake the contact name into stored text at post time.
- Fixing the stale `bill.vendor` fallback (see "Incidental fix" below).

Explicitly **out** of scope:

- Already-posted journal memos. They are historical audit records and must not
  retroactively change. New memos use the display name; old memos keep their
  posted text. This is correct behaviour, not a limitation.
- POS sales (`pos_sales.customer_name`). POS captures free text and has no FK to
  `contacts`, so it never joins and is unaffected.
- The legacy `Invoice.client` snapshot column. No live code writes or reads it.

## Data model

One new column on `contacts`:

```sql
ALTER TABLE contacts
  ADD COLUMN display_name_preference text NOT NULL DEFAULT 'business'
    CHECK (display_name_preference IN ('business', 'primary'));
```

Named `display_name_preference` rather than `invoice_name_preference` because
the scope is app-wide, not invoice-only.

`NOT NULL DEFAULT 'business'` makes every existing row correct with no backfill
and preserves today's behaviour exactly until a user opts in. New contacts also
default to `'business'`.

Mirrored in:

- `prisma/schema.prisma` — the `Contact` model.
- `components/sales/use-customers.ts` — the `Contact` and `NewContactInput`
  types, plus the field list in `addContact`.

## Architecture: shared resolver

A single pure function is the only definition of the rule.

```ts
// lib/accounting/contact-name.ts
export type ContactNameParts = {
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name_preference?: string | null;
};

export function contactDisplayName(c: ContactNameParts): string {
  if (c.display_name_preference !== "primary") return c.name;
  const primary = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return primary || c.name;
}
```

It accepts snake_case because both Supabase client rows and the Prisma `Contact`
model use snake_case for these specific fields — no mapping layer is needed.

**Fallback rule:** preference `'primary'` with no first or last name resolves to
the business name. Nothing ever renders blank or "Unknown Customer" because of
this preference. The choice stays selectable in the UI even when it currently has
no effect; the dialog surfaces that state visually instead (see "UI" below).

### Why a TS helper

Considered and rejected:

- **Postgres generated column** — impossible to forget on read, but puts the
  logic in a migration where it is hard to change, and Prisma treats it as
  read-only.
- **Denormalise on save** — trivial reads, but goes stale on any write that
  bypasses `addContact`/`updateContact`, and needs a backfill.

The helper is pure, unit-testable, and has one definition. Its known weakness is
that a new read site can forget to call it; tests mitigate this (see "Testing").

## Application sites

### Mappers (highest leverage — ~30 downstream sites follow from these six)

| File | Lines |
|---|---|
| `lib/accounting/documents.ts` | 733 (invoice DTO), 776 (bill DTO), 988 (picker options) |
| `lib/accounting/receipts.ts` | 452 (receipt DTO) |
| `lib/accounting/customer-statement-loader.ts` | 122 |
| `lib/banking/dal.ts` | 874 (banking contact options) |

### Direct component reads (edited individually)

`components/sales/customers.tsx` (450, 453), `components/purchases/suppliers.tsx`
(282, 285), `components/sales/view-customer-dialog.tsx` (22),
`components/banking/money-modals.tsx` (330, 475),
`app/print/invoice/[id]/print-client.tsx` (133),
`app/print/bill/[id]/print-client.tsx` (92),
`app/(dashboard)/payroll/employees/[id]/page.tsx` (105, 203),
`app/(dashboard)/payroll/employees/page.tsx` (78),
`components/payroll/timesheets-view.tsx` (113),
`components/payroll/run-payroll-view.tsx` (115),
`app/(dashboard)/payroll/actions.ts` (606).

Note: `components/payroll/myprofile.tsx:196` reads an emergency-contact `name`
that is unrelated to the `contacts` table. Leave it alone.

### Journal memos (resolver called at post time)

`lib/accounting/documents.ts` 1463, 1647, 1720, 2246;
`lib/accounting/receipts.ts` 309, 383, 638, 711.

### Raw SQL — the one duplication

`lib/accounting/reports.ts:198` composes `c.name as contact_name` in raw SQL for
the general ledger. The rule is inlined there as a CASE expression:

```sql
CASE WHEN c.display_name_preference = 'primary'
       AND NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '') IS NOT NULL
     THEN TRIM(CONCAT_WS(' ', c.first_name, c.last_name))
     ELSE c.name END AS contact_name
```

This is the only place the rule exists twice. It carries a comment pointing at
`contactDisplayName` so the two are changed together.

### Prisma selects that MUST be widened

Each of these currently selects `name` without the other fields. If missed, the
resolver silently receives `undefined` and always returns the business name —
**this is the primary failure mode of the design, and it fails quietly.**

| File | Lines |
|---|---|
| `lib/accounting/documents.ts` | 815, 843, 927, 956, 1381 |
| `lib/accounting/receipts.ts` | 115, 351, 497, 680, 748 |
| `lib/accounting/customer-statement-loader.ts` | 29 |
| `lib/banking/dal.ts` | 874 |

Each must add `first_name`, `last_name`, and `display_name_preference`.

Both print pages use `include: { contact: true }` and already have the full row.

## Incidental fix

`app/print/bill/[id]/print-client.tsx:92` reads
`bill.contact?.name || bill.vendor || "Unknown Vendor"`. `bill.vendor` is a
legacy denormalised snapshot, so a renamed supplier can print a stale name. This
is a pre-existing bug, but the line is being edited anyway and the stale snapshot
would otherwise silently override the new display name. Fixed to prefer the live
resolved name, falling back to `vendor` only when there is genuinely no contact.

## UI

A radio pair in the "Contact details" section of
`components/sales/add-customer-dialog.tsx`, placed directly beneath the Contact
name input because that is the field it modifies.

```
Name to display          ( ) Business name — Acme Ltd
                         ( ) Primary person — Jane Smith
```

- Each option live-previews the actual value from the form's current state, so
  the choice is self-explanatory.
- When first and last name are both empty, the primary option renders a muted
  hint: "no primary person entered — will use business name". It remains
  selectable, consistent with the fallback rule.
- Respects the existing `readOnly` prop like every other field.
- Submits through the existing `FormData` path as `display_name_preference`.
- Defaults to `business` for new contacts; reflects the stored value when
  editing.

Because the previews track the name inputs, those inputs need controlled or
watched values in the dialog (today they are uncontrolled with `defaultValue`).
Reading them via local state on change is sufficient; the form submission path
does not change.

## Error handling

There are no new error paths. The feature cannot fail at runtime:

- An unrecognised or null preference resolves to `'business'` (the `!== "primary"`
  check treats anything else as business), so bad data degrades to today's
  behaviour rather than throwing.
- The CHECK constraint prevents invalid values reaching the column at all.
- The empty-primary-name case is handled by the fallback, not an error.

## Testing

Unit tests on `contactDisplayName` covering four cases:

1. `business` preference returns `name`.
2. `primary` with both first and last returns "First Last".
3. `primary` with only one of the two returns that one, with no stray whitespace.
4. `primary` with neither returns `name` (the fallback).

Integration tests, one per mapper family (invoice DTO, bill DTO, receipt DTO,
statement bundle), asserting that a contact set to `primary` actually surfaces
the primary name through the DTO. These are what catch a select someone forgot to
widen — the quiet failure mode above. A test that only exercises the pure helper
would not.

Per project convention, testing is a single consolidated pass at the end of
implementation rather than per-task TDD.

## Scale

Roughly 45–50 edited sites across ~25 files. The large majority are one-line
swaps of `contact.name` for `contactDisplayName(contact)`. The substantive work
is the twelve widened selects, the raw SQL, and the dialog control.
