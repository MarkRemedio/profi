# Account creation guide should be reactive, not static

**Audit priority:** Medium (UX)
**Section:** Chart of Accounts — UI

## What the auditor saw

The "Create new account" panel includes a side guide titled **Profit & Loss / Balance Sheet** that lists income, expense, and asset sections. Today it is static — it always shows the same content regardless of which account type the user has selected.

## The auditor's recommendation

Turn the guide into a reactive component:

- When the user selects an **Account Type** from the dropdown, the corresponding section in the side guide highlights.
- A "ghost entry" preview shows where the new account will appear in the P&L or Balance Sheet (Xero does this).
- Result: the guide stops being decoration and becomes an active validator/teacher.

## What to do

- Track the selected Account Type in form state.
- Map Account Type → target section in the P&L or Balance Sheet preview.
- Render that section with a highlight ring + a "← Your new account would appear here" tag.
- Optionally, render the literal name/code the user is typing as a faded row in the right place.

## Implementation notes

- Pure client-side; no schema changes.
- Pair with [shared validation](../../missing/frontend/shared-validation.md) so the highlight tracks the same enum the server validates against.
- Accessibility: the highlight should also announce via `aria-live` for screen reader users.

## Related

- [Standardised numeric ranges](../coa-structure/standardised-numeric-ranges.md) — the same reactive UI can warn when the code is outside the allowed range for the chosen type.
