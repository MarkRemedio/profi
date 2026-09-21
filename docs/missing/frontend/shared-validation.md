# Shared client+server validation (zod)

**Status:** Missing
**Category:** Frontend

## What this is

A single set of zod schemas used by:

- Client forms (via react-hook-form resolver)
- Server Actions (input parsing)
- The (future) HTTP API (request validation + OpenAPI generation)

## Current state

- No `zod` in `package.json`.
- Input validation in Server Actions is hand-coded or absent — see [app/sales/invoices/actions.ts](../../../app/sales/invoices/actions.ts) and [app/purchases/actions.ts](../../../app/purchases/actions.ts).
- No shared schemas; client and server can drift.

## Why it's needed

- Without a shared contract, server-side rejections produce mystery errors on the client.
- Schemas are also the cleanest source for OpenAPI generation later.

## Recommended approach

- `lib/schemas/` per aggregate (`invoice.ts`, `bill.ts`, etc.) exporting input + output zod schemas.
- Server Action `parse()` at the entrance; throw `ZodError` and surface field errors back to the form.
- Use `zod-to-openapi` when the HTTP API arrives.

## Implementation notes

- Money fields: schema accepts string from the form, transforms to `BigInt` minor units server-side.
- Currency code: enum schema matching `CurrencyCode` in [prisma/schema.prisma](../../../prisma/schema.prisma).

## Related

- [Form layer](form-layer.md), [HTTP API layer](../architecture/http-api-layer.md), [API versioning](../devops/api-versioning.md)
