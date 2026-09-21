# WAW-Profi — Full Accounting Software Audit

**Auditors:** CPA · ERP Consultant · Financial Auditor · QA · Architect · Security Engineer · UX · Tax Specialist
**Method:** Direct code read of `lib/accounting`, `lib/banking`, `lib/payroll`, all `actions.ts` server actions, `prisma/schema.prisma`, and SQL migrations — plus three specialist sub-audits. Nothing was assumed correct; every claim below cites real code.
**Date:** 2026-06-29

---

## Executive summary

WAW-Profi has a **genuinely well-engineered manual double-entry core** wrapped around **several money-touching modules that are disconnected from the ledger or unsafe**. The skeleton (BigInt minor units, balanced-journal enforcement, period locking, reversals-not-deletions, SQL-view-derived reports, HMAC-signed impersonation) is the work of someone who understands accounting. But Payroll and POS post **nothing** to the general ledger, an entire POS module is **unauthenticated**, row-level security is **enabled but 100% bypassed**, and live secrets sit in the working tree. It is not yet trustworthy with real books.

**Maturity rating: late-stage MVP / early SMB-prototype.** Not releasable as-is.

---

## 1–3. Accounting & journal-entry correctness

### What is correct ✅

- **Manual journals** (`app/accounting/journals/actions.ts`) are the model citizen: balance enforced at create (`debitTotal !== creditTotal` throws, line 62) **and** re-verified at post (line 322); each line must be debit-XOR-credit (line 33); period guard on every posting path; posted journals immutable (edits require `status: DRAFT`); **reversals create a separate reversing journal** (idempotent, line 114) rather than deleting; wrapped in `$transaction`; audit events written; all queries org-scoped.
- **Period close** (`lib/accounting/period-close.ts`) correctly sweeps revenue/expense → 3200 Current Year Earnings, blocks re-close and out-of-order close, and `assertPeriodOpen` is invoked on invoice, bill, banking, and manual posting paths.
- **Money storage** is BigInt minor units throughout the schema; `poundsToMinor` uses exact string-split arithmetic, not floats.
- **Reports derive from posted journal lines** via real SQL views (`account_balances`, `general_ledger_entries`) defined in migrations with `status = 'posted'` filters — trial balance, P&L, balance sheet, and GL are correctly ledger-derived.

### Critical accounting defects ❌

| # | Severity | Module | Problem | File |
|---|----------|--------|---------|------|
| A1 | **Critical** | Payroll | `createPayrollRun`/`approvePayrollRun` create **no journal entries at all**. `PayrollRun.journal_id` is never populated. Wages expense, PAYE, NI, pension liability, and net-pay cash are **absent from the P&L and balance sheet**. | `app/payroll/actions.ts:394-462` |
| A2 | **Critical** | POS / Inventory | POS sales write only `pos_sales`/`pos_stock_logs`. **No revenue, output VAT, cash, COGS, or inventory relief hits the ledger.** `pos_sales.posted_journal_id` exists but is never set. Retail trade is invisible to the books and VAT return. | `app/pos/actions.ts:41-92` |
| A3 | **Critical** | Banking | Opening-balance reset runs `SET LOCAL session_replication_role='replica'` then **hard-deletes a POSTED journal**, bypassing the immutability trigger and erasing it from the audit trail. | `lib/banking/dal.ts:319-322` |
| A4 | **High** | Sales/Purchases | `approveInvoice`/`approveBill` have **no debit==credit assertion** (unlike the manual path) — they rely on `totalMinor`/`taxMinor` being internally consistent. They balance *arithmetically today*, but any drift between stored header `discountMinor` and per-line discounts posts an unbalanced journal silently. Revenue/expense are also recorded **gross** with a contra-discount line rather than net. | `lib/accounting/documents.ts:1086-1136` |
| A5 | **High** | Tax | VAT uses BigInt **truncation** (`/ 10000n`), systematically under-charging output VAT by up to ~1p/line (£99.99×20% → £19.99 not £20.00). Should round-half-up. | `lib/accounting/documents.ts:196-202` |
| A6 | **High** | Banking | `toMinor()` uses `Math.round(Number(str)*100)` — float path, vulnerable to `1.005→100` errors — instead of the exact `poundsToMinor`. | `lib/banking/dal.ts:630-635` |
| A7 | **Medium** | Multi-currency | `CurrencyCode` enum + `multicurrencyEnabled` flag exist, but `money.ts` **hardcodes GBP** and there is **no FX gain/loss** handling. Foreign-currency documents post as if GBP. | `lib/accounting/money.ts:5` |
| A8 | **Medium** | Period close | Same-day postings on the close date are blocked (`gte` should be `gt`), preventing legitimate end-of-period adjusting entries. | `lib/accounting/period-close.ts:37` |

