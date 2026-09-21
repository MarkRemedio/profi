# Customer Statement Template + Modular Document-Template Workspace — Design

- **Date:** 2026-07-16
- **Status:** Approved (design), pending implementation plan
- **Author:** brainstormed with the team

## 1. Motivation

Today, printing a customer statement prints the **dashboard UI itself**. The
"Print Statement" button in [`components/sales/customer-statements.tsx`](../../../components/sales/customer-statements.tsx)
calls `window.print()` on the live page, and a `@media print` block hides the
nav/controls so the on-screen dashboard is what lands on paper.

Invoices already work the way we want statements to work: an **editable branding
template** configured in settings, plus a **dedicated print route** that renders
a clean, branded document (see [`app/print/invoice/[id]`](../../../app/print/invoice/[id])
and the "Document Template Workspace" in
[`components/sales/invoice-settings.tsx`](../../../components/sales/invoice-settings.tsx)).

We want to give statements the same treatment, with two extra commitments:

1. **Transparency.** The printed statement must tell the complete financial
   story — every ledger event in chronological order with a running balance,
   optional full invoice line-item expansion, outstanding invoices with aging,
   and clear disclosure of excluded or non-balance-affecting items — with
   **every section individually configurable** so a business chooses its own
   level of detail.
2. **Modularity.** Rather than bolt statements onto the already-746-line
   `invoice-settings.tsx`, we use this feature to establish a **modular
   document-template architecture** that future document types (Purchase Orders,
   Sales Receipts, Supplier Statements, etc.) follow. Statement is the first
   module built the "right" way; the existing Invoice/Credit Note/Quote/Bill
   editors migrate to the pattern **later**, gradually, not in a big-bang
   refactor.

## 2. Goals

- A **Statement** tab in the Document Template Workspace with editable branding
  and per-section transparency toggles, plus a live ledger-shaped preview.
- A dedicated, **organization-scoped, permission-checked** print route that
  renders a clean branded statement and auto-prints — never the dashboard UI.
- A **modular document-template architecture** (typed kind enum, a module
  contract covering editor + preview + shared renderer, a registry, and a
  workspace shell) that Statement implements natively and that the existing
  types can be migrated into later.
- A **single shared renderer** for the statement used by both the live preview
  and the print output, kept browser-agnostic so a future server-side PDF
  pipeline can reuse it without duplication.

## 3. Non-Goals

- No rewrite of the existing Invoice/Credit Note/Quote/Bill editors. They keep
  working exactly as they do today; the only change is a small, additive
  "chromeless / controlled-tab" mode so the shell can host them under one tab
  bar. Extracting them into native modules is explicitly **future work**.
- No batch "print all customers at once" in v1 (single selected customer only).
- No change to the statement **calculation** engine
  ([`lib/accounting/customer-statement.ts`](../../../lib/accounting/customer-statement.ts));
  we reuse it verbatim.
- No new database migration. `DocumentTemplate.kind` is already a free-text
  `String` column, so a `"statement"` kind drops in with no schema change.
- No server-side PDF generation yet — but the renderer is designed so it can be
  added later without duplication.

## 4. Guiding Principles

1. **One shared renderer per printable document.** Every printable document type
   has exactly one presentational renderer component that is used across live
   preview, browser print, and (future) server-side PDF generation. Preview and
   print must never be able to drift, because they are the same component fed
   different data. Browser-only concerns (triggering print, injecting print CSS,
   reading query params) live in thin wrappers around the renderer, never inside
   it.
2. **Additive over rewrite.** New capability is added alongside existing code.
   Existing editors are touched only enough to host them under the new shell.
3. **Typed kinds, not stringly-typed.** Document-template kinds are a typed union
   so tabs, storage rows, print modules, and branding actions all agree.
4. **Neutral shared homes.** Shared building blocks (branding actions, the module
   contract, shared form fields) live in a neutral `document-templates` location,
   not inside one document type's folder.
5. **Org-scoped by default.** Every route that renders customer/financial data
   resolves the caller's organization and refuses cross-org access. We do not
   inherit the invoice print route's unscoped `runAsSystem`-by-id fetch.

## 5. Current State (for context)

- **Branding storage.** `DocumentTemplate` rows (Prisma model at
  [`prisma/schema.prisma:1471`](../../../prisma/schema.prisma)) with a unique
  `(organizationId, kind, name)`. Branding profiles are stored one row per kind
  with `name = "${kind}_default_branding"` and the whole branding object stuffed
  into the `lines` JSON column. `kind` is a free-text `String`.
