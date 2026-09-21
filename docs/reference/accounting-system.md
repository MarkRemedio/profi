# WAWPROFI Accounting System

This document describes the current accounting system in WAWPROFI as implemented in the codebase. It is a current-state reference, not a future roadmap.

## Overview

WAWPROFI now has a ledger-backed accounting core. Operational records such as sales invoices and supplier bills are stored as line-based documents, then posted into balanced journals when approved. Financial reports are derived from posted journal data through database views, rather than from dashboard-only aggregates.

The core shape is:

```text
Organization
  -> Chart of Accounts
  -> Contacts
  -> Invoices / Bills
  -> Journals / Journal Lines
  -> Account Balances / General Ledger Views
  -> Reports / Dashboard
  -> Audit Events
```

The current implementation is UK/GBP/VAT-oriented. Money is stored in integer minor units for accounting records, and formatted to GBP only at render boundaries.

## Architecture

The accounting system is split across three main layers:

- Database schema and rules: Prisma schema mirrors the Postgres/Supabase schema. SQL migrations define tables, enums, views, RLS policies, and journal immutability triggers.
- Server accounting services: `lib/accounting/*` contains server-only data access, posting logic, report queries, and money helpers.
- Next routes and UI workspaces: app routes load server data and pass serializable DTOs into client components for interactive workflows.

Important files:

- `prisma/schema.prisma`: ORM model definitions for organizations, accounts, contacts, documents, journals, and audit events.
- `prisma/migrations/*`: SQL migrations for accounting foundation, reports/views, documents, contact backfills, and status normalization.
- `lib/accounting/dal.ts`: workspace/membership checks, account options, journal list, and account balances.
- `lib/accounting/documents.ts`: invoice/bill draft saving, line normalization, posting, voiding, and reversal journals.
- `lib/accounting/reports.ts`: trial balance, P&L, balance sheet, general ledger, and report drilldown data.
- `app/accounting/journals/actions.ts`: manual journal server actions.
- `app/sales/invoices/actions.ts`: sales invoice server actions.
- `app/purchases/actions.ts`: supplier bill server actions.
- `components/accounting/reports-workspace.tsx`: report UI, ledger tab, and account drilldown drawer.

## Tenancy and Permissions

Every accounting-owned table is scoped to an organization through `org_id` / `organizationId`.

Users are connected to organizations through `user_roles`, with these roles:

- `owner`
- `accountant`
- `employee`

Server-side accounting access is enforced through:

- `requireAccountingWorkspace()`: requires a logged-in Supabase user and returns the first organization membership.
- `requireAccountantRole()`: allows only `owner` and `accountant` users to mutate accounting records.

Read-oriented pages can use `requireAccountingWorkspace()`. Posting, creating, updating, deleting, voiding, and reversing accounting records should use `requireAccountantRole()`.

Supabase RLS is enabled on the main accounting tables. Policies allow members to read organization-scoped rows, and owners/accountants to manage sensitive accounting records. Views such as `account_balances` and `general_ledger_entries` are created with `security_invoker = true`, so they respect caller permissions in supported Postgres versions.

## Core Data Model

### Organizations

Organizations represent accounting entities. They include:

- base currency, currently defaulting to `GBP`
- VAT registration metadata
- accounting period start/end fields
- organization-scoped child records

### Chart of Accounts

`chart_of_accounts` is the routing layer for financial activity.

Each account has:

- `code`
- `name`
- `account_type`: `asset`, `liability`, `equity`, `revenue`, or `expense`
- `report_category`: used to group accounts into report sections
- default tax code/rate fields
- `is_system` and `is_active`

Current report categories:

- `bank`
- `current_asset`
- `fixed_asset`
- `non_current_asset`
- `current_liability`
- `non_current_liability`
- `equity`
- `sales`
- `other_income`
- `cost_of_sales`
- `expense`
- `depreciation`

Starter accounts are seeded for each organization when none exist, including:

- `1000` Bank Current Account
- `1100` Accounts Receivable
- `1200` VAT Control
- `2000` Accounts Payable
- `2100` VAT Payable
- `3000` Owner Equity
- `4000` Sales
- `5000` Cost of Sales
- `6000` General Expenses
- `7000` Payroll Expenses

### Tax Rates

Tax rates are global reference data. Current codes are:

- `vat_20`
- `vat_5`
- `vat_0`
- `vat_exempt`
- `no_vat`

Document line tax is calculated from the selected tax code's rate. The current calculation treats line amounts as tax-exclusive subtotals and computes tax as:

```text
tax_minor = subtotal_minor * rate_basis_points / 10000
```

### Contacts

Contacts are shared customer/supplier records.

Core accounting fields include:

