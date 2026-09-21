# Admin Access Control & Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/*` a real, locked admin area — only users with the `app_metadata.role === "platform_admin"` JWT claim can reach it, login establishes a proper cookie session, the hardcoded backdoor is gone, and the shell shows the real admin identity with a working server-side logout.

**Architecture:** Two enforcement layers — an optimistic edge gate in `proxy.ts` (Next.js 16's renamed middleware) and a defense-in-depth server guard in a `(protected)` route-group layout. A `(protected)` route group holds the 13 admin pages + the guarded shell; `login/` stays outside it so the guard never loops on the login page. Provisioning is a service-role CLI script.

**Tech Stack:** Next.js 16.2.4 (App Router, `proxy.ts` convention), React 19, `@supabase/ssr` (cookie sessions), `@supabase/supabase-js` admin API (service role), Vitest.

## Global Constraints

- This is Next.js 16: middleware is **`proxy.ts`** at repo root, exporting `proxy()`. Already wired to `lib/supabase/proxy.ts` `updateSession`.
- Admin claim value is exactly `"platform_admin"` at `user.app_metadata.role`.
- Service-role key env var: `SUPABASE_SERVICE_ROLE_KEY` (server-only; never `NEXT_PUBLIC_`). User adds the value to `.env.local` themselves.
- Server session cookies are set via the `@supabase/ssr` server client (`lib/supabase/server.ts` `createClient()`), only from Server Actions.
- Tests live in `tests/**/*.test.ts`, run by `pnpm test` (vitest). `server-only` is shimmed in vitest; `@` alias = repo root.
- Do not auto-commit (user commits manually).

---

### Task 1: `lib/admin/auth.ts` — pure helper + server guard

**Files:**
- Create: `lib/admin/auth.ts`
- Test: `tests/admin-auth.test.ts`

**Interfaces:**
- Produces: `PLATFORM_ADMIN_ROLE: "platform_admin"`, `isPlatformAdmin(user): boolean`, `requirePlatformAdmin(): Promise<User>`

- [ ] **Step 1: Write the failing test** (`tests/admin-auth.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { isPlatformAdmin, PLATFORM_ADMIN_ROLE } from "@/lib/admin/auth";

describe("isPlatformAdmin", () => {
  it("is true when app_metadata.role is platform_admin", () => {
    expect(isPlatformAdmin({ app_metadata: { role: PLATFORM_ADMIN_ROLE } })).toBe(true);
  });
  it("matches the claim shape the grant script writes", () => {
    expect(PLATFORM_ADMIN_ROLE).toBe("platform_admin");
    expect(isPlatformAdmin({ app_metadata: { role: "platform_admin" } })).toBe(true);
  });
  it("is false for other roles, missing metadata, null, and undefined", () => {
    expect(isPlatformAdmin({ app_metadata: { role: "super_admin" } })).toBe(false);
    expect(isPlatformAdmin({ app_metadata: {} })).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `pnpm test tests/admin-auth.test.ts` → FAIL (cannot find module `@/lib/admin/auth`).

- [ ] **Step 3: Implement** (`lib/admin/auth.ts`)

```ts
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

export const PLATFORM_ADMIN_ROLE = "platform_admin";

/** Pure claim check — safe to import anywhere (no server-only side effects). */
export function isPlatformAdmin(
  user: { app_metadata?: { role?: string } } | null | undefined
): boolean {
  return user?.app_metadata?.role === PLATFORM_ADMIN_ROLE;
}

/** Server guard: redirects to /admin/login unless the session user is a platform admin. */
export async function requirePlatformAdmin(): Promise<User> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isPlatformAdmin(user)) {
    redirect("/admin/login");
  }
  return user as User;
}
```

(Dynamic `import` of `createClient` keeps top-level imports light so `proxy.ts` and Vitest can import `isPlatformAdmin` without pulling `next/headers`.)

- [ ] **Step 4: Run test, verify pass** — `pnpm test tests/admin-auth.test.ts` → PASS.

---

### Task 2: `scripts/grant-admin.cjs` + `scripts/revoke-admin.cjs`

**Files:**
- Create: `scripts/grant-admin.cjs`, `scripts/revoke-admin.cjs`

**Interfaces:**
- `grant-admin.cjs` exports `setAdminRole(email, grant)`; CLI: `node scripts/grant-admin.cjs <email>`.
- `revoke-admin.cjs` CLI: `node scripts/revoke-admin.cjs <email>` (calls `setAdminRole(email, false)`).

- [ ] **Step 1: Implement `scripts/grant-admin.cjs`**

```js
// Grant/revoke the platform_admin claim via the Supabase service-role key.
//   node scripts/grant-admin.cjs <email>     # grant
//   node scripts/revoke-admin.cjs <email>    # revoke
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvLocal() {
  const text = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function setAdminRole(email, grant) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find the user by email (admin API has no by-email lookup; paginate listUsers).
  let user = null;
  for (let page = 1; page <= 50 && !user; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
    if (data.users.length < 1000) break;
  }
  if (!user) throw new Error(`No auth user found for ${email}`);

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { role: grant ? "platform_admin" : null },
  });
  if (error) throw error;
  console.log(`${grant ? "Granted" : "Revoked"} platform_admin for ${email} (${user.id})`);
}

