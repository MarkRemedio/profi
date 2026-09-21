# Payment processors (Stripe, etc.)

**Status:** Missing
**Category:** Compliance / Integration

## What this is

Allow customers to pay invoices online with card / Apple Pay / Direct Debit, with the receipt automatically posted to the ledger and applied to the invoice.

## Current state

- No Stripe or GoCardless integration in `package.json`.
- Invoices have no `payment_url` field; the only way to mark paid is manual or via a separate banking flow.

## Why it's needed

- "Pay this invoice" is table-stakes; without it, AR collection is slower and matching is manual.
- Stripe Direct (card) + GoCardless (UK Bacs DD) covers most SMB use cases.

## Recommended approach

- Add a Stripe Connect account per organisation (or platform-mode for an aggregated model).
- On invoice posting, create a Stripe PaymentLink and store its id on the invoice.
- Webhook (`payment_intent.succeeded`) creates a `Payment` + allocation + posts the journal automatically.
- Stripe fees post to a fee expense account.

## Implementation notes

- Use idempotency keys on Stripe API calls to handle retries safely.
- Currency on the PaymentIntent must match the invoice currency.

## Related

- [Payments](../data-models/payments.md), [Webhooks](../architecture/webhooks.md), [Email service](../architecture/email-service.md)