**Not implemented at all:** depreciation, amortization, inventory valuation (FIFO/AVCO), COGS recognition, accrual-vs-cash basis toggle, revenue recognition schedules, loan/interest amortization, asset disposal.

**Accounting accuracy: 44/100** — excellent manual core, but payroll & POS off-ledger and the immutability bypass are disqualifying for production.

---

## 4. Business-logic validation

| Rule | Enforced? | Evidence |
|------|-----------|----------|
| Cannot post unbalanced journal | ✅ manual / ⚠️ documents (no assert) | journals/actions.ts:62,322 |
| Cannot edit/delete posted journal | ✅ (trigger) but **bypassable** | banking/dal.ts:319 |
| Cannot post into closed period | ✅ (except close itself) | period-close.ts |
| Cannot pay an already-paid invoice | ⚠️ partial (status-gated) | documents.ts |
| Cannot post negative inventory | ❌ no check | pos/actions.ts |
| Cannot oversell stock | ❌ no perpetual-inventory guard | pos/actions.ts |
| Invoice numbering unique & sequential | ❌ **race + breaks past 9999** (lexicographic `orderBy desc`, no lock) | documents.ts:280 |

---

## 5. Security audit

**Systemic:** RLS policies are defined on every accounting table, but **Prisma connects as the `postgres` superuser** (which bypasses RLS) and there is **no `FORCE ROW LEVEL SECURITY`**. So tenant isolation depends *entirely* on hand-written `organizationId` filters — any omission is a live cross-tenant breach, not defense-in-depth.

| # | Severity | Vulnerability | File |
|---|----------|---------------|------|
| S1 | **Critical** | Entire POS module is **unauthenticated** (no `requireAccountingWorkspace`), uses a **hardcoded `TEMP_ORG_ID`**, and exposes global `deletePosProduct`/`deletePosSale`/`executeReceiptRefund` across all tenants. | `app/pos/actions.ts:7` |
| S2 | **Critical** | IDOR — `prisma.invoice.update({ where: { id } })` with **no org filter** lets any accountant flip another org's invoice to SENT. | `app/sales/invoices/actions.ts:87` |
| S3 | **Critical** | Cross-org **data leak** — audit-trail page does `auditEvent.findMany()` with no `organizationId` filter; every tenant sees every other tenant's activity. | `app/reports/audit-trail/page.tsx:10` |
| S4 | **Critical** | Live `SUPABASE_SERVICE_ROLE_KEY`, DB superuser password, Stripe secret, and `IMPERSONATION_SECRET` sit in plaintext `.env`/`.env.local` in the working tree. (Not committed, but must be rotated.) | `.env`, `.env.local` |
| S5 | **High** | Onboarding sends the user's **plaintext password into Stripe checkout `metadata`** (visible in Stripe dashboard/logs). | `app/onboarding/actions.ts:46` |
| S6 | **High** | `reconcileFeed` writes a caller-supplied `journalId` with **no org/existence check** — cross-org journal linkage. | `lib/banking/dal.ts:442` |
| S7 | **Medium** | `runAiMatch`/`importStatement` only require `requireAccountingWorkspace` — an **EMPLOYEE** can mutate reconciliation state. | `app/banking/actions.ts:85` |
| S8 | **Medium** | Audit log is a plain mutable table (owner can UPDATE/DELETE), **not tamper-evident**; POS/payroll/reconcile write no audit events. | schema + pos/payroll actions |

**Done well:** server-verified `auth.getUser()` everywhere (never `getSession()`); HMAC-SHA256 + `timingSafeEqual` impersonation with admin re-check (forgery-proof); all `$queryRaw` parameterized (no SQLi); service-role key never reaches the browser; edge gate on `/admin`.

**Security: 22/100** — strong primitives undone by a few catastrophic holes.

---

## 6. Reports · 7. Bugs · 13. Database

**Reports (61/100):** core statements correctly ledger-derived; but **dashboard AR/AP aging uses full `totalMinor` with no payment subtraction** while the AR report nets payments — the two disagree (`dashboard.ts:98`); AR view uses a **hardcoded anchor date `2026-05-18`**; dashboard VAT widget shadow-computes from document headers instead of the ledger.

