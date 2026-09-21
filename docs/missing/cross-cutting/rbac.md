# RBAC enforcement

**Status:** Partial
**Category:** Cross-cutting

## What this is

Beyond the role enum — actual fine-grained permission checks enforced consistently on every Server Action, API route, and (eventually) UI element.

## Current state

- `MemberRole` enum: `OWNER | ACCOUNTANT | EMPLOYEE` ([prisma/schema.prisma:9](../../../prisma/schema.prisma#L9)).
- [lib/accounting/dal.ts](../../../lib/accounting/dal.ts) reads role but enforcement is ad-hoc per action.
- No permission middleware, no policy table, no UI hint of "you don't have permission".

## Why it's needed

- A clerk who can record bills must not be able to close periods or submit VAT.
- Auditors need read-only access without create/update.
- Owners need delegation: invite a bookkeeper without giving them payroll.

## Recommended approach

- Move from coarse roles to a `Permission` enum + `RolePermission` map (still server-side).
- Wrap Server Actions with a `requirePermission('invoice.post')` helper that throws on failure.
- Surface permission errors with friendly messages, not generic 500s.

## Implementation notes

- Audit every permission denial (security event).
- A user can have different permissions in different orgs (`UserRole` already supports this).
- Consider a `READ_ONLY` role for accountant access.

## Related

- [Audit-trail UI](audit-trail-ui.md), [MFA / SSO](mfa-sso.md), [Tenant isolation](tenant-isolation.md), [Service / domain layer](../architecture/service-domain-layer.md)
