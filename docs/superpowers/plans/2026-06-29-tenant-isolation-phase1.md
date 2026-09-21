# Tenant Isolation — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it structurally impossible to forget tenant scoping on Prisma-model access, via an AsyncLocalStorage tenant context + a fail-closed Prisma client extension + CI guards.

**Architecture:** A single `AsyncLocalStorage<TenantContext>` is entered once per request inside `requireAccountingWorkspace()`. A Prisma client extension reads that context and auto-injects `organizationId` into org-scoped model queries; with no context and no explicit org filter it throws. Three CI tests guard the registry and raw SQL. The ~290 existing explicit filters stay as a second layer.

**Tech Stack:** TypeScript, Next.js 16 (server actions/RSC), Prisma 7 (`@prisma/adapter-pg`), Supabase auth, Vitest 4, Node `async_hooks`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-29-tenant-isolation-rls-design.md`. This plan implements **Phase 1 only**.
- This is a non-standard Next.js (per `AGENTS.md`) — consult `node_modules/next/dist/docs/` before any Next-specific code.
- Money is BigInt minor units; do not introduce floats. (Not central here, but applies repo-wide.)
- Do NOT auto-commit on the user's behalf as part of normal work — the user commits manually. The `git commit` steps below are written for completeness; **the executor must pause and let the user commit** unless the user explicitly opts into auto-commit for this run.
- Keep all existing explicit `where: { organizationId }` filters — do not remove them.
- Verification gate for every task: `pnpm typecheck` exits 0 and `pnpm test` stays green (baseline 71/71).
- Connection is pgbouncer transaction-mode; nothing in Phase 1 may rely on session-level `SET`.

### Refined fail-closed rule (clarifies spec §4.2)

`applyTenantScope(model, operation, args, ctx)` behaves as:
1. `model` ∉ `ORG_SCOPED` → return `args` unchanged.
2. `ctx?.mode === "system"` → return `args` unchanged.
3. `ctx?.mode === "scoped"` → set the org field to `ctx.organizationId` in the relevant location (`where`/`data`). If an explicit value is already present and differs → throw `TenantScopeConflictError` (catches client-supplied-org bugs/IDOR).
4. `ctx` absent:
   - if the org field is already explicitly present in `args` (`where` or `data`) → return unchanged (trusted explicit path: tests, scripts, system jobs).
   - else → throw `TenantContextError` (the real "forgot everything" bug).

This preserves the spec's intent ("a forgotten scope is a loud error") while keeping the 290 explicit-filter call sites and existing tests working without a request context.

---

## File structure

- Create `lib/tenancy/context.ts` — ALS store, `getTenantContext`, `enterScopedContext`, `runAsSystem`, error classes.
- Create `lib/tenancy/scoped-models.ts` — `ORG_SCOPED` registry + `KNOWN_EXCLUDED`.
- Create `lib/tenancy/scope.ts` — pure `applyTenantScope` (the testable core).
- Create `lib/tenancy/extension.ts` — `tenancyExtension` (`Prisma.defineExtension`) calling `applyTenantScope`.
- Modify `lib/prisma.ts` — apply `tenancyExtension` to the client.
- Modify `lib/accounting/dal.ts` — `requireAccountingWorkspace` enters scoped context.
- Modify `lib/banking/dal.ts:61` — convert `chartAccount.findUnique` → `findFirst`.
- Create tests under `tests/tenancy/`.

---

## Task 1: Tenant context module

**Files:**
- Create: `lib/tenancy/context.ts`
- Test: `tests/tenancy/context.test.ts`

**Interfaces:**
- Produces:
  - `type TenantContext = { userId: string; organizationId: string; role: "owner"|"accountant"|"employee"; mode: "scoped"|"system" }`
  - `getTenantContext(): TenantContext | undefined`
  - `enterScopedContext(ctx: Omit<TenantContext,"mode">): void`  // uses ALS `enterWith`, sets mode "scoped"
  - `runAsSystem<T>(fn: () => Promise<T>): Promise<T>`
  - `class TenantContextError extends Error`
  - `class TenantScopeConflictError extends Error`

- [ ] **Step 1: Write the failing test**

```ts
// tests/tenancy/context.test.ts
import { describe, it, expect } from "vitest";
import {
  getTenantContext, enterScopedContext, runAsSystem,
} from "@/lib/tenancy/context";

