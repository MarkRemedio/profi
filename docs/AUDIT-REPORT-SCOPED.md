# WAW-Profi — Audit Report (Scoped Remediation Version)

> **This is a scoped derivative of [`AUDIT-REPORT.md`](AUDIT-REPORT.md).** The original full audit is unchanged. This version reflects an explicit descoping decision and re-plans the remediation around it.

**Date:** 2026-06-29

---

## Scope decision

The following areas are **OUT OF SCOPE** for remediation in this version:

| Area | Status | Reason |
|---|---|---|
| **POS module** (`app/pos/*`, `components/pos/*`) | ❌ Out | Whole module deprioritized |
| **Payroll module** (`app/payroll/*`, `components/payroll/*`) | ❌ Out | Whole module deprioritized |
| **Onboarding** (`app/onboarding/*`) | ❌ Out | Deprioritized |
| **Admin SaaS-mgmt** (`app/(admin)/.../plans`, `clients`, `subscriptions`) | ❌ Out | Not part of accounting core |

### Findings removed by this scope change

| ID | Finding | Where it lived |
|---|---|---|
| ~~A1~~ | Payroll posts no journal entries | `app/payroll/actions.ts` |
| ~~A2~~ | POS sales post nothing to the ledger (no revenue/VAT/COGS/cash) | `app/pos/actions.ts` |
| ~~S1~~ | POS module unauthenticated + hardcoded `TEMP_ORG_ID` + global delete/refund | `app/pos/actions.ts` |
| ~~S5~~ | Plaintext password sent to Stripe metadata | `app/onboarding/actions.ts` |

> ⚠️ **These remain real, unfixed defects** — they are deferred, not resolved. POS/Payroll must not be exposed to real customers in their current state. The negative-inventory / oversell business-logic gaps and the POS/Payroll audit-event coverage gap (part of S8) are likewise deferred with the modules.

---

## In-scope findings (the remediation backlog)

### Accounting & journal correctness

| # | Severity | Module | Problem | File |
|---|----------|--------|---------|------|
| A3 | **Critical** | Banking | Opening-balance reset runs `SET LOCAL session_replication_role='replica'` then **hard-deletes a POSTED journal**, bypassing the immutability trigger and erasing it from the audit trail. | `lib/banking/dal.ts:319-322` |
| A4 | **High** | Sales/Purchases | `approveInvoice`/`approveBill` have **no debit==credit assertion** — they trust `totalMinor`/`taxMinor`. Balances arithmetically today, but drift between header `discountMinor` and per-line discounts would post an unbalanced journal silently. Revenue/expense recorded **gross** with a contra-discount line rather than net. | `lib/accounting/documents.ts:1086-1136` |
| A5 | **High** | Tax | VAT uses BigInt **truncation** (`/ 10000n`), under-charging output VAT by up to ~1p/line (£99.99×20% → £19.99 not £20.00). Should round-half-up. | `lib/accounting/documents.ts:196-202` |
| A6 | **High** | Banking | `toMinor()` uses `Math.round(Number(str)*100)` — float path vulnerable to `1.005→100` — instead of the exact `poundsToMinor`. | `lib/banking/dal.ts:630-635` |
| A7 | **Medium** | Multi-currency | `CurrencyCode` enum + `multicurrencyEnabled` flag exist, but `money.ts` **hardcodes GBP**; **no FX gain/loss**. Foreign-currency documents post as if GBP. | `lib/accounting/money.ts:5` |
| A8 | **Medium** | Period close | Same-day postings on the close date are blocked (`gte` should be `gt`), preventing legitimate end-of-period adjusting entries. | `lib/accounting/period-close.ts:37` |

### Security

