# Trial Balance: Sales appears on debit side after invoice post

**Audit priority:** **P0 — verify** (ledger correctness)
**Section:** Ledger correctness / posting

## What the auditor saw

> For the Trial Balance, there is an issue with the posting logic. **Sales should not appear on the debit side** when an invoice is created. The correct behavior should be a debit to Accounts Receivable and a credit to Sales Revenue, but at the moment Sales is incorrectly showing a debit value.

Screenshot referenced: `4000 - Sales | Revenue | £61,462.00 | £279,314.00`.

## Why this matters

- Trial Balance is the auditor's primary check that double-entry holds. A revenue account showing a debit balance means either:
  - the posting is wrong (an invoice is debiting Sales instead of crediting it), or
  - the Trial Balance report is mis-rendering the column (showing the gross movement in the wrong column).
- Either way it's a credibility-killer for the system. The number printed matters more than the journal underneath if a customer reads it.

## What to check first

1. Look at the actual journal a posted invoice produces. From [prisma/schema.prisma](../../../prisma/schema.prisma), `Invoice.postedJournalId` points at a `Journal` row with `JournalLine` rows. For an invoice with positive amount, expect:
   - one line: `account = Accounts Receivable`, `debitMinor > 0`, `creditMinor = 0`
   - one line: `account = Sales`, `debitMinor = 0`, `creditMinor > 0`
   - one line (if VAT applies): `account = VAT Output`, `debitMinor = 0`, `creditMinor > 0`
2. Confirm the Trial Balance query in [lib/accounting/reports.ts](../../../lib/accounting/reports.ts) renders the columns based on the account's normal balance (revenue normal balance = credit), not on raw sums.

## Likely scenarios

| Scenario | How to spot it |
|----------|----------------|
| Posting writes the wrong line direction | The `JournalLine` for Sales has `debitMinor > 0`. Fix at the posting site, not in the report. |
| Posting is correct, report uses raw `debit_minor - credit_minor` per account | Sales would have a negative number that some renderer might be flipping into the DR column. Fix the report. |
| Column misread by auditor | The screenshot shows two figures (`£61,462.00 | £279,314.00`) which on the COA list are MTD / YTD, not DR / CR. Worth confirming the screenshot is from the **Trial Balance**, not the COA. |

## What to do

1. **Verify with [accountant-auditor agent](../../missing/README.md):** run the agent on [lib/accounting/reports.ts](../../../lib/accounting/reports.ts), [app/sales/invoices/actions.ts](../../../app/sales/invoices/actions.ts), and a sample posted invoice in the DB to confirm where the bug is.
2. **If posting is wrong:** fix the journal builder. Add a regression test that asserts a posted invoice produces a balanced journal with debit on AR and credit on Sales.
3. **If the report is wrong:** fix the column logic to respect the account's normal balance.
4. Either way, add a backfill check: query for any posted invoice whose journal has a debit on a Revenue account; flag those orgs and offer a corrective reversal + re-post path.

## Implementation notes

- Add a property-based test: for every posted journal, `sum(debit_minor) == sum(credit_minor)` and the side assignments match the account's normal balance.
- The Trial Balance display should explicitly say "Debit" / "Credit" headers, not just two number columns.

## Related

- [Missing — Service / domain layer](../../missing/architecture/service-domain-layer.md) — posting belongs there with tests.
- [Missing — Tests](../../missing/devops/tests.md) — this exact case should be a unit test.
- [Missing — Reporting periods](../../missing/data-models/reporting-periods.md) — if a backfill is needed, period locks affect what can be re-posted.
