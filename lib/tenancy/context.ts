// lib/tenancy/context.ts
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

export type TenantRole = "owner" | "accountant" | "employee";

export type TenantContext = {
  userId: string;
  organizationId: string;
  role: TenantRole;
  mode: "scoped" | "system";
};

export class TenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant context missing for ${model}.${operation}: no scoped context and no explicit organization filter. ` +
        `Call this within a request (requireAccountingWorkspace) or wrap deliberate cross-org access in runAsSystem().`
    );
    this.name = "TenantContextError";
  }
}

export class TenantScopeConflictError extends Error {
  constructor(model: string, expected: string, got: string) {
    super(`Tenant scope conflict on ${model}: context org ${expected} but query specified ${got}.`);
    this.name = "TenantScopeConflictError";
  }
}

const globalForTenant = globalThis as unknown as {
  tenantStore?: AsyncLocalStorage<TenantContext>;
};

const store = globalForTenant.tenantStore ?? new AsyncLocalStorage<TenantContext>();

if (process.env.NODE_ENV !== "production") {
  globalForTenant.tenantStore = store;
}

export function getTenantContext(): TenantContext | undefined {
  return store.getStore();
}

// enterWith binds the context to the current async execution and its descendants —
// the correct primitive for "set once in requireAccountingWorkspace, valid for the
// rest of this request" (no callback wrapper available at that call site).
export function enterScopedContext(ctx: Omit<TenantContext, "mode">): void {
  store.enterWith({ ...ctx, mode: "scoped" });
}

export function runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
  return store.run(
    { userId: "system", organizationId: "system", role: "owner", mode: "system" },
    fn
  );
}
