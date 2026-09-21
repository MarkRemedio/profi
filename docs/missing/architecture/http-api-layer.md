# HTTP API layer

**Status:** Missing
**Category:** Architecture / Backend

## What this is

A public HTTP API surface (REST or GraphQL) for the Next.js side of the app, separate from internal Server Actions.

## Current state

- No [app/api/](../../../app/api/) directory exists.
- All server work is invoked through Next.js Server Actions, e.g. [app/sales/invoices/actions.ts](../../../app/sales/invoices/actions.ts), [app/purchases/actions.ts](../../../app/purchases/actions.ts), [app/taxes/actions.ts](../../../app/taxes/actions.ts).
- The Django service ([lib/django/banking.ts](../../../lib/django/banking.ts)) has its own API; the Next side does not expose one.

## Why it's needed

- Third-party integrations (accountants, mobile apps, Zapier-like tools) cannot consume Server Actions.
- Webhook receivers and OAuth callbacks need stable HTTP routes.
- Public API is a baseline expectation for SaaS accounting (Xero, QuickBooks, FreeAgent all publish one).

## Recommended approach

- Add `app/api/v1/...` route handlers for each resource (invoices, bills, contacts, journals, reports).
- Authenticate with personal access tokens or OAuth2 client credentials, not the Supabase cookie.
- Document with OpenAPI generated from zod schemas (e.g. `zod-to-openapi`).

## Implementation notes

- Reuse the same domain functions Server Actions call so internal and external paths stay consistent.
- Version from day one (`/api/v1/`).
- See [api-versioning](../devops/api-versioning.md).

## Related

- [Webhooks](webhooks.md), [Rate limiting](rate-limiting.md), [Shared validation](../frontend/shared-validation.md)
