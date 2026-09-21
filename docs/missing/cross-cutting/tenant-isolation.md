# Tenant isolation (RLS)

**Status:** Partial
**Category:** Cross-cutting

## What this is

Defence-in-depth so that even a buggy query cannot return another tenant's rows: Postgres Row Level Security policies on every org-scoped table.

## Current state

- Every org-owned table has `org_id` indexed in [prisma/schema.prisma](../../../prisma/schema.prisma) — good.
- Scoping is enforced _only in application code_ ([lib/accounting/dal.ts](../../../lib/accounting/dal.ts)). A missing `where: { organizationId }` would leak data.
- No RLS policies on the Postgres side.
- No per-request `SET app.current_org_id = ...` pattern.

## Why it's needed

- Single biggest correctness/security risk in any multi-tenant SaaS.
- Auditors and enterprise customers explicitly check for RLS.

## Recommended approach

- Enable RLS on every org-scoped table.
- Define a policy: `USING (org_id = current_setting('app.current_org_id')::uuid)`.
- Wrap every Prisma transaction with a `SET LOCAL app.current_org_id = $1` at the start.
- A migration script can generate these policies for all tables that have `org_id`.

## Implementation notes

- Test by running queries from a session with no org_id set — should see zero rows.
- Service-role bypass for migrations and admin tasks; never use it from request paths.

## Related

- [RBAC](rbac.md), [Audit-trail UI](audit-trail-ui.md), [Data migrations](../devops/data-migrations.md)
