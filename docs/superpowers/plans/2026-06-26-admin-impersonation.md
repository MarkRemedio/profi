# Admin Impersonation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a platform admin view/use a real client's accounting workspace via a secure signed-cookie "pass", with the session recorded in the audit log.

**Architecture:** Admin keeps their own Supabase session. Starting impersonation sets a server-signed `impersonation` cookie `{ orgId, adminUserId, sessionId, startedAt }`. The single workspace chokepoint `requireAccountingWorkspace()` honors the pass only when the real user is still `platform_admin`, returning the impersonated org at `owner` role while keeping `userId` = the admin (so all audit events trace to the admin). A banner shows on `/dashboard`; Exit clears the cookie. Start/stop write `AuditEvent` rows.

**Tech Stack:** Next.js 16 (server components + server actions, `cookies()` from `next/headers`), `node:crypto` HMAC, Prisma (`AuditEvent`, `Organization`), Vitest. Reuses sub-project #1's `isPlatformAdmin` / `requirePlatformAdmin`.

## Global Constraints

- Admin claim is `app_metadata.role === "platform_admin"` (`lib/admin/auth.ts` `isPlatformAdmin`).
- Cookie secret: server-only env var `IMPERSONATION_SECRET`. `readImpersonation()` returns `null` if the secret is unset (impersonation simply disabled — must not crash `/dashboard`); `setImpersonation()` throws a clear error if unset.
- `AuditEvent` required fields: `organizationId` (uuid), `entityType` (string), `entityId` (uuid), `action` (`AuditAction` enum: only CREATE/UPDATE/POST/VOID/REVERSE/DELETE). `actorUserId` is optional uuid. Use `entityType: "impersonation_session"`, `entityId: sessionId`, `action: CREATE` (start) / `DELETE` (stop).
- Cookie: `httpOnly`, `secure`, `sameSite: "lax"`, `path: "/"`, name `impersonation`.
- Tests live in `tests/**/*.test.ts` (`pnpm test`). `@` = repo root. Don't auto-commit (user commits manually).

---

### Task 1: Signed-cookie helpers (`lib/admin/impersonation.ts`) + unit test

**Files:**
- Create: `lib/admin/impersonation.ts`
- Test: `tests/impersonation-cookie.test.ts`

**Interfaces:**
- Produces: `ImpersonationPayload { orgId: string; adminUserId: string; sessionId: string; startedAt: number }`, pure `signPayload(payload, secret): string` / `verifyPayload(value, secret): ImpersonationPayload | null`, and async cookie helpers `setImpersonation(payload)`, `readImpersonation(): Promise<ImpersonationPayload|null>`, `clearImpersonation()`.

