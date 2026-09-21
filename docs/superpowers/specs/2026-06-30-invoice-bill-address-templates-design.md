# Editable Document Address + Save-as-Template — Design

> **Status:** Approved for planning
> **Date:** 2026-06-30
> Two related features on the invoice & bill **create** forms: (1) an editable per-document address snapshot, and (2) save/load reusable document templates. One combined spec because both touch the same two forms and the shared `DocumentDraftInput` → `saveInvoiceDraft`/`saveBillDraft` flow.
> Related code: [`components/sales/add-invoice-dialog.tsx`](../../../components/sales/add-invoice-dialog.tsx) · [`components/purchases/add-bill-dialog.tsx`](../../../components/purchases/add-bill-dialog.tsx) · [`lib/accounting/documents.ts`](../../../lib/accounting/documents.ts)

---

## 1. Problem / goal

On the create-invoice and create-bill forms, the accountant can pick a contact but **never sees or edits an address**, and there is **no way to reuse a common invoice/bill** — every document is re-keyed by hand. We add:

1. **Editable address snapshot** — when a contact is selected, show its address with an **Edit** button; the (possibly edited) address is stored **on that document only**, leaving the contact's saved address unchanged (standard accounting behaviour).
2. **Save-as-template** — save the current contact + line items + terms as a named, org-shared template, and load it later to prefill the form in one click.

## 2. Decisions (locked)

- Address edit = **snapshot on the document**; the contact record is never modified by this flow.
- Template captures **contact + lines + currency + due-date offset**, **org-shared**; it does **not** store an address (address prefills from the contact on load).
- **One unified** `document_templates` table with a `kind` (INVOICE|BILL) discriminator (Approach A), not separate per-type models.
- Address source for prefill = the contact's **`billing_address`** (for both invoices and bills), shown as a single freetext snapshot. Delivery address is out of scope.

## 3. Non-goals

- Structured address fields (street/city/postcode/country) — addresses stay **freetext**, matching the current `Contact` model.
- The existing client-only "Recurring Automation Template" localStorage checkbox — left untouched; this is a separate auto-recurring concept, not manual templates.
- Editing the contact's saved address from the document form (that lives in the existing add/edit-customer dialog).
- Templating the document number or absolute dates (number stays auto-generated; dates are relative via the offset).

## 4. Feature 1 — Editable address snapshot

### 4.1 Schema
Add a nullable freetext column to both document tables:
- `invoices.billing_address text NULL`
- `bills.billing_address text NULL`

Prisma: `billingAddress String? @map("billing_address")` on `Invoice` and `Bill`. No new model; the column inherits each document's existing `organizationId` scoping.

### 4.2 Transport
Extend `DocumentDraftInput` ([lib/accounting/documents.ts](../../../lib/accounting/documents.ts)) with `billingAddress?: string`. `saveInvoiceDraft` and `saveBillDraft` write it to the new column on both the INSERT (create) and UPDATE (edit-draft) raw-SQL paths, trimmed; empty/whitespace persists as `NULL`. `getDocumentOptions` / the draft-load path returns the stored snapshot so editing a draft shows what was saved.

### 4.3 Form behaviour (both create forms)
- On contact select: set the form's `billingAddress` from the chosen contact's `billing_address`, and show it **read-only** in a block beneath the contact picker with an **"Edit"** button.
- **Edit** reveals a `<textarea>` prefilled with the current value; typing updates the document's `billingAddress` only.
- A **"Reset to contact's address"** link restores the value to the selected contact's `billing_address`.
- Changing the contact re-prefills from the new contact (the snapshot is a convenience copy, not a manual lock — re-selecting a contact is an explicit re-prefill).
- If the contact has no `billing_address`, show an empty editable field with a hint ("No address on file — add one here").
- The value submits through the existing `onSubmit(submissionData)` payload as `billingAddress`.

### 4.4 Tests
- `saveInvoiceDraft` / `saveBillDraft` persist `billingAddress`; reloading the draft returns it.
- Editing the snapshot to a different value persists the edited value and leaves `Contact.billing_address` unchanged.
- Omitting/blanking the address persists `NULL` (no crash).

## 5. Feature 2 — Save-as-template

