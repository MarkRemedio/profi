# Tenant Isolation Hardening (App-level guarantee + DB-enforced RLS)

**Status:** Design approved — ready for implementation planning (Phase 1)
**Date:** 2026-06-29
**Source finding:** S4 (Critical) in [`../../AUDIT-REPORT.md`](../../AUDIT-REPORT.md) / [`../../AUDIT-REPORT-SCOPED.md`](../../AUDIT-REPORT-SCOPED.md)
**Tracker:** [`../../REMEDIATION-CHECKLIST.md`](../../REMEDIATION-CHECKLIST.md)

---

## 1. Problem

The app is multi-tenant (org = `Organization`). Tenant isolation today depends **entirely** on each Prisma query hand-filtering by `organizationId`:

- Prisma connects as the Supabase pooler **superuser** (`postgres.…`), which **bypasses Row Level Security**.
- RLS policies exist in migrations but use `auth.uid()`, which a Prisma connection never carries — so they are both bypassed (owner) and unsatisfiable (no auth context).
- There is **no `FORCE ROW LEVEL SECURITY`**; `banking_*` and `pos_*` tables have no RLS at all.

Consequence: a single forgotten `where: { organizationId }` is a directly exploitable cross-tenant breach (as found in Wave 1: S2 invoice IDOR, S3 audit-trail leak). Wave 1 fixed the known gaps manually, but nothing prevents the *next* one.

### Environment constraints (confirmed)

- Connection: `aws-1-ap-southeast-2.pooler.supabase.com:6543` with `pgbouncer=true` → **transaction-mode pooling**. Session-level `SET` does not persist across queries; only `SET LOCAL` inside an explicit transaction is reliable.
- Driver: `@prisma/adapter-pg` (`PrismaPg`), single global `PrismaClient` ([lib/prisma.ts](../../../lib/prisma.ts)).
- Scale: ~290 `prisma.*`/`tx.*` call sites across `lib/` and `app/`. Per-call manual wrapping is infeasible → a **central mechanism** is required.

## 2. Goals & non-goals

**Goals**
- Make it structurally impossible to forget tenant scoping on Prisma-model access (Phase 1).
- Add database-enforced isolation as defense-in-depth, covering even raw SQL (Phase 2).
- Preserve the existing admin-impersonation behavior and legitimate cross-org admin/onboarding flows.

**Non-goals**
- Rewriting the 290 existing explicit filters (they stay — see §4.4).
- Bringing POS/Payroll back into scope (descoped); their tables are noted only for Phase 2 policy coverage.
- Secret rotation itself (manual, dashboard-side — see §6).

## 3. Foundation — shared tenant context (both phases)

A single `AsyncLocalStorage<TenantContext>` is the one source of truth for who the caller is and which org they act in.

```ts
// lib/tenancy/context.ts
type TenantContext = {
  userId: string;
  organizationId: string;          // already-resolved org (impersonation handled upstream)
  role: "owner" | "accountant" | "employee";
  mode: "scoped" | "system";       // "system" = deliberately unscoped
};

export const tenantStore = new AsyncLocalStorage<TenantContext>();
export function getTenantContext(): TenantContext | undefined;
export function runAsSystem<T>(fn: () => Promise<T>): Promise<T>;  // sets mode: "system"
```

- `requireAccountingWorkspace()` ([lib/accounting/dal.ts](../../../lib/accounting/dal.ts)) already resolves the effective org **including admin impersonation**. It becomes the single place that **enters the ALS scope**, wrapping the remainder of the request in `tenantStore.run(ctx, …)`. Because it is already called at the top of every accounting server action and page, coverage is near-free.
- `runAsSystem(fn)` is the **explicit, greppable escape hatch** for deliberate cross-org code: the `/admin` panel (lists all orgs) and onboarding (creates the first org/membership before any context exists).
- Because the context stores the *already-resolved* org, the impersonation logic stays in `dal.ts` and the enforcement layer below stays uniform and dumb.

## 4. Phase 1 — app-level guarantee (extension + CI guard) — IMPLEMENT FIRST

### 4.1 Org-scoped model registry

One explicit list is the spine of enforcement.

```ts
// lib/tenancy/scoped-models.ts
export const ORG_SCOPED = {
  ChartAccount: "organizationId", Contact: "organizationId",
  Journal: "organizationId", JournalLine: "organizationId",
  Invoice: "organizationId", InvoiceLine: "organizationId",
  Bill: "organizationId", BillLine: "organizationId",
  AuditEvent: "organizationId", Employee: "organizationId",
  PayrollRun: "organizationId", PayrollRunEmployee: "organizationId",
  Timesheet: "organizationId", /* …every Prisma model carrying an org FK… */
} as const;
```

**Deliberately excluded:** `Organization` (keyed by `id`, scoped by `id === ctx.organizationId` where relevant), `TaxRate` / `AccountTemplate` (global platform data), all Supabase `auth_*` models, and raw snake_case tables (`banking_*`, `pos_*` — not Prisma-model access). The exclusion list is asserted complete by a reflection test (§4.3).

### 4.2 Prisma Client extension

In [lib/prisma.ts](../../../lib/prisma.ts), wrap the client with `$extends({ query: { $allModels: { async $allOperations({ model, operation, args, query }) } } })`:

- **Filter ops** (`findFirst`, `findMany`, `findUnique`*, `update`, `updateMany`, `delete`, `deleteMany`, `count`, `aggregate`, `groupBy`): inject `args.where.organizationId = ctx.organizationId`.
  - `findUnique` on an org-scoped model is rewritten to `findFirst` (since `where` on a unique op only accepts unique fields) — or the call site uses the existing composite unique; documented in the plan.
