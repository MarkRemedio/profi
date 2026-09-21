# Data-fetching consistency

**Status:** Partial
**Category:** Frontend

## What this is

A single, consistent approach to client-side data fetching across the app.

## Current state

- Mixed: TanStack Query for banking ([components/banking/banking-dashboard.tsx](../../../components/banking/banking-dashboard.tsx) via [lib/django/banking.ts](../../../lib/django/banking.ts)).
- Sales uses Server Actions + custom hooks ([components/sales/use-invoices.ts](../../../components/sales/use-invoices.ts), [components/sales/use-customers.ts](../../../components/sales/use-customers.ts)).
- Some pages mix server-side rendering with client query hooks.
- No shared cache-key conventions: [lib/query-keys.ts](../../../lib/query-keys.ts) exists but appears partially used.

## Why it's needed

- Inconsistent patterns mean cache invalidation bugs (e.g. posting an invoice but the list page still shows DRAFT).
- New devs guess at which approach to use per feature.

## Recommended approach

- Pick a default per resource type:
  - RSC + Server Actions for create/edit forms (no client cache needed).
  - TanStack Query for list pages that need re-fetch on focus, mutations, optimistic updates.
- Centralise every query key in [lib/query-keys.ts](../../../lib/query-keys.ts).
- After any Server Action mutation, call `revalidatePath` + matching `queryClient.invalidateQueries`.

## Implementation notes

- For Django-backed banking, keep TanStack Query — it makes sense for a separate HTTP backend.
- For Prisma-backed Server Actions, prefer RSC where possible.

## Related

- [Service / domain layer](../architecture/service-domain-layer.md), [Form layer](form-layer.md), [Error boundaries](error-boundaries.md)