module.exports = { setAdminRole };

if (require.main === module) {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node scripts/grant-admin.cjs <email>");
    process.exit(1);
  }
  setAdminRole(email, true).catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Implement `scripts/revoke-admin.cjs`**

```js
const { setAdminRole } = require("./grant-admin.cjs");
const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/revoke-admin.cjs <email>");
  process.exit(1);
}
setAdminRole(email, false).catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
```

- [ ] **Step 3: Sanity-check** the usage string only (no live run without the user's service key): `node scripts/grant-admin.cjs` → prints usage, exits 1.

---

### Task 3: Fix login (`app/(admin)/admin/login/actions.ts`)

**Files:**
- Modify: `app/(admin)/admin/login/actions.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`, `isPlatformAdmin` from `@/lib/admin/auth`.
- Produces: `adminSignIn(prevState, formData)`, `adminSignOut()` (unchanged signatures; `AdminSignInState` type kept).

- [ ] **Step 1: Replace file contents**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin/auth";

export type AdminSignInState = { error?: string } | null;

export async function adminSignIn(
  prevState: AdminSignInState,
  formData: FormData
): Promise<AdminSignInState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Admin email and security password are required." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: error?.message || "Invalid administrative credentials." };
  }

  if (!isPlatformAdmin(data.user)) {
    await supabase.auth.signOut();
    return { error: "Access Denied: this account does not have platform-admin privileges." };
  }

  redirect("/admin");
}

export async function adminSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
```

Backdoor (`admin@gmail.com` / `@wawprofi.com` / staff-email) removed. `redirect()` stays outside any try/catch (it throws by design).

- [ ] **Step 2: Typecheck** — `pnpm typecheck` → no new errors in this file.

---

### Task 4: Edge gate (`lib/supabase/proxy.ts`)

**Files:**
- Modify: `lib/supabase/proxy.ts`

- [ ] **Step 1:** Add `import { isPlatformAdmin } from "@/lib/admin/auth";` at the top.

- [ ] **Step 2:** Replace the `const { error } = await supabase.auth.getUser();` block (and the lines through `return response;`) with:

```ts
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (isInvalidRefreshTokenError(error)) {
    clearSupabaseAuthCookies(request, response);
  }

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    if (!isPlatformAdmin(user)) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  return response;
```

- [ ] **Step 3: Typecheck** — `pnpm typecheck` → clean.

---

### Task 5: Route-group restructure (`(protected)` group + guarded layout)

**Files:**
- Move (git mv) into `app/(admin)/admin/(protected)/`: `page.tsx`, `billing-extras/`, `chat-inbox/`, `clients/`, `health/`, `impersonate/`, `plans/`, `roadmap/`, `security/`, `subscriptions/`, `support-analytics/`, `support-new/`. **Keep `login/` where it is.**
- Create: `app/(admin)/admin/(protected)/layout.tsx`
- Delete: `app/(admin)/admin/layout.tsx`

URLs are unchanged (route groups don't affect the path). `login/` no longer inherits a shell layout — its page renders a self-contained full-screen view, so no shell is needed.

- [ ] **Step 1:** `git mv` each protected page/folder under `(protected)/`. Leave `login/` and `login/actions.ts` in place.

- [ ] **Step 2:** Create `app/(admin)/admin/(protected)/layout.tsx`:

```tsx
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { MasterShell } from "@/components/admin/shell";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePlatformAdmin();
  const name = (user.user_metadata?.name as string | undefined) ?? user.email ?? "Admin";
  return (
    <MasterShell identity={{ email: user.email ?? "", name }}>
      {children}
    </MasterShell>
  );
}
```

- [ ] **Step 3:** Delete `app/(admin)/admin/layout.tsx`.

- [ ] **Step 4: Verify** — `pnpm typecheck`; `pnpm build` resolves routes without duplicate-path or missing-layout errors (run after Task 6 so `MasterShell` accepts `identity`).

---

### Task 6: Single shell with real identity + server-action logout + hide Impersonate (`components/admin/shell.tsx`)

**Files:**
- Modify: `components/admin/shell.tsx`

**Interfaces:**
- Consumes: `adminSignOut` from `@/app/(admin)/admin/login/actions`.
- Produces: `MasterShell({ identity, children })` where `identity: { email: string; name: string }`.

- [ ] **Step 1:** Make `MasterShell` accept identity and thread it to the sidebar:

```tsx
interface AdminIdentity { email: string; name: string }

