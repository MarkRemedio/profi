# Audit-trail UI

**Status:** Partial
**Category:** Cross-cutting

## What this is

A persistent record of who-did-what + an in-app viewer so accountants and admins can review history.

## Current state

- `AuditEvent` model exists in [prisma/schema.prisma](../../../prisma/schema.prisma) with an `AuditAction` enum (`create | update | post | void | reverse | delete`).
- No global writer middleware — each Server Action would need to remember to log.
- No UI to browse audit events.

## Why it's needed

- Accounting standard: every posting, voiding, period close, user/role change must be auditable.
- HMRC MTD digital-links audit requires evidence trail.

## Recommended approach

- Add a `writeAudit({ orgId, userId, action, entityType, entityId, before, after })` helper called from the [domain layer](../architecture/service-domain-layer.md), not from Server Actions directly.
- New page at `app/(admin)/admin/audit/` with filters by entity, user, date.
- Diff view: `before` vs `after` JSON.

## Implementation notes

- Audit table is append-only — never UPDATE or DELETE.
- Index `(org_id, entity_type, entity_id, created_at)` for fast lookup.
- For posted ledger entries: prefer recording a reversing journal rather than mutating, so audit + ledger agree.

## Related

- [Reporting periods](../data-models/reporting-periods.md), [RBAC](rbac.md), [Observability](observability.md)
