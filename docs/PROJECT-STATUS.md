# WAW-Profi — Project Status & Task Ledger

> Master record of completed and pending work from the audit-and-remediation effort.
> **Last updated:** 2026-07-03
> **Test status at last update:** `pnpm test` **179/179** across 29 files (145 → 152 address/templates → 155 S5 onboarding → 164 A2 POS ledger → 172 A1 payroll ledger → 179 invoice deposit account). Suite verified green 2026-07-03.
> Related docs: [`AUDIT-REPORT.md`](AUDIT-REPORT.md) · [`AUDIT-REPORT-SCOPED.md`](AUDIT-REPORT-SCOPED.md) · [`REMEDIATION-CHECKLIST.md`](REMEDIATION-CHECKLIST.md) · [`EOD-REPORT-2026-07-03.md`](EOD-REPORT-2026-07-03.md) · [`EOD-REPORT-2026-06-29.md`](EOD-REPORT-2026-06-29.md) · [`superpowers/specs/2026-06-29-tenant-isolation-rls-design.md`](superpowers/specs/2026-06-29-tenant-isolation-rls-design.md) · [`superpowers/specs/2026-06-30-pos-security-hardening-design.md`](superpowers/specs/2026-06-30-pos-security-hardening-design.md) · [`superpowers/plans/2026-06-30-pos-security-hardening.md`](superpowers/plans/2026-06-30-pos-security-hardening.md)

---

# ✅ COMPLETED

## 1. Comprehensive audit
Full 20-section review (accounting accuracy, GAAP/IFRS, security, business logic, reports, database, API, performance, UX, missing features, enterprise readiness) using parallel specialist agents.
- **Deliverables:** [`AUDIT-REPORT.md`](AUDIT-REPORT.md) (full), [`AUDIT-REPORT-SCOPED.md`](AUDIT-REPORT-SCOPED.md) (POS/Payroll/onboarding descoped), [`REMEDIATION-CHECKLIST.md`](REMEDIATION-CHECKLIST.md).
- **Outcome:** prioritised findings → drove all remediation below. Overall maturity rated "late MVP."

## 2. Wave 1 — Security & accounting remediation
All verified by typecheck + test suite (ended 71/71). Files reflect pre-restructure paths; `app/*` later moved under `app/(dashboard)/*`.

| ID | Severity | What was fixed | Location |
|----|----------|----------------|----------|
| S2 | Critical | Invoice-status update scoped to caller's org (`updateMany` + count guard) — closes cross-company edit (IDOR) | `app/(dashboard)/sales/invoices/actions.ts` |
| S3 | Critical | Audit-trail page scoped to `organizationId` — closes cross-tenant data leak | `app/(dashboard)/reports/audit-trail/page.tsx` |
| S7 | Medium | `runAiMatch` / `importStatement` now require accountant role | `app/(dashboard)/banking/actions.ts` |
| A4 | High | `approveInvoice`/`approveBill` assert debits == credits before posting | `lib/accounting/documents.ts` |
| A5 | High | VAT now rounds half-up instead of truncating (was under-charging) | `lib/accounting/documents.ts` |
| A6 | High | Banking `toMinor` exact integer parsing (signed, rejects >2 decimals) | `lib/banking/dal.ts` |
| A3 | Critical | Opening-balance reset now posts a **reversing journal** instead of trigger-bypass hard-delete of a posted journal | `lib/banking/dal.ts` |
| S6 | High | `reconcileFeed` validates the journal is in-org + POSTED before linking | `lib/banking/dal.ts` |
| — | Bug | Invoice/bill numbering ordered numerically (no break past INV-9999) | `lib/accounting/documents.ts` |

## 3. Phase 1 — Tenant isolation (app-level guarantee)
A fail-closed safety net so org-scoped data access can't silently leak across tenants. Design → spec → plan → subagent-driven implementation with two independent security reviews.

**Core delivered** (`lib/tenancy/*`, `tests/tenancy/*`):
- `context.ts` — AsyncLocalStorage tenant context (`enterScopedContext`, `runAsSystem`, error classes).
- `scoped-models.ts` — 15-model `ORG_SCOPED` registry, enforced complete by a dmmf reflection test.
- `scope.ts` — pure `applyTenantScope`: injects `organizationId` on filter/create ops; throws when context is missing and no explicit org filter is present (fail-closed); passes single update/delete-by-id through; org-safe `upsert`; fail-closed on unknown ops.
- `extension.ts` + `lib/prisma.ts` — wires the guard onto every Prisma call.
- `lib/accounting/dal.ts` — `requireAccountingWorkspace` enters scoped context per request; membership lookup correctly `runAsSystem`-wrapped.
- CI guards: dmmf-completeness test + raw-SQL tenancy lint (`// tenancy:safe: <reason>` convention).

**Latent bugs surfaced & fixed during wiring:** 9 queries that were missing an `organizationId` filter (potential IDOR/leaks) now scoped.

**Review findings fixed:**
- CRIT-1: `createAccountingWorkspace` would throw in production for existing users — `runAsSystem`-wrapped.
- CRIT-2: onboarding bootstrap `runAsSystem`-wrapped (greppable, robust).
- upsert cross-org write gap closed; single update/delete documented gap; `getAccountBalance` given an explicit `orgId` filter; Prisma 7 `createManyAndReturn`/`updateManyAndReturn` handled; unknown-op catch-all made fail-closed.