**Top bugs:**
- Invoice number race + lexicographic break past INV-9999.
- Dashboard loads a full year of journal lines into JS and aggregates in memory (`dashboard.ts:43`) — won't scale (N+1 / unbounded fetch).
- `getJournalList` fetches **all** journals with no pagination.
- BigInt → `Number` downcast across DAL/reports (fine under £90T, but inconsistent with `/100` inline float division).

**Schema (52/100):** Three unmerged stacks (clean Prisma + Supabase auth + introspected Django/POS tables). `Invoice.organizationId` is **nullable** (isolation hazard). Dual money sources (`amount Decimal` legacy columns alongside `*Minor` BigInt). `matched_journal_id` has **no FK**. Hard-delete + replica-mode FK bypass. Inconsistent soft-delete. JournalLine indexing and `$transaction` discipline are good.

---

## 18. Final scorecard

| Dimension | Score |
|---|---|
| Accounting Accuracy | 44 |
| GAAP Compliance | 45 |
| IFRS Compliance | 30 |
| Business Logic | 50 |
| Security | 22 |
| Performance | 48 |
| Scalability | 45 |
| Architecture | 55 |
| Code Quality | 58 |
| User Experience | not separately audited — partial |
| Reporting | 61 |
| Inventory | 15 |
| Payroll | 20 |
| Banking | 60 |
| API (server actions) | 50 |
| **Overall Readiness** | **38** |
| **Enterprise Readiness** | **18** |
| **Commercial Readiness** | **25** |

---

## 11. Missing features vs competitors

**Critical:** payroll→ledger posting, POS→ledger posting, inventory valuation/COGS, multi-currency + FX, bank-feed automation (Open Banking), fixed assets/depreciation, recurring invoices, credit notes/refund accounting, tax-return filing (MTD VAT submission).
**Important:** budgets, multi-company consolidation, attachment/document management, payment gateway reconciliation, statement-of-cash-flows (proper), dimensional/class tracking.
**Nice to have:** customer portal, mobile app, forecasting, custom report builder.

### Comparison table

| Capability | WAW-Profi | QuickBooks | Xero | Sage |
|---|---|---|---|---|
| Double-entry core | ✅ (manual) | ✅ | ✅ | ✅ |
| Posted-entry immutability | ⚠️ bypassable | ✅ | ✅ | ✅ |
| Payroll → GL | ❌ | ✅ | ✅ | ✅ |
| Inventory/COGS | ❌ | ✅ | ✅ | ✅ |
| Multi-currency + FX | ❌ | ✅ | ✅ | ✅ |
| MTD VAT filing | ❌ | ✅ | ✅ | ✅ |
| Tenant isolation (DB-enforced) | ❌ (RLS bypassed) | ✅ | ✅ | ✅ |
| Tamper-evident audit | ❌ | ✅ | ✅ | ✅ |
| Bank feeds | ⚠️ import only | ✅ | ✅ | ✅ |

---

## 19. Prioritized action plan

**Critical (must fix before any real data):**
1. Authenticate + org-scope the entire POS module; delete `TEMP_ORG_ID` (S1).
2. Add `organizationId` to the invoice-status update and the audit-trail query (S2, S3).
3. Connect Payroll and POS to the ledger via balanced journals (A1, A2).
4. Stop hard-deleting posted journals; reverse-and-repost opening balances (A3).
5. Rotate every secret; move to a secrets manager (S4); stop sending passwords to Stripe (S5).
6. Run Prisma as a non-owner role with `FORCE ROW LEVEL SECURITY` **and** keep app-level filters.

**High:** balance-assert in `approveInvoice`/`approveBill` (A4); fix VAT rounding (A5); use `poundsToMinor` in banking (A6); concurrency-safe invoice numbering; validate `journalId` org in `reconcileFeed` (S6).

**Medium:** multi-currency + FX (A7); period-close `gt` fix (A8); reconcile dashboard vs report aging; make `Invoice.organizationId` non-null; paginate journal/invoice lists; tamper-evident audit log; zod at every action boundary.

**Low / nice-to-have:** drop legacy `amount Decimal` columns; consistent soft-delete; dashboard SQL aggregation; broaden test coverage (no tests exist for invoice posting, reports, or tenant isolation).

---

## 20. Final verdict