- **Create ops** (`create`, `createMany`, `upsert`): inject the org field into `data` (and into `where` + `create`/`update` for `upsert`).
- **Scoped context present:** set the org field to `ctx.organizationId`; if an explicit value is already present and differs → throw `TenantScopeConflictError` (catches client-supplied-org / IDOR bugs).
- **Fail-closed (no context):** model ∈ `ORG_SCOPED`, no scoped context, and **no explicit org field already in `args`** → **throw** `TenantContextError`. If an explicit org IS present (tests, scripts, the retained manual filters), pass through and trust it. A forgotten scope — no context *and* no filter — becomes a loud error, never a silent all-tenant query.
- **Pass-through:** `system` mode (`runAsSystem`), and any model not in the registry.

### 4.3 CI guard (covers what the extension cannot)

1. **Fail-closed runtime test** — for every model in `ORG_SCOPED`, invoke a representative op with no context and assert it throws.
2. **Registry-completeness reflection test** — walk `Prisma.dmmf.datamodel.models`; any model exposing an `organizationId` field that is absent from `ORG_SCOPED` (and not in an explicit `KNOWN_EXCLUDED` set) fails CI. This stops "added a model, forgot to register it."
3. **Raw-query lint test** — scan source for `$queryRaw`/`$queryRawUnsafe`/`$executeRaw*`; each must reference `org_id`/`organizationId` **or** carry an inline `// tenancy:safe: <reason>` annotation. A bare `// tenancy:safe` with no reason is rejected. This is the only guard for raw SQL until Phase 2.

### 4.4 Explicit filters are retained

The ~290 existing `where: { organizationId }` filters (incl. Wave 1 fixes) **stay**. Rationale:
- Second enforcement layer that survives the extension being bypassed (raw client, future base-client usage, interactive-transaction edge cases).
- Self-documenting scoping intent at the call site.
- Removing them is churn + risk for zero functional gain.

The extension is the guarantee you can't forget; the manual filters are the layer that survives the guarantee being bypassed.

### 4.5 Phase 1 coverage gap (documented)

The extension only intercepts Prisma-model calls. Raw SQL (reports, banking DAL, period-close) and the snake_case `banking_*`/`pos_*` tables are **not** covered by §4.2 — they are caught by the raw-query lint (§4.3.3) and ultimately closed by Phase 2 DB-level RLS.

Additionally, single-record `update` and `delete` operations pass through **unscoped** in Phase 1: Prisma's `where` for these ops accepts only unique-index fields, so injecting `organizationId` (a non-unique field) would cause a runtime error. Scoping for these ops is provided by: (a) the retained explicit `where: { organizationId }` filters at each call site, (b) the ownership-check-before-write pattern (`findFirstOrThrow({ where: { id, organizationId } })` before every mutation), and (c) Phase 2 DB-level RLS. `upsert` is safe: it requires the org field to appear in `where` (either as a flat `@unique organizationId` or within a composite `@@unique` key); omitting it or keying by a non-org unique field throws at the extension layer.

## 5. Phase 2 — DB-enforced RLS (designed now, implemented later)

- **Dedicated non-owner role** `app_rls` for Prisma. Tenant context is set per-transaction via `SET LOCAL app.current_org_id = ctx.organizationId`. The Phase-1 extension already wraps scoped ops; in Phase 2 it additionally opens a transaction and emits the `SET LOCAL`. `system` mode uses a separate privileged path/role.
- **Policy rewrite:** replace `auth.uid()`-based policies with `current_setting('app.current_org_id', true)::uuid = org_id`. Add `FORCE ROW LEVEL SECURITY` so the table owner is also subject. Extend policies to `banking_*` (and `pos_*` if it returns).
- **Why it complements Phase 1:** RLS sits below Prisma, covering the `$queryRaw` code the extension can't reach — closing the §4.5 gap.
- **Rollout safety:** ship behind a flag; validate in staging with the **full test suite** running as `app_rls`. A missing `SET LOCAL` returns **zero rows (not an error)**, so the passing test suite is the safety net against silent breakage.

## 6. Prerequisite — secret rotation (S4a, manual)

Out of band, dashboard-side, the user rotates: `SUPABASE_SERVICE_ROLE_KEY`, DB password (`DATABASE_URL`/`DIRECT_URL`), `STRIPE_SECRET_KEY`, `IMPERSONATION_SECRET`. Recorded here as a prerequisite/checklist item, not implemented in code.

## 7. Testing strategy

- Phase 1: the three CI-guard tests (§4.3) + targeted unit tests for the extension (injection on each op class; fail-closed; `system` pass-through; impersonation context yields the impersonated org).
- Regression: full `pnpm test` + `pnpm typecheck` must stay green (currently 71/71).
- Phase 2: full suite executed under the `app_rls` role in staging.

## 8. Success criteria

1. Any new org-scoped Prisma query is auto-scoped; omitting context throws rather than leaking.
2. Adding an org model without registering it fails CI.
3. Every raw query is either org-filtered or annotated with a reason.
4. Admin/onboarding cross-org flows work via `runAsSystem` and nothing else.
5. (Phase 2) With `FORCE RLS` + `app_rls`, a query missing tenant context returns no cross-tenant rows at the DB level; full suite green in staging.

## 9. Out of scope

Removing existing explicit filters; POS/Payroll re-scoping; secret rotation mechanics; non-tenant performance work (dashboard aggregation, pagination — tracked separately in the checklist).