- [ ] **Step 1: Write the failing test** (`tests/impersonation-cookie.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { signPayload, verifyPayload, type ImpersonationPayload } from "@/lib/admin/impersonation";

const SECRET = "test-secret-please-change";
const payload: ImpersonationPayload = {
  orgId: "11111111-1111-1111-1111-111111111111",
  adminUserId: "22222222-2222-2222-2222-222222222222",
  sessionId: "33333333-3333-3333-3333-333333333333",
  startedAt: 1750000000000,
};

describe("impersonation cookie signing", () => {
  it("round-trips a signed payload", () => {
    const value = signPayload(payload, SECRET);
    expect(verifyPayload(value, SECRET)).toEqual(payload);
  });

  it("rejects a tampered body", () => {
    const value = signPayload(payload, SECRET);
    const tampered = "x" + value.slice(1);
    expect(verifyPayload(tampered, SECRET)).toBeNull();
  });

  it("rejects a wrong secret (forgery)", () => {
    const value = signPayload(payload, SECRET);
    expect(verifyPayload(value, "different-secret")).toBeNull();
  });

  it("returns null for absent or garbage values", () => {
    expect(verifyPayload(undefined, SECRET)).toBeNull();
    expect(verifyPayload("not-a-cookie", SECRET)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `pnpm test tests/impersonation-cookie.test.ts` → FAIL (cannot find `@/lib/admin/impersonation`).

- [ ] **Step 3: Implement** (`lib/admin/impersonation.ts`)

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "impersonation";

export interface ImpersonationPayload {
  orgId: string;
  adminUserId: string;
  sessionId: string;
  startedAt: number;
}

export function signPayload(payload: ImpersonationPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPayload(
  value: string | undefined,
  secret: string
): ImpersonationPayload | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof parsed?.orgId === "string" &&
      typeof parsed?.adminUserId === "string" &&
      typeof parsed?.sessionId === "string" &&
      typeof parsed?.startedAt === "number"
    ) {
      return parsed as ImpersonationPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function requireSecret(): string {
  const s = process.env.IMPERSONATION_SECRET;
  if (!s) {
    throw new Error("IMPERSONATION_SECRET is not set — required to start an impersonation session.");
  }
  return s;
}

export async function setImpersonation(payload: ImpersonationPayload): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, signPayload(payload, requireSecret()), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function readImpersonation(): Promise<ImpersonationPayload | null> {
  const secret = process.env.IMPERSONATION_SECRET;
  if (!secret) return null; // impersonation disabled when unconfigured — never crash /dashboard
  const store = await cookies();
  return verifyPayload(store.get(COOKIE_NAME)?.value, secret);
}

export async function clearImpersonation(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
```

- [ ] **Step 4: Run test, verify pass** — `pnpm test tests/impersonation-cookie.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit** (user does this manually per their preference — note it's ready).

---

### Task 2: Impersonation branch in `requireAccountingWorkspace` (`lib/accounting/dal.ts`)

**Files:**
- Modify: `lib/accounting/dal.ts:89-115` (`requireAccountingWorkspace`)

**Interfaces:**
- Consumes: `readImpersonation` from `@/lib/admin/impersonation`, `isPlatformAdmin` from `@/lib/admin/auth`, existing `prisma`, `createClient`.
- Produces: unchanged return shape `{ userId, organizationId, role }`.

- [ ] **Step 1: Add imports** at the top of `lib/accounting/dal.ts`:

```ts
import { isPlatformAdmin } from "@/lib/admin/auth";
import { readImpersonation } from "@/lib/admin/impersonation";
```

- [ ] **Step 2: Insert the impersonation branch** between the `getUser()` check and the membership lookup. The function becomes:

```ts
export async function requireAccountingWorkspace(): Promise<AccountingWorkspace> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  // Admin impersonation: a platform admin holding a valid pass views the
  // target org as owner. userId stays the admin's, so audit events trace to them.
  const pass = await readImpersonation();
  if (pass && isPlatformAdmin(data.user)) {
    const org = await prisma.organization.findUnique({
      where: { id: pass.orgId },
      select: { id: true },
    });
    if (org) {
      return {
        userId: data.user.id,
        organizationId: pass.orgId,
        role: roleMap.OWNER,
      };
    }
    // Stale pass (org gone): fall through to the normal path.
  }

  const membership = await prisma.userRole.findFirst({
    where: { userId: data.user.id },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true, role: true },
  });

  if (!membership) {
    redirect("/onboarding");
  }

  return {
    userId: data.user.id,
    organizationId: membership.organizationId,
    role: roleMap[membership.role],
  };
}
```

(`roleMap.OWNER` resolves to `"owner"`; `roleMap` is already defined at the top of the file.)

- [ ] **Step 3: Typecheck** — `pnpm typecheck` → clean.

---

### Task 3: Start/stop server actions (`app/(admin)/admin/(protected)/impersonate/actions.ts`)

**Files:**
- Create: `app/(admin)/admin/(protected)/impersonate/actions.ts`

**Interfaces:**
- Produces: `startImpersonation(orgId: string)`, `stopImpersonation()`.

- [ ] **Step 1: Implement** (`actions.ts`)

```ts
"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { AuditAction } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { setImpersonation, readImpersonation, clearImpersonation } from "@/lib/admin/impersonation";

