# Customer Statement Template + Modular Document-Template Workspace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give customer statements an editable, fully-transparent branded print document — driven by a new "Statement" tab in the Document Template Workspace and a dedicated org-scoped print route — while establishing a modular document-template architecture the other document types can migrate into later.

**Architecture:** A typed module system (`DocumentTemplateKind` + a `DocumentModule` contract of `Editor`/`Preview`/`Document`) is registered in a registry and hosted by a workspace shell. Statement is the first native module; Invoice/Credit Note/Quote are hosted through a transitional adapter over the existing editor. A single shared, browser-agnostic `StatementDocument` renderer backs both the live preview and the print output. The print route reuses the existing (tested) statement engine and is organization-scoped.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind, Prisma 7, Supabase (auth + storage), vitest.

## Global Constraints

- **Test cadence:** Implement-first. Do NOT write per-task unit tests; the only automated tests live in the consolidated testing pass (Task 11), per team preference. Each earlier task is verified with `pnpm typecheck` and, where noted, manual checks.
- **Commits are manual.** No task auto-commits. Each task ends with a **Checkpoint**: run the verification, stage the changes, and pause for the user to commit (a suggested message is provided).
- **Package manager:** `pnpm`. Typecheck: `pnpm typecheck`. Test: `pnpm test`. Build: `pnpm build`. Lint: `pnpm lint`.
- **Path alias:** `@/` maps to the repo root (e.g. `@/lib/utils`, `@/components/...`).
- **Money is minor units** (integer pence) everywhere; format only at the render edge.
- **Additive only for existing editors.** The only change permitted to `components/sales/invoice-settings.tsx` is adding optional props whose defaults preserve today's exact behavior (Task 7). Do not alter its field logic, save logic, or preview.
- **`StatementDocument` must stay browser-agnostic:** no `window`, `document`, `useSearchParams`, timers, DOM access, or data fetching inside it. Browser-only concerns live only in `statement-print-client.tsx` and `statement-preview.tsx`.
- **Org isolation:** the print route must resolve the caller's organization via `requireAccountingWorkspace()` and return `notFound()` for any customer not in that org. Never fetch by id under `runAsSystem` without an org check.

---

## File Structure

**Created:**
- `components/sales/document-templates/types.ts` — `DocumentTemplateKind`, `DocumentModule` contract.
- `components/sales/document-templates/registry.ts` — `DOCUMENT_MODULES` list.
- `components/sales/document-templates/workspace.tsx` — shell: header + unified tab bar, mounts active module's `Editor`.
- `components/sales/document-templates/invoice-settings-adapter.tsx` — transitional modules for invoice/credit_note/quote.
- `components/sales/document-templates/shared/upload-template-logo.ts` — base64→Supabase-storage logo upload.
- `components/sales/document-templates/shared/use-template-branding.ts` — generic load/save hook.
- `components/sales/document-templates/shared/branding-fields.tsx` — reusable branding form blocks.
- `components/sales/document-templates/statement/statement-config.ts` — config type, defaults, `mergeStatementDefaults`.
- `components/sales/document-templates/statement/statement-document.tsx` — shared pure renderer + `StatementDocumentData`.
- `components/sales/document-templates/statement/statement-preview.tsx` — sample-data live preview.
- `components/sales/document-templates/statement/statement-editor.tsx` — statement settings form.
- `components/sales/document-templates/statement/statement-module.tsx` — binds into a `DocumentModule`.
- `app/(dashboard)/sales/document-templates/actions.ts` — relocated branding actions (neutral home).
- `app/print/statement/[customerId]/page.tsx` — org-scoped print route.
- `app/print/statement/[customerId]/statement-print-client.tsx` — client print wrapper.
- `lib/accounting/accounting-today.ts` — `accountingToday()` timezone-correct date.
- `tests/statement-config.test.ts`, `tests/accounting-today.test.ts` — Task 11.

**Modified:**
- `lib/accounting/templates.ts` — rename `DocumentTemplateKind` → `LineTemplateKind`.
- `app/(dashboard)/sales/credit-notes/actions.ts` — remove relocated branding actions.
- `components/sales/invoice-settings.tsx` — repoint branding import; add optional controlled/chromeless props.
- `components/purchases/purchase-settings.tsx` — repoint branding import.
- `app/print/bill/[id]/page.tsx` — repoint branding import.
- `app/(dashboard)/sales/settings/page.tsx` — render `<DocumentTemplateWorkspace>` instead of `<InvoiceSettings>`.
- `components/sales/customer-statements.tsx` — Print button opens the print route; remove dead print CSS.
- `app/(dashboard)/sales/statements/page.tsx` — derive `todayIso` from `accountingToday()`.

---

### Task 1: Foundations — typed kinds, rename, relocated branding actions

**Files:**
- Create: `components/sales/document-templates/types.ts`
- Modify: `lib/accounting/templates.ts:4` (and its in-file uses)
- Create: `app/(dashboard)/sales/document-templates/actions.ts`
- Modify: `app/(dashboard)/sales/credit-notes/actions.ts:88-124`
- Modify: `components/sales/invoice-settings.tsx:14`
- Modify: `components/purchases/purchase-settings.tsx:24`
- Modify: `app/print/bill/[id]/page.tsx:5`

**Interfaces:**
- Produces: `type DocumentTemplateKind = "invoice" | "bill" | "credit_note" | "quote" | "statement"`; `type DocumentModule<Config, Data>`; server actions `saveDocumentBrandingDB(orgId: string, docKind: DocumentTemplateKind, profileData: unknown)` and `fetchDocumentBrandingDB(orgId: string, docKind: DocumentTemplateKind): Promise<unknown>` at `@/app/(dashboard)/sales/document-templates/actions`.

- [ ] **Step 1: Create the types module**

Create `components/sales/document-templates/types.ts`:

```ts
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Which printable document a template configures. This is a *template
 * classifier*, distinct from the accounting entities (Invoice, CreditNote, …).
 * Not to be confused with `LineTemplateKind` in lib/accounting/templates.ts,
 * which classifies reusable line-item templates.
 */
export type DocumentTemplateKind =
  | "invoice"
  | "bill"
  | "credit_note"
  | "quote"
  | "statement";
// future: | "purchase_order" | "sales_receipt" | "supplier_statement"

/**
 * A self-describing document-template module. The workspace shell renders
 * whatever modules are registered; it knows nothing about specific types.
 *
 * Native modules implement Editor + Preview + Document. Transitional adapters
 * (e.g. the invoice editor) implement only Editor until they are extracted.
 */
export type DocumentModule<Config = unknown, Data = unknown> = {
  id: DocumentTemplateKind;
  kind: DocumentTemplateKind;
  label: string;
  icon: LucideIcon;
  defaults: Config;
  Editor: ComponentType<{ activeOrgId: string }>;
  Preview?: ComponentType<{ config: Config }>;
  Document?: ComponentType<{ config: Config; data: Data }>;
};
```

- [ ] **Step 2: Rename the narrow enum in templates.ts**

In `lib/accounting/templates.ts`, rename the type `DocumentTemplateKind` to `LineTemplateKind` and update its four in-file uses (the export on line 4, and the `kind:` fields/casts on lines 16, 26, 94, 118). Only that file references it.

Change line 4 from:

```ts
export type DocumentTemplateKind = "invoice" | "bill";
```

to:

```ts
export type LineTemplateKind = "invoice" | "bill";
```

Then replace every remaining `DocumentTemplateKind` occurrence in that file with `LineTemplateKind` (lines 16, 26, 94, 118).