**Docs:** spec + implementation plan under `docs/superpowers/`.

## 4. Repository integration
- Saved all in-progress work to branch `tenancy-phase1` (pushed) **before** pulling.
- A contributor had restructured `app/` into a Next.js `app/(dashboard)/` route group (~69 files moved). Merged it in; resolved one content conflict in `app/onboarding/actions.ts` (kept their new dynamic-plan logic inside our `runAsSystem` wrapper).
- Fast-forwarded and pushed `master`; deleted the redundant branch; removed a stray conflict marker in `plans/pending_task.md`.

## 5. Wave 2 — Correctness & performance
All verified; suite went 102 → 124.

| ID | What was fixed | Location |
|----|----------------|----------|
| W2-1 | Dashboard AR/AP aging + receivables/payables KPIs now **net ledger payments**; AR/AP ageing views age from **today** (was hardcoded `2026-05-18`); payment derivation extracted to shared `getAmountPaidMap` | `lib/accounting/dashboard.ts`, `components/accounting/ar-aging-view.tsx`, `components/accounting/ap-aging-view.tsx`, `lib/accounting/payments.ts` (new) |
| W2-2 | `saveInvoiceDraft`/`saveBillDraft` retry on unique-violation (raw-SQL `23505` / Prisma `P2002`/`P2010`) — numbering collision-safe under concurrency | `lib/accounting/documents.ts` |
| W2-3 | `Invoice.organizationId` / `Bill.organizationId` made **NOT NULL** — applied to DB (verified 0 null rows), schema + regenerated client + migration file | `prisma/schema.prisma`, `prisma/migrations/20260629120000_invoice_bill_org_not_null/` |
| W2-4 | `getJournalList` **server-side pagination** (page size 50) + Prev/Next URL controls on the journals list | `lib/accounting/dal.ts`, `app/(dashboard)/accounting/journals/page.tsx`, `components/accounting/journal-workspace.tsx` |
| W2-5 | Behavior-preserving cleanup: inline pence→pounds `/100` conversions routed through `minorToMajor` (ratio math left untouched) | `lib/accounting/dashboard.ts` |

## 6. POS security hardening (S1 + POS data-integrity) — 2026-06-30
Sub-project 1 of 3 in Priority 3. Design → plan → subagent-driven implementation with per-task spec+quality reviews. New `lib/pos/dal.ts` centralises POS auth + manual org-scoping (the `pos_*` snake_case tables are excluded from the tenancy auto-guard); `app/(dashboard)/pos/actions.ts` rewritten as thin authenticated wrappers; `TEMP_ORG_ID` deleted. Suite 124 → **145** (21 new POS tests: tenant isolation, role gating, stock guard, amount validation, stock restore).

| ID | Severity | What was fixed | Location |
|----|----------|----------------|----------|
| S1 | Critical | POS authenticated + scoped to the caller's real org. Two role tiers — `requirePosAccess` (any member: sell/refund/read) and `requirePosManager` (owner/accountant: product edits + hard-delete sale). Cross-tenant read leaks (`getPosSales`/`getPosProducts`/`getPosRefunds` had no `org_id` filter) and IDOR on by-id writes closed. Hardcoded org id removed. | `lib/pos/dal.ts` (new), `app/(dashboard)/pos/actions.ts` |
| — | High | **Server-side oversell guard** — sale re-validates stock inside the transaction and hard-rejects, rolling back the whole sale (was client-side only). Per-product aggregation across duplicate cart lines. | `lib/pos/dal.ts` (`processSale`) |
| — | High | **Server-side amount validation** — sale money (subtotal/discount/tax/total/change) re-derived from DB product records; client-sent prices/totals no longer trusted. | `lib/pos/dal.ts` (`processSale`) |
| — | Med | **Stock restored on sale delete** (was silently lost); no double-restore for already-refunded sales. | `lib/pos/dal.ts` (`deleteSale`) |
| — | Med | **Truthful audit user** — stock-log `created_by` uses the authenticated user, not hardcoded `"Admin User"`; product write + stock-log are atomic. | `lib/pos/dal.ts` (`upsertProduct`) |

## 7. Editable address snapshots & document templates — 2026-07-01
Committed as `569b68a`. Suite 145 → **152** (+7: `tests/document-address.test.ts`, `tests/document-templates.test.ts`).

| What was built | Location |
|----------------|----------|
| **Editable billing-address snapshot** — invoices/bills store a per-document `billingAddress` that can be edited without mutating the contact's saved address | `components/sales/add-invoice-dialog.tsx`, `components/purchases/add-bill-dialog.tsx`, `app/(dashboard)/sales/invoices/actions.ts` |
| **Save-as-template** — save an invoice/bill draft (contact, line items, currency, due-date offset) as a reusable template; create/list/delete backend + data model | `lib/accounting/templates.ts` (new) |
| **UI integration** — invoice/bill forms support template load/apply/delete + address editing | invoice/bill dialogs |
| **Tests** — address snapshots, template CRUD, validation, org-level isolation | `tests/document-address.test.ts`, `tests/document-templates.test.ts` |

> Note: this feature shipped but was **not** captured in the COMPLETED list when this ledger was first written; recorded here on 2026-07-01.