- **Branding actions.** `saveDocumentBrandingDB` / `fetchDocumentBrandingDB`
  currently live in
  [`app/(dashboard)/sales/credit-notes/actions.ts`](../../../app/(dashboard)/sales/credit-notes/actions.ts)
  and are imported by four call sites: sales `invoice-settings.tsx`
  (invoice/credit_note/quote), purchases `purchase-settings.tsx` (`bill`), and
  the `app/print/bill/[id]/page.tsx` route (`bill`).
- **Statement engine.** `computeCustomerStatement()` (pure, tested in
  [`tests/customer-statement.test.ts`](../../../tests/customer-statement.test.ts))
  already produces opening balance, an itemised running-balance ledger, per-invoice
  line breakdowns, aging, outstanding items, and an `excludedCurrencies` list.
  The server loader `loadCustomerStatementBundles()` gathers per-customer bundles,
  org-scoped.
- **Existing narrow enum collision.** `lib/accounting/templates.ts` exports
  `DocumentTemplateKind = "invoice" | "bill"` for the unrelated invoice/bill
  *line-item template* feature. It is used only within that one file (no external
  importers). To free the canonical name for the new broad enum, this narrow type
  is renamed **`LineTemplateKind`** (a mechanical, single-file rename).

## 6. Architecture: Modular Document-Template System

### 6.1 Typed kind enum

```ts
// components/sales/document-templates/types.ts
export type DocumentTemplateKind =
  | "invoice" | "bill" | "credit_note" | "quote" | "statement";
  // future: | "purchase_order" | "sales_receipt" | "supplier_statement"
```

`"bill"` is included because purchases branding already uses it. The pre-existing
narrow `DocumentTemplateKind` in `lib/accounting/templates.ts` is renamed to
`LineTemplateKind` to remove the ambiguity between "template classifier" and the
line-item-template feature.

### 6.2 Module contract

```ts
// components/sales/document-templates/types.ts
import type { LucideIcon } from "lucide-react";

export type DocumentModule<Config = unknown, Data = unknown> = {
  id: DocumentTemplateKind;
  kind: DocumentTemplateKind;
  label: string;
  icon: LucideIcon;
  defaults: Config;
  /** Settings form (owns its own load/save + preview mounting). Required. */
  Editor: React.ComponentType<{ activeOrgId: string }>;
  /** Live preview: wraps Document with sample data. Native modules only. */
  Preview?: React.ComponentType<{ config: Config }>;
  /** Pure presentational renderer (preview + print + future PDF). Native only. */
  Document?: React.ComponentType<{ config: Config; data: Data }>;
};
```

Native modules (Statement) implement all of `Editor`, `Preview`, `Document`.
The transitional invoice adapter implements only `Editor`; `Preview`/`Document`
become populated when those types are extracted natively later.

### 6.3 Registry + shell

```ts
// components/sales/document-templates/registry.ts
export const DOCUMENT_MODULES: DocumentModule[] = [
  ...invoiceAdapterModules,   // invoice, credit_note, quote (transitional)
  statementModule,            // native
];
```

`workspace.tsx` is the **shell**: it renders the "Document Template Workspace"
header and a single unified tab bar derived from the registry, and mounts the
active module's `Editor`. It knows nothing about any specific document type.

**`"bill"` is intentionally not in this registry.** Bill branding is configured
in the *purchases* settings ([`components/purchases/purchase-settings.tsx`](../../../components/purchases/purchase-settings.tsx)),
not the sales Document Template Workspace. `"bill"` appears in
`DocumentTemplateKind` only so the shared branding actions and the purchases
editor are typed consistently; the purchases bill editor is out of scope here and
changes only its import path (§6.5). Folding bill into a native module lives with
the other extractions in §11.

### 6.4 Transitional invoice adapter (no permanent "legacy" namespace)

A single transitional file — `document-templates/invoice-settings-adapter.tsx`
— produces `DocumentModule`s for `invoice` / `credit_note` / `quote` by mounting
the existing `InvoiceSettings` in a **chromeless, controlled-tab** mode. This is
the only change to the existing editor:

```ts
// invoice-settings.tsx — additive optional props, defaults preserve today's behavior
export function InvoiceSettings({
  activeOrgId,
  activeTab: controlledTab,        // optional controlled mode
  onTabChange,                     // optional
  hideChrome = false,              // hide own header + internal tab bar
}: {
  activeOrgId: string;
  activeTab?: "invoice" | "credit_note" | "quote";
  onTabChange?: (t: "invoice" | "credit_note" | "quote") => void;
  hideChrome?: boolean;
})
```