- [ ] **Step 3: Create the relocated branding actions**

Create `app/(dashboard)/sales/document-templates/actions.ts` (moved verbatim from credit-notes/actions.ts, retyped):

```ts
"use server";

import { prisma } from "@/lib/prisma";
import type { DocumentTemplateKind } from "@/components/sales/document-templates/types";

// Universal multi-tenant branding storage. One row per (org, kind) using the
// reserved name `${kind}_default_branding`; the whole profile blob lives in the
// JSON `lines` column of DocumentTemplate.
export async function saveDocumentBrandingDB(
  orgId: string,
  docKind: DocumentTemplateKind,
  profileData: unknown
) {
  if (!orgId) throw new Error("Missing organization context ID");

  return await prisma.documentTemplate.upsert({
    where: {
      organizationId_kind_name: {
        organizationId: orgId,
        kind: docKind,
        name: `${docKind}_default_branding`,
      },
    },
    update: { lines: profileData as object },
    create: {
      organizationId: orgId,
      kind: docKind,
      name: `${docKind}_default_branding`,
      lines: profileData as object,
    },
  });
}

export async function fetchDocumentBrandingDB(
  orgId: string,
  docKind: DocumentTemplateKind
): Promise<unknown> {
  if (!orgId) return null;

  const template = await prisma.documentTemplate.findFirst({
    where: {
      organizationId: orgId,
      kind: docKind,
      name: `${docKind}_default_branding`,
    },
  });

  return template ? JSON.parse(JSON.stringify(template.lines)) : null;
}
```

- [ ] **Step 4: Remove the old definitions from credit-notes/actions.ts**

In `app/(dashboard)/sales/credit-notes/actions.ts`, delete the two functions `saveDocumentBrandingDB` and `fetchDocumentBrandingDB` (lines 88-124, including the `// 👑 NEW: ...` comment banner). Leave the rest of the file unchanged.

- [ ] **Step 5: Repoint the three importers**

In `components/sales/invoice-settings.tsx` line 14, change:

```ts
import { saveDocumentBrandingDB, fetchDocumentBrandingDB } from "@/app/(dashboard)/sales/credit-notes/actions";
```

to:

```ts
import { saveDocumentBrandingDB, fetchDocumentBrandingDB } from "@/app/(dashboard)/sales/document-templates/actions";
```

Apply the identical import-path change in `components/purchases/purchase-settings.tsx` (line 24) and `app/print/bill/[id]/page.tsx` (line 5, which imports only `fetchDocumentBrandingDB`).

- [ ] **Step 6: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS (no errors). If `tsc` reports an unresolved `DocumentTemplateKind`, a templates.ts use was missed in Step 2; if it reports a missing branding export, an importer was missed in Step 5.

- [ ] **Step 7: Checkpoint (manual commit)**

Stage the changed/created files. Suggested message:
`refactor: add typed DocumentTemplateKind + relocate branding actions to neutral home`

---

### Task 2: `accountingToday()` timezone-correct date helper

**Files:**
- Create: `lib/accounting/accounting-today.ts`

**Interfaces:**
- Produces: `accountingToday(timeZone?: string): string` returning `yyyy-mm-dd` in the given IANA zone (default `Europe/London`).

- [ ] **Step 1: Create the helper**

Create `lib/accounting/accounting-today.ts`:

```ts
/**
 * Today's date (yyyy-mm-dd) in the organization's accounting timezone.
 *
 * There is no per-organization timezone column yet and the product is
 * UK-centric (GBP/VAT/en-GB), so the default is Europe/London. Using UTC here
 * (as `new Date().toISOString().slice(0,10)` does) renders the wrong date near
 * midnight UK time, worse under BST. When a per-org timezone is added, pass it in.
 */
export function accountingToday(timeZone = "Europe/London"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint (manual commit)**

Suggested message: `feat: add accountingToday() timezone-correct date helper`

---

### Task 3: Statement config, defaults, and defensive merge

**Files:**
- Create: `components/sales/document-templates/statement/statement-config.ts`

**Interfaces:**
- Produces: `type StatementTemplateConfig`; `const STATEMENT_DEFAULTS: StatementTemplateConfig`; `mergeStatementDefaults(raw: unknown): StatementTemplateConfig` (never throws).

- [ ] **Step 1: Create the config module**

Create `components/sales/document-templates/statement/statement-config.ts`:

```ts
export type StatementFont = "sans" | "serif" | "mono";
export type StatementPaperSize = "a4" | "letter";

export type StatementTemplateConfig = {
  // Branding
  logo: string | null;
  brandColor: string;
  font: StatementFont;
  companyAddress: string;
  vatNumber: string;
  regNumber: string;
  paperSize: StatementPaperSize;
  statementTitle: string;
  introText: string;
  footer: string;
  // Section toggles — the transparency controls
  showSummaryTiles: boolean;
  showActivityLedger: boolean;
  showLineBreakdown: boolean;
  showAgingSummary: boolean;
  showOutstandingTable: boolean;
  showDisclosures: boolean;
};

export const STATEMENT_DEFAULTS: StatementTemplateConfig = {
  logo: null,
  brandColor: "#0f766e", // teal — distinct from invoice/credit-note/quote defaults
  font: "sans",
  companyAddress: "",
  vatNumber: "",
  regNumber: "",
  paperSize: "a4",
  statementTitle: "Statement of Account",
  introText: "",
  footer: "",
  showSummaryTiles: true,
  showActivityLedger: true,
  showLineBreakdown: true,
  showAgingSummary: true,
  showOutstandingTable: true,
  showDisclosures: true,
};

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function asEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Overlay a possibly-malformed DB blob (untyped `Json` column) onto typed
 * defaults. Every missing / wrong-typed / null / array value falls back to its
 * default. NEVER throws — the print route depends on always getting a valid config.
 */
