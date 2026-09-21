# Design: Remove Django, port Banking to Next.js + Prisma

**Date:** 2026-06-25
**Status:** Approved (design) — pending spec review before plan
**Goal:** Run the whole app on a single backend (Next.js + Prisma + Supabase Auth) by re-implementing the Django banking backend 1:1 in Next.js, then deleting Django entirely.

---

## 1. Background & intent

Banking is currently served by a Django REST app in [backend/](../../../backend/), consumed by the frontend via [lib/django/banking.ts](../../../lib/django/banking.ts) (React Query hooks) and [lib/django/client.ts](../../../lib/django/client.ts) (a `fetch` wrapper that attaches the Supabase JWT).

Key facts that shape this work:

- **No data migration.** The banking tables already live in the same Supabase Postgres and are already mapped in Prisma: `banking_bank_accounts`, `banking_bank_conversions`, `banking_feed_transactions` ([prisma/schema.prisma:1050+](../../../prisma/schema.prisma)). Django marks the Prisma-owned tables (`journals`, `journal_lines`, `chart_of_accounts`, `organizations`, `user_roles`, `contacts`) as `managed=False` and only reads/writes them via raw SQL. This is **logic re-implementation, not data movement.**
- **Banking is the only Django consumer.** `lib/django/` contains just `client.ts` + `banking.ts`, used only by the banking components. Removing banking = removing Django entirely.
- **Parity is the contract.** The intent is a behavior-preserving port (chosen over cleanup/redesign). The React Query hook signatures and JSON shapes in `lib/django/banking.ts` define exactly what each ported function must keep producing. No UX or data-shape changes.
- **The target pattern already exists.** The accounting module is the reference: a `server-only` Prisma DAL ([lib/accounting/dal.ts](../../../lib/accounting/dal.ts)) plus `"use server"` actions ([app/accounting/chart-of-accounts/actions.ts](../../../app/accounting/chart-of-accounts/actions.ts)) with `requireAccountingWorkspace` / `requireAccountantRole` authz, `AuditEvent` writes, and `revalidatePath`.

## 2. Architecture

Mirror the accounting module. New code lives under `lib/banking/` and `app/banking/`.

- **`lib/banking/dal.ts`** — `server-only` Prisma reads + money math (BigInt `*_minor` → number). Account list, feed list, dashboard summary, balances, candidates, lookups (expense accounts, contacts). Org-scoped + authz via the existing `requireAccountingWorkspace` / `requireAccountantRole`.
- **`app/banking/actions.ts`** — `"use server"` mutations: create/update/delete account, transfer, received/paid payment, reconcile, AI-match, statement confirm, set opening balance. Each: authz → Prisma write (in `prisma.$transaction` where journals are posted) → `revalidatePath`.
- **`lib/banking/posting.ts`** — `server-only` journal posting helper, the Prisma/`$executeRaw` equivalent of Django's [posting.py](../../../backend/banking/posting.py). Preserves the **draft → insert lines → post** dance required by the DB triggers.
- **`lib/banking/matching.ts`** — pure TypeScript port of [matching.py](../../../backend/banking/matching.py) (no I/O, unit-testable).
- **`lib/banking/statement-parser.ts`** — CSV + PDF parsing, the port of [ocr.py](../../../backend/banking/ocr.py).

Decision: **server actions + DAL, no `app/api/*` route handlers** — matches accounting. The frontend keeps React Query; only each hook's `queryFn`/`mutationFn` changes from `djangoFetch(...)` to the new server action import. Types stay identical.

### Frontend transition

`lib/django/banking.ts` is re-implemented as `lib/banking/api.ts` exporting the same hooks/types with identical signatures. A thin re-export shim at the old path keeps component imports working during the cutover, then is deleted. `lib/django/` (incl. `client.ts`) is removed at the end.

## 3. Auth & workspace

Replace Django's JWKS JWT verification ([auth.py](../../../backend/banking/auth.py)) with the existing Supabase-cookie helpers `requireAccountingWorkspace` / `requireAccountantRole`. Role gating maps directly: every Django endpoint using `require_accountant_role` → `requireAccountantRole()`; every `get_user_workspace` → `requireAccountingWorkspace()`.

**Known parity difference (accepted):** Django selects the user's **most recent** `user_role` (`order_by -created_at`); the Next helper selects the **oldest** (`orderBy createdAt: asc`). Irrelevant for single-org users (the norm). We adopt the Next behavior for consistency with the rest of the app and document it. If multi-org selection becomes a real requirement, it's a separate change.