| # | Severity | Vulnerability | File |
|---|----------|---------------|------|
| S2 | **Critical** | IDOR — `prisma.invoice.update({ where: { id } })` with **no org filter** lets any accountant flip another org's invoice to SENT. | `app/sales/invoices/actions.ts:87` |
| S3 | **Critical** | Cross-org **data leak** — audit-trail page does `auditEvent.findMany()` with no `organizationId` filter; every tenant sees every other tenant's activity. | `app/reports/audit-trail/page.tsx:10` |
| S4 | **Critical** | Live `SUPABASE_SERVICE_ROLE_KEY`, DB superuser password, Stripe secret, `IMPERSONATION_SECRET` in plaintext `.env`/`.env.local`. Plus RLS enabled but **100% bypassed** (Prisma as `postgres` superuser, no `FORCE ROW LEVEL SECURITY`). | `.env`, `.env.local`, migrations |
| S6 | **High** | `reconcileFeed` writes a caller-supplied `journalId` with **no org/existence check** — cross-org journal linkage. | `lib/banking/dal.ts:442` |
| S7 | **Medium** | `runAiMatch`/`importStatement` only require `requireAccountingWorkspace` — an **EMPLOYEE** can mutate reconciliation state. | `app/banking/actions.ts:85` |
| S8 | **Medium** | Audit log is a plain mutable table (owner can UPDATE/DELETE), **not tamper-evident**. (POS/payroll coverage sub-point is deferred with those modules.) | schema + actions |

### Bugs / performance (in-scope modules only)

1. Invoice numbering race + lexicographic break past INV-9999 — `lib/accounting/documents.ts:280`.
2. Dashboard AR/AP aging uses full `totalMinor` (no payment subtraction) while AR report nets payments — figures disagree; AR view uses hardcoded anchor date `2026-05-18`.
3. Dashboard loads a full year of journal lines into JS and aggregates in memory — `lib/accounting/dashboard.ts:43`.
4. `getJournalList` fetches **all** journals, no pagination.
5. BigInt → `Number` downcast across DAL/reports (safe under £90T, but inconsistent with inline `/100` float division).

---

## Revised remediation plan

With POS/Payroll/onboarding out, the remaining work collapses into **one wave of conflict-free agents** (each owns disjoint files → safe to parallelize, worktree-isolated), plus a few design/ops items handled separately.

### Wave 1 — parallel agents (mechanical, no design needed)

- **Agent A — security org-scope (3 small files):** S2 `app/sales/invoices/actions.ts` · S3 `app/reports/audit-trail/page.tsx` · S7 `app/banking/actions.ts`
- **Agent B — documents correctness (1 file):** A4 + A5 + invoice-numbering race → `lib/accounting/documents.ts`
- **Agent C — banking integrity (1 file):** A3 + S6 + A6 → `lib/banking/dal.ts`
- **Agent D — period close (1 file, tiny):** A8 → `lib/accounting/period-close.ts` (foldable into B)

### Not agent-parallel — design / ops

- **A7 multi-currency + FX** — real feature; design pass before code.
- **S4 secrets rotation + RLS hardening** — rotate keys; add a non-owner Prisma role + `FORCE ROW LEVEL SECURITY`. Partly infra.
- **S8 tamper-evident audit log** — design choice (hash-chain vs append-only DB trigger).
- **Bug #2/#3/#4** (dashboard aging/perf/pagination) — straightforward but cross-cutting; schedule after Wave 1.

---

## Scorecard note

The headline scores in the original report reflected the **full** product (including POS/Payroll). With those modules descoped:

- The **in-scope accounting core** (manual journals, sales/purchases posting, banking, period close, reports) is materially stronger than the blended scores suggest — its main remaining risks are A3 (immutability bypass), A4 (no balance assert), and the systemic RLS-bypass in S4.
- **Do not re-publish the blended scorecard as if it represents the shipped product** until POS/Payroll are either removed from the build or brought up to the core's standard. The deferred A1/A2/S1 defects keep overall **commercial readiness low** regardless of in-scope fixes.

---

## Verdict (scoped)

Fixing the in-scope backlog above makes the **core ledger (sales, purchases, banking, journals, reports)** trustworthy for single-tenant-careful SMB use — *provided* S4's RLS bypass is genuinely closed. It does **not** make the whole product releasable: POS and Payroll remain off-ledger and (for POS) unauthenticated, so any build that ships those screens still fails a CPA audit and still has a critical auth hole. Recommended path: ship the core, **hide/disable POS & Payroll** until they get their own remediation pass.
