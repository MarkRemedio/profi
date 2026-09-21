# Accounting Software Overview: QuickBooks, Xero, and Similar Systems

This note summarizes the main concepts behind accountancy software such as QuickBooks and Xero, especially from a product and database design perspective.

## What These Systems Do

QuickBooks, Xero, Sage, FreeAgent, and similar platforms help businesses record, classify, reconcile, and report financial activity. Their main job is to turn day-to-day business events into reliable accounting records.

Typical users include business owners, bookkeepers, accountants, finance teams, and tax agents.

## Core Product Areas

### 1. Organisations and Users

Most systems support one or more business entities, often called organisations, companies, or tenants.

Common features:

- Multiple organisations per user
- Role-based access control
- Accountant or advisor access
- Audit logs
- Organisation-level settings
- Tax registration details
- Accounting period settings
- Base currency

### 2. Chart of Accounts

The chart of accounts is the backbone of the accounting system. It defines the ledgers used to classify financial transactions.

Common account categories:

- Assets
- Liabilities
- Equity
- Income
- Expenses

Common examples:

- Bank account
- Accounts receivable
- Accounts payable
- Sales revenue
- VAT/GST/HMRC tax control account
- Cost of goods sold
- Payroll liabilities
- Owner equity

Each accounting transaction eventually posts to one or more accounts.

### 3. Customers and Suppliers

Accounting platforms usually maintain contact records for both customers and suppliers.

Common fields:

- Legal or trading name
- Billing address
- Email address
- Phone number
- Tax number
- Payment terms
- Default currency
- Default account mappings

Customers are usually linked to invoices and receipts. Suppliers are usually linked to bills, expenses, and payments.

### 4. Invoices

Sales invoices record money owed by customers.

Common invoice lifecycle:

- Draft
- Approved or posted
- Sent
- Part-paid
- Paid
- Void or cancelled

Important invoice concepts:

- Invoice number
- Issue date
- Due date
- Customer
- Line items
- Tax rates
- Discounts
- Currency
- Payment allocation
- Status

When an invoice is posted, it usually creates double-entry accounting records:

- Debit accounts receivable
- Credit sales revenue
- Credit tax payable, if tax applies

### 5. Bills and Expenses

Bills record money owed to suppliers. Expenses often record money already paid.

Typical bill posting:

- Debit expense or asset account
- Debit recoverable tax, if applicable
- Credit accounts payable

Typical expense posting:

- Debit expense or asset account
- Debit recoverable tax, if applicable
- Credit bank, cash, or card account

### 6. Payments

Payments settle invoices, bills, or standalone transactions.

Common payment types:

- Customer receipt
- Supplier payment
- Bank transfer
- Card payment
- Refund
- Overpayment
- Prepayment

Payments often need allocation logic. A single payment may pay multiple invoices, and one invoice may be paid by multiple payments.

### 7. Bank Feeds and Reconciliation

Bank feeds import real-world bank transactions into the accounting system.

Reconciliation matches imported bank transactions to accounting records.

Common matching targets:

- Invoice payments
- Bill payments
- Expense transactions
- Transfers between bank accounts
- Journal entries

Useful reconciliation features:

- Suggested matches
- Rule-based categorisation
- Split transactions
- Attachments or receipt images
- Reconciliation status
- Bank statement balance comparison

### 8. Journals and Double-Entry Accounting

Behind the scenes, accounting systems usually rely on double-entry bookkeeping.

Every posted accounting event creates balanced journal entries:

- Total debits must equal total credits
- Each journal entry has multiple journal lines
- Each line posts to a chart of accounts account
- Lines may include tax, contact, tracking category, department, or project metadata

Examples of journal-producing events:

- Sales invoice
- Supplier bill
- Customer payment
- Supplier payment
- Bank transfer
- Manual journal
- Credit note
- Payroll summary
- Depreciation
- Year-end adjustment

### 9. Credit Notes and Refunds

Credit notes reduce or reverse invoices and bills.

Sales credit note example:

- Debit sales revenue
- Debit tax payable
- Credit accounts receivable

Credit notes may be:

- Applied to an unpaid invoice
- Refunded to the customer
- Held as customer credit