export async function startImpersonation(orgId: string): Promise<void> {
  const admin = await requirePlatformAdmin();

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!org) {
    throw new Error("Organization not found.");
  }

  const sessionId = randomUUID();
  await prisma.auditEvent.create({
    data: {
      organizationId: orgId,
      actorUserId: admin.id,
      entityType: "impersonation_session",
      entityId: sessionId,
      action: AuditAction.CREATE,
      after: { adminUserId: admin.id, adminEmail: admin.email ?? null },
    },
  });

  await setImpersonation({
    orgId,
    adminUserId: admin.id,
    sessionId,
    startedAt: Date.now(),
  });

  redirect("/dashboard");
}

export async function stopImpersonation(): Promise<void> {
  const pass = await readImpersonation();
  if (pass) {
    await prisma.auditEvent.create({
      data: {
        organizationId: pass.orgId,
        actorUserId: pass.adminUserId,
        entityType: "impersonation_session",
        entityId: pass.sessionId,
        action: AuditAction.DELETE,
        before: { adminUserId: pass.adminUserId, startedAt: pass.startedAt },
      },
    });
    await clearImpersonation();
  }
  redirect("/admin");
}
```

- [ ] **Step 2: Typecheck** — `pnpm typecheck` → clean.

---

### Task 4: Real client picker (`app/(admin)/admin/(protected)/impersonate/page.tsx`)

**Files:**
- Modify: `app/(admin)/admin/(protected)/impersonate/page.tsx` (replace the "coming soon" stub)

**Interfaces:**
- Consumes: `requirePlatformAdmin`, `startImpersonation`, `prisma`.

- [ ] **Step 1: Replace the page** with a server component that lists real organizations and renders a `View as` form per client:

```tsx
import { Building2, Eye } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { Button } from "@/components/ui/button";
import { startImpersonation } from "./actions";

export const metadata = { title: "Impersonate Client | Admin" };

export default async function AdminImpersonatePage() {
  await requirePlatformAdmin();

  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, subscription_status: true },
  });

  async function viewAs(formData: FormData) {
    "use server";
    await startImpersonation(formData.get("orgId") as string);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">Impersonate Client</h1>
        <p className="mt-1 text-sm text-slate-500">
          View a client&apos;s workspace as an admin. Your session is audit-logged. Full access.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {orgs.map((org) => (
          <div
            key={org.id}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Building2 className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-slate-900">{org.name}</p>
                <p className="truncate text-[10px] text-slate-400">{org.subscription_status ?? "—"}</p>
              </div>
            </div>
            <form action={viewAs}>
              <input type="hidden" name="orgId" value={org.id} />
              <Button size="sm" type="submit" className="w-full gap-1.5 bg-teal-600 text-white hover:bg-teal-700">
                <Eye className="size-3.5" /> View as Client
              </Button>
            </form>
          </div>
        ))}
      </div>

      {orgs.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
          No client organizations found.
        </div>
      )}
    </div>
  );
}
```

(Search can be added later; YAGNI for v1 — the grid is filterable by eye and the list is ~21 rows. If the org list grows, add a client-side filter input.)

- [ ] **Step 2: Typecheck** — `pnpm typecheck` → clean.

---

### Task 5: Dashboard banner (`components/accounting/impersonation-banner.tsx` + `app/dashboard/layout.tsx`)

**Files:**
- Create: `components/accounting/impersonation-banner.tsx`
- Modify: `app/dashboard/layout.tsx`

**Interfaces:**
- `ImpersonationBanner({ orgName }: { orgName: string })` — client component with an Exit form bound to `stopImpersonation`.

- [ ] **Step 1: Create the banner** (`components/accounting/impersonation-banner.tsx`)

```tsx
import { Eye } from "lucide-react";
import { stopImpersonation } from "@/app/(admin)/admin/(protected)/impersonate/actions";