## 8. Quick-win remediation — 2026-07-01
| ID | What was done | Location |
|----|---------------|----------|
| **S5** | **Plaintext password removed from Stripe metadata.** The Supabase auth user is now created *before* Stripe checkout (`ensureAuthUser`, auto-confirmed, reuses an existing account on retry); checkout metadata carries only a pre-created `userId` + non-sensitive onboarding fields via a new pure `buildCheckoutMetadata` helper. Success page links the workspace by `userId` instead of re-signing-up from the password. New test `tests/onboarding-checkout.test.ts` asserts the password never appears in metadata. | `lib/onboarding/checkout.ts` (new), `app/onboarding/actions.ts`, `app/onboarding/success/page.tsx`, `tests/onboarding-checkout.test.ts` (new) |
| **A8** | **Period-close boundary decided: keep `gte`** (block same-date postings after close). Confirmed correct — the close sweep is inclusive of the close date (`journal_date <= asOfDate`), so a same-date posting after close would escape it. No code change; already covered by the boundary test. | `lib/accounting/period-close.ts` (unchanged), `tests/period-close.test.ts:86` |

## 9. POS → Ledger posting (A2, sales-side) — 2026-07-01
Design → spec → plan → subagent-driven implementation (fresh subagent per task + per-task review). New `lib/pos/posting.ts` posts double-entry journals for POS activity, reusing the invoice engine's `resolveSystemAccount` + `assertJournalBalances` (exported from `documents.ts`). Linkage rides on `journal.sourceType` + `sourceId` — **no schema change / migration**. An independent accountant-auditor review confirmed double-entry correctness (no Critical); two Important findings (zero-total sale crash, missing period-close guard on reversal) were fixed. Suite +9 POS posting tests.

| What was built | Location |
|----------------|----------|
| **Sale posts a balanced journal** — `DR 1000 Bank (total) / CR 4000 Sales (net) / CR 2100 VAT Payable (tax)`; VAT line omitted when zero; revenue booked **net** of whole-cart discount. Idempotent, period-close-guarded, DRAFT→POSTED (respects immutability triggers). | `lib/pos/posting.ts` (`postPosSaleJournal`), `lib/pos/dal.ts` (`processSale`) |
| **Refund & delete reverse** — refund posts a `pos_refund` reversal; delete posts a `pos_sale_void` reversal unless already refunded (mirrors the existing double-restore stock guard). Reversals dated **today** so they never land in a closed period. | `lib/pos/posting.ts` (`reversePosSaleJournal`), `lib/pos/dal.ts` (`refundSale`, `deleteSale`), `app/(dashboard)/pos/actions.ts` |
| **AuditEvent trail** — POS sale/reversal now write `AuditEvent` rows (`entityType: "pos_sale"`), closing the prior gap. | `lib/pos/posting.ts` |
| **Reused, not duplicated** — `resolveSystemAccount` + `assertJournalBalances` exported from `documents.ts` (the latter generalized to a `(label, ref, lines)` signature). | `lib/accounting/documents.ts` |
| **Tests** — balanced journal, zero-VAT omission, discount→net, refund nets to zero, delete reverses, delete-already-refunded no double-reverse, sourceType/sourceId linkage. | `tests/pos/ledger-posting.test.ts` |

> **Deferred (A2b):** COGS-per-sale + inventory capitalization — see the pending table.

## 10. Payroll → Ledger posting (A1) — 2026-07-01
Design → spec → plan → subagent-driven implementation + independent accountant-auditor review. New `lib/payroll/posting.ts` posts the payroll journal on approve; a new `resolveOrCreateSystemAccount` lazily creates the two payroll liability accounts per-org (**no migration**). Linkage via the pre-existing `PayrollRun.journal_id` column + `journal.sourceType`/`sourceId`. The audit confirmed correctness (no Critical); its one actionable finding — missing status preconditions — was fixed: `approvePayrollRun` is now **DRAFT-only** and `reversePayrollRun` **APPROVED-only**, so status can't drift out of sync with the ledger. Suite +8 tests (2 lazy-account + 6 payroll posting).

| What was built | Location |
|----------------|----------|
| **Approve posts a balanced journal** — `DR 7000 Payroll Expenses (gross) / CR 2200 PAYE & NI Payable (tax+NI) / CR 2210 Pension Payable (pension) / CR 1000 Bank (net)`; liability/pension lines omitted when 0; `assertJournalBalances` rejects a run whose stored figures don't satisfy `gross = tax+NI+pension+net`. Period-close-guarded, DRAFT→POSTED, AuditEvent. Idempotent via `journal_id`. | `lib/payroll/posting.ts` (`postPayrollRunJournal`), `app/(dashboard)/payroll/actions.ts` (`approvePayrollRun`) |
| **Reverse action** — posts a `payroll_run_void` reversal (dated today, period-guarded, idempotent), clears `journal_id`, resets status to DRAFT. | `lib/payroll/posting.ts` (`reversePayrollRunJournal`), `reversePayrollRun` action |
| **Lazy liability accounts** — 2200 PAYE & NI Payable, 2210 Pension Payable created per-org on first use (LIABILITY / CURRENT_LIABILITY, isSystem). No migration. | `lib/accounting/documents.ts` (`resolveOrCreateSystemAccount`) |
| **Tests** — balanced journal, lazy account creation, zero-pension omission, reversal nets to zero + clears journal_id, idempotency, unbalanced-run rejection. | `tests/payroll/ledger-posting.test.ts`, `tests/accounting/resolve-or-create.test.ts` |