### 10. Tax Handling

Tax support depends on jurisdiction. For UK-focused software, this often means VAT and HMRC Making Tax Digital.

Common tax concepts:

- Tax rates
- Tax codes
- Tax-inclusive vs tax-exclusive pricing
- VAT return periods
- Output tax on sales
- Input tax on purchases
- Tax adjustments
- Reverse charge
- Partial exemption
- Digital tax submission

For UK VAT, systems commonly need to support VAT return boxes, audit trails, and digital links for MTD compliance.

### 11. Reporting

Core reports:

- Profit and loss
- Balance sheet
- Trial balance
- General ledger
- Aged receivables
- Aged payables
- Cash summary
- VAT/GST return
- Bank reconciliation report
- Account transactions report

Good accounting reports are usually derived from posted journal entries rather than directly from invoices or bills.

### 12. Attachments and Evidence

Modern accounting systems often store supporting documents.

Examples:

- Supplier invoices
- Receipts
- Bank statements
- Contracts
- Credit note PDFs
- Payroll reports

Attachments should usually be linked to business records and protected by access controls.

### 13. Audit Trail

Auditability is essential.

Systems should track:

- Who created a record
- Who changed it
- When it changed
- What changed
- Posting, voiding, deletion, or reversal events
- Tax submission events
- Login and permission changes

For accounting data, soft deletion, immutable posting records, and reversal entries are often safer than hard deletion.

## Database Design Implications

### Important Tables

A QuickBooks/Xero-style system commonly needs tables like:

- organisations
- users
- organisation_members
- roles
- contacts
- accounts
- tax_rates
- invoices
- invoice_lines
- bills
- bill_lines
- payments
- payment_allocations
- bank_accounts
- bank_transactions
- bank_reconciliations
- journals
- journal_lines
- credit_notes
- attachments
- audit_events
- reporting_periods
- tax_returns

### Important Design Rules

- Use tenant scoping on every organisation-owned table.
- Keep posted accounting entries immutable where possible.
- Use reversing entries instead of silently editing historical records.
- Store money using integer minor units or fixed precision decimal types.
- Store currency explicitly on money-bearing records.
- Separate operational documents from accounting postings.
- Make journal entries the source of truth for financial reports.
- Ensure every posted journal balances.
- Track status transitions carefully.
- Keep audit logs separate from normal business records.

## Common Status Models

### Invoice Statuses

- draft
- approved
- sent
- part_paid
- paid
- void

### Bill Statuses

- draft
- approved
- part_paid
- paid
- void

### Bank Transaction Statuses

- imported
- matched
- reconciled
- excluded

### Journal Statuses

- draft
- posted
- reversed

## API and Integration Patterns

Accounting platforms often expose APIs for:

- Creating invoices
- Reading contacts
- Syncing chart of accounts
- Importing payments
- Fetching reports
- Uploading attachments
- Connecting bank feeds
- Submitting tax returns

Common integration concerns:

- Idempotency keys
- Webhooks
- External IDs
- Sync cursors
- Rate limits
- Conflict resolution
- OAuth connections
- Token refresh
- Field mapping

## Product Lessons from QuickBooks and Xero

QuickBooks is often seen as broad, feature-rich, and suitable for many small business accounting workflows. Xero is often praised for clean bank reconciliation, cloud-first collaboration, and accountant-friendly workflows.

Useful design lessons:

- Bank reconciliation should be fast and central.
- The chart of accounts should be flexible but controlled.
- Reports should tie back to source transactions.
- Users need simple workflows, but the accounting engine must remain strict.
- Accountants need auditability, exports, corrections, and period controls.
- Business owners need clear invoice, cash, tax, and profit visibility.

## Recommended Architecture Shape

A strong accounting system usually separates:

- Product documents: invoices, bills, payments, contacts, bank transactions
- Accounting engine: journals, journal lines, account balances, posting rules
- Compliance layer: tax returns, MTD submissions, audit evidence
- Reporting layer: financial reports generated from posted entries
- Integration layer: bank feeds, HMRC, payment processors, external accounting APIs

This separation keeps the user experience simple while preserving accounting correctness.