describe("tenant context", () => {
  it("returns undefined when no context is entered", () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it("exposes a scoped context after enterScopedContext within the same async flow", async () => {
    await runAsSystem(async () => {}); // sanity: callable
    await new Promise<void>((resolve) => {
      // run inside an isolated async scope so enterWith doesn't leak the test runner
      void (async () => {
        enterScopedContext({ userId: "u1", organizationId: "org1", role: "owner" });
        const ctx = getTenantContext();
        expect(ctx).toEqual({ userId: "u1", organizationId: "org1", role: "owner", mode: "scoped" });
        resolve();
      })();
    });
  });

  it("runAsSystem provides a system-mode context only inside the callback", async () => {
    const inside = await runAsSystem(async () => getTenantContext());
    expect(inside?.mode).toBe("system");
    expect(getTenantContext()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tenancy/context.test.ts`
Expected: FAIL — cannot resolve `@/lib/tenancy/context`.

- [ ] **Step 3: Write minimal implementation**

```ts
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

const store = new AsyncLocalStorage<TenantContext>();

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
```

> Note for `server-only`: tests import this module; the repo already shims `server-only` (see `tests/shims/server-only.ts` and `vitest.config.ts`). Confirm the shim is active; if the import errors in tests, the alias is already configured for other DAL tests, so no change should be needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tenancy/context.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tenancy/context.ts tests/tenancy/context.test.ts
git commit -m "feat(tenancy): add AsyncLocalStorage tenant context"
```

---

## Task 2: Org-scoped model registry + completeness guard

**Files:**
- Create: `lib/tenancy/scoped-models.ts`
- Test: `tests/tenancy/registry-completeness.test.ts`

**Interfaces:**
- Produces:
  - `const ORG_SCOPED: Record<string, string>` — Prisma model name → org field name.
  - `const KNOWN_EXCLUDED: Set<string>` — models intentionally not org-scoped.

- [ ] **Step 1: Write the failing test (dmmf reflection)**

```ts
// tests/tenancy/registry-completeness.test.ts
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { ORG_SCOPED, KNOWN_EXCLUDED } from "@/lib/tenancy/scoped-models";

describe("ORG_SCOPED registry completeness", () => {
  it("registers every Prisma model that has an organizationId field", () => {
    const offenders: string[] = [];
    for (const model of Prisma.dmmf.datamodel.models) {
      const hasOrg = model.fields.some((f) => f.name === "organizationId");
      if (hasOrg && !(model.name in ORG_SCOPED) && !KNOWN_EXCLUDED.has(model.name)) {
        offenders.push(model.name);
      }
    }
    expect(offenders, `Models with organizationId not in ORG_SCOPED or KNOWN_EXCLUDED`).toEqual([]);
  });

  it("every ORG_SCOPED field actually exists on its model", () => {
    const bad: string[] = [];
    for (const [modelName, field] of Object.entries(ORG_SCOPED)) {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
      if (!model || !model.fields.some((f) => f.name === field)) bad.push(`${modelName}.${field}`);
    }
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tenancy/registry-completeness.test.ts`
Expected: FAIL — cannot resolve `@/lib/tenancy/scoped-models`.

- [ ] **Step 3: Write minimal implementation**

Populate `ORG_SCOPED` from the schema. Start from the models known to carry `organizationId` (Prisma camelCase models only — NOT the snake_case `banking_*`/`pos_*` tables, which use `org_id` and are reached via raw SQL). Then run the test; it will name any you missed — add them until green.

```ts
// lib/tenancy/scoped-models.ts
export const ORG_SCOPED: Record<string, string> = {
  ChartAccount: "organizationId",
  Contact: "organizationId",
  TaxRate: "organizationId", // include ONLY if schema gives TaxRate an organizationId; otherwise leave in KNOWN_EXCLUDED
  Journal: "organizationId",
  JournalLine: "organizationId",
  Invoice: "organizationId",
  InvoiceLine: "organizationId",
  Bill: "organizationId",
  BillLine: "organizationId",
  AuditEvent: "organizationId",
  PayrollSettings: "organizationId",
  Employee: "organizationId",
  PayrollSchedule: "organizationId",
  PayrollRun: "organizationId",
  PayrollRunEmployee: "organizationId",
  Timesheet: "organizationId",
  TimesheetEntry: "organizationId",
  UserRole: "organizationId",
};

// Intentionally NOT org-scoped (the completeness test will hold us honest):
export const KNOWN_EXCLUDED = new Set<string>([
  "Organization",      // keyed by id; scoped by id where relevant
  "AccountTemplate",   // global platform data
  // Supabase auth_* / oauth_* / mfa_* / sso_* / saml_* etc. and Django/legacy
  // tables have no organizationId, so they won't appear in the reflection at all.
]);
```

> The exact membership is **determined by the test**, not by guesswork: run it, read the offenders, and either register (with the real field name) or add to `KNOWN_EXCLUDED` with a code comment justifying the exclusion. Verify `Invoice.organizationId` etc. against `prisma/schema.prisma`. If `TaxRate` has no `organizationId` in the schema (audit says it's global), remove it from `ORG_SCOPED` here.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tenancy/registry-completeness.test.ts`
Expected: PASS (2 tests). If the first test lists offenders, register them and re-run.

- [ ] **Step 5: Commit**

```bash
git add lib/tenancy/scoped-models.ts tests/tenancy/registry-completeness.test.ts
git commit -m "feat(tenancy): add org-scoped model registry with dmmf completeness guard"
```

---

## Task 3: Pure `applyTenantScope` core

**Files:**
- Create: `lib/tenancy/scope.ts`
- Test: `tests/tenancy/scope.test.ts`

**Interfaces:**
- Consumes: `ORG_SCOPED` (Task 2); `TenantContext`, `TenantContextError`, `TenantScopeConflictError` (Task 1).
- Produces: `applyTenantScope(model: string, operation: string, args: any, ctx: TenantContext | undefined): any` — returns (possibly mutated) args or throws.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/tenancy/scope.test.ts
import { describe, it, expect } from "vitest";
import { applyTenantScope } from "@/lib/tenancy/scope";
import { TenantContextError, TenantScopeConflictError, type TenantContext } from "@/lib/tenancy/context";

const scoped: TenantContext = { userId: "u", organizationId: "ORG", role: "owner", mode: "scoped" };
const system: TenantContext = { userId: "system", organizationId: "system", role: "owner", mode: "system" };

describe("applyTenantScope", () => {
  it("passes through models not in the registry", () => {
    const args = { where: { id: "x" } };
    expect(applyTenantScope("Organization", "findFirst", args, scoped)).toBe(args);
  });

  it("passes through in system mode", () => {
    const args = { where: { id: "x" } };
    expect(applyTenantScope("Invoice", "findMany", args, system)).toBe(args);
  });

  it("injects organizationId into where on filter ops (scoped)", () => {
    const out = applyTenantScope("Invoice", "findMany", { where: { status: "DRAFT" } }, scoped);
    expect(out.where).toMatchObject({ status: "DRAFT", organizationId: "ORG" });
  });

  it("injects organizationId when where is absent", () => {
    const out = applyTenantScope("Invoice", "count", {}, scoped);
    expect(out.where).toEqual({ organizationId: "ORG" });
  });

  it("injects organizationId into data on create (scoped)", () => {
    const out = applyTenantScope("Invoice", "create", { data: { invoiceNo: "INV-1" } }, scoped);
    expect(out.data).toMatchObject({ invoiceNo: "INV-1", organizationId: "ORG" });
  });

  it("injects into each row of createMany", () => {
    const out = applyTenantScope("Invoice", "createMany", { data: [{ invoiceNo: "A" }, { invoiceNo: "B" }] }, scoped);
    expect(out.data).toEqual([
      { invoiceNo: "A", organizationId: "ORG" },
      { invoiceNo: "B", organizationId: "ORG" },
    ]);
  });

  it("throws TenantScopeConflictError when scoped context disagrees with an explicit org", () => {
    expect(() =>
      applyTenantScope("Invoice", "findMany", { where: { organizationId: "OTHER" } }, scoped)
    ).toThrow(TenantScopeConflictError);
  });

  it("passes through when no context but org is explicit (trusted path)", () => {
    const args = { where: { organizationId: "ORG", id: "x" } };
    expect(applyTenantScope("Invoice", "findFirst", args, undefined)).toBe(args);
  });

  it("throws TenantContextError when no context and no explicit org", () => {
    expect(() => applyTenantScope("Invoice", "findMany", { where: { status: "DRAFT" } }, undefined))
      .toThrow(TenantContextError);
  });

  it("throws on findUnique for an org-scoped model (use findFirst)", () => {
    expect(() => applyTenantScope("Invoice", "findUnique", { where: { id: "x" } }, scoped))
      .toThrow(/findFirst/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tenancy/scope.test.ts`
Expected: FAIL — cannot resolve `@/lib/tenancy/scope`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/tenancy/scope.ts
import "server-only";
import { ORG_SCOPED } from "./scoped-models";
import { TenantContext, TenantContextError, TenantScopeConflictError } from "./context";

const FILTER_OPS = new Set([
  "findFirst", "findFirstOrThrow", "findMany",
  "update", "updateMany", "delete", "deleteMany",
  "count", "aggregate", "groupBy",
]);
const CREATE_OPS = new Set(["create", "createMany", "upsert"]);
const UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow"]);

export function applyTenantScope(
  model: string,
  operation: string,
  args: any,
  ctx: TenantContext | undefined
): any {
  const field = ORG_SCOPED[model];
  if (!field) return args;                 // not org-scoped
  if (ctx?.mode === "system") return args; // deliberate cross-org

  if (UNIQUE_OPS.has(operation)) {
    throw new Error(
      `${model}.${operation} is not tenant-safe (where accepts only unique fields). Use findFirst/findFirstOrThrow with { ${field} } instead.`
    );
  }

  args = args ?? {};

  const setOrgOn = (container: Record<string, any>) => {
    const existing = container[field];
    if (ctx?.mode === "scoped") {
      if (existing != null && existing !== ctx.organizationId) {
        throw new TenantScopeConflictError(model, ctx.organizationId, String(existing));
      }
      container[field] = ctx.organizationId;
      return true;
    }
    // no context: trusted only if explicit org already present
    return existing != null;
  };

  if (FILTER_OPS.has(operation)) {
    args.where = args.where ?? {};
    if (!setOrgOn(args.where)) throw new TenantContextError(model, operation);
    // upsert also has a where (handled below via CREATE path too)
    return args;
  }

  if (CREATE_OPS.has(operation)) {
    if (operation === "createMany") {
      const rows = Array.isArray(args.data) ? args.data : [args.data];
      for (const row of rows) {
        if (ctx?.mode === "scoped") {
          if (row[field] != null && row[field] !== ctx.organizationId)
            throw new TenantScopeConflictError(model, ctx.organizationId, String(row[field]));
          row[field] = ctx.organizationId;
        } else if (row[field] == null) {
          throw new TenantContextError(model, operation);
        }
      }
      return args;
    }
    if (operation === "upsert") {
      args.where = args.where ?? {};
      // upsert.where uses unique fields; rely on create/update data for org safety
      args.create = args.create ?? {};
      args.update = args.update ?? {};
      const okCreate = setOrgOn(args.create);
      // update may legitimately not change org; only enforce create + where presence
      if (ctx?.mode !== "scoped" && !okCreate) throw new TenantContextError(model, operation);
      return args;
    }
    // create
    args.data = args.data ?? {};
    if (!setOrgOn(args.data)) throw new TenantContextError(model, operation);
    return args;
  }

  // Unknown op on an org-scoped model: be safe, require context.
  if (!ctx) throw new TenantContextError(model, operation);
  return args;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/tenancy/scope.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tenancy/scope.ts tests/tenancy/scope.test.ts
git commit -m "feat(tenancy): add pure applyTenantScope core with tests"
```

---

## Task 4: Prisma extension + client wiring

**Files:**
- Create: `lib/tenancy/extension.ts`
- Modify: `lib/prisma.ts`
- Modify: `lib/banking/dal.ts:61` (convert `chartAccount.findUnique` → `findFirst`)
- Test: `tests/tenancy/extension.test.ts`

**Interfaces:**
- Consumes: `applyTenantScope` (Task 3), `getTenantContext` (Task 1).
- Produces: `tenancyExtension` (a `Prisma.defineExtension` value); `prisma` (extended client) from `lib/prisma.ts`.

- [ ] **Step 1: Write the failing test (fail-closed needs no DB — it throws before querying)**

```ts
// tests/tenancy/extension.test.ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import { TenantContextError } from "@/lib/tenancy/context";

describe("tenancy extension (fail-closed, no DB hit)", () => {
  it("rejects an org-scoped query with no context and no explicit org", async () => {
    await expect(prisma.invoice.findMany({ where: { status: "DRAFT" } }))
      .rejects.toThrow(TenantContextError);
  });

  it("allows a non-org model through (Organization) — reaches DB", async () => {
    // system mode avoids needing a real org; just assert it doesn't throw the tenancy error
    await runAsSystem(async () => {
      await expect(prisma.organization.findMany({ take: 0 })).resolves.toBeDefined();
    });
  });
});
```

> The first test must throw **before** any DB round-trip, so it passes even without DB connectivity. The second needs the test DB the existing suite already uses.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/tenancy/extension.test.ts`
Expected: FAIL — extension not wired; `findMany` does not throw `TenantContextError`.

- [ ] **Step 3: Implement the extension and wire it**

```ts
// lib/tenancy/extension.ts
import "server-only";
import { Prisma } from "@prisma/client";
import { getTenantContext } from "./context";
import { applyTenantScope } from "./scope";

export const tenancyExtension = Prisma.defineExtension({
  name: "tenancy",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const scoped = applyTenantScope(model, operation, args as any, getTenantContext());
        return query(scoped);
      },
    },
  },
});
```

Modify `lib/prisma.ts` to apply it (extension returns a new client; keep the global-cache pattern):

```ts
// lib/prisma.ts
import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { tenancyExtension } from "@/lib/tenancy/extension";

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
};

function getConnectionString() {
  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!connectionString) throw new Error("DATABASE_URL or DIRECT_URL is required for Prisma.");
  return connectionString;
}

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: getConnectionString() }),
  }).$extends(tenancyExtension);
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

Convert the one in-scope `findUnique` on an org-scoped model — `lib/banking/dal.ts:61`:

```ts
// before
const coa = await db.chartAccount.findUnique({ where: { id: /* ... */ } });
// after — findFirst so the extension can scope it (keep any existing explicit org filter)
const coa = await db.chartAccount.findFirst({ where: { id: /* ... */ } });
```
(Adjust to the actual `where` at that line; if it already filters by org, keep that and just change the method name.)

- [ ] **Step 4: Run the new test**

Run: `pnpm vitest run tests/tenancy/extension.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the FULL suite and fix fallout**

Run: `pnpm typecheck && pnpm test`
Expected: green. If any existing test or script now throws `TenantContextError`, it means that code touches an org-scoped model with neither context nor an explicit org filter. Fix by EITHER:
  - adding the explicit `organizationId` to that query (preferred — it was a latent bug), OR
  - wrapping a genuinely cross-org test/script body in `runAsSystem(async () => { ... })`.
Do not weaken the extension to make tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/tenancy/extension.ts lib/prisma.ts lib/banking/dal.ts tests/tenancy/extension.test.ts
git commit -m "feat(tenancy): wire fail-closed tenancy extension into prisma client"
```

---

## Task 5: Enter scoped context in `requireAccountingWorkspace`; system-wrap admin/onboarding

**Files:**
- Modify: `lib/accounting/dal.ts` (`requireAccountingWorkspace`)
- Modify: admin cross-org reads under `app/(admin)/admin/(protected)/**` and `app/onboarding/actions.ts` (wrap deliberate cross-org access in `runAsSystem`)
- Test: `tests/tenancy/workspace-scope.test.ts`

**Interfaces:**
- Consumes: `enterScopedContext`, `runAsSystem` (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
// tests/tenancy/workspace-scope.test.ts
import { describe, it, expect, vi } from "vitest";

// We test the helper directly: after enterScopedContext, the extension scopes queries.
import { enterScopedContext, getTenantContext } from "@/lib/tenancy/context";

describe("requireAccountingWorkspace scoping", () => {
  it("enterScopedContext makes the org available to getTenantContext in the same flow", async () => {
    await (async () => {
      enterScopedContext({ userId: "u1", organizationId: "orgX", role: "accountant" });
      expect(getTenantContext()).toMatchObject({ organizationId: "orgX", mode: "scoped" });
    })();
  });
});
```

> Full end-to-end (Supabase `getUser` → enterScopedContext → scoped query) is covered by the existing accounting flows once context is entered; mocking Supabase auth here is out of scope for this unit test.

- [ ] **Step 2: Run to verify it fails or passes trivially**

Run: `pnpm vitest run tests/tenancy/workspace-scope.test.ts`
Expected: PASS only after Task 1 exists (it does). If the import path is wrong it FAILS — fix path.

- [ ] **Step 3: Wire `enterScopedContext` into `requireAccountingWorkspace`**

In `lib/accounting/dal.ts`, at each `return { userId, organizationId, role }` path of `requireAccountingWorkspace` (the impersonation path and the normal membership path), call `enterScopedContext(...)` immediately before returning:

```ts
import { enterScopedContext } from "@/lib/tenancy/context";

// impersonation path:
enterScopedContext({ userId: data.user.id, organizationId: pass.orgId, role: "owner" });
return { userId: data.user.id, organizationId: pass.orgId, role: roleMap.OWNER };

// normal path:
enterScopedContext({ userId: data.user.id, organizationId: membership.organizationId, role: roleMap[membership.role] });
return { userId: data.user.id, organizationId: membership.organizationId, role: roleMap[membership.role] };
```

- [ ] **Step 4: Wrap deliberate cross-org reads in `runAsSystem`**

Find admin/onboarding code that must read across orgs (e.g. the `/admin` clients/plans/subscriptions lists, onboarding pre-membership org creation). Wrap those Prisma calls:

```ts
import { runAsSystem } from "@/lib/tenancy/context";
const orgs = await runAsSystem(() => prisma.organization.findMany({ /* ... */ }));
```

> `Organization` is not org-scoped, so listing orgs already passes through; the wrap is needed only where the code touches an ORG_SCOPED model across tenants (e.g. platform-wide audit/metrics). Identify by running the suite/app and reacting to any `TenantContextError` from admin routes. Since admin pages are out of the accounting scope, prefer `runAsSystem` at the narrowest call.

- [ ] **Step 5: Run typecheck + full suite**

Run: `pnpm typecheck && pnpm test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add lib/accounting/dal.ts app tests/tenancy/workspace-scope.test.ts
git commit -m "feat(tenancy): enter scoped context in requireAccountingWorkspace; system-wrap admin/onboarding"
```

---

## Task 6: Raw-query lint guard + annotations

**Files:**
- Create: `tests/tenancy/raw-query-lint.test.ts`
- Modify: annotate legitimately-global raw queries with `// tenancy:safe: <reason>` (only if any are not org-filtered)

**Interfaces:** none exported.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tenancy/raw-query-lint.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

const RAW = /\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)\b/;

describe("raw SQL tenancy lint", () => {
  it("every raw query references org scoping or is annotated // tenancy:safe: <reason>", () => {
    const roots = ["lib", "app"].map((d) => join(process.cwd(), d));
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const lines = readFileSync(file, "utf8").split(/\r?\n/);
        lines.forEach((line, i) => {
          if (!RAW.test(line)) return;
          // gather a small window for context (org filters often a few lines down)
          const windowText = lines.slice(Math.max(0, i - 1), i + 12).join("\n");
          const hasOrg = /org_id|organizationId/.test(windowText);
          const annotated = /\/\/\s*tenancy:safe:\s*\S+/.test(windowText);
          if (!hasOrg && !annotated) offenders.push(`${file}:${i + 1}`);
        });
      }
    }
    expect(offenders, "raw queries lacking org scoping or a // tenancy:safe: reason").toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see offenders**

Run: `pnpm vitest run tests/tenancy/raw-query-lint.test.ts`
Expected: FAIL listing any raw queries not within 12 lines of an `org_id`/`organizationId` reference.

- [ ] **Step 3: Resolve each offender**

For each listed site: if it is genuinely org-scoped but the filter is outside the window, widen by adding the org reference nearer, or add `// tenancy:safe: <reason>` directly above the raw call with a real justification (e.g. `// tenancy:safe: reads the global account_balances view filtered by org_id in the WHERE below`). Do NOT annotate something that is actually unscoped — fix it instead. Per the audit, all 8 raw-using files are already org-filtered, so most should pass; annotate only true globals.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/tenancy/raw-query-lint.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/tenancy/raw-query-lint.test.ts lib app
git commit -m "test(tenancy): add raw-SQL tenancy lint guard and annotations"
```

---

## Task 7: Docs + final gate

**Files:**
- Modify: `docs/REMEDIATION-CHECKLIST.md` (mark S4 Phase 1 done; note Phase 2 still open)

- [ ] **Step 1: Update the checklist**

Set S4 (RLS hardening) row to reflect "Phase 1 (app-level guarantee) ✅ — extension + CI guards landed; Phase 2 (DB RLS) 🧭 still open." Add the new test files to the verification note.

- [ ] **Step 2: Final verification gate**

Run: `pnpm typecheck && pnpm test`
Expected: `typecheck` exit 0; full suite green (baseline 71 + the new tenancy tests).

- [ ] **Step 3: Commit**

```bash
git add docs/REMEDIATION-CHECKLIST.md
git commit -m "docs(tenancy): mark S4 Phase 1 complete in remediation checklist"
```

---

## Self-review notes (author)

- **Spec coverage:** §3 context → Task 1; §4.1 registry → Task 2; §4.2 extension + refined fail-closed → Tasks 3–4; §4.3 CI guards → Tasks 2 (completeness), 4 (fail-closed runtime), 6 (raw lint); §4.4 keep filters → Global Constraints + Task 4 Step 5; §3 enter scope → Task 5; coverage gap §4.5 → Task 6 + documented. Phase 2 (§5) intentionally excluded. Secrets §6 manual, noted in checklist.
- **Type consistency:** `applyTenantScope(model, operation, args, ctx)`, `enterScopedContext(ctx)`, `runAsSystem(fn)`, `getTenantContext()`, `tenancyExtension` used consistently across tasks.
- **Risk to watch (executor):** `enterWith` per-request semantics in Next 16 — verify no context bleed between requests during Task 5 (the `runAsSystem`-only-inside-callback test in Task 1 guards the cleanup direction). If bleed is observed, escalate: switch the request entry to wrap the handler in `store.run` at the proxy layer instead of `enterWith`.

## Security fix note (2026-06-29, post-review)

`scope.ts` was revised before the extension was wired. Two defects were corrected:

1. **CRITICAL fixed:** `upsert` now validates that `where` contains the org field (flat or composite). A plain `where: { id }` upsert throws at the extension layer rather than silently allowing a cross-org write. Both production upsert call sites (`app/payroll/actions.ts` and `app/purchases/settings/actions.ts`) already key on `{ organizationId }` and are safe.
2. **IMPORTANT fixed:** Single-record `update` and `delete` ops now pass through **unscoped**. They are removed from the inject-filter set because Prisma's unique-key `where` cannot accept `organizationId` without a runtime error (the field is not part of any `@unique` or `@@unique` index on any org-scoped model). Coverage in Phase 1 is maintained by: (a) explicit `where: { organizationId }` filters retained at all 44 call sites, (b) the ownership-check-before-write pattern, and (c) Phase 2 DB RLS. See spec §4.5 for the full documented gap.