export function mergeStatementDefaults(raw: unknown): StatementTemplateConfig {
  const o: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  return {
    logo: typeof o.logo === "string" ? o.logo : null,
    brandColor: asString(o.brandColor, STATEMENT_DEFAULTS.brandColor),
    font: asEnum(o.font, ["sans", "serif", "mono"] as const, STATEMENT_DEFAULTS.font),
    companyAddress: asString(o.companyAddress, ""),
    vatNumber: asString(o.vatNumber, ""),
    regNumber: asString(o.regNumber, ""),
    paperSize: asEnum(o.paperSize, ["a4", "letter"] as const, STATEMENT_DEFAULTS.paperSize),
    statementTitle: asString(o.statementTitle, STATEMENT_DEFAULTS.statementTitle),
    introText: asString(o.introText, ""),
    footer: asString(o.footer, ""),
    showSummaryTiles: asBool(o.showSummaryTiles, true),
    showActivityLedger: asBool(o.showActivityLedger, true),
    showLineBreakdown: asBool(o.showLineBreakdown, true),
    showAgingSummary: asBool(o.showAgingSummary, true),
    showOutstandingTable: asBool(o.showOutstandingTable, true),
    showDisclosures: asBool(o.showDisclosures, true),
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Checkpoint (manual commit)**

Suggested message: `feat: add statement template config + defensive merge`

---

### Task 4: Shared `StatementDocument` renderer

**Files:**
- Create: `components/sales/document-templates/statement/statement-document.tsx`

**Interfaces:**
- Consumes: `StatementTemplateConfig` (Task 3); `CustomerStatement`, `StatementCustomer`, `StatementRow`, `OpenItem` from `@/lib/accounting/customer-statement`.
- Produces: `type StatementDocumentData = { customer: StatementCustomer; statement: CustomerStatement; period: { from: string | null; to: string | null; asOf: string } }`; component `StatementDocument({ config, data }: { config: StatementTemplateConfig; data: StatementDocumentData })`.

- [ ] **Step 1: Create the pure renderer**

Create `components/sales/document-templates/statement/statement-document.tsx`. No `"use client"` — this component must render on the server too (future PDF). No browser APIs.

```tsx
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type {
  CustomerStatement,
  StatementCustomer,
} from "@/lib/accounting/customer-statement";
import type { StatementTemplateConfig } from "./statement-config";

export type StatementDocumentData = {
  customer: StatementCustomer;
  statement: CustomerStatement;
  period: { from: string | null; to: string | null; asOf: string };
};

const money = (minor: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((minor ?? 0) / 100);

const day = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const fontClass = (f: StatementTemplateConfig["font"]) =>
  f === "serif" ? "font-serif" : f === "mono" ? "font-mono" : "font-sans";

export function StatementDocument({
  config,
  data,
}: {
  config: StatementTemplateConfig;
  data: StatementDocumentData;
}) {
  const { customer, statement, period } = data;
  const brand = config.brandColor;

  return (
    <div className={cn("bg-white text-slate-800 w-full", fontClass(config.font))}>
      {/* HEADER */}
      <div
        className="flex items-start justify-between gap-6 border-b-2 pb-5"
        style={{ borderColor: brand }}
      >
        <div className="space-y-1.5">
          {config.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.logo} alt="Logo" className="max-h-14 object-contain" />
          ) : (
            <h1 className="text-2xl font-black tracking-tight" style={{ color: brand }}>
              {config.statementTitle}
            </h1>
          )}
          {config.logo && (
            <p className="text-sm font-bold" style={{ color: brand }}>
              {config.statementTitle}
            </p>
          )}
          <p className="whitespace-pre-line text-xs leading-relaxed text-slate-500">
            {config.companyAddress}
          </p>
          {config.vatNumber && (
            <p className="text-xs text-slate-500">
              VAT: <span className="font-mono font-bold text-slate-700">{config.vatNumber}</span>
            </p>
          )}
          {config.regNumber && (
            <p className="text-xs text-slate-500">
              CRN: <span className="font-mono font-bold text-slate-700">{config.regNumber}</span>
            </p>
          )}
        </div>

        <div className="max-w-[45%] text-right text-xs text-slate-500">
          <p className="mb-1 font-bold uppercase tracking-wide text-slate-400">Statement For</p>
          <p className="text-base font-bold text-slate-900">{customer.name}</p>
          {customer.email && <p>{customer.email}</p>}
          {customer.billingAddress && (
            <p className="whitespace-pre-line leading-relaxed">{customer.billingAddress}</p>
          )}
          <p className="pt-2">
            As at <span className="font-bold text-slate-700">{day(period.asOf)}</span>
            {period.from || period.to ? (
              <>
                <br />
                {period.from ? day(period.from) : "start"} – {period.to ? day(period.to) : "today"}
              </>
            ) : null}
          </p>
        </div>
      </div>

      {config.introText && (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {config.introText}
        </p>
      )}

      {/* 1. SUMMARY TILES */}
      {config.showSummaryTiles && (
        <div className="mt-6 grid grid-cols-4 gap-3 text-center">
          {[
            { label: "Opening", value: statement.openingBalanceMinor },
            { label: "Invoiced", value: statement.totalDebitsMinor },
            { label: "Paid", value: statement.totalCreditsMinor },
            { label: "Closing", value: statement.closingBalanceMinor },
          ].map((t) => (
            <div key={t.label} className="rounded-lg border border-slate-200 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t.label}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900">{money(t.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* 2. ACTIVITY LEDGER */}
      {config.showActivityLedger && (
        <table className="statement-ledger mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-2">Date</th>
              <th className="py-2">Reference</th>
              <th className="py-2">Details</th>
              <th className="py-2 text-right">Charge</th>
              <th className="py-2 text-right">Payment</th>
              <th className="py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            <tr className="font-semibold text-slate-600">
              <td className="py-2" colSpan={5}>
                Balance brought forward
              </td>
              <td className="py-2 text-right font-bold text-slate-900">
                {money(statement.openingBalanceMinor)}
              </td>
            </tr>

            {statement.rows.map((row, i) => (
              <Fragment key={`row-${i}`}>
                <tr className={cn("statement-row", row.informational && "text-slate-400")}>
                  <td className="py-2 align-top">{day(row.date)}</td>
                  <td className="py-2 align-top font-bold text-slate-900">{row.ref}</td>
                  <td className="py-2 align-top">
                    {row.description}
                    {row.informational ? (
                      <span className="ml-1 text-[11px] text-slate-400">
                        ({money(row.amountMinor ?? 0)} · no balance impact)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-right align-top">
                    {row.debitMinor ? money(row.debitMinor) : "—"}
                  </td>
                  <td className="py-2 text-right align-top">
                    {row.creditMinor ? money(row.creditMinor) : "—"}
                  </td>
                  <td
                    className={cn(
                      "py-2 text-right align-top font-bold",
                      row.informational ? "text-slate-400" : "text-slate-900"
                    )}
                  >
                    {money(row.runningBalanceMinor)}
                  </td>
                </tr>

                {config.showLineBreakdown && row.kind === "invoice" && row.lines && row.lines.length > 0 && (
                  <tr className="statement-lines">
                    <td colSpan={6} className="px-4 pb-3">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            <th className="py-1">Description</th>
                            <th className="py-1 text-right">Qty</th>
                            <th className="py-1 text-right">Unit</th>
                            <th className="py-1 text-right">Net</th>
                            <th className="py-1 text-right">VAT</th>
                            <th className="py-1 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-600">
                          {row.lines.map((ln, li) => (
                            <tr key={li}>
                              <td className="py-1">{ln.description}</td>
                              <td className="py-1 text-right">{ln.quantity}</td>
                              <td className="py-1 text-right">{money(ln.unitPriceMinor)}</td>
                              <td className="py-1 text-right">{money(ln.subtotalMinor)}</td>
                              <td className="py-1 text-right">
                                {money(ln.taxMinor)}
                                {ln.taxRate ? <span className="ml-1 text-slate-400">({ln.taxRate}%)</span> : null}
                              </td>
                              <td className="py-1 text-right font-semibold text-slate-800">
                                {money(ln.totalMinor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}

            <tr className="border-t-2 border-slate-200 font-bold text-slate-900">
              <td className="py-2" colSpan={5}>
                Balance carried forward
              </td>
              <td className="py-2 text-right" style={{ color: brand }}>
                {money(statement.closingBalanceMinor)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* 3. AGING SUMMARY */}
      {config.showAgingSummary && (
        <div className="mt-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Aging Summary
          </p>
          <div className="grid grid-cols-6 gap-2 text-center text-xs">
            {[
              { label: "Current", value: statement.aging.current },
              { label: "1–30", value: statement.aging.d1_30 },
              { label: "31–60", value: statement.aging.d31_60 },
              { label: "61–90", value: statement.aging.d61_90 },
              { label: "90+", value: statement.aging.d90plus },
              { label: "Total", value: statement.aging.total },
            ].map((c) => (
              <div key={c.label} className="rounded-md border border-slate-200 p-2">
                <p className="text-[10px] font-bold uppercase text-slate-400">{c.label}</p>
                <p className="mt-1 font-bold text-slate-900">{money(c.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. OUTSTANDING TABLE */}
      {config.showOutstandingTable && statement.outstandingItems.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Outstanding Invoices
          </p>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-2">Invoice</th>
                <th className="py-2">Issued</th>
                <th className="py-2">Due</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Paid</th>
                <th className="py-2 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {statement.outstandingItems.map((it) => (
                <tr key={it.invoiceId} className="statement-row">
                  <td className="py-2 font-bold text-slate-900">{it.invoiceNo}</td>
                  <td className="py-2 text-slate-500">{day(it.issueDate)}</td>
                  <td className="py-2 text-slate-500">{it.dueDate ? day(it.dueDate) : "—"}</td>
                  <td className="py-2 text-right">{money(it.totalMinor)}</td>
                  <td className="py-2 text-right">{money(it.paidMinor)}</td>
                  <td className="py-2 text-right font-bold text-slate-900">
                    {money(it.outstandingMinor)}
                    {it.daysOverdue > 0 ? (
                      <span className="ml-1 text-[10px] font-bold text-red-600">
                        ({it.daysOverdue}d overdue)
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. DISCLOSURES */}
      {config.showDisclosures && (
        <>
          {statement.rows.some((r) => r.informational) && (
            <p className="mt-6 text-xs italic text-slate-500">
              Informational documents (credit notes, receipts) are shown for reference and do not
              affect the running balance.
            </p>
          )}
          {statement.excludedCurrencies.length > 0 && (
            <p className="mt-2 text-xs italic text-amber-700">
              {statement.excludedCurrencies.join(", ")} documents are excluded — this statement
              covers GBP only.
            </p>
          )}
        </>
      )}

      {/* FOOTER */}
      {config.footer && (
        <div className="mt-8 whitespace-pre-line border-t border-slate-100 pt-4 text-center text-xs font-bold tracking-wide text-slate-400">
          {config.footer}
        </div>
      )}
    </div>
  );
}
```

Note: the `statement-ledger`, `statement-row`, and `statement-lines` class hooks carry no styling here — Task 9's print CSS targets them for pagination. Each mapped row returns a **keyed `<Fragment key={...}>`** (not a `<>` shorthand, which can't take a key), so the invoice row and its optional line-breakdown row group under one list item without a React key warning.

- [ ] **Step 2: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS. If TS complains about the fragment-in-map keys, confirm each `<tr>` has its own `key` and the map returns the fragment.

- [ ] **Step 3: Checkpoint (manual commit)**

Suggested message: `feat: add shared StatementDocument renderer`

---

### Task 5: Statement live preview (sample data)

**Files:**
- Create: `components/sales/document-templates/statement/statement-preview.tsx`

**Interfaces:**
- Consumes: `StatementDocument`, `StatementDocumentData` (Task 4); `computeCustomerStatement`, `StatementInvoice`, `StatementDoc` from `@/lib/accounting/customer-statement`; `StatementTemplateConfig` (Task 3).
- Produces: `StatementPreview({ config }: { config: StatementTemplateConfig })`.

- [ ] **Step 1: Create the preview**

Create `components/sales/document-templates/statement/statement-preview.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import {
  computeCustomerStatement,
  type StatementInvoice,
  type StatementDoc,
} from "@/lib/accounting/customer-statement";
import type { StatementTemplateConfig } from "./statement-config";
import { StatementDocument, type StatementDocumentData } from "./statement-document";

// Fixed sample data so the preview is a real, internally-consistent statement
// (running balance + aging computed by the same engine as production).
const SAMPLE_INVOICES: StatementInvoice[] = [
  {
    id: "sample-1",
    invoiceNo: "INV-004381",
    issueDate: "2026-05-02",
    dueDate: "2026-06-01",
    status: "sent",
    currency: "GBP",
    subtotalMinor: 120000,
    taxMinor: 24000,
    discountMinor: 0,
    totalMinor: 144000,
    amountsAre: "exclusive",
    payments: [{ amountMinor: 144000, paidAt: "2026-05-28", accountName: "Bank" }],
    lines: [
      {
        description: "Premium SaaS Development Service",
        quantity: "1",
        unitPriceMinor: 120000,
        discountMinor: 0,
        subtotalMinor: 120000,
        taxCode: "STD",
        taxRate: 20,
        taxMinor: 24000,
        totalMinor: 144000,
      },
    ],
  },
  {
    id: "sample-2",
    invoiceNo: "INV-004392",
    issueDate: "2026-06-14",
    dueDate: "2026-07-14",
    status: "sent",
    currency: "GBP",
    subtotalMinor: 80000,
    taxMinor: 16000,
    discountMinor: 0,
    totalMinor: 96000,
    amountsAre: "exclusive",
    payments: [],
    lines: [
      {
        description: "Strategic Integration Architecture Scope",
        quantity: "2",
        unitPriceMinor: 40000,
        discountMinor: 0,
        subtotalMinor: 80000,
        taxCode: "STD",
        taxRate: 20,
        taxMinor: 16000,
        totalMinor: 96000,
      },
    ],
  },
];

const SAMPLE_DOCS: StatementDoc[] = [
  { id: "cn-1", kind: "credit_note", docNo: "CN-001092", date: "2026-06-20", totalMinor: 12000, currency: "GBP" },
];

export function StatementPreview({ config }: { config: StatementTemplateConfig }) {
  const statement = computeCustomerStatement({
    invoices: SAMPLE_INVOICES,
    documents: SAMPLE_DOCS,
    params: { fromDate: null, toDate: null, asOfDate: "2026-07-16" },
  });

  const data: StatementDocumentData = {
    customer: {
      id: "sample-customer",
      name: "Acme Corporation",
      email: "accounts@acme.example",
      billingAddress: "123 Client Street\nTech District, London",
    },
    statement,
    period: { from: null, to: null, asOf: "2026-07-16" },
  };

  return (
    <div
      className={cn(
        "mx-auto w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-md",
        config.paperSize === "letter" ? "aspect-[8.5/11]" : "aspect-[210/297]"
      )}
      style={{ overflowY: "auto" }}
    >
      <StatementDocument config={config} data={data} />
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS. If TS flags a `StatementInvoice`/`StatementDoc` field mismatch, align the sample object to the type in `lib/accounting/customer-statement.ts` (lines 21-70).

- [ ] **Step 3: Checkpoint (manual commit)**

Suggested message: `feat: add statement live preview with sample data`

---

### Task 6: Shared editor blocks + statement editor

**Files:**
- Create: `components/sales/document-templates/shared/upload-template-logo.ts`
- Create: `components/sales/document-templates/shared/use-template-branding.ts`
- Create: `components/sales/document-templates/shared/branding-fields.tsx`
- Create: `components/sales/document-templates/statement/statement-editor.tsx`

**Interfaces:**
- Consumes: branding actions (Task 1); `StatementTemplateConfig`, `STATEMENT_DEFAULTS`, `mergeStatementDefaults` (Task 3); `StatementPreview` (Task 5); `DocumentTemplateKind` (Task 1).
- Produces: `uploadTemplateLogo(base64, orgId, prefix): Promise<string | null>`; `useTemplateBranding<C>(orgId, kind, coerce): { config, setConfig, save, saving, loading }`; `BrandingFields` component; `StatementEditor({ activeOrgId }: { activeOrgId: string })`.

- [ ] **Step 1: Create the logo-upload helper**

Create `components/sales/document-templates/shared/upload-template-logo.ts`:

```ts
import { createClient } from "@/lib/supabase/client";

/**
 * Convert a base64 data-URL logo to a real file in the workspace_assets bucket
 * and return its public URL. Non-base64 input (already a URL, or null) is passed
 * through unchanged. Returns the original input on upload failure (non-fatal).
 */
export async function uploadTemplateLogo(
  base64Data: string | null,
  orgId: string,
  prefix: string
): Promise<string | null> {
  if (!base64Data || !base64Data.startsWith("data:image")) return base64Data;

  try {
    const supabase = createClient();
    const response = await fetch(base64Data);
    const blob = await response.blob();
    const fileExt = blob.type.split("/")[1] || "png";
    const filePath = `logos/workspace-${orgId}-${prefix}-${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from("workspace_assets")
      .upload(filePath, blob, { cacheControl: "3600", upsert: true });
    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("workspace_assets").getPublicUrl(filePath);
    return publicUrl;
  } catch (err) {
    console.error(`Failed to upload ${prefix} logo:`, err);
    return base64Data;
  }
}
```

- [ ] **Step 2: Create the branding load/save hook**

Create `components/sales/document-templates/shared/use-template-branding.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import {
  fetchDocumentBrandingDB,
  saveDocumentBrandingDB,
} from "@/app/(dashboard)/sales/document-templates/actions";
import type { DocumentTemplateKind } from "../types";

/**
 * Load a template's branding blob and coerce it into a typed config; expose a
 * save. `coerce` is the module's defensive merge (e.g. mergeStatementDefaults),
 * so the hook stays generic across document types.
 */
export function useTemplateBranding<C>(
  orgId: string,
  kind: DocumentTemplateKind,
  coerce: (raw: unknown) => C
) {
  const [config, setConfig] = useState<C | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const raw = orgId ? await fetchDocumentBrandingDB(orgId, kind) : null;
        if (active) setConfig(coerce(raw));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // coerce is a stable module-level function; intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, kind]);

  const save = async (next: C) => {
    setSaving(true);
    try {
      await saveDocumentBrandingDB(orgId, kind, next);
    } finally {
      setSaving(false);
    }
  };

  return { config, setConfig, save, saving, loading };
}
```

- [ ] **Step 3: Create the reusable branding fields**

Create `components/sales/document-templates/shared/branding-fields.tsx`:

```tsx
"use client";

import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type BrandingFieldValues = {
  logo: string | null;
  brandColor: string;
  font: "sans" | "serif" | "mono";
  companyAddress: string;
  vatNumber: string;
  regNumber: string;
  paperSize: "a4" | "letter";
  footer: string;
};

export function BrandingFields<V extends BrandingFieldValues>({
  value,
  onPatch,
}: {
  value: V;
  onPatch: (patch: Partial<BrandingFieldValues>) => void;
}) {
  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => onPatch({ logo: reader.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
          Logo Emblem
        </label>
        <div className="flex items-center gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
            {value.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.logo} alt="Logo" className="h-full w-full object-contain p-1" />
            ) : (
              <span className="text-[10px] font-bold uppercase text-slate-400">No Logo</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="relative h-8 gap-2 text-xs font-bold">
              <Upload className="size-3" /> Upload
              <input
                type="file"
                accept="image/*"
                onChange={onLogoFile}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </Button>
            {value.logo && (
              <Button
                variant="ghost"
                onClick={() => onPatch({ logo: null })}
                className="h-8 text-xs font-bold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="mr-1 size-3" /> Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Color / Font / Paper */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Brand Color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.brandColor}
              onChange={(e) => onPatch({ brandColor: e.target.value })}
              className="size-9 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
            />
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-bold uppercase text-slate-600">
              {value.brandColor}
            </span>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Typography
          </label>
          <select
            value={value.font}
            onChange={(e) => onPatch({ font: e.target.value as BrandingFieldValues["font"] })}
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
          >
            <option value="sans">Modern Sans</option>
            <option value="serif">Classic Serif</option>
            <option value="mono">Technical Mono</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Paper Size
          </label>
          <select
            value={value.paperSize}
            onChange={(e) => onPatch({ paperSize: e.target.value as BrandingFieldValues["paperSize"] })}
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
          >
            <option value="a4">A4 (Global)</option>
            <option value="letter">Letter (US)</option>
          </select>
        </div>
      </div>

      {/* Statutory */}
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Trading Address
          </label>
          <textarea
            rows={2}
            value={value.companyAddress}
            onChange={(e) => onPatch({ companyAddress: e.target.value })}
            placeholder="e.g. 123 Accounting Lane, London, EC1A 1BB"
            className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
              VAT Number
            </label>
            <input
              type="text"
              value={value.vatNumber}
              onChange={(e) => onPatch({ vatNumber: e.target.value })}
              placeholder="e.g. GB 123 4567 89"
              className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Company Reg No (CRN)
            </label>
            <input
              type="text"
              value={value.regNumber}
              onChange={(e) => onPatch({ regNumber: e.target.value })}
              placeholder="e.g. 01234567"
              className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Footer
          </label>
          <textarea
            rows={2}
            value={value.footer}
            onChange={(e) => onPatch({ footer: e.target.value })}
            placeholder="e.g. Please remit payment to Bank … Sort 00-00-00 Acct 1234-5678"
            className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the statement editor**

Create `components/sales/document-templates/statement/statement-editor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Save, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BrandingFields } from "../shared/branding-fields";
import { useTemplateBranding } from "../shared/use-template-branding";
import { uploadTemplateLogo } from "../shared/upload-template-logo";
import {
  STATEMENT_DEFAULTS,
  mergeStatementDefaults,
  type StatementTemplateConfig,
} from "./statement-config";
import { StatementPreview } from "./statement-preview";

const SECTION_TOGGLES: { key: keyof StatementTemplateConfig; label: string }[] = [
  { key: "showSummaryTiles", label: "Summary tiles (opening / invoiced / paid / closing)" },
  { key: "showActivityLedger", label: "Activity ledger (running balance)" },
  { key: "showLineBreakdown", label: "Per-invoice line breakdown" },
  { key: "showAgingSummary", label: "Aging summary" },
  { key: "showOutstandingTable", label: "Outstanding invoices table" },
  { key: "showDisclosures", label: "Disclosures (informational + excluded currencies)" },
];

export function StatementEditor({ activeOrgId }: { activeOrgId: string }) {
  const { config, setConfig, save, saving, loading } = useTemplateBranding<StatementTemplateConfig>(
    activeOrgId,
    "statement",
    mergeStatementDefaults
  );
  const [savingLogo, setSavingLogo] = useState(false);

  const current = config ?? STATEMENT_DEFAULTS;
  const patch = (p: Partial<StatementTemplateConfig>) => setConfig({ ...current, ...p });

  const onSave = async () => {
    if (!activeOrgId) {
      toast.error("Active organization context is missing.");
      return;
    }
    setSavingLogo(true);
    try {
      const finalLogo = await uploadTemplateLogo(current.logo, activeOrgId, "statement");
      const next = { ...current, logo: finalLogo };
      await save(next);
      setConfig(next);
      toast.success("Statement template saved.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save statement template.");
    } finally {
      setSavingLogo(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Loading statement template…</div>;
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* Editor column */}
      <div className="space-y-6 lg:col-span-7">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <BrandingFields value={current} onPatch={patch} />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">Statement Content</h2>
          </div>
          <div className="space-y-4 p-5 sm:p-6">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Statement Title
              </label>
              <input
                type="text"
                value={current.statementTitle}
                onChange={(e) => patch({ statementTitle: e.target.value })}
                className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Intro Text (optional)
              </label>
              <textarea
                rows={2}
                value={current.introText}
                onChange={(e) => patch({ introText: e.target.value })}
                placeholder="e.g. Please find your statement of account below."
                className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">Statement Sections</h2>
          </div>
          <div className="space-y-3 p-5 text-xs font-semibold tracking-wide text-slate-700 sm:p-6">
            {SECTION_TOGGLES.map((t) => (
              <label key={t.key} className="flex cursor-pointer select-none items-center gap-3 hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={Boolean(current[t.key])}
                  onChange={(e) => patch({ [t.key]: e.target.checked } as Partial<StatementTemplateConfig>)}
                  className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={onSave}
            disabled={saving || savingLogo}
            className="h-9 gap-2 bg-blue-600 px-6 text-xs font-bold text-white hover:bg-blue-700"
          >
            <Save className="size-4" />
            {saving || savingLogo ? "Saving…" : "Save Statement Template"}
          </Button>
        </div>
      </div>

      {/* Preview column */}
      <div className="space-y-3 lg:sticky lg:top-24 lg:col-span-5">
        <div className="flex items-center gap-2 px-1 text-slate-700">
          <Eye className="size-4 text-slate-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Live Statement Preview</h3>
        </div>
        <StatementPreview config={current} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS. If TS flags the checkbox `onChange` computed-key patch, confirm the `as Partial<StatementTemplateConfig>` cast is present.

- [ ] **Step 6: Checkpoint (manual commit)**

Suggested message: `feat: add shared editor blocks + statement editor`

---

### Task 7: Add controlled/chromeless mode to the existing invoice editor

**Files:**
- Modify: `components/sales/invoice-settings.tsx:18-24` (signature), `:23` (activeTab state), and the header/tab-bar JSX block (`:446-489`)

**Interfaces:**
- Produces: `InvoiceSettings` accepts optional `activeTab?`, `onTabChange?`, `hideChrome?` (defaults preserve current behavior).

- [ ] **Step 1: Extend the component signature**

In `components/sales/invoice-settings.tsx`, change the function signature (line 18) from:

```tsx
export function InvoiceSettings({ activeOrgId }: { activeOrgId: string }) {
```

to:

```tsx
export function InvoiceSettings({
  activeOrgId,
  activeTab: controlledTab,
  onTabChange,
  hideChrome = false,
}: {
  activeOrgId: string;
  activeTab?: "invoice" | "credit_note" | "quote";
  onTabChange?: (tab: "invoice" | "credit_note" | "quote") => void;
  hideChrome?: boolean;
}) {
```

- [ ] **Step 2: Make the active tab controllable**

Line 23 currently reads:

```tsx
const [activeTab, setActiveTab] = useState<"invoice" | "credit_note" | "quote">("invoice");
```

Replace it with an internal state renamed to `activeTabState`, plus derived controlled values:

```tsx
const [activeTabState, setActiveTabState] = useState<"invoice" | "credit_note" | "quote">("invoice");
const activeTab = controlledTab ?? activeTabState;
const setActiveTab = (tab: "invoice" | "credit_note" | "quote") => {
  setActiveTabState(tab);
  onTabChange?.(tab);
};
```

Every existing reference to `activeTab` / `setActiveTab` in the file now resolves to these — no other change needed.

- [ ] **Step 3: Gate the header + tab bar behind `hideChrome`**

Wrap the entire "HEADER SECTION" block (the `<div className="flex flex-col xl:flex-row ...">` that contains the `<h1>Document Template Workspace</h1>` and the three tab `<button>`s — lines 446-489) in a conditional so it renders only when chrome is shown:

```tsx
{!hideChrome && (
  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
    {/* …existing header + tab bar unchanged… */}
  </div>
)}
```

Leave the workspace grid, all field sections, the preview, and the action buttons untouched.

- [ ] **Step 4: Verify legacy editor still works standalone**

Run: `pnpm typecheck` (Expected: PASS), then `pnpm dev` and open `/sales/settings`. The page still renders `<InvoiceSettings>` directly at this point (repointed in Task 8). Expected: identical behavior to before — header, three tabs, fields, preview, save all work.

- [ ] **Step 5: Checkpoint (manual commit)**

Suggested message: `feat: add optional controlled/chromeless mode to InvoiceSettings`

---

### Task 8: Statement module, registry, workspace shell, settings wiring

**Files:**
- Create: `components/sales/document-templates/statement/statement-module.tsx`
- Create: `components/sales/document-templates/invoice-settings-adapter.tsx`
- Create: `components/sales/document-templates/registry.ts`
- Create: `components/sales/document-templates/workspace.tsx`
- Modify: `app/(dashboard)/sales/settings/page.tsx:1,33`

**Interfaces:**
- Consumes: `StatementEditor` (Task 6), `StatementPreview` (Task 5), `StatementDocument` (Task 4), `STATEMENT_DEFAULTS` (Task 3), `DocumentModule` (Task 1), `InvoiceSettings` controlled props (Task 7).
- Produces: `statementModule`; `invoiceAdapterModules`; `DOCUMENT_MODULES`; `DocumentTemplateWorkspace({ activeOrgId }: { activeOrgId: string })`.

- [ ] **Step 1: Create the statement module**

Create `components/sales/document-templates/statement/statement-module.tsx`:

```tsx
import { FileSpreadsheet } from "lucide-react";
import type { DocumentModule } from "../types";
import { STATEMENT_DEFAULTS, type StatementTemplateConfig } from "./statement-config";
import { StatementEditor } from "./statement-editor";
import { StatementPreview } from "./statement-preview";
import { StatementDocument, type StatementDocumentData } from "./statement-document";

export const statementModule: DocumentModule<StatementTemplateConfig, StatementDocumentData> = {
  id: "statement",
  kind: "statement",
  label: "Statement",
  icon: FileSpreadsheet,
  defaults: STATEMENT_DEFAULTS,
  Editor: StatementEditor,
  Preview: StatementPreview,
  Document: StatementDocument,
};
```

- [ ] **Step 2: Create the transitional invoice adapter**

Create `components/sales/document-templates/invoice-settings-adapter.tsx`:

```tsx
"use client";

import { FileText, Receipt, Sliders } from "lucide-react";
import { InvoiceSettings } from "@/components/sales/invoice-settings";
import type { DocumentModule, DocumentTemplateKind } from "./types";

// Transitional: mounts the existing InvoiceSettings chromeless, controlled to a
// single tab, so the shell can host invoice/credit_note/quote under one unified
// tab bar. Delete this file when those types are extracted into native modules.
//
// Known transitional limitation: switching among these three tabs remounts
// InvoiceSettings, so unsaved edits in one are dropped when moving to another.
// Acceptable while this is an adapter; native extraction removes it.
function makeAdapter(
  kind: Extract<DocumentTemplateKind, "invoice" | "credit_note" | "quote">,
  label: string,
  icon: DocumentModule["icon"]
): DocumentModule {
  return {
    id: kind,
    kind,
    label,
    icon,
    defaults: {},
    Editor: ({ activeOrgId }) => (
      <InvoiceSettings activeOrgId={activeOrgId} activeTab={kind} hideChrome />
    ),
  };
}

export const invoiceAdapterModules: DocumentModule[] = [
  makeAdapter("invoice", "Invoice", FileText),
  makeAdapter("credit_note", "Credit Note", Receipt),
  makeAdapter("quote", "Quote / Estimate", Sliders),
];
```

- [ ] **Step 3: Create the registry**

Create `components/sales/document-templates/registry.ts`:

```ts
import type { DocumentModule } from "./types";
import { invoiceAdapterModules } from "./invoice-settings-adapter";
import { statementModule } from "./statement/statement-module";

// "bill" is intentionally absent — bill branding is configured under purchases
// settings, not the sales Document Template Workspace.
export const DOCUMENT_MODULES: DocumentModule[] = [
  ...invoiceAdapterModules,
  statementModule as DocumentModule,
];
```

- [ ] **Step 4: Create the workspace shell**

Create `components/sales/document-templates/workspace.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DOCUMENT_MODULES } from "./registry";

export function DocumentTemplateWorkspace({ activeOrgId }: { activeOrgId: string }) {
  const [activeId, setActiveId] = useState(DOCUMENT_MODULES[0]?.id);
  const active = DOCUMENT_MODULES.find((m) => m.id === activeId) ?? DOCUMENT_MODULES[0];
  const ActiveEditor = active.Editor;

  return (
    <div className="w-full space-y-6 pb-16">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Document Template Workspace
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure branding, statutory details, and layout for each document type.
          </p>
        </div>

        <div className="flex max-w-full items-center gap-1 self-start overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-sm scrollbar-none">
          {DOCUMENT_MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setActiveId(m.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all",
                  activeId === m.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Icon className="size-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Remount editor per tab: key by module id */}
      <ActiveEditor key={active.id} activeOrgId={activeOrgId} />
    </div>
  );
}
```

- [ ] **Step 5: Repoint the settings page**

In `app/(dashboard)/sales/settings/page.tsx`, change the import (line 1) from:

```tsx
import { InvoiceSettings } from "@/components/sales/invoice-settings";
```

to:

```tsx
import { DocumentTemplateWorkspace } from "@/components/sales/document-templates/workspace";
```

and the render (line 33) from:

```tsx
return <InvoiceSettings activeOrgId={activeOrgId} />;
```

to:

```tsx
return <DocumentTemplateWorkspace activeOrgId={activeOrgId} />;
```

- [ ] **Step 6: Verify the workspace**

Run: `pnpm typecheck` (Expected: PASS), then `pnpm dev` and open `/sales/settings`. Expected: four tabs — Invoice, Credit Note, Quote / Estimate, Statement — under one header. Invoice/Credit Note/Quote render the existing editor (no duplicate header/tab bar). Statement renders the new editor + live preview; toggling a section checkbox updates the preview; changing brand color/logo updates the preview.

- [ ] **Step 7: Checkpoint (manual commit)**

Suggested message: `feat: modular document-template workspace shell hosting Statement + legacy tabs`

---

### Task 9: Organization-scoped statement print route

**Files:**
- Create: `app/print/statement/[customerId]/page.tsx`
- Create: `app/print/statement/[customerId]/statement-print-client.tsx`

**Interfaces:**
- Consumes: `requireAccountingWorkspace` from `@/lib/accounting/dal`; `loadCustomerStatementBundles` from `@/lib/accounting/customer-statement-loader`; `computeCustomerStatement` from `@/lib/accounting/customer-statement`; `fetchDocumentBrandingDB` (Task 1); `mergeStatementDefaults` (Task 3); `accountingToday` (Task 2); `StatementDocument`, `StatementDocumentData` (Task 4).

- [ ] **Step 1: Create the print client wrapper**

Create `app/print/statement/[customerId]/statement-print-client.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { StatementDocument, type StatementDocumentData } from "@/components/sales/document-templates/statement/statement-document";
import type { StatementTemplateConfig } from "@/components/sales/document-templates/statement/statement-config";

export function StatementPrintClient({
  config,
  data,
}: {
  config: StatementTemplateConfig;
  data: StatementDocumentData;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (ready) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [ready]);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page { size: ${config.paperSize === "letter" ? "letter" : "A4"}; margin: 14mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
        }
        /* Keep each invoice with its own line breakdown; repeat ledger headers. */
        .statement-ledger thead { display: table-header-group; }
        .statement-row, .statement-lines { break-inside: avoid; page-break-inside: avoid; }
        h1, h2, h3 { break-after: avoid; }
      `,
        }}
      />
      <div
        className={cn(
          "mx-auto w-full max-w-[820px] bg-white p-10 print:p-0",
        )}
      >
        <StatementDocument config={config} data={data} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create the org-scoped print route**

Create `app/print/statement/[customerId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { loadCustomerStatementBundles } from "@/lib/accounting/customer-statement-loader";
import { computeCustomerStatement } from "@/lib/accounting/customer-statement";
import { fetchDocumentBrandingDB } from "@/app/(dashboard)/sales/document-templates/actions";
import { mergeStatementDefaults } from "@/components/sales/document-templates/statement/statement-config";
import { accountingToday } from "@/lib/accounting/accounting-today";
import { StatementPrintClient } from "./statement-print-client";

export const dynamic = "force-dynamic";

export default async function PrintStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ from?: string; to?: string; asOf?: string }>;
}) {
  const { customerId } = await params;
  const { from, to, asOf } = await searchParams;

  // Auth + org resolution + onboarding gate (read-only view).
  const workspace = await requireAccountingWorkspace();

  // Org-scoped load. Missing customer → notFound(), which also blocks cross-org
  // access because the loader only returns the caller's own customers.
  const bundles = await loadCustomerStatementBundles(prisma, workspace.organizationId);
  const bundle = bundles.find((b) => b.customer.id === customerId);
  if (!bundle) return notFound();

  const branding = await fetchDocumentBrandingDB(workspace.organizationId, "statement");
  const config = mergeStatementDefaults(branding);

  const asOfDate = asOf ?? accountingToday();
  const statement = computeCustomerStatement({
    invoices: bundle.invoices,
    documents: bundle.documents,
    params: { fromDate: from ?? null, toDate: to ?? null, asOfDate },
  });

  return (
    <StatementPrintClient
      config={config}
      data={{
        customer: bundle.customer,
        statement,
        period: { from: from ?? null, to: to ?? null, asOf: asOfDate },
      }}
    />
  );
}
```

- [ ] **Step 3: Verify the route renders and prints**

Run: `pnpm typecheck` (Expected: PASS), then `pnpm dev`. Log in, open `/sales/statements`, note a real customer id from the customer dropdown's option value (via devtools), and visit `/print/statement/<thatId>`. Expected: a clean branded statement renders and the browser print dialog opens automatically. Visit `/print/statement/does-not-exist` → 404. In the print preview, confirm invoices with expanded lines are not split across a page break.

- [ ] **Step 4: Checkpoint (manual commit)**

Suggested message: `feat: add org-scoped customer statement print route`

---

### Task 10: Wire the "Print Statement" button + timezone-correct date

**Files:**
- Modify: `app/(dashboard)/sales/statements/page.tsx:27`
- Modify: `components/sales/customer-statements.tsx:119-161` (print CSS + button handler)

**Interfaces:**
- Consumes: `accountingToday` (Task 2); the print route (Task 9).

- [ ] **Step 1: Use `accountingToday()` for the statement's as-at date**

In `app/(dashboard)/sales/statements/page.tsx`, add the import at the top:

```tsx
import { accountingToday } from "@/lib/accounting/accounting-today";
```

and replace line 27:

```tsx
const todayIso = new Date().toISOString().slice(0, 10);
```

with:

```tsx
const todayIso = accountingToday();
```

- [ ] **Step 2: Point the Print button at the print route**

In `components/sales/customer-statements.tsx`, replace the Print Statement button's handler. The button currently (lines 151-159) reads `onClick={() => window.print()}`. Replace that `onClick` with a call to a new local handler; add this handler inside the `CustomerStatements` component (near the other hooks, e.g. after the `range` memo):

```tsx
const openPrintStatement = () => {
  if (!selectedCustomerId) return;
  const qs = new URLSearchParams();
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);
  qs.set("asOf", todayIso);
  window.open(`/print/statement/${selectedCustomerId}?${qs.toString()}`, "_blank");
};
```

and change the button to `onClick={openPrintStatement}`.

- [ ] **Step 3: Remove the dead dashboard-print CSS**

Delete the `<style dangerouslySetInnerHTML={{ __html: ... }} />` block at lines 121-133 (the `@media print` rules that hid the dashboard nav). We no longer print the dashboard, so it is dead code. Leave the surrounding JSX intact.

- [ ] **Step 4: Verify end-to-end**

Run: `pnpm typecheck` (Expected: PASS), then `pnpm dev`. Open `/sales/statements`, pick a customer and a period, click **Print Statement**. Expected: a new tab opens at `/print/statement/<id>?from=…&to=…&asOf=…`, renders the branded statement, and auto-opens the print dialog. The on-screen numbers and the printed numbers match.

- [ ] **Step 5: Checkpoint (manual commit)**

Suggested message: `feat: print statements via dedicated route + timezone-correct as-at date`

---

### Task 11: Consolidated testing pass

**Files:**
- Create: `tests/statement-config.test.ts`
- Create: `tests/accounting-today.test.ts`

**Interfaces:**
- Consumes: `mergeStatementDefaults`, `STATEMENT_DEFAULTS` (Task 3); `accountingToday` (Task 2).

- [ ] **Step 1: Write the config-merge tests**

Create `tests/statement-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mergeStatementDefaults,
  STATEMENT_DEFAULTS,
} from "@/components/sales/document-templates/statement/statement-config";

describe("mergeStatementDefaults", () => {
  it("returns full defaults for null / undefined / non-object input", () => {
    expect(mergeStatementDefaults(null)).toEqual(STATEMENT_DEFAULTS);
    expect(mergeStatementDefaults(undefined)).toEqual(STATEMENT_DEFAULTS);
    expect(mergeStatementDefaults("nonsense")).toEqual(STATEMENT_DEFAULTS);
    expect(mergeStatementDefaults(42)).toEqual(STATEMENT_DEFAULTS);
  });

  it("treats arrays as empty (falls back to defaults)", () => {
    expect(mergeStatementDefaults([1, 2, 3])).toEqual(STATEMENT_DEFAULTS);
  });

  it("keeps valid fields and defaults the wrong-typed ones", () => {
    const merged = mergeStatementDefaults({
      brandColor: "#123456",
      font: "banana", // invalid → default
      showAgingSummary: "yes", // wrong type → default true
      showLineBreakdown: false, // valid
      statementTitle: 123, // wrong type → default
      logo: 999, // wrong type → null
    });
    expect(merged.brandColor).toBe("#123456");
    expect(merged.font).toBe(STATEMENT_DEFAULTS.font);
    expect(merged.showAgingSummary).toBe(true);
    expect(merged.showLineBreakdown).toBe(false);
    expect(merged.statementTitle).toBe(STATEMENT_DEFAULTS.statementTitle);
    expect(merged.logo).toBeNull();
  });

  it("never throws on hostile input", () => {
    expect(() => mergeStatementDefaults({ paperSize: {}, font: [] })).not.toThrow();
  });

  it("preserves a valid logo URL and paper size", () => {
    const merged = mergeStatementDefaults({
      logo: "https://cdn.example/logo.png",
      paperSize: "letter",
    });
    expect(merged.logo).toBe("https://cdn.example/logo.png");
    expect(merged.paperSize).toBe("letter");
  });
});
```

- [ ] **Step 2: Write the timezone tests**

Create `tests/accounting-today.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { accountingToday } from "@/lib/accounting/accounting-today";

describe("accountingToday", () => {
  it("returns a yyyy-mm-dd string", () => {
    expect(accountingToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("defaults to Europe/London and can differ from a far-offset zone", () => {
    // At most times of day these agree; the format contract is what we assert.
    expect(accountingToday("Europe/London")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(accountingToday("Pacific/Kiritimati")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("honors an explicit timezone argument", () => {
    // UTC and a +14 zone can only differ by at most one calendar day.
    const utc = accountingToday("UTC");
    const plus14 = accountingToday("Pacific/Kiritimati");
    const diff = Math.abs(Date.parse(`${plus14}T00:00Z`) - Date.parse(`${utc}T00:00Z`));
    expect(diff).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 3: Run the tests**

The full `pnpm test` has KNOWN pre-existing, unrelated failures on master (e.g. a raw-query-lint check), so scope the gate to this feature's suites:
Run: `pnpm test tests/statement-config.test.ts tests/accounting-today.test.ts tests/customer-statement.test.ts`
Expected: PASS — the two new suites plus the existing `customer-statement.test.ts` all green.

- [ ] **Step 4: Full typecheck and build (and lint delta)**

Run: `pnpm typecheck` and `pnpm build` — Expected: both PASS.
Then `pnpm lint`: this repo has a KNOWN pre-existing lint baseline that does NOT pass cleanly on master (~141 problems, mostly `require()` in `scripts/*.cjs`). Gate = **no new lint problems naming a file this branch created or modified**; do not expect zero problems.

- [ ] **Step 5: Manual print verification checklist**

With `pnpm dev`, on `/sales/statements`:
1. Save a Statement template with a logo, a teal brand color, and a footer; toggle **off** "Per-invoice line breakdown" and "Aging summary".
2. Click **Print Statement** for a customer with several invoices/payments.
3. Confirm in the print preview: brand color on header rule + carried-forward total; logo present; line breakdown and aging **absent**; summary tiles, ledger, outstanding table, and disclosures **present**.
4. Re-enable all sections, save, print again: line breakdown and aging now present; each invoice stays with its own line block across page breaks; ledger header repeats on page 2.
5. Confirm the printed opening/closing balances match the on-screen statement for the same period.

- [ ] **Step 6: Checkpoint (manual commit)**

Suggested message: `test: cover statement config merge + accountingToday; consolidated verification`

---

## Self-Review Notes

- **Spec coverage:** §4 shared-renderer principle → Tasks 4/5/9 (one `StatementDocument`). §6.1 typed kind + rename → Task 1. §6.2 contract (Editor/Preview/Document) → Tasks 1/8. §6.4 adapter (no legacy namespace) → Task 8. §6.5 actions relocation → Task 1. §7 config + toggles + merge → Tasks 3/6. §8 org-scoped route + accountingToday + pagination + browser-agnostic renderer → Tasks 2/4/9. §8.4 button + dead CSS → Task 10. §9 testing → Task 11. §11 follow-ups remain out of scope by design.
- **Placeholders:** none — every code step contains full content.
- **Type consistency:** `DocumentTemplateKind`, `StatementTemplateConfig`, `mergeStatementDefaults`, `StatementDocumentData`, `useTemplateBranding`, `BrandingFieldValues`, and `accountingToday` signatures match across Tasks 1–11. `"bill"` is in the enum (Task 1) but excluded from `DOCUMENT_MODULES` (Task 8) as intended.