Internally: `const activeTab = controlledTab ?? activeTabState;` and the
header/tab-bar JSX is wrapped in `{!hideChrome && (...)}`. Field rendering, save
logic, sync, reset, and preview are untouched. When these three types are
extracted into native modules later, this adapter file is deleted — there is no
`legacy/` namespace to carry forward.

### 6.5 Branding actions relocated to a neutral home

`saveDocumentBrandingDB` / `fetchDocumentBrandingDB` are **moved** (not
re-exported long-term) from `credit-notes/actions.ts` into:

```
app/(dashboard)/sales/document-templates/actions.ts
```

Retyped `(orgId: string, kind: DocumentTemplateKind, config)`. All four importers
are repointed:

- `components/sales/invoice-settings.tsx`
- `components/purchases/purchase-settings.tsx`
- `app/print/bill/[id]/page.tsx`
- (definition removed from `app/(dashboard)/sales/credit-notes/actions.ts`)

### 6.6 File layout

```
components/sales/document-templates/
  types.ts                      # DocumentTemplateKind, DocumentModule
  registry.ts                   # DOCUMENT_MODULES
  workspace.tsx                 # shell: header + unified tab bar, mounts active Editor
  invoice-settings-adapter.tsx  # transitional adapter for invoice/credit_note/quote
  shared/
    branding-fields.tsx         # reusable logo/color/font/address/VAT/footer blocks
    use-template-branding.ts    # load/save hook over document-templates/actions.ts
  statement/
    statement-config.ts         # StatementTemplateConfig, defaults, mergeStatementDefaults
    statement-document.tsx      # SHARED pure renderer (preview + print + future PDF)
    statement-preview.tsx       # wraps statement-document with sample data
    statement-editor.tsx        # branding fields + section toggles + save
    statement-module.tsx        # binds into a DocumentModule

app/(dashboard)/sales/document-templates/
  actions.ts                    # relocated branding actions (neutral home)

app/print/statement/[customerId]/
  page.tsx                      # server: org-scoped, computes statement, renders client
  statement-print-client.tsx    # thin client wrapper: print CSS + window.print()

lib/accounting/
  accounting-today.ts           # accountingToday() timezone-correct "today"
```

The sales settings page ([`app/(dashboard)/sales/settings/page.tsx`](../../../app/(dashboard)/sales/settings/page.tsx))
is repointed from `<InvoiceSettings>` to the new `<DocumentTemplateWorkspace>` shell.

## 7. Statement Module

### 7.1 Config

Stored as before in `DocumentTemplate` (`kind: "statement"`,
`name: "statement_default_branding"`, blob in the `lines` JSON column):

```ts
// statement-config.ts
export type StatementTemplateConfig = {
  // Branding
  logo: string | null;
  brandColor: string;
  font: "sans" | "serif" | "mono";
  companyAddress: string;
  vatNumber: string;
  regNumber: string;
  paperSize: "a4" | "letter";
  statementTitle: string;   // default "Statement of Account"
  introText: string;        // optional blurb under the header
  footer: string;
  // Section toggles — the transparency controls
  showSummaryTiles: boolean;      // opening / invoiced / paid / closing
  showActivityLedger: boolean;    // itemised running-balance ledger (core)
  showLineBreakdown: boolean;     // expand each invoice's lines
  showAgingSummary: boolean;      // current / 1-30 / 31-60 / 61-90 / 90+
  showOutstandingTable: boolean;  // open invoices: total / paid / outstanding
  showDisclosures: boolean;       // info rows + excluded-currency notice
};
```

### 7.2 Defaults + defensive merge

Defaults: **every toggle `true`** (maximally transparent out of the box; a
business opts *down*). `brandColor` default is a distinct slate/teal so it does
not collide with the invoice/credit-note/quote defaults.

```ts
export const STATEMENT_DEFAULTS: StatementTemplateConfig = { /* all toggles true */ };

/** Overlay a possibly-malformed DB blob onto typed defaults. Never throws. */
export function mergeStatementDefaults(raw: unknown): StatementTemplateConfig;
```

`mergeStatementDefaults` is a field-by-field defensive coercer: it treats `raw`
as `unknown`, checks each field's type, and falls back to the default on any
missing/wrong-typed/`null`/array value. This is what makes the print route
resilient — a corrupt or partial `lines` blob still renders a clean statement,
and newly-added toggles get sane defaults for old saved rows.

### 7.3 Shared `StatementDocument` renderer