## 4. Endpoint → server-function map

Every route in [backend/banking/urls.py](../../../backend/banking/urls.py) gets a 1:1 counterpart. All reads org-scoped; mutations marked (A) require accountant/owner role.

| Django route | New Next function | Notes |
|---|---|---|
| `GET accounts/` | `dal.listBankAccounts()` | order by `display_name`; `deleted_at IS NULL`; includes derived `balance`/`balance_minor` from ledger |
| `POST accounts/` (A) | `actions.createBankAccount()` | reuse `chart_account_id` or auto-create a `chart_of_accounts` row in the 1000–1099 range (`_next_bank_account_code`) |
| `PATCH accounts/<id>/` (A) | `actions.updateBankAccount()` | partial update of allowed fields |
| `DELETE accounts/<id>/` (A) | `actions.deleteBankAccount()` | soft delete: set `deleted_at`, `status='inactive'`; returns 204-equivalent |
| `GET accounts/<coa_id>/transactions/` | `dal.getAccountTransactions()` | posted journal lines for a bank account's chart account |
| `POST statements/import/` | `actions.importStatement()` | multipart upload; parse only, **no DB write**; 10 MB cap; returns preview |
| `POST statements/import/confirm/` (A) | `actions.confirmStatementImport()` | bulk-insert feed rows, `source='import'`, `reconcile_status='unmatched'` |
| `GET feed/` | `dal.listFeedTransactions()` | filters `bank_account_id`, `search` (description icontains); limit 200; newest first |
| `DELETE feed/<id>/` (A) | `actions.deleteFeedTransaction()` | soft delete |
| `POST feed/bulk-delete/` (A) | `actions.bulkDeleteFeed()` | soft delete by id list; returns `{deleted}` |
| `POST feed/<id>/reconcile/` (A) | `actions.reconcileFeed()` | set status reconciled + `matched_journal_id`, `matched_at`, `matched_by_user_id` |
| `POST feed/ai-match/` | `actions.runAiMatch()` | score unmatched feed vs posted bank journals; ≥75 → `ai_suggested` |
| `GET feed/<id>/candidates/` | `dal.getFeedCandidates()` | top 20 scored journal candidates |
| `GET balances/` | `dal.getOpeningClosingBalances()` | per-account opening (`source_type='opening_balance'`) + closing |
| `PATCH balances/<id>/opening/` (A) | `actions.setOpeningBalance()` | replace existing opening-balance journal; auto-create `OB001` equity account |
| `POST transfers/` (A) | `actions.createTransfer()` | debit dest bank, credit src bank |
| `POST payments/received/` (A) | `actions.createReceivedPayment()` | debit bank, credit AR (default code `1100`) |
| `POST payments/paid/` (A) | `actions.createPaidExpense()` | debit expense account, credit bank |
| `GET expense-accounts/` | `dal.listExpenseAccounts()` | `report_category in (expense, cost_of_sales, depreciation)`, active, by code |
| `GET contacts/?type=` | `dal.listContacts()` | customer/supplier/both filter |
| `GET dashboard-summary/` | `dal.getDashboardSummary()` | cash validation + balance summary + unreconciled count |
| `GET health/` | — | not ported (Django-only healthcheck) |

## 5. Journal posting (the money-critical core)

Port [posting.py](../../../backend/banking/posting.py) faithfully. The Postgres triggers `ensure_journal_balanced_on_post` and `prevent_posted_journal_line_changes` exist **at the database level** and apply regardless of backend, so the sequence is mandatory:

1. Insert `journals` row as `status='draft'`.
2. Insert all `journal_lines` while draft.
3. `UPDATE journals SET status='posted'` — triggers validate `Σdebits = Σcredits`.

Guards ported exactly: reject empty line list, reject unbalanced (`debits != credits`), reject zero-value. Done inside `prisma.$transaction`. We use `$executeRaw` here (not the Prisma model API) to keep the exact insert/flip ordering and column set the triggers expect.

The four posting flows and their debit/credit legs are reproduced verbatim from [views.py](../../../backend/banking/views.py):
- **Transfer:** Dr destination bank / Cr source bank — `source_type='bank_transfer'`.
- **Received payment:** Dr bank / Cr AR (`source_account_code`, default `1100`) — `source_type='payment_received'`.
- **Paid expense:** Dr expense account / Cr bank — `source_type='expense_paid'`.
- **Opening balance:** Dr/Cr bank vs `OB001` equity account — `source_type='opening_balance'`. Replacing an existing opening balance deletes the old journal using `SET session_replication_role='replica'` to bypass the posted-line trigger, then restores `origin`. This privileged trick must be reproduced via `$executeRaw` and verified to work over the pooled connection.

