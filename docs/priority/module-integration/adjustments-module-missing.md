# Adjustments module not found

**Audit priority:** Medium
**Section:** Module integration with the COA

## What the auditor saw

In the module-verification table:

| Module       | Verification          |
|--------------|-----------------------|
| Adjustments  | **Module not Found**  |

There is no dedicated workflow for accounting adjustments (accruals, prepayments, depreciation, year-end provisions, error corrections).

## Current state in the codebase

- Manual journals **do** exist: [app/accounting/journals/](../../../app/accounting/journals/), [components/accounting/journal-workspace.tsx](../../../components/accounting/journal-workspace.tsx).
- `Journal.autoReversalDate` is on the model in [prisma/schema.prisma](../../../prisma/schema.prisma) — supports the accrual/prepayment auto-reversal pattern.
- There is **no** specialised "adjustments" surface that distinguishes them from one-off manual journals.

## Reading of this finding

Strictly, adjustments can be entered today as manual journals, so this is a naming/UX gap more than a structural one. But the auditor's instinct is correct: bookkeepers expect a recognisable surface for adjustments rather than a generic journal screen.

## What to do

- Add an "Adjustments" tab inside Accounting that filters the journal list by `sourceType IN ('accrual', 'prepayment', 'depreciation', 'year_end', 'correction')` and offers templates per type.
- Templates:
  - **Accrual** — `DR expense / CR accrued liability` with auto-reverse on the first day of the next period (already supported via `autoReversalDate`).
  - **Prepayment** — `DR prepayment asset / CR bank` with monthly release journals.
  - **Depreciation** — driven by the fixed-asset register (see [Missing — Fixed assets](../../missing/data-models/fixed-assets.md)).
  - **Correction** — must reference the journal being corrected; never edit history.
- Track which "kind" of adjustment by adding a `sourceType` value or a new `adjustmentType` column.

## Implementation notes

- Don't rebuild manual journals — adjustments are a curated entry point into the same underlying flow.
- Year-end adjustments should respect period locks (see [Missing — Reporting periods](../../missing/data-models/reporting-periods.md)).

## Related

- [Missing — Fixed assets](../../missing/data-models/fixed-assets.md) — depreciation engine.
- [Missing — Recurring transactions](../../missing/data-models/recurring-transactions.md) — recurring accruals/prepayments.
- [Missing — Reporting periods](../../missing/data-models/reporting-periods.md).
