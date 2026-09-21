# Tax module screens — UI-only stubs

**Status:** Stub
**Category:** UI awaiting backend

## What this is

The `/taxes` sub-routes: VAT, corporation tax, CIS, EC sales, capital gains, self-employed, forex.

## Current state

- Pages: [app/taxes/vat/](../../../app/taxes/vat/), [app/taxes/corporation/](../../../app/taxes/corporation/), [app/taxes/cis/](../../../app/taxes/cis/), [app/taxes/ec-sales/](../../../app/taxes/ec-sales/), [app/taxes/capital-gains/](../../../app/taxes/capital-gains/), [app/taxes/self-employed/](../../../app/taxes/self-employed/), [app/taxes/forex/](../../../app/taxes/forex/).
- Each renders a corresponding `*-view.tsx` in [components/taxes/](../../../components/taxes/) — all with hard-coded data.
- Example: [components/taxes/vat-view.tsx:42](../../../components/taxes/vat-view.tsx#L42) declares `vatObligations` and `vatReturnDraft` as constants.
- No integration to compute these figures from posted journals; no submission backend.

## Why this matters

- Misleading: tax screens look "ready" but produce no real figures and submit nothing.
- A user could believe they've filed VAT when nothing has reached HMRC.

## What's needed before each is real

- VAT → [HMRC MTD VAT](../compliance/hmrc-mtd-vat.md) + [tax returns model](../data-models/tax-returns.md).
- Corporation → [Corporation tax / iXBRL](../compliance/corporation-tax.md).
- CIS → [CIS filing](../compliance/cis-filing.md).
- EC Sales → similar to VAT MTD submission flow.
- Capital gains, self-employed → require additional data models (asset disposals, sole-trader income).
- Forex → see [exchange rates](../data-models/exchange-rates.md).

## Suggested cleanup

- Mark each `*-view.tsx` with a banner: "Preview — figures are illustrative."
- Hide submission CTAs (Submit to HMRC, etc.) until wired.

## Related

- [HMRC MTD VAT](../compliance/hmrc-mtd-vat.md), [Tax returns model](../data-models/tax-returns.md), [Feature flags](../cross-cutting/feature-flags.md)
