# WAWPROFI Accounting Guide

This guide explains the current WAWPROFI accounting system in plain language. It is written for accountants, bookkeepers, finance users, and business owners who want to understand how the system records and reports financial activity.

## What WAWPROFI Does Today

WAWPROFI now works more like a real accounting system than a simple dashboard.

It can:

- keep a chart of accounts
- store customers and suppliers as contacts
- create sales invoices
- create supplier bills
- post approved invoices and bills into the ledger
- create manual journals
- reverse posted journals
- void approved invoices and bills
- produce ledger-backed financial reports
- show drilldowns from reports to the ledger entries behind the numbers

The important idea is this:

```text
Invoices, bills, and journals feed the general ledger.
Reports are built from the general ledger.
```

That means the report numbers are not just dashboard summaries. They come from posted accounting entries.

## Main Accounting Areas

### Chart of Accounts

The chart of accounts is the list of accounts used to classify money.

Examples include:

- Bank Current Account
- Accounts Receivable
- VAT Control
- Accounts Payable
- VAT Payable
- Sales
- Cost of Sales
- General Expenses
- Payroll Expenses

Every invoice or bill line must be connected to an account. This is how WAWPROFI knows whether a transaction affects sales, expenses, assets, liabilities, VAT, or equity.

### Contacts

Contacts are customers, suppliers, or both.

A customer is used for sales invoices.
A supplier is used for bills.
A contact can be both if the same business is sometimes a customer and sometimes a supplier.

### VAT

WAWPROFI currently supports common UK VAT codes:

- VAT 20%
- VAT 5%
- VAT 0%
- VAT exempt
- No VAT

When a line item has VAT, the system calculates the tax amount and posts it to the correct VAT account when the document is approved.

### Sales Invoices

A sales invoice records money owed by a customer.

Current invoice statuses are:

- Draft
- Approved
- Sent
- Void

The current working flow is:

1. Create a draft invoice.
2. Add one or more invoice lines.
3. Choose a sales or income account for each line.
4. Choose the VAT code for each line.
5. Approve the invoice.
6. WAWPROFI posts the accounting entry into the ledger.

When a sales invoice is approved, WAWPROFI posts:

```text
Debit  Accounts Receivable
Credit Sales / Revenue
Credit VAT Payable, if VAT applies
```

In plain English:

- the customer now owes the business money
- sales income increases
- VAT owed to HMRC increases if VAT was charged

### Supplier Bills

A supplier bill records money the business owes to a supplier.

Current bill statuses are:

- Draft
- Approved
- Void

The current working flow is:

1. Create a draft bill.
2. Add one or more bill lines.
3. Choose an expense or asset account for each line.
4. Choose the VAT code for each line.
5. Approve the bill.
6. WAWPROFI posts the accounting entry into the ledger.

When a supplier bill is approved, WAWPROFI posts:

```text
Debit  Expense or Asset account
Debit  VAT Control, if VAT applies
Credit Accounts Payable
```

In plain English:

- the business now owes the supplier money
- the expense or asset is recorded
- recoverable VAT is recorded if applicable

### Manual Journals

Manual journals are used for accounting adjustments that are not created from invoices or bills.

Examples could include:

- month-end adjustments
- accruals
- corrections
- opening balances
- depreciation entries

Every manual journal must balance:

```text
Total debits = total credits
```

Draft manual journals can be deleted or posted. Once posted, they become part of the accounting record.

### Reversals and Voids

WAWPROFI does not silently edit posted accounting history.

If an approved invoice or bill needs to be cancelled, it is voided. If it already created a journal, WAWPROFI creates a reversal journal.

This keeps the audit trail clear:

- the original entry remains visible
- the reversal explains how it was corrected
- reports reflect the net effect

The same idea applies to posted manual journals. They can be reversed rather than directly changed.

## Reports

Reports are based on posted ledger entries.

Current reports include:

- Trial Balance
- Profit and Loss
- Balance Sheet
- General Ledger

### Trial Balance

The Trial Balance shows account debit and credit totals.

It helps check that the books are balanced overall.

### Profit and Loss

The Profit and Loss report shows income and expenses for the current calendar year so far.

It groups accounts into sections such as:

- Income
- Cost of Sales
- Other Income
- Expenses

This report is used to understand business performance and net profit.

### Balance Sheet

The Balance Sheet shows the financial position of the business.

It groups accounts into:

- Assets
- Liabilities
- Equity

It also includes current net profit as part of the equity picture.

### General Ledger

The General Ledger shows the detailed posted entries behind the accounts.

It includes:

- date
- account
- memo
- source
- debit
- credit
- running balance

### Report Drilldown

Reports have drilldown.

When you click an account line in Trial Balance, Profit and Loss, or Balance Sheet, WAWPROFI opens a detail panel showing the ledger entries behind that number.

This helps answer questions like:

- Why is this sales number what it is?
- Which bills make up this expense account?
- Which journal entries affected this balance?
- Which customer or supplier is connected to this amount?

This is important for accountant review because report numbers can be traced back to source entries.

## Dashboard

The dashboard currently shows high-level financial information, including:

- net profit
- revenue
- open receivables
- open payables
- recent posted journal activity

The profit and balance summaries come from ledger-backed reports.

One important note: open receivables and payables are still transitional. A proper aged receivables and aged payables report has not been built yet.

## Permissions

WAWPROFI supports three organization roles:

- Owner
- Accountant
- Employee

Owners and accountants can perform accounting actions such as creating, approving, posting, voiding, and reversing records.

Employees may have more limited access depending on the page and workflow.

## Audit Trail

WAWPROFI records audit events for important accounting actions.

Examples include:

- creating invoices
- updating draft invoices
- approving invoices
- voiding invoices
- creating bills
- approving bills
- voiding bills
- creating journals
- posting journals
- reversing journals
- deleting draft journals

The audit trail helps show who did what and when.

## What Is Protected

The system currently protects these accounting rules:

- posted journals must balance
- posted journal lines cannot be changed
- posted journals cannot be deleted
- approved invoices and bills create ledger entries
- voiding approved documents creates reversal journals
- invoice and bill lines must be mapped to accounts
- accounting actions are limited to authorized users

This gives the system a reliable accounting backbone.

## What Is Not Built Yet

These areas are not complete yet:

- customer payments
- supplier payments
- payment allocation to invoices or bills
- part-paid and paid statuses
- aged receivables
- aged payables
- bank feeds
- bank reconciliation
- VAT returns
- Making Tax Digital submission
- credit notes
- attachments and receipt storage
- period locking
- full expense claims accounting

So the system can currently record and post invoices, bills, and journals, but it is not yet a full end-to-end accounting package like Xero or QuickBooks.

## Current Best Use

At this stage, WAWPROFI is best understood as:

```text
A ledger-backed accounting foundation for invoices, bills, journals, and reports.
```

It is already suitable for testing the accounting flow from:

```text
Draft document
  -> approval
  -> posted journal
  -> ledger
  -> report
  -> drilldown
```

The next major accounting improvements should be:

1. Aged receivables and aged payables.
2. Payment recording and allocation.
3. Bank reconciliation.
4. VAT return reporting.
5. Period locking and stronger accountant review workflows.