`statement-document.tsx` is a **pure, browser-agnostic** presentational
component:

```ts
export function StatementDocument({
  config,   // StatementTemplateConfig (already merged)
  data,     // { customer, statement: CustomerStatement, period: {from,to,asOf} }
}: { config: StatementTemplateConfig; data: StatementDocumentData })
```

Constraints (enforced by review, not tooling): no `window`, `document`,
`useSearchParams`, timers, or DOM access; no data fetching. It receives fully
computed data and renders markup + inline/utility styles only. This is what lets
the same component back the live preview, the browser print client, and a future
server-side PDF renderer.

Section order (only enabled sections render):

```
[ brand header: logo · statementTitle · company/VAT/CRN | recipient | as-at + period ]
[ introText (if present) ]
1. Summary tiles          (showSummaryTiles)
2. Activity ledger        (showActivityLedger)
     opening balance → dated rows w/ running balance → closing balance
     └ per-invoice line breakdown  (showLineBreakdown, nested under each invoice)
3. Aging summary          (showAgingSummary)
4. Outstanding table      (showOutstandingTable)
5. Disclosures            (showDisclosures: informational credit-note/receipt rows
                           + "non-GBP documents excluded" notice when present)
[ footer ]
```

### 7.4 Preview + Editor

- `statement-preview.tsx` feeds `StatementDocument` a fixed **sample** statement
  (mirrors how invoice preview uses fake data), wrapped in the paper-sheet frame.
- `statement-editor.tsx` renders the branding fields (reusing
  `shared/branding-fields.tsx`) and a "Statement Sections" toggle panel, saves via
  `use-template-branding.ts`, and mounts the preview beside the form.

## 8. Print Route + Data Flow

### 8.1 Route & authorization

`app/print/statement/[customerId]/page.tsx` (server component). It is **not**
modeled on the invoice route's `runAsSystem`-by-id fetch.

```ts
export default async function PrintStatementPage({ params, searchParams }) {
  const { customerId } = await params;
  const { from, to, asOf } = await searchParams;

  // Auth + org resolution + onboarding gate (read-only view → base workspace guard).
  const workspace = await requireAccountingWorkspace();

  // Org-scoped load. Missing customer → notFound(), which also blocks cross-org
  // access because the loader only ever returns the caller's own customers.
  const bundles = await loadCustomerStatementBundles(prisma, workspace.organizationId);
  const bundle = bundles.find((b) => b.customer.id === customerId);
  if (!bundle) return notFound();

  const branding = await fetchDocumentBrandingDB(workspace.organizationId, "statement");
  const config = mergeStatementDefaults(branding);

  const asOfDate = asOf ?? accountingToday(); // Europe/London default, see §8.2
  const statement = computeCustomerStatement({
    invoices: bundle.invoices,
    documents: bundle.documents,
    params: { fromDate: from ?? null, toDate: to ?? null, asOfDate },
  });

  return (
    <StatementPrintClient
      customer={bundle.customer}
      statement={statement}
      config={config}
      period={{ from: from ?? null, to: to ?? null, asOf: asOfDate }}
    />
  );
}
```

Properties:

- **Reuses the tested engine** — no statement math is duplicated; printed numbers
  are computed by the same code as the on-screen page, so they cannot disagree.
- **`asOf` carried from the screen** so the printed as-at/aging exactly matches
  what the user saw; falls back to `accountingToday()` when absent.
- **`config` always valid** via `mergeStatementDefaults`.

### 8.2 `accountingToday()` helper

There is **no organization timezone column** in the schema today, and the app is
UK-centric (GBP, VAT, `en-GB`). The existing statements page derives "today" as
UTC (`new Date().toISOString().slice(0,10)`), which near midnight UK time (worse
under BST) can show the wrong date.

`lib/accounting/accounting-today.ts` exports `accountingToday()` returning the
current date (`yyyy-mm-dd`) in the organization's accounting timezone, defaulting
to **`Europe/London`** (via `Intl.DateTimeFormat` with `timeZone`). Used by:

- the print route's `asOf` fallback, and
- the statements page's `todayIso`,

so screen and print agree and are both correct. A per-organization configurable
timezone is future work (§11).

### 8.3 Print client + pagination

`statement-print-client.tsx` is a thin `"use client"` wrapper that renders
`<StatementDocument config data />` inside a print shell and calls
`window.print()` once mounted (same auto-print UX as invoices). It owns all
browser-only concerns so the renderer stays pure.

Print CSS rules:

- `@page { size: auto; margin: … }`, `print-color-adjust: exact` so the brand
  color survives.
