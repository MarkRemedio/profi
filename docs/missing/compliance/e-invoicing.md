# eInvoicing (Peppol)

**Status:** Missing
**Category:** Compliance / Integration

## What this is

Send and receive structured e-invoices via the Peppol network — increasingly required for B2G in the EU and mandated for B2B in several jurisdictions over the next few years.

## Current state

- Invoice output is HTML print only ([components/sales/print-invoice-view.tsx](../../../components/sales/print-invoice-view.tsx)).
- No UBL 2.1 / Peppol BIS Billing 3.0 generator, no access-point integration.

## Why it's needed

- EU member states are phasing in mandatory e-invoicing (Italy, France, Belgium, Poland already moving).
- UK government already accepts Peppol; many corporate buyers require it.

## Recommended approach

- Generate UBL XML alongside the PDF on invoice posting.
- Partner with a Peppol Access Point provider (Storecove, Pagero) rather than becoming one.
- Inbound Peppol → land as a draft bill in the customer's bills inbox.

## Implementation notes

- UBL is verbose but standardised — map invoice + line + tax once.
- Many providers expose REST APIs over Peppol; pick one with good test sandbox.

## Related

- [PDF generation](../architecture/pdf-generation.md), [Bills](../data-models/payments.md), [Webhooks](../architecture/webhooks.md)
