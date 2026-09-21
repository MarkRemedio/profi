# Standardised numeric ranges per account type

**Audit priority:** Medium (architecture)
**Section:** Chart of Accounts — code structure

## What the auditor saw

The current COA allows any numeric code for any account type. Sample rows from the audit:

| Code | Name           | Type     |
|------|----------------|----------|
| 123  | Merchant fees  | Expense  |
| 200  | wadwad         | Asset    |
| 0999 | Discount       | Revenue  |
| 1000 | Bank Current Account | Asset |

Mixed lengths (3/4/4 digits), no relationship between code and type, leading-zero codes.

## The auditor's recommendation

Lock account types into defined numeric ranges. The proposed structure:

| Range        | Type                  |
|--------------|-----------------------|
| 1000–1999    | Fixed Assets          |
| 2000–2999    | Current Assets        |
| 3000–3999    | Current Liabilities   |
| 4000–4999    | Sales / Revenue       |
| 5000–5999    | Cost of Sales         |
| 6000–7999    | Operating Expenses    |
| 8000–8999    | Other Income / Expense |
| 9000–9999    | Equity / Reserves     |

When the user picks an Account Type, the form should either:

- auto-assign the next free code in the matching range, or
- validate the typed code and refuse with a message: "Please use a number between 5000–5999."

## My calibration (from the codebase review)

Strict locking is opinionated and clashes with non-UK templates (German SKR03 uses very different ranges, for example). Recommended adjustment:

- Make the range a **soft validation** linked to the active **account template** ([prisma/schema.prisma `AccountTemplate`](../../../prisma/schema.prisma)), not a hard global lock.
- The default UK template uses the ranges above.
- The form **warns** on out-of-range codes and offers the next available code; rejects only when a duplicate.

## What to do

- Add a `numericRangeStart` / `numericRangeEnd` per `AccountReportCategory` (or per template entry).
- In the create-account form: when the user selects an account type, suggest the next free code in that range; warn on out-of-range manual entry.
- Update the CSV importer to apply the same validation (see [CSV import broken](../coa-ui/csv-import-broken.md)).

## Implementation notes

- Pad codes to 4 digits consistently to avoid the `200` vs `0999` mix.
- Migrate existing accounts only on user opt-in — renumbering historical accounts breaks bank reconciliation rules and external integrations.

## Related

- [Parent/child hierarchy (Phase 2)](parent-child-hierarchy.md) — the auditor positions this as a Phase 2 follow-up.
- [Reactive creation guide](../coa-ui/reactive-creation-guide.md) — same form is a good place to show the range hint.