> **Deferred (A1b):** accurate UK statutory PAYE/NI/pension + server-side recompute — see the pending table.

## 11. Payroll statutory & HMRC roadmap — research + decisions — 2026-07-02
Research pass ahead of A1b: HMRC's API landscape verified against current GOV.UK docs, employer-data prerequisites mapped against the schema, and A1b scoped.

> **Direction change (2026-07-02, same day):** an A1b implementation (pure statutory engine `lib/payroll/statutory/`, schema migration, YTD run-compute layer — 53 tests green through independent per-task reviews) was built and then **fully reverted at the user's request**: the payroll module is repositioned as **internal-use**, with scope set by the feature roadmap in §H below. The research in this section remains valid (RTI/P60 are still on the roadmap). The reverted work is preserved for revival in the shelved spec + plan (`docs/superpowers/specs/2026-07-02-payroll-statutory-calc-design.md`, `docs/superpowers/plans/2026-07-02-payroll-statutory-calc.md` — the plan contains the complete, review-corrected code and verified 2026/27 tables).

**API landscape (verified 2026-07-02):**
- **RTI filing (FPS/EPS/NVR) is NOT a Developer Hub REST API.** It submits via the Government Gateway **Transaction Engine** using the Document Submission Protocol — GovTalk 2.0 XML envelopes with an **IRmark** integrity hash, employer Gateway credentials in the envelope (not OAuth), and a submit → poll → delete-response lifecycle. The **2026–27 RTI technical specifications** are published; access to schemas/test credentials requires registering with HMRC's Software Developer Support Team (SDSTeam@hmrc.gov.uk), and live filing requires passing HMRC's **payroll software recognition** process.
- **DPS (Data Provisioning Service)** is the companion inbound channel — retrieves employer notices (P6/P9 tax-code changes, SL1/SL2 student-loan notices, generic notifications). Without it, client tax codes silently go stale.
- **Developer Hub REST/OAuth APIs** cover MTD (VAT, ITSA) etc. — relevant later for the accounting side (MTD VAT), irrelevant to payroll filing.
- FPS is due **on or before every payday**; EPS monthly. Late FPS ⇒ automatic penalties, so filing needs scheduling/alerting if built.

**Schema gaps identified for statutory payroll (drives the A1b spec):**
- `Employee` lacks: DOB, gender, NI category letter, tax basis (cumulative vs W1/M1), starter declaration + P45 previous pay/tax, leaver handling, student loan plan, director flag. Default `taxCode "1250L"` is stale — standard code has been **1257L** since April 2021.
- **No per-employee, per-tax-year YTD ledger** — UK PAYE is cumulative; mid-year periods and FPS reporting are impossible without pay/tax/NI-band YTDs. `PayrollRun` lacks tax year + period number.
- `Organization` lacks employer PAYE reference (`123/AB45678`), Accounts Office reference (13-char `123PA00012345`), HMRC payment frequency (monthly/quarterly), Employment Allowance claim, Small Employers' Relief, Apprenticeship Levy flags.
- `createPayrollRun` hardcodes `totalPensionMinor = 0`, so the 2210 Pension Payable line from A1 never fires.

**Decisions adopted (defaults, revisable):**
| Decision | Choice |
|----------|--------|
| **A1b scope (first statutory pass)** | Core PAYE (UK/Scottish/Welsh tax codes, cumulative + W1/M1) + NI category letters (exact-percentage method) + auto-enrolment pension (qualifying earnings), tax year **2026/27**, computed **server-side** with versioned rate tables. Statutory payments (SSP/SMP/ShPP), student loans, directors' annual NI → **A1c**. |
| **RTI build vs partner** | **Deferred** — A1b is prerequisite for both paths. Schema is designed FPS-shaped (NI category, starter declaration, YTDs) so neither path is foreclosed. Partner candidate if chosen: Staffology-style REST payroll API. |
| **HMRC references at onboarding** | Optional at setup (nullable, format-validated); required to unlock future filing features. Stored in a new 1:1 `PayrollSettings` model, not widened onto `Organization`. |
| **Migrations** | Continue the W2-3 pattern (direct SQL + recorded migration folder) while the migration history remains drifted (see §D). |

## 12. Documentation produced
`AUDIT-REPORT.md`, `AUDIT-REPORT-SCOPED.md`, `REMEDIATION-CHECKLIST.md`, `EOD-REPORT-2026-06-29.md`, [`EOD-REPORT-2026-07-01.md`](EOD-REPORT-2026-07-01.md), tenant-isolation spec + plan, POS security-hardening spec + plan, POS ledger-posting (A2) spec + plan, payroll ledger-posting (A1) spec + plan, invoice payment deposit-account spec ([`superpowers/specs/2026-07-02-invoice-payment-deposit-account-design.md`](superpowers/specs/2026-07-02-invoice-payment-deposit-account-design.md)), this status ledger.