- **Would it pass a CPA audit?** **No.** Payroll and POS leave no ledger trail, and posted journals can be silently deleted — the financial statements are provably incomplete and the audit trail is breakable.
- **Would businesses trust it with their finances?** **Not yet.** The cross-tenant leaks and unauthenticated POS module are show-stoppers.
- **Could it compete with Sage/Xero/QuickBooks?** **Architecturally, eventually — yes.** The manual-journal engine, period close, and view-based reporting are competitive foundations. But it's ~12–18 months of focused work behind, mostly in connecting subsystems to the ledger and hardening isolation.
- **Biggest weaknesses:** off-ledger payroll & POS; RLS bypassed + IDOR/data-leak holes; ledger-immutability bypass; no inventory/multi-currency/tax-filing.
- **Biggest strengths:** rigorous manual double-entry core; BigInt money; correct period-close and reversals; SQL-view-derived reports; sound HMAC impersonation; parameterized SQL.
- **Build next (in order):** (1) lock down POS auth + tenant isolation, (2) payroll→GL and POS→GL posting, (3) make posted entries truly immutable, (4) inventory/COGS, (5) multi-currency, (6) MTD VAT filing.

**Overall maturity: late MVP.** Strong bones, dangerous gaps. Fix the six Criticals before it touches a single real customer's books.

---

## Appendix A — Audited module checklist

| Module | Audited | Ledger-integrated | Notes |
|---|---|---|---|
| Manual journals | ✅ | ✅ | Reference-quality implementation |
| Chart of accounts | ✅ | ✅ | Org-scoped, system accounts resolved |
| Sales invoices | ✅ | ✅ | No balance assert; gross discount treatment |
| Purchases / bills | ✅ | ✅ | Same caveats as invoices |
| Banking | ✅ | ⚠️ partial | Manual flows post; feeds match-only; replica-mode delete |
| Period close | ✅ | ✅ | Close journal not self-guarded |
| Reports (TB/P&L/BS/GL) | ✅ | ✅ | View-derived |
| AR/AP aging | ✅ | ⚠️ | Dashboard vs report disagree; hardcoded date |
| Payroll | ✅ | ❌ | No journals posted |
| POS / inventory | ✅ | ❌ | Off-ledger + unauthenticated |
| Taxes/VAT | ✅ | ✅ | Truncation rounding bug |
| Audit trail | ✅ | n/a | Not tamper-evident; cross-org leak |
| Admin impersonation | ✅ | n/a | HMAC-signed, sound |

## Appendix B — Detected bugs (consolidated)

1. Payroll posts no journals (A1).
2. POS posts no journals; no COGS/inventory relief (A2).
3. Opening-balance hard-deletes posted journals via replica mode (A3).
4. Automated invoice/bill posting lacks balance assertion (A4).
5. VAT truncated instead of rounded (A5).
6. Banking `toMinor` float rounding (A6).
7. Multi-currency declared but unimplemented; no FX gain/loss (A7).
8. Period-close `gte` blocks same-day adjustments (A8).
9. Invoice numbering race + lexicographic break past 9999.
10. Dashboard vs AR-report aging disagree; hardcoded anchor date.
11. Dashboard in-memory aggregation of full-year journal lines (perf).
12. Unbounded journal/invoice list fetches (no pagination).

## Appendix C — Security vulnerabilities (consolidated)

1. RLS enabled but bypassed (Prisma superuser, no FORCE RLS) — systemic.
2. POS module unauthenticated + hardcoded org + global delete/refund (S1).
3. Invoice-status IDOR, no org filter (S2).
4. Audit-trail cross-org data leak (S3).
5. Live secrets in working tree — rotate all (S4).
6. Plaintext password sent to Stripe metadata (S5).
7. `reconcileFeed` unvalidated cross-org journal link (S6).
8. EMPLOYEE can trigger reconciliation mutations (S7).
9. Mutable, non-tamper-evident audit log; coverage gaps (S8).

## Appendix D — Accounting inaccuracies (consolidated)

1. Payroll absent from P&L/balance sheet.
2. POS revenue/VAT/COGS/cash absent from ledger.
3. Revenue/expense recorded gross with contra-discount instead of net.
4. Output VAT systematically under-stated (truncation).
5. No FX revaluation for foreign-currency documents.
6. No depreciation, amortization, inventory valuation, or COGS recognition.
7. Dashboard VAT/aging figures diverge from ledger-derived figures.
