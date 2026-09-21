# Corporation tax / iXBRL

**Status:** Stub
**Category:** Compliance

## What this is

HMRC's CT600 corporation tax submission, requiring iXBRL-tagged statutory accounts and computations.

## Current state

- [components/taxes/corporation-view.tsx](../../../components/taxes/corporation-view.tsx) is a UI placeholder.
- No statutory account templates (FRS 102 / FRS 105).
- No iXBRL tagging library.
- No capital allowances calculation.

## Why it's needed

- Limited companies must file CT600 + tagged accounts annually.
- Without an accounts module that produces FRS-compliant statements, customers must export to a separate filing tool.

## Recommended approach

- This is a large workstream — most accounting SaaS partners with HMRC-recognised filing software (e.g. Inflo, Taxfiler) rather than building it in-house.
- Minimum: produce a high-quality CSV/iXBRL export of trial balance and adjustments.
- Long term: integrate a third-party CT filing API.

## Implementation notes

- iXBRL taxonomy versions (UK GAAP, IFRS) change every year — don't bake the taxonomy into the codebase, load from configuration.
- Capital allowances depend on the [fixed asset register](../data-models/fixed-assets.md).

## Related

- [Fixed assets](../data-models/fixed-assets.md), [Reporting periods](../data-models/reporting-periods.md), [Tax returns](../data-models/tax-returns.md)