## 13. UI fixes, realtime-data fix & component restructure — 2026-07-02
Committed as `92ea439`, `95f45f5`, `35efd81`, `cca7a5f`. No test-count change; verified by typecheck + lint on touched files.

| What was fixed | Root cause / detail | Location |
|----------------|---------------------|----------|
| **Selects unclickable inside every dialog** (reported on chart-of-accounts "Add account") | Commit `6ccad13` had raised Dialog overlay/content to `z-[100]` while Radix Select/popover portals stay at `z-50` — dropdowns opened invisibly *behind* the dialog backdrop, app-wide. Reverted dialog primitives to the standard `z-50` stack (the nav-overlap bug that motivated the bump was already fixed by the same commit's nav `z-40`). | `components/ui/dialog.tsx` |
| **CoA guide panel made display-only** | The Profit & Loss / Balance Sheet guide items silently overwrote the form's account type + report category on click. Now plain informational cards (tabs still switch views; current selection still highlighted). | `components/chart-of-accounts/add-account-dialog.tsx` |
| **`components/reports/` created** | Four report views lived in `components/accounting/` but were used only by `app/(dashboard)/reports/*`. Moved (`git mv`, history preserved): `reports-workspace`, `ar-aging-view`, `ap-aging-view`, `audit-logs-view`; all imports updated. Remaining misplacements documented as a pending follow-up (§I). | `components/reports/*` |
| **New customer now appears realtime in the invoice/quote form** | "Add new customer" saved through a separate `useCustomers()` Supabase path whose state nothing rendered, while the select reads the React Query `invoiceWorkspace` cache — never invalidated, so a full page refresh was needed. `addContact` now returns the created row; the create view invalidates the workspace query and auto-selects the new customer (name, address, due date from payment terms). | `components/sales/use-customers.ts`, `components/sales/add-invoice-dialog.tsx`, `components/sales/customers.tsx` |

Also delivered (analysis, no code): a **senior UI/UX review of the invoice creation page** — P0 findings: failed saves give no feedback on the create view; mislabeled/unwired footer actions ("Approve & email" doesn't email; "get link" is a stub); no unsaved-changes guard; recurring/linking data persisted only to `localStorage`. Recorded as pending follow-ups in §I. (The review's cash-sale validation finding was fixed in §14.)

## 14. Invoice payment deposit bank account — 2026-07-03
Committed as `15dfef8`. Design → spec → implementation → independent accountant-auditor review → findings fixed. Suite 172 → **179** (+7: `tests/invoice-deposit-account.test.ts`). Spec: [`superpowers/specs/2026-07-02-invoice-payment-deposit-account-design.md`](superpowers/specs/2026-07-02-invoice-payment-deposit-account-design.md).

| What was built / fixed | Location |
|------------------------|----------|
| **"Deposit into" bank select when recording an invoice payment** — chosen at payment time (bank is a property of the payment; partial payments can hit different accounts), defaults to `1000 Bank Current Account`, threaded through `payInvoiceDocument` → `payInvoice()`. Omitted → falls back to system `1000` exactly as before. | `components/sales/view-invoice-dialog.tsx`, `components/sales/use-invoices.ts`, `app/(dashboard)/sales/invoices/actions.ts`, `lib/accounting/documents.ts` |
| **Server-side validation (`resolveDepositAccount`)** — caller-supplied account must be org-owned, active, `BANK` report category (semantic filter, not a code deny-list). **Security fix:** the cash-sale path previously posted the client-supplied `depositAccountId` with *no* validation — a hostile client could post to any account, including another org's. Both paths now share the validated resolver (confirmed by the accountant-auditor review). | `lib/accounting/documents.ts` (`resolveDepositAccount`, `payInvoice`, `approveInvoice`) |
| **Cash-sale "Deposit to (Bank)" select actually works now** — it had always been empty (`getInvoiceWorkspace` ships income accounts only; the client filtered them for assets). Workspace payload now includes a dedicated `bankAccounts` list consumed by both selects; the cash-sale select gained a default (1000) + submit guard. | `app/(dashboard)/sales/invoices/actions.ts`, `components/sales/add-invoice-dialog.tsx`, `components/sales/invoices.tsx`, `components/sales/quotes.tsx`, `components/sales/invoice-types.ts` |
| **Tests** — debit = chosen bank / credit = AR with equal amounts; fallback to 1000; rejection of foreign-org, inactive, revenue, and AR-control accounts on both `payInvoice` and the cash-sale path. | `tests/invoice-deposit-account.test.ts` (7) |

> The invoice slide-out panel was also lowered `z-[100]` → `z-50` so the new select's portal renders above it (same layering fix as §13).

---

# ⏳ PENDING

## A. Security

| ID | Severity | Item | Why it's still open / what's needed |
|----|----------|------|-------------------------------------|
| S4 (Phase 2) | Critical | **DB-enforced Row Level Security** | Phase 1 guards at the app layer; Phase 2 enforces inside Postgres. Needs a non-owner Prisma role + `FORCE ROW LEVEL SECURITY` + rewriting policies from `auth.uid()` to a session variable (`SET LOCAL`), validated on a staging DB (a query missing context returns 0 rows, not an error). Designed in the spec; not implemented. |
| S4a | Critical | **Rotate secrets** | Service-role key, DB password, Stripe key, `IMPERSONATION_SECRET` are in the working tree. Must be rotated in the Supabase/Stripe dashboards by the team — cannot be automated here. |
| S8 | Medium | **Tamper-evident audit log** | The audit log is a plain, mutable table. Make it append-only / hash-chained and revoke UPDATE/DELETE. Design decision required. |
| ~~S5~~ | ~~High~~ | ~~**Onboarding sends plaintext password to Stripe**~~ | ✅ **Resolved 2026-07-01** — auth user created before checkout; password no longer enters Stripe metadata (see §8). |

## B. Accounting & features

| ID | Severity | Item | Notes |
|----|----------|------|-------|
| A7 | Medium | **Multi-currency + FX gain/loss** | `CurrencyCode` enum + `multicurrencyEnabled` flag exist, but money is effectively GBP-only and there's no FX revaluation. Real feature build — needs a design pass first. |
| A2b | Medium | **POS COGS + inventory relief** | A2 posts the sales side only. COGS-per-sale (`DR Cost of Sales / CR Inventory`) is deferred: there is no Inventory GL account and no path that capitalizes stock on receipt, so relieving it alone would drive inventory negative. Needs a proper inventory subledger (capitalize on purchase/restock) first. |
| A1b | High | **Payroll statutory calc + server recompute** — *SHELVED 2026-07-02* | A1 posts the run's stored figures, but PAYE = `gross*0.15` and NI = `gross*0.08` are rough estimates **computed in the browser and client-trusted** (`components/payroll/run-payroll-view.tsx`), and pension is never posted (`totalPensionMinor` hardcoded 0). A full implementation was built and reverted the same day when payroll was rescoped as internal-use (§11 direction change, §H roadmap). Accuracy still matters for payslips/P60/RTI on the roadmap — revive from the shelved plan when sequenced. |
| RTI | High | **RTI filing (FPS/EPS/NVR) — on the §H roadmap** | Strategic decision + user actions still apply (§G). If **built**: Transaction Engine GovTalk XML + IRmark client, submission lifecycle, correction flows, HMRC recognition, annual re-validation each April. If **partnered** (e.g. Staffology-style API): employee/YTD data mapping + one REST integration. Either way, statutory-accurate figures (shelved A1b) must land first. |
| DPS | Medium | **DPS inbound notices (P6/P9, SL1/SL2)** | Retrieve + auto-apply employer notices so tax codes and student-loan flags don't go stale. Same access route as RTI (SDST registration); only relevant on the "build" path or if the chosen partner doesn't surface notices. |
| A9 | Medium | **Bill payment deposit account** | `payBill` still hardcodes the credit side to system account 1000 — same gap invoice payments had before §14. Same fix pattern: "Paid from" select in the bill payment flow + the shared `resolveDepositAccount` validation + `bankAccounts` in the bill workspace payload. |
| ~~A8~~ | ~~Medium~~ | ~~**Period-close `gte` vs `gt` decision**~~ | ✅ **Resolved 2026-07-01** — decided **keep `gte`** (block same-date postings after close); consistent with the inclusive close sweep and already tested (see §8). No code change. |

## C. Performance

| Item | Notes |
|------|-------|
| **Dashboard aggregates a full year of journal lines in JavaScript** | `getDashboardOverview` loads all posted journal lines for 12 months and sums them in memory; should move to SQL `GROUP BY` against the existing views. Correctness was fixed in W2-1; this remaining item is purely scalability. `lib/accounting/dashboard.ts` |
| **Invoice list still loads all rows** | Journals were paginated server-side (W2-4); the invoice list is client-paginated/filtered via a React Query hook (loads all then paginates in the browser). Fine at current scale; a server-side rework is a larger change deferred. |

## D. Infrastructure / housekeeping

| Item | Notes |
|------|-------|
| **Prisma migration history is drifted** | The shared DB's `_prisma_migrations` has 26 records vs 20 migration folders in the repo, with 6 marked unfinished, and `migration_lock.toml` is missing. Running `prisma migrate dev/deploy` against this could misbehave. The team should reconcile the history. (This is why W2-3's NOT NULL was applied via direct SQL + a recorded migration file rather than the migrate CLI.) |
| ~~Inert A1b columns left in the dev DB~~ | ✅ **Dropped 2026-07-02** at the user's request — all A1b columns (`employees` ×5, `payroll_runs` ×2, `payroll_settings` ×3) and the empty `employee_opening_balances` table removed; verified gone by probe query; payroll + tenancy suites green after the drop (37/37). Deliberately kept: `employees.tax_code` DB default `'1257L'` and the `'1250L'`→`'1257L'` data fix (the old value was the stale 2019/20 code; `schema.prisma` still says `1250L`, harmless since Prisma supplies defaults client-side — align the schema default to `1257L` in any future payroll pass). |
| ~~Commit the current work~~ | ✅ **Done 2026-07-01.** Wave 2 + POS hardening + address/templates are all committed; working tree is clean. |