Amount handling ported from `_to_minor` (accepts pounds float/string or minor int; `amount_minor` wins) and `_parse_date` (`YYYY-MM-DD`, default today).

## 6. AI matching

Pure port of [matching.py](../../../backend/banking/matching.py) to `lib/banking/matching.ts` — no external API. Scoring out of 100:
- **Amount:** exact = 50, ≤5% = 30, ≤10% = 15, ≤20% = 5, else 0.
- **Date:** 0 days = 30, ≤1 = 20, ≤3 = 10, ≤7 = 5, else 0.
- **Description:** Jaccard overlap of 3+ letter tokens (uppercased), minus stop-words `{THE, LTD, LIMITED, PLC, AND, FOR, REF, PAY, PAYMENT, TRF, TRANSFER}`, scaled to 0–20.

`runAiMatch` loads unmatched/ai_suggested feed rows + posted bank-journal candidates (excluding already-reconciled journals, limit 500), scores each feed row against all candidates, and writes `ai_suggested` + label + confidence + `matched_journal_id` for best score ≥75. `getFeedCandidates` returns the top 20 scored candidates for one feed row. Match amount selection: `credit_minor` if > 0 else `debit_minor`, both sides.

## 7. Statement parsing

Port [ocr.py](../../../backend/banking/ocr.py) to `lib/banking/statement-parser.ts`. Output shape unchanged: `{ date: "YYYY-MM-DD", description, debit, credit }`, amounts in minor units.

- **CSV** — exact port. UTF-8 BOM tolerant; header heuristics for date / description (`description|narrative|memo|details|particulars`) / debit (`debit|withdrawals|out|payment out|spent`) / credit (`credit|deposits|in|payment in|received`) / single `amount` (negative → debit, positive → credit). Rows with unparseable dates skipped. Date formats: `%d/%m/%Y, %d-%m-%Y, %d %b %Y, %d %B %Y, %Y-%m-%d, %m/%d/%Y, %d/%m/%y`.
- **PDF** — re-implemented with a JS PDF text-extraction library (e.g. `unpdf` / `pdfjs-dist`) keeping the same per-line regex (date, description, 1–2 amounts) and the debit/credit heuristic (two amounts → debit, credit; single amount → debit if `DR` present else credit). **Accepted risk:** JS text extraction may lay lines out slightly differently than `pdfplumber`; validated against real sample statements during implementation.
- File-type routing by extension: `pdf` → PDF; `csv`/`txt` → CSV; else error.

## 8. Decommission Django

After parity is verified across all endpoints:
1. Delete `lib/django/` and the re-export shim.
2. Remove `NEXT_PUBLIC_DJANGO_API_URL` from `.env` (and any deploy config).
3. Decommission the Django service; the [backend/](../../../backend/) directory is removed (or archived out of the repo).
4. The inert `django_migrations` / `django_content_type` tables can be dropped in a later, separate cleanup — not required for this work.

## 9. Verification strategy

- **Per-endpoint differential test:** because the DB is shared, run the new server function and the live Django endpoint for the same org/input and diff the JSON. Money fields and `*_minor` values must match exactly.
- **Unit tests** for `matching.ts` (scoring table) and `statement-parser.ts` (CSV fixtures; PDF sample fixtures).
- **Journal invariant assertions:** every posting path asserts `Σdebits == Σcredits` and that the row count / `source_type` matches Django.
- **Accounting audit:** route the posting, opening-balance, and dashboard-math changes through the `accountant-auditor` agent before sign-off (money-touching code).
- **Manual smoke** of the banking UI against the ported backend before deleting `lib/django/`.

## 10. Out of scope (YAGNI)

- No new features, no UI redesign, no live bank feeds (Plaid/TrueLayer) beyond the existing `connection_type` enum values.
- No multi-org selection change beyond documenting the oldest-vs-newest membership difference.
- No dropping of legacy `django_*` tables in this work.

## 11. Open risks

1. **PDF parity** — different text extraction layout vs `pdfplumber`; mitigated by sample-based validation.
2. **`session_replication_role` over the pooler** — the opening-balance replace trick needs verifying on the pooled connection (port 6543); may require running that statement on a direct connection.
3. **Trigger coupling** — posting must keep the exact draft→post order; covered by `$executeRaw` + invariant tests.