- contact type: `customer`, `supplier`, or `both`
- name
- email
- phone
- billing address
- VAT/tax number
- payment terms
- default currency
- active flag

When an invoice or bill is created with an existing contact of the opposite type, the contact is promoted to `both`.

## Money Handling

Accounting amounts are stored as integer minor units in journal and document records:

- `subtotal_minor`
- `tax_minor`
- `total_minor`
- `debit_minor`
- `credit_minor`
- `unit_amount_minor`

`lib/accounting/money.ts` provides:

- `poundsToMinor(value: string)`: validates and converts user-entered GBP values to `BigInt` minor units.
- `minorToMajor(minor)`: converts minor units to a major-unit number.
- `formatGbpMinor(minor)`: formats minor units as GBP for display.

Input amounts currently accept positive values with up to two decimal places.

## Journals and Ledger

Journals are the accounting source of truth once posted.

`journals` fields include:

- organization
- status: `draft`, `posted`, or `reversed`
- journal date
- memo
- source type/id
- reversed journal id
- posted metadata
- creator metadata

`journal_lines` fields include:

- organization
- journal
- account
- optional contact
- debit minor
- credit minor
- memo

Database constraints and triggers enforce accounting safety:

- A journal line must be one-sided: debit or credit, not both.
- Posting a journal requires total debits to equal total credits.
- Posting also sets `posted_at` when absent.
- Posted journals cannot be edited.
- Posted journal lines cannot be inserted, updated, or deleted.
- Posted journals cannot be deleted.

Corrections are handled by reversal journals rather than editing posted history.

## Manual Journals

Manual journals live at `/accounting/journals`.

Users with owner/accountant permissions can:

- create draft journals
- post draft journals
- delete draft journals
- reverse posted journals

Manual journal lines are validated in the server action before insert:

- each line must have either a debit or a credit
- at least two valid lines are required
- debit and credit totals are calculated before posting

Posting is still ultimately protected by database triggers, so server validation is not the only line of defense.

Audit events are written for create, update, post, reverse, and delete actions.

## Sales Invoices

Sales invoices are line-based operational documents.

Current invoice statuses:

- `draft`
- `approved`
- `sent`
- `void`

Implemented workflow:

1. Create or update a draft invoice.
2. Each invoice line must select an active revenue account with report category `sales` or `other_income`.
3. Line amounts and VAT are normalized into minor units.
4. Approving the draft invoice creates and posts a journal.
5. The invoice is marked `approved` and linked to `posted_journal_id`.
6. Voiding an approved invoice creates a posted reversal journal and marks the invoice `void`.

Invoice posting creates:

```text
Debit  Accounts Receivable   invoice total
Credit selected revenue      line subtotal(s)
Credit VAT Payable           invoice tax, when tax > 0
```

The configured system accounts are resolved by code/type:

- Accounts Receivable: code `1100`, asset
- VAT Payable: code `2100`, liability

Draft invoices can be edited. The current server logic only updates existing documents if they are still in `draft`.

## Supplier Bills

Supplier bills are line-based purchase documents.

Current bill statuses:

- `draft`
- `approved`
- `void`

Implemented workflow:

1. Create or update a draft bill.
2. Each bill line must select an active expense or asset account with an allowed purchase report category.
3. Line amounts and VAT are normalized into minor units.
4. Approving the draft bill creates and posts a journal.
5. The bill is marked `approved` and linked to `posted_journal_id`.
6. Voiding an approved bill creates a posted reversal journal and marks the bill `void`.

Allowed purchase report categories:

- `cost_of_sales`
- `expense`
- `depreciation`
- `current_asset`
- `fixed_asset`
- `non_current_asset`

Bill posting creates:

```text
Debit  selected expense/asset account   line subtotal(s)
Debit  VAT Control                      bill tax, when tax > 0
Credit Accounts Payable                 bill total
```

The configured system accounts are resolved by code/type:

- Accounts Payable: code `2000`, liability
- VAT Control: code `1200`, asset

## Audit Events

`audit_events` records organization-scoped accounting changes.

Current action enum:

- `create`
- `update`
- `post`
- `void`
- `reverse`
- `delete`

The system currently logs audit events for:

- invoice create/update/post/void
- bill create/update/post/void
- manual journal create/update/post/reverse/delete

Audit rows include actor user id, entity type/id, action, timestamp, and optional before/after JSON payloads.

## Reports

Reports live at `/reports` and are generated from posted ledger data.

The server-side report function is `getCoreReports(organizationId)`.

It returns:

- report period
- trial balance
- profit and loss
- balance sheet
- general ledger rows

Current period behavior:

- `yearStart` is January 1 of the current calendar year.
- `asOfDate` is today's date.
- P&L includes revenue/expense posted ledger entries between `yearStart` and `asOfDate`.
- Trial Balance and Balance Sheet use account balances as of current posted data.
- General Ledger rows include posted entries through `asOfDate`.

### Database Views

Reports use two main Postgres views:

- `account_balances`: account-level debit, credit, and balance totals from posted journals.
- `general_ledger_entries`: line-level posted journal entries joined to account metadata.

`general_ledger_entries` includes:

- journal id/date/memo/source
- account id/code/name/type/category
- contact id
- debit and credit minor units
- line memo
- posted and created timestamps

### Report UI

The report workspace has four tabs:

- Trial Balance
- Profit and Loss
- Balance Sheet
- General Ledger

Account rows in Trial Balance, P&L, and Balance Sheet are clickable. Clicking opens an inline drilldown drawer showing the ledger entries behind that account balance.

The drilldown drawer shows:

- selected account and report context
- displayed balance
- debit and credit totals for the drilldown rows
- ledger date
- memo
- source label
- contact name when available
- journal id prefix

The drawer includes an "Open in General Ledger" action that switches to the General Ledger tab and applies the selected account filter.

Source labels are derived from journal source metadata:

- `invoice`: invoice number when available
- `bill`: bill number when available
- `invoice_void`: Void invoice
- `bill_void`: Void bill
- `manual` / `manual_reversal`: Manual journal
- fallback: raw source type or "Journal"

## Dashboard

The dashboard uses `getDashboardOverview(organizationId)`.

Current dashboard metrics include:

- net profit
- revenue
- open receivables
- open payables

Revenue, expenses, profit, assets, liabilities, and equity are derived from `getCoreReports`.

Recent activity is derived from posted journals.

Note: the current open receivables/payables query still contains fallback-style legacy logic that expects an `amount` field and catches query failures. This should be treated as a transitional dashboard area, not the authoritative AR/AP reporting implementation.

## UI Routes

Accounting-facing routes:

- `/dashboard`: financial summary and recent posted journal activity.
- `/accounting/chart-of-accounts`: chart of accounts with account balances.
- `/accounting/journals`: manual journal register and draft journal entry UI.
- `/reports`: trial balance, P&L, balance sheet, general ledger, and account drilldown.
- `/sales/invoices`: sales invoice workflow.
- `/purchases` and `/purchases/bills`: supplier bill workflow.
- `/purchases/expense-claims`: placeholder expense claims UI.

Some sales customer screens still use direct Supabase client access for contact CRUD. The stricter accounting posting flows use server actions and Prisma transactions.

## Revalidation

Accounting mutations call `revalidatePath` for affected screens.

Invoice mutations revalidate:

- `/sales`
- `/sales/invoices`
- `/dashboard`
- `/reports`
- `/accounting/journals`

Bill mutations revalidate:

- `/purchases`
- `/dashboard`
- `/reports`
- `/accounting/journals`

Manual journal mutations revalidate:

- `/dashboard`
- `/accounting/journals`
- `/reports`

## Current Guarantees

The current accounting system guarantees:

- organization scoping for accounting reads and mutations
- role checks for accounting mutations
- account mapping on invoice and bill lines
- tax calculation into minor units
- balanced journal enforcement when posting
- immutability of posted journals and posted journal lines
- reversal-based voiding for approved invoices and bills
- audit events for important accounting actions
- reports based on posted ledger data
- account-level report drilldown to ledger entries

## Current Limitations

The following areas are not complete yet:

- No payment records or payment allocation engine.
- No part-paid or paid invoice/bill lifecycle.
- No aged receivables or aged payables reports.
- No bank feeds, imported bank transactions, or reconciliation.
- No VAT return workflow or MTD submission layer.
- No credit notes.
- No attachment/document evidence system.
- No period locking.
- No multi-organization chooser; the DAL currently selects the first membership.
- Dashboard open receivables/payables are transitional and not ledger-grade AR/AP reports yet.
- Expense claims are currently a UI placeholder.
- Some contact/customer UI still performs direct browser Supabase writes instead of server actions.

## Development and Verification

Standard checks:

```bash
npm.cmd run lint
npm.cmd run build
```

Seeding:

```bash
npm.cmd run db:seed
```

When changing schema or RLS:

- Use Supabase SQL migrations as the database source of truth.
- Keep RLS enabled on exposed public tables.
- Use `security_invoker = true` for exposed reporting views.
- Do not weaken posted journal immutability.
- Verify fresh migration and existing-data migration paths.

When changing posting logic:

- Keep document saves inside Prisma transactions.
- Keep posted journal creation and document status updates atomic.
- Ensure every posted journal balances before status changes to `posted`.
- Preserve audit events.
- Prefer reversals over edits for posted accounting history.