## E. Deferred modules (out of current scope — do NOT ship as-is)

These were deliberately set aside to focus on the core accounting engine. They contain **critical** issues and are not production-ready.

| ID | Severity | Module | Issue |
|----|----------|--------|-------|
| ~~A2~~ | ~~Critical~~ | **POS** | ✅ **Resolved 2026-07-01 (sales-side)** — each POS sale now posts DR Bank / CR Sales / CR VAT; refunds and deletes post reversing journals (see §9). **Remaining as A2b:** COGS-per-sale + inventory capitalization (deferred by design — no inventory subledger yet). |
| ~~S1~~ | ~~Critical~~ | **POS** | ✅ **Resolved 2026-06-30** — POS is now authenticated + org-scoped (see §6). |
| ~~—~~ | ~~High~~ | **POS** | ✅ **Resolved 2026-06-30** — server-side oversell guard added; stock-log audit now records the real user (see §6). *POS sales now also write `AuditEvent` rows via the A2 ledger posting (see §9).* |
| ~~A1~~ | ~~Critical~~ | **Payroll** | ✅ **Resolved 2026-07-01 (ledger posting)** — approving a run posts DR Payroll Expenses / CR PAYE&NI Payable / CR Pension Payable / CR Bank; a reverse action backs it out (see §10). **Remaining as A1b** (below): the posted PAYE/NI figures are still `gross*0.15` / `gross*0.08` client-side estimates. |

