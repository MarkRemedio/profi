# HMRC MTD VAT

**Status:** Stub
**Category:** Compliance

## What this is

HMRC's Making Tax Digital VAT API: obligations, view returns, submit returns, view liabilities, view payments — all over OAuth2 with digital-links audit requirements.

## Current state

- [components/taxes/vat-view.tsx](../../../components/taxes/vat-view.tsx) shows a 9-box return UI from hard-coded data.
- No HMRC OAuth client, no `vat_returns` table (see [tax returns model](../data-models/tax-returns.md)).
- No fraud-prevention headers, no MTD compliance evidence.

## Why it's needed

- Mandatory for UK VAT-registered businesses.
- "Digital links" rule: figures going to HMRC must trace back unbroken to source transactions in the same system.

## Recommended approach

- Add an `lib/hmrc/` client wrapping the MTD endpoints (`/organisations/vat/{vrn}/obligations`, `.../returns`).
- OAuth2 authorisation-code flow per organisation; persist refresh tokens encrypted.
- Send all 40+ HMRC fraud-prevention headers (`Gov-Client-*`, `Gov-Vendor-*`).
- Background job for the actual submission with retry.

## Implementation notes

- Use the HMRC sandbox first; certify against the agent and individual VRN scenarios.
- Store the _exact_ request body and response receipt on the `VatReturn` row.

## Related

- [Tax returns model](../data-models/tax-returns.md), [Background jobs](../architecture/background-jobs.md), [Webhooks](../architecture/webhooks.md), [Reporting periods](../data-models/reporting-periods.md)