export function ImpersonationBanner({ orgName }: { orgName: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950">
      <span className="flex items-center gap-2">
        <Eye className="size-4" />
        You are viewing <strong>{orgName}</strong> as an admin.
      </span>
      <form action={stopImpersonation}>
        <button
          type="submit"
          className="rounded-md bg-amber-950/10 px-3 py-1 text-xs font-bold uppercase tracking-wide hover:bg-amber-950/20"
        >
          Exit
        </button>
      </form>
    </div>
  );
}
```

(The banner has no `"use client"` — it only renders a server-action form, so it can stay a server component.)

- [ ] **Step 2: Wire into the dashboard layout** (`app/dashboard/layout.tsx`)

```tsx
import { WorkspaceShell } from "@/components/accounting/workspace-shell";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { readImpersonation } from "@/lib/admin/impersonation";
import { prisma } from "@/lib/prisma";
import { ImpersonationBanner } from "@/components/accounting/impersonation-banner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // 🛡️ Server-side gate (also resolves an active impersonation pass).
  await requireAccountingWorkspace();

  const pass = await readImpersonation();
  let bannerOrgName: string | null = null;
  if (pass) {
    const org = await prisma.organization.findUnique({
      where: { id: pass.orgId },
      select: { name: true },
    });
    bannerOrgName = org?.name ?? "client";
  }

  return (
    <>
      {bannerOrgName && <ImpersonationBanner orgName={bannerOrgName} />}
      <WorkspaceShell>{children}</WorkspaceShell>
    </>
  );
}
```

- [ ] **Step 3: Typecheck** — `pnpm typecheck` → clean.

---

### Task 6: Re-add the Impersonate nav item (`components/admin/shell.tsx`)

**Files:**
- Modify: `components/admin/shell.tsx`

- [ ] **Step 1:** Re-import `Eye` from `lucide-react` and add back the nav entry in the `"Operations"` group:

```tsx
{ label: "Impersonate", href: "/admin/impersonate", icon: Eye },
```

- [ ] **Step 2: Typecheck** — `pnpm typecheck` → clean.

---

### Task 7: `.env.example` — add `IMPERSONATION_SECRET`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1:** Add under a new section:

```bash
# Admin impersonation — server-only secret used to sign the impersonation pass cookie.
# Generate with: openssl rand -base64 32
IMPERSONATION_SECRET=your-impersonation-secret
```

- [ ] **Step 2:** Note for the user: add a real `IMPERSONATION_SECRET` value to `.env.local` (and the Vercel project env) before using impersonation.

---

## Final verification

- [ ] `pnpm test tests/impersonation-cookie.test.ts` → 4 pass.
- [ ] `pnpm test` → full suite still green (no regressions; existing accounting/banking tests don't set `IMPERSONATION_SECRET`, so `readImpersonation()` returns null and behavior is unchanged).
- [ ] `pnpm typecheck` → clean.
- [ ] `pnpm build` → builds; `/admin/impersonate` + `/dashboard` resolve.
- [ ] **Manual smoke** (needs `IMPERSONATION_SECRET` set + an admin account): `/admin/impersonate` → pick a client → lands on `/dashboard` with the amber banner showing that client → navigate the books → click **Exit** → back on `/admin`; the `audit_events` table has a CREATE + DELETE `impersonation_session` pair stamped with the admin's id. Revoke the admin claim mid-session → `/dashboard` redirects (pass no longer honored).

## Self-review notes

- Spec §3.2 → Task 1. §3.3 → Task 2. §3.4 → Task 3. §3.5 → Tasks 3 (events), §3.6 → Task 5. §3.7 → Tasks 4, 6. §5 files all covered; §7 open items resolved: dedicated `IMPERSONATION_SECRET` (Task 7), `AuditEvent` shape uses `CREATE`/`DELETE` + `sessionId` as `entityId`.
- Security: pass honored only when `readImpersonation()` returns a signature-valid payload AND `isPlatformAdmin(realUser)` (Task 2). Forged/tampered cookies fail `verifyPayload` (Task 1 tests). Missing secret disables impersonation without breaking `/dashboard`.
- `userId` stays the admin's in the impersonated workspace, so every downstream `AuditEvent.actorUserId` is the admin — satisfies "tag actions as admin" with no per-action change.