> **Recommendation:** POS (sales-side) and Payroll now post to the ledger, so both are visible in the P&L and balance sheet. Two accuracy gaps remain before either is fully trustworthy for filing: **A2b** (POS gross margin needs COGS relief) and **A1b** (payroll PAYE/NI/pension are estimates, not real UK statutory figures, and are computed client-side). Treat payroll tax/NI liabilities as indicative until A1b.

## F. Minor follow-ups from the A1/A2 accountant-auditor reviews

Non-blocking items surfaced during the independent reviews; the ledger stays balanced and tenant-safe without them.

| ID | Severity | Item | Notes |
|----|----------|------|-------|
| POS-refund-role | Decision | **POS refund authorization** | Refunds are reachable by any POS member (`requirePosAccess`), not just owners/accountants — **intentional** per S1 (§6: "cashiers process sales and refunds"), re-flagged by the A2 audit. One-line change to `requirePosManager` if you want to restrict it. `app/(dashboard)/pos/actions.ts` (`executeReceiptRefund`) |
| POS-toctou | Minor | **POS sale-posting idempotency is read-then-write** | The "already posted" check has no unique index behind it — not reachable in the current call graph (one synchronous call per fresh `saleId`); defense-in-depth only. `lib/pos/posting.ts` |
| POS-legacy-reverse | Minor | **Pre-feature POS sales reverse silently** | Refunding/deleting a sale created before A2 (no `pos_sale` journal) no-ops the ledger with no signal. Bounded migration-era gap. `lib/pos/posting.ts` |
| PAY-account-race | Minor | **`resolveOrCreateSystemAccount` has no unique-violation retry** | Two concurrent first-ever payroll approvals in one org could both try to create 2200/2210; one hits `@@unique([organizationId, code])` and rolls back (safe failure, no corruption/duplicate). Consider a P2002 retry/upsert like `withDocNumberRetry`. `lib/accounting/documents.ts` |
| PAY-reversal-memo | Minor | **Payroll reversal memo lacks a date annotation** | Cosmetic — `createReversalJournal` annotates cross-period reversals; the payroll reversal memo doesn't. `lib/payroll/posting.ts` |

## G. Payroll/HMRC user actions (cannot be automated)

None of these block A1b; all block (or de-risk) the RTI track.

| Item | When needed | Notes |
|------|-------------|-------|
| **Register with HMRC SDST** (from a company email) | Before any RTI build work | Gets RTI schemas, business validation rules, and test Gateway credentials. Lead time unknown — kick off early if leaning "build". |
| **Rotate secrets (S4a)** | Hard requirement before storing Gateway credentials / NINOs at scale | Already Critical in §A. |
| **Provide 1–2 real (anonymised) payslips** | During A1b verification | Cross-check the new engine against a known-correct provider, in addition to HMRC's published test data. |
| **Decide RTI build vs partner** | After A1b lands | If partner: sign up + API keys. See §11 decisions and the RTI pending row. |
| **Reconcile Prisma migration history** | Whenever possible | Until then payroll migrations follow the W2-3 direct-SQL + recorded-folder pattern (§D, §11). |

## H. Payroll module roadmap — internal use (2026-07-02)

> **Status: ON HOLD (2026-07-02)** — the user paused all payroll work later the same day. This roadmap is retained as the agreed target scope for whenever payroll resumes; do not start any of it unprompted.

Per the user's direction, payroll is an **internal-use** module with the following target feature set. Current state assessed against the codebase; ordering/sequencing to be decided with the user. Statutory accuracy (shelved A1b, revivable from the plan doc) underpins the correctness of payslips, P60 and RTI.