### 5.1 Schema
New model `DocumentTemplate` → table `document_templates`:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `organizationId` | uuid | `@map("org_id")`; ORG_SCOPED |
| `kind` | enum `DocumentTemplateKind {INVOICE, BILL}` | discriminator |
| `name` | text | user-chosen label |
| `contactId` | uuid? | nullable; FK to `Contact`, `onDelete: SetNull` (deleting a contact blanks it, doesn't drop the template) |
| `currency` | `CurrencyCode` | default GBP |
| `dueDateOffsetDays` | int? | `dueDate − issueDate` at save time |
| `lines` | jsonb | `Array<{accountId, description, quantity, unitPrice, discount, taxCode}>` — **no monetary amounts** |
| `createdByUserId` | uuid? | audit |
| `createdAt`/`updatedAt` | timestamptz | |

Constraints: `@@unique([organizationId, kind, name])`, `@@index([organizationId, kind])`. Add `DocumentTemplate: "organizationId"` to the `ORG_SCOPED` registry in [lib/tenancy/scoped-models.ts](../../../lib/tenancy/scoped-models.ts) (the dmmf-completeness test requires it once the model has an `organizationId` field).

### 5.2 DAL — `lib/accounting/templates.ts` (new)
Pure, org-scoped functions taking `(prisma, organizationId, …)`:
- `saveDocumentTemplate(prisma, orgId, actorUserId, input)` → upsert by `(orgId, kind, name)`; stores contact/currency/offset/lines; returns `{ id }`. Rejects empty name and empty line set with a typed validation error.
- `listDocumentTemplates(prisma, orgId, kind)` → `[{ id, name, contactId, updatedAt }]` for the picker.
- `getDocumentTemplate(prisma, orgId, id)` → full template for prefill (throws not-found if missing/foreign-org).
- `deleteDocumentTemplate(prisma, orgId, id)` → scoped delete; throws not-found if missing/foreign-org.

### 5.3 Server actions
Each surface exposes its own thin wrappers — the four template actions are added to `app/(dashboard)/sales/invoices/actions.ts` (kind = INVOICE) and to `app/(dashboard)/purchases/actions.ts` (kind = BILL) — and **both delegate to the shared `lib/accounting/templates.ts` DAL**. This mirrors the existing split between the invoice and purchase action files. Every action is gated by `requireAccountantRole` and passes `workspace.organizationId`/`workspace.userId` to the DAL.

### 5.4 Form UI (both create forms)
- **"Save as template"** button near the form actions → opens a small name-prompt dialog → calls the save action with `{ kind, name, contactId, currency, dueDateOffsetDays, lines }` derived from current form state (`dueDateOffsetDays = max(0, dueDate − issueDate)` in whole days; omit if no due date).
- **"Load template"** Select listing the org's templates for that `kind` (by name); on pick → `getDocumentTemplate` → prefill `contactId`, `lines`, `currency`, and `dueDate = issueDate + offset`. A trash affordance in the picker calls the delete action.
- **Stale references on load:** a template line whose `accountId` no longer exists (or is inactive) prefills with the account unselected, for the user to re-pick; final validation is unchanged — it happens at save via the existing `normalizeLines`, which already validates account type/category and org membership. No separate template-time account validation.

### 5.5 Tests
- Round-trip: `saveDocumentTemplate` → `listDocumentTemplates` → `getDocumentTemplate` → `deleteDocumentTemplate`.
- Captured payload: contact, currency, offset, and lines (account/description/quantity/unitPrice/discount/taxCode) are stored; **no amount fields** are stored.
- Unique name per `(org, kind)`: re-saving the same name updates rather than duplicates; the same name is allowed across different `kind` or different orgs.
- **Tenant isolation:** org B cannot `list`/`get`/`delete` org A's templates (the auto-guard + explicit org filter); cross-org `get`/`delete` throw not-found.

## 6. Migration strategy
Both schema changes (address columns + `document_templates` table + `DocumentTemplateKind` enum) are delivered exactly as W2-3 was, because the repo's `_prisma_migrations` history is drifted: a hand-written SQL migration file under `prisma/migrations/<timestamp>_invoice_bill_address_and_templates/migration.sql`, plus the `schema.prisma` edits and `prisma generate`. The SQL is applied to the shared dev DB (via `prisma db execute` or psql) so the integration tests run against real columns/table. **The apply-to-DB step is flagged for the user/team** (consistent with the manual-commit / drifted-migration constraints). Column adds are nullable and the new table is additive — no backfill, no destructive change.

## 7. Architecture / isolation
- Address: no new module — `DocumentDraftInput` + the two `save*Draft` functions + the two form components.
- Templates: one new DAL module (`lib/accounting/templates.ts`), one new Prisma model, thin server actions, and template controls added to the two form components. `document_templates` is org-scoped by the tenancy auto-guard (it uses `organizationId`); every DAL function additionally passes an explicit org filter, matching the accounting DAL convention.
- No change to journal posting, numbering, or the approve/post flow. Templates never create documents directly — they only prefill the form, which goes through the normal save/approve path.

## 8. Definition of done
Code changed · `pnpm typecheck` exit 0 · new/updated tests pass · the two create forms show the editable address and the save/load-template controls · behaviour changes noted. Migration SQL written and applied to the dev DB; schema + client regenerated; `DocumentTemplate` added to `ORG_SCOPED` and the dmmf-completeness test passes.