- **Keep invoice groups together:** `break-inside: avoid` on each invoice row
  *and* its nested line-breakdown block, so an invoice never splits from its own
  lines across a page break.
- `thead { display: table-header-group }` so ledger headers repeat on each page.
- `break-after: avoid` on section headings to prevent orphaned titles.

### 8.4 Wiring the "Print Statement" button

In `customer-statements.tsx`, the handler stops calling `window.print()` on the
dashboard and instead opens the route with the current selection:

```ts
const qs = new URLSearchParams();
if (range.from) qs.set("from", range.from);
if (range.to) qs.set("to", range.to);
qs.set("asOf", todayIso);            // todayIso now from accountingToday()
window.open(`/print/statement/${selectedCustomerId}?${qs}`, "_blank");
```

The now-obsolete `@media print` block that hid the dashboard nav (currently
[`customer-statements.tsx:121-133`](../../../components/sales/customer-statements.tsx))
is removed, since we no longer print the dashboard.

## 9. Testing Strategy

Aligned with the team's implement-first, one-consolidated-pass preference (not
per-task TDD). The reusable engine already has
[`tests/customer-statement.test.ts`](../../../tests/customer-statement.test.ts).

New unit tests target the two pure functions that carry real risk:

- `mergeStatementDefaults()` — fed junk (`null`, arrays, wrong-typed fields,
  partial objects) → asserts safe, fully-populated config; never throws.
- `accountingToday()` — GMT/BST boundary dates → asserts the London-local date.

The `StatementDocument` renderer, `statement-editor`, workspace shell, and print
route get **manual print verification** in the consolidated pass (render a real
statement, print to PDF, confirm branding, section toggles, and pagination —
invoice groups not split, headers repeating).

## 10. Build Sequence (additive, statement-first)

1. **Foundations** — `types.ts` (`DocumentTemplateKind`, `DocumentModule`);
   rename existing `DocumentTemplateKind` → `LineTemplateKind` in
   `lib/accounting/templates.ts`; relocate branding actions to
   `document-templates/actions.ts`, retype `kind`, repoint all four importers.
2. **Shared** — `branding-fields.tsx`, `use-template-branding.ts`,
   `accounting-today.ts`.
3. **Statement module** — `statement-config.ts` (+ `mergeStatementDefaults`);
   `statement-document.tsx`; `statement-preview.tsx`; `statement-editor.tsx`;
   `statement-module.tsx`.
4. **Shell** — `workspace.tsx` + `registry.ts` + `invoice-settings-adapter.tsx`
   (add the controlled/chromeless props to `InvoiceSettings`); repoint the sales
   settings page to the shell.
5. **Print** — route `page.tsx` + `statement-print-client.tsx` + pagination CSS.
6. **Wire** the "Print Statement" button; apply `accountingToday()` to the
   statements page; remove the dead dashboard-print CSS.
7. **Consolidated testing pass** — unit tests for the two pure functions; manual
   print verification.

## 11. Future Work / Follow-ups

- **Single-customer loader** to replace the current full-bundle scan
  (`loadCustomerStatementBundles(...).find(...)`) in the print route.
- **Per-organization accounting timezone** (schema field + settings UI) to
  replace the `Europe/London` default in `accountingToday()`.
- **Extract Invoice / Credit Note / Quote / Bill** into native modules
  (`Editor` + `Preview` + shared `Document`), then delete
  `invoice-settings-adapter.tsx`. Each gains the single-shared-renderer property
  the invoice preview/print currently lack (they are separate, drift-prone copies).
- **Server-side PDF generation** reusing `StatementDocument` (and the future
  native renderers) — enabled by the browser-agnostic renderer principle.
- **Batch statements** ("print all customers") if needed.
- **Credit notes in the running balance.** The engine currently treats credit
  notes as informational only (they do not move the receivable balance); the
  statement discloses them but does not net them. Revisit if/when credit-note
  application is modeled.

## 12. Risks / Open Considerations

- **Touching `InvoiceSettings`.** Even additive props are a change to a working
  746-line file. Mitigation: defaults preserve current behavior exactly; the
  adapter is the only new caller that passes the new props.
- **Relocating branding actions** touches four files. Mitigation: mechanical
  import-path change; behavior identical; typed `kind` catches typos.
- **Over-fetch in the print route** (loads all customers to pick one). Accepted
  for v1; flagged as a follow-up.
- **`accountingToday()` default.** `Europe/London` is correct for the current
  user base but is a default, not a per-org setting. Documented as future work.