| Feature | Current state | What's needed |
|---------|---------------|---------------|
| **For recording (GL posting)** | ✅ Done (A1, §10) — approve posts DR 7000 / CR 2200 / CR 2210 / CR 1000; reversible. | — |
| **Run payroll** | ✅ Exists (create → approve → reverse, per-employee lines, schedules) but deduction figures are client-side estimates (see shelved A1b row). | Accuracy pass when sequenced. |
| **Benefits** | ❌ Not built — no benefit models in the schema. | Design pass: benefit types (health, BIK, allowances), per-employee assignment, payroll-run integration, and whether BIK affects tax (P11D territory). |
| **Leave credits** | ◐ Partial — `Timesheet`/`TimesheetEntry` capture leave type/hours; `PayrollSettings` holds entitlement days; run lines carry `leaveDays`. No accrual/balance engine. | Leave balance tracking per employee per holiday year (entitlement − taken = credit), surfaced in UI; feeds payslips. |
| **Payslip generation** | ❌ Not built — run lines hold the figures but there is no payslip artifact. | Per-employee payslip (HTML/PDF) per run: gross → deductions breakdown → net, YTD column, employer/employee details. |
| **RTI (generation)** | ◐ Stub — `generateFPSReport` returns a JSON summary, not a GovTalk XML FPS. | Real FPS/EPS document generation per the 2026–27 RTI schemas (§11 research). |
| **Sending RTI** | ❌ Not built. | Transaction Engine client (GovTalk + IRmark, submit/poll/delete), HMRC SDST registration + recognition — or partner API (§11 decision, §G user actions). |
| **P60** | ◐ Rough — `generateP60Report` sums PAID run lines per tax year (no YTD ledger, no statutory layout). | Correct YTD basis + proper P60 layout/artifact per employee at year end. |
| **P45** *(confirmed by user 2026-07-02)* | ❌ Not built — `Employee.endDate` exists, no leaver processing. | Leaver flow: final pay, leaving date on the run, P45 artifact with pay/tax-to-date. |
| **P30** | ❌ Not built. | Monthly employer payment record: PAYE + NI due to HMRC per tax month (derivable from approved run totals), with payment-due dates (22nd electronic). |

## I. UI/UX & code-structure follow-ups — from the 2026-07-02 review + restructure

Non-blocking; recorded so they don't get lost. The invoice-form items come from the senior UI/UX review in §13.

| Item | Severity | Notes |
|------|----------|-------|
| **Failed invoice save gives no feedback on the create view** | P0 | `useInvoices` errors render on the *list* view, which is unmounted while creating — a failed "Approve & email" looks like nothing happened (duplicate-click risk). Toast/inline error in `CreateInvoiceView.handleSubmit`. |
| **Mislabeled / unwired footer actions** | P0 | "Approve & email" only marks as sent; "Approve & get link" is a stub. Rename honestly; remove unwired menu items. |
| **No unsaved-changes guard** | P0 | Cancel / template-load silently destroys a long form. Dirty flag + confirm. |
| **Recurring & item-linking data persists only to `localStorage`** | P0 | Keyed by invoice number, per-device — silently lost across devices/storage clears. Needs real persistence or removal of the promise. |
| **Customer select + free-text name field confusion** | P1 | Two fields for one concept; typing the name silently clears `contactId`. Replace with a searchable combobox with a pinned "create" action; unify with the bill form's supplier pattern. |
| **Invoice-form polish batch** | P2 | Sticky totals footer, template Select→DropdownMenu (invalid nested interactive), `inputMode="decimal"` + sanitizer on qty (bill form has it, invoice doesn't), "Discount (£)" label, due-date `min`, label→trigger a11y association, stable line keys, plain-language recurring copy. |
| **Finish the components restructure** | Low | `workspace-shell` + `impersonation-banner` (in `accounting/`) and `sidebar` + `top-nav` (in `chart-of-accounts/`) are the global dashboard layout → `components/layout/`; `dashboard-overview` → `components/dashboard/`; `chart-of-accounts/constants.tsx` mixes global nav config with CoA constants. |
| **Pre-existing lint debt in moved report views** | Low | `setState`-in-effect + `no-explicit-any` errors in `components/reports/*` and sales views predate the moves; separate cleanup pass. |

---

# Suggested next priorities (in order)

1. **Rotate secrets** (S4a) — quick, high-value, your action.
2. **Invoice-form P0 UX items** (§I: failure feedback, honest action labels, dirty guard, localStorage persistence) — small, high-trust-impact fixes.
3. **A9** (bill payment deposit account — mirror of §14) and **A2b** (POS COGS + inventory subledger). *(Payroll roadmap §H is ON HOLD per the user, 2026-07-02 — resume only when they say so.)*
4. **Perf:** dashboard SQL aggregation + invoice-list server pagination (behaviour-preserving refactors).
5. **Phase 2 DB-enforced RLS** (S4) — second security layer.
6. **Tamper-evident audit log** (S8), **multi-currency** (A7), **migration-history cleanup**, then the **RTI build-vs-partner decision** (§G) once A1b is solid.

> Done since last revision: ~~commit current work~~ ✅ · ~~authenticate POS (S1)~~ ✅ (2026-06-30) · editable address snapshots + document templates ✅ · ~~password out of Stripe (S5)~~ ✅ · ~~period-close policy (A8)~~ ✅ · ~~POS → ledger sales-side (A2)~~ ✅ · ~~Payroll → ledger (A1)~~ ✅ (2026-07-01) · dialog z-index select fix + CoA guide panel + `components/reports/` restructure + realtime new-customer fix ✅ (2026-07-02) · ~~invoice payment deposit account~~ ✅ (2026-07-03).

---

# Quality bar (definition of done used throughout)
A task is ✅ only when: code changed · `pnpm typecheck` exits 0 · relevant tests added/updated and passing · any behavior change noted. New features/fixes went through design → plan → implementation → independent review where warranted.