export function MasterShell({
  identity,
  children,
}: {
  identity: AdminIdentity;
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  // ...existing wrapper... pass identity={identity} into <MasterSidebar /> and <MasterTopNav />
}
```

- [ ] **Step 2:** Replace the client `handleSignOut` (anon `createClient` + `window.location`) with the `adminSignOut` server action so the httpOnly cookie session is actually cleared. Remove the `import { createClient } from "@supabase/supabase-js";` line. Wrap each logout button in a form:

```tsx
import { adminSignOut } from "@/app/(admin)/admin/login/actions";
// ...
<form action={adminSignOut}>
  <button type="submit" title="Sign out" className="...existing classes...">
    <LogOut className="size-4" />
  </button>
</form>
```

- [ ] **Step 3:** Render real identity in the sidebar footer. Compute initials from `identity.name`/`identity.email`:

```tsx
const initials = (identity.name || identity.email || "AD")
  .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "AD";
```

Replace hardcoded `"Super Admin"` → `identity.name`, `"admin@wawprofi.com"` → `identity.email`, and both `"SA"` avatars (sidebar footer + top nav) → `{initials}`. Pass `identity` into `MasterTopNav` for its avatar.

- [ ] **Step 4:** Remove the Impersonate nav item — delete the `{ label: "Impersonate", href: "/admin/impersonate", icon: Eye }` entry from `navItems` (drop the now-unused `Eye` import).

- [ ] **Step 5: Typecheck** — `pnpm typecheck` → clean.

---

### Task 7: Neutralize the Impersonate page (`(protected)/impersonate/page.tsx`)

**Files:**
- Modify: `app/(admin)/admin/(protected)/impersonate/page.tsx`

The page falsely promises audit-logged, read-only impersonation. Replace it with a "coming soon" state until sub-project #6. Leave `components/admin/impersonate.tsx` on disk (unused, out of scope to delete).

- [ ] **Step 1:** Replace the page body:

```tsx
import { Eye } from "lucide-react";

export const metadata = { title: "User Impersonation | Admin" };

export default function AdminImpersonatePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-slate-100">
        <Eye className="size-6 text-slate-400" />
      </div>
      <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Impersonation — coming soon</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        Secure, audit-logged client impersonation is not available yet. It will arrive in a future
        release with a real server-side session swap and full audit-log coverage.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — `pnpm typecheck` → clean.

---

### Task 8: `.env.example`

**Files:**
- Create: `.env.example`

- [ ] **Step 1:** Create `.env.example` with placeholder (non-secret) values mirroring `.env.local`'s keys, including the new `SUPABASE_SERVICE_ROLE_KEY`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# Server-only secret — service-role key. Never expose with NEXT_PUBLIC_.
# Used by scripts/grant-admin.cjs to set the platform_admin claim.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database (Prisma)
DATABASE_URL=postgresql://user:pass@host:5432/db
DIRECT_URL=postgresql://user:pass@host:5432/db

# App
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PRICE_ID=price_xxx
```

---

## Final verification

- [ ] `pnpm test tests/admin-auth.test.ts` → PASS.
- [ ] `pnpm test` → existing suites still pass (no regressions).
- [ ] `pnpm typecheck` → clean.
- [ ] `pnpm build` → builds; admin routes resolve.
- [ ] **Manual smoke** (user, needs `SUPABASE_SERVICE_ROLE_KEY` + a granted account): non-admin → `/admin` bounces to `/admin/login`; `node scripts/grant-admin.cjs <email>` then login → reaches `/admin`, shell shows real email; logout returns to `/admin/login`; non-admin login is rejected with the access-denied error.

## Self-review notes

- Spec §3.1 → Tasks 2, 8. §3.2 → Task 3. §3.3 → Tasks 1, 4, 5. §3.4 → Tasks 5, 6. §3.5 → Tasks 6, 7. §3.6 → Task 1 (+ manual smoke). §3.7 files all covered; `.env.example` created fresh (none existed).
- Deviation from spec (approved): protected pages move into a `(protected)` route group so the server guard doesn't loop on `/admin/login`; the active shell was inline in `layout.tsx` (not `components/admin/shell.tsx`) so consolidation = guarded layout imports the single `MasterShell`.
- Logout now uses the `adminSignOut` server action (clears httpOnly cookies) rather than the client anon-key `signOut` that could not clear them.
