# Companies House / VIES lookups

**Status:** Missing
**Category:** Compliance / Integration

## What this is

Lookup integrations: UK Companies House for company name + registered office + officers; EU VIES for VAT number validation; HMRC Check a UK VAT number.

## Current state

- Adding a customer/supplier in [components/sales/add-customer-dialog.tsx](../../../components/sales/add-customer-dialog.tsx) is free-text only.
- `Contact.taxNumber` is stored but never validated.

## Why it's needed

- Reduces customer onboarding friction: type a company number, autofill the rest.
- Reverse-charge VAT rules require the supplier to confirm the customer's EU VAT number is valid; VIES is the only authoritative check.
- Reduces typos that break later reports / submissions.

## Recommended approach

- `lib/integrations/companies-house.ts` — wraps the public Companies House Search API.
- `lib/integrations/vies.ts` — wraps the EU SOAP endpoint (cached per VAT number per day).
- Surface as an autocomplete on the contact form.

## Implementation notes

- VIES has aggressive rate limits — always cache the result (with a freshness check).
- Persist the VIES proof (request id + timestamp) on the contact for VAT defence.

## Related

- [Tax returns](../data-models/tax-returns.md), [HMRC MTD VAT](hmrc-mtd-vat.md)
