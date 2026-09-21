// lib/tenancy/scope.ts
import "server-only";
import { ORG_SCOPED } from "./scoped-models";
import { TenantContext, TenantContextError, TenantScopeConflictError } from "./context";

// Ops that accept an arbitrary `where` filter -> safe to inject organizationId.
const INJECT_FILTER_OPS = new Set([
  "findFirst", "findFirstOrThrow", "findMany",
  "updateMany", "updateManyAndReturn", "deleteMany", "count", "aggregate", "groupBy",
]);
// Single-record reads by unique key: cannot add a non-unique field to `where`.
// Force callers to use findFirst (which IS injectable).
const UNIQUE_THROW_OPS = new Set(["findUnique", "findUniqueOrThrow"]);
// Single-record writes by unique key (update/delete): Prisma's `where` accepts
// only unique selectors, so organizationId cannot be injected without a runtime
// error. These pass through UNSCOPED. Phase 1 relies on the codebase's
// findFirstOrThrow({ id, organizationId }) ownership-check-before-write pattern,
// the retained explicit filters, and Phase 2 DB RLS. Documented gap (spec §4.5).
const UNIQUE_PASSTHROUGH_OPS = new Set(["update", "delete"]);

function conflictOrSet(
  container: Record<string, any>,
  field: string,
  ctx: TenantContext | undefined,
  model: string
): boolean {
  const existing = container[field];
  if (ctx?.mode === "scoped") {
    if (existing != null && existing !== ctx.organizationId) {
      throw new TenantScopeConflictError(model, ctx.organizationId, String(existing));
    }
    container[field] = ctx.organizationId;
    return true;
  }
  return existing != null;
}

// Whether an upsert `where` references the org field (flat or nested composite
// key), checking up to 2 levels deep. Returns "match" | "conflict" | "absent".
function whereOrgState(
  where: any,
  field: string,
  expected: string | undefined
): "match" | "conflict" | "absent" {
  let sawOrg = false;
  const CONFLICT = Symbol("conflict");
  const visit = (obj: any, depth: number) => {
    if (!obj || typeof obj !== "object" || depth > 2) return;
    for (const [k, v] of Object.entries(obj)) {
      if (k === field) {
        sawOrg = true;
        if (expected != null && v != null && v !== expected) throw CONFLICT;
      } else if (v && typeof v === "object") {
        visit(v, depth + 1);
      }
    }
  };
  try {
    visit(where, 0);
  } catch (e) {
    if (e === CONFLICT) return "conflict";
    throw e;
  }
  return sawOrg ? "match" : "absent";
}

export function applyTenantScope(
  model: string,
  operation: string,
  args: any,
  ctx: TenantContext | undefined
): any {
  const field = ORG_SCOPED[model];
  if (!field) return args;                 // not org-scoped
  if (ctx?.mode === "system") return args; // deliberate cross-org

  if (UNIQUE_THROW_OPS.has(operation)) {
    throw new Error(
      `${model}.${operation} is not tenant-safe (where accepts only unique fields). Use findFirst/findFirstOrThrow with { ${field} } instead.`
    );
  }
  if (UNIQUE_PASSTHROUGH_OPS.has(operation)) return args;

  args = args ?? {};

  if (INJECT_FILTER_OPS.has(operation)) {
    args.where = args.where ?? {};
    if (!conflictOrSet(args.where, field, ctx, model)) throw new TenantContextError(model, operation);
    return args;
  }

  if (operation === "create") {
    args.data = args.data ?? {};
    if (!conflictOrSet(args.data, field, ctx, model)) throw new TenantContextError(model, operation);
    return args;
  }

  if (operation === "createMany" || operation === "createManyAndReturn") {
    const rows = Array.isArray(args.data) ? args.data : [args.data];
    for (const row of rows) {
      if (!conflictOrSet(row, field, ctx, model)) throw new TenantContextError(model, operation);
    }
    return args;
  }

  if (operation === "upsert") {
    args.where = args.where ?? {};
    args.create = args.create ?? {};
    args.update = args.update ?? {};
    const state = whereOrgState(args.where, field, ctx?.mode === "scoped" ? ctx.organizationId : undefined);
    if (state === "conflict") {
      throw new TenantScopeConflictError(model, String(ctx?.organizationId), "different org in upsert where");
    }
    if (state === "absent") {
      throw new Error(
        `${model}.upsert must key on an org-inclusive unique constraint: include ${field} in \`where\` (a flat @unique ${field} or a composite @@unique([${field}, ...])).`
      );
    }
    if (!conflictOrSet(args.create, field, ctx, model)) {
      throw new TenantContextError(model, "upsert");
    }
    conflictOrSet(args.update, field, ctx, model);
    return args;
  }

  // Unknown op on an org-scoped model: always fail-closed regardless of context.
  // If a legitimate Prisma op reaches here, add it explicitly to the correct set above.
  throw new Error(
    `${model}.${operation} is not handled by the tenancy extension. Add it explicitly to lib/tenancy/scope.ts.`
  );
}
