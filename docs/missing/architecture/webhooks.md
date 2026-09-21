# Webhook infrastructure

**Status:** Missing
**Category:** Architecture / Backend

## What this is

Both directions: inbound webhook receivers (Stripe, bank-feed providers, HMRC callbacks) and outbound webhook dispatch so tenants can subscribe to events such as `invoice.posted`.

## Current state

- No inbound webhook routes anywhere under [app/](../../../app/).
- No `WebhookEndpoint` model in [prisma/schema.prisma](../../../prisma/schema.prisma).
- No HMAC signing helper, no replay-protection store.

## Why it's needed

- Bank feed and payment processor integrations are webhook-driven.
- Accountant tools, ERPs, and customer integrations expect outbound events.

## Recommended approach

- Inbound: `app/api/v1/webhooks/[provider]/route.ts` with provider-specific signature verification.
- Outbound: `WebhookEndpoint { id, orgId, url, secret, events[], active }`, deliveries logged in a `WebhookDelivery` table, retries on the job queue.
- Sign outbound payloads with HMAC-SHA256 and include a timestamp to prevent replay.

## Implementation notes

- Store every inbound payload (raw body + signature) before doing any work — needed for debugging and for replay.
- Cap retry to ~24h with exponential backoff.

## Related

- [HTTP API layer](http-api-layer.md), [Background jobs](background-jobs.md), [Payment processors](../compliance/payment-processors.md), [Bank feeds](../compliance/bank-feeds.md)
