# Priority — WAWPROFI Audit (May 15 2026)

Source: `WAWPROFI AUDIT MAY 15 2026.pdf` (author: SJ). Each finding from that audit is captured here as its own file, grouped by section.

Notes on this index:

- The order below is the **recommended fix order**, not the order from the PDF.
- Items the auditor explicitly tagged top priority are marked **(P0)**.
- Items that need code verification before action are marked **(verify)**.
- The PDF ended with "Power cut off happened to be continued" — there may be additional findings in a follow-up document.

## Top priority — known reproducible bugs

1. [Bank Account add throws errors / does not sync to COA](coa-ui/bank-account-sync-broken.md) **(P0)**
2. [Trial Balance: Sales appears on debit side after invoice post](ledger-correctness/trial-balance-sales-debit-bug.md) **(verify — ledger correctness)**
3. [CSV import for Chart of Accounts silently rejects valid-looking files](coa-ui/csv-import-broken.md)
4. [Expense Claims module not working](module-integration/expense-claims-broken.md)
5. [Bank Transactions module untestable](module-integration/bank-transactions-untestable.md)

## Module integration with the COA

6. [Payments module missing (no Payment / Allocation model)](module-integration/payments-module-missing.md)
7. [Payroll has no GL integration](module-integration/payroll-no-gl-integration.md)
8. [Adjustments module not found](module-integration/adjustments-module-missing.md)

## Ledger correctness / posting

9. [Invoice status: no clear "outstanding / unpaid" indication](ledger-correctness/invoice-status-outstanding-display.md)
10. [Invoice payment: no bank account source tracking](ledger-correctness/invoice-payment-bank-source-tracking.md)
11. [Bills default to draft, drafts are invisible in reports](ledger-correctness/bills-draft-default-posting.md)
12. [Bill payment traceability / partial payments](ledger-correctness/bill-payment-traceability.md)

## Chart of Accounts — code structure

13. [Standardised numeric ranges per account type](coa-structure/standardised-numeric-ranges.md)
14. [Parent / child account hierarchy (Phase 2)](coa-structure/parent-child-hierarchy.md)

## Chart of Accounts — UI

15. [Dashboard metric cards should be clickable](coa-ui/dashboard-metric-cards.md)
16. [Data filter bar is dense — collapse behind a Filter button](coa-ui/data-filtering-layout.md)
17. [Missing Export option (CSV / Excel / PDF)](coa-ui/export-option-missing.md)
18. [Add Bank Account button on the COA page](coa-ui/add-bank-account-button.md)
19. [Edit / View discoverability — use natural click targets](coa-ui/edit-view-discoverability.md)
20. [Account creation guide should be reactive, not static](coa-ui/reactive-creation-guide.md)
21. [Smart-account-setup footer banner is redundant once COA has rows](coa-ui/footer-banner-redundant.md)
