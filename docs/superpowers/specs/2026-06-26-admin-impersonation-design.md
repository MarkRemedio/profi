# Admin Impersonation (Sub-project #6) — Design

**Date:** 2026-06-26
**Status:** Design — pending approval → implementation plan
**Depends on:** Sub-project #1 (Access Control & Identity) — shipped. Reuses `isPlatformAdmin`, the `platform_admin` claim, and `lib/accounting/dal.ts` `requireAccountingWorkspace`.

---

## 1. Goal

Let a platform admin safely **view and use a real client's accounting workspace** ("View as Acme Ltd"), with every session recorded in the audit log. This replaces the neutralized "coming soon" impersonate page (the old version was security theater — fake client list, React-state only, false promises of audit-logging and read-only).

**In scope:** real client picker, a secure server-signed impersonation session, the workspace-resolution override, a persistent banner, and audit logging of start/stop + admin-stamped actions.

**Out of scope:** read-only / write-blocking (deliberately omitted — full access; data is still dummy), per-feature restrictions, impersonating a *specific named user* (we impersonate the **organization** as owner-level), and the full Clients management page (#2).

---

## 2. Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Power level | **Full access** — act as the client freely (no write-blocking). Audit is the safety net. |
| Mechanism | **Option A** — admin keeps their own session; a signed cookie marks the active impersonation. No Supabase session swap. |
| Entry point | **Real client picker** on `/admin/impersonate`, listing live `organizations`. Self-contained; does not wait for #2. |
| Audit | **Start/stop events + every impersonated action stamped with the admin's real user id.** |
| Identity model | Impersonate an **organization** at **owner** role. The acting user id remains the **admin's** id (for audit). |

---

## 3. Architecture

### 3.1 The single chokepoint
Every accounting page and server action resolves its workspace through **`requireAccountingWorkspace()`** in [lib/accounting/dal.ts](../../../lib/accounting/dal.ts). This is the one place to teach impersonation — one change covers the entire `/dashboard` app.

Current shape:
```ts
requireAccountingWorkspace(): Promise<{ userId, organizationId, role }>
```
- `userId` → used as `actorUserId` when writing `AuditEvent`s.
- `organizationId` → scopes all data queries.
- `role` → gates edits (`requireAccountantRole`).

### 3.2 The impersonation "pass" (signed cookie)
A new module **`lib/admin/impersonation.ts`** owns the cookie:
- **Cookie name:** `impersonation` — `httpOnly`, `secure`, `sameSite=lax`, path `/`.
- **Payload:** `{ orgId: string, adminUserId: string, startedAt: number }`.
- **Integrity:** signed (HMAC) or encrypted with a server secret so it cannot be forged or tampered. (Reuse `SUPABASE_SERVICE_ROLE_KEY`? No — use a dedicated `IMPERSONATION_SECRET`, or fall back to signing with an existing server-only secret. Implementation plan decides; it MUST be a server-only secret.)
- **Helpers:** `setImpersonation(orgId, adminUserId)`, `clearImpersonation()`, `readImpersonation(): Payload | null` (verifies signature; returns null if absent/invalid).

### 3.3 Workspace resolution with impersonation
`requireAccountingWorkspace()` gains an impersonation branch, checked **before** the normal membership lookup:

```
1. realUser = supabase.auth.getUser()           // unchanged
2. if no user → redirect("/login")              // unchanged
3. pass = readImpersonation()
4. if pass AND isPlatformAdmin(realUser):
     - verify the org still exists (else clearImpersonation() + redirect("/admin"))
     - return { userId: realUser.id, organizationId: pass.orgId, role: "owner" }
5. else (normal path):
     membership = prisma.userRole.findFirst(...)
     if !membership → redirect("/onboarding")     // the #1 crash-fix, unchanged
     return { userId, organizationId, role }
```

**Security properties:**
- The pass is honored **only** if the real session user is still `platform_admin`. Revoking admin instantly disables it.
- `userId` stays the **admin's** id → all `AuditEvent`s written during the session are stamped with the admin, automatically satisfying "tag actions as admin."
- A non-admin who somehow obtains a cookie value can't use it (step 4 fails `isPlatformAdmin`), and can't forge a valid signature anyway.

### 3.4 Start / stop (server actions)
New file **`app/(admin)/admin/(protected)/impersonate/actions.ts`** (`"use server"`):
- **`startImpersonation(orgId: string)`**
  1. `requirePlatformAdmin()` (guard).
  2. Verify `orgId` exists in `organizations`.
  3. Write `AuditEvent` `impersonation_start` (actor = admin, target org, timestamp).
  4. `setImpersonation(orgId, adminUserId)`.
  5. `redirect("/dashboard")`.
- **`stopImpersonation()`**
  1. Read the pass (no-op if none).
  2. Write `AuditEvent` `impersonation_stop`.
  3. `clearImpersonation()`.
  4. `redirect("/admin")`.

### 3.5 Audit events
Reuse the existing `AuditEvent` table (already written by accounting/banking flows).
- `impersonation_start` / `impersonation_stop` events: `organizationId` = impersonated org, `actorUserId` = admin id, plus metadata `{ adminEmail, startedAt }`.
- The exact column/enum names are confirmed against the schema in the implementation plan; if `eventType` is a constrained enum, use the nearest existing convention or a generic event with a typed metadata discriminator.

### 3.6 The banner
- **`components/accounting/impersonation-banner.tsx`** (new, client component): a fixed strip at the top of `/dashboard`, e.g. *"👁 You are viewing **Acme Ltd** as an admin — [Exit]"*. The **Exit** button is a `<form action={stopImpersonation}>`.
- Rendered from the **`/dashboard` layout** ([app/dashboard/layout.tsx](../../../app/dashboard/layout.tsx)). The layout reads the pass server-side (`readImpersonation()`), and if present passes `{ orgName }` to the banner. No pass → no banner.
- (Note: the old admin-side `components/admin/impersonation-banner.tsx` + `impersonation-context.tsx` were React-state fakes — leave them or remove during the build; this is a fresh, real banner on the **client/dashboard** side.)

### 3.7 The client picker
- Rebuild **`app/(admin)/admin/(protected)/impersonate/page.tsx`** (currently the "coming soon" stub) as a **server component**:
  - `requirePlatformAdmin()`.
  - Query real `organizations` (id, name, subscription_status, etc.) — server-side, with optional search.
  - Render a searchable list; each row has a **View as** button → `<form action={startImpersonation}>` with the `orgId`.
- Re-add the **Impersonate** nav item to `components/admin/shell.tsx` (it was hidden in #1).

---

## 4. Data flow (end to end)

```
/admin/impersonate (picker)
   │  click "View as Acme"  → startImpersonation(orgId)
   │     ├─ requirePlatformAdmin()
   │     ├─ verify org exists
   │     ├─ AuditEvent: impersonation_start
   │     ├─ set signed cookie {orgId, adminUserId, startedAt}
   │     └─ redirect → /dashboard
   ▼
/dashboard (+ all accounting pages)
   │  requireAccountingWorkspace() sees pass + admin → returns Acme workspace (role: owner, userId: admin)
   │  layout renders <ImpersonationBanner orgName="Acme Ltd" />
   │  admin acts freely; AuditEvents stamped with admin's id
   │  click "Exit" → stopImpersonation()
   │     ├─ AuditEvent: impersonation_stop
   │     ├─ clear cookie
   │     └─ redirect → /admin
   ▼
back to admin (no pass; admin again)
```

---

## 5. Files

**Create:**
- `lib/admin/impersonation.ts` — signed-cookie helpers (`set`/`clear`/`read`) + pure signing helpers (unit-testable).
- `app/(admin)/admin/(protected)/impersonate/actions.ts` — `startImpersonation`, `stopImpersonation`.
- `components/accounting/impersonation-banner.tsx` — the dashboard banner.
- A unit test for the cookie sign/verify round-trip (and that a tampered/forged value verifies as invalid).

**Modify:**
- `lib/accounting/dal.ts` — impersonation branch in `requireAccountingWorkspace` (before the membership lookup).
- `app/(admin)/admin/(protected)/impersonate/page.tsx` — real client picker (replace "coming soon").
- `app/dashboard/layout.tsx` — read pass, render banner when impersonating.
- `components/admin/shell.tsx` — re-add the Impersonate nav item.
- `.env.example` — add `IMPERSONATION_SECRET` (if a dedicated secret is chosen).

---

## 6. Testing

- **Unit:** cookie sign → verify round-trips; a tampered payload fails verification; `readImpersonation()` returns null for absent/garbage cookies.
- **Unit:** the `requireAccountingWorkspace` impersonation branch — given (admin + valid pass) returns the impersonated workspace with `role: owner` and `userId: admin`; given (non-admin + pass) ignores the pass. (Mock `getUser` / cookie read.)
- **Manual smoke:** admin picks a client → lands on `/dashboard` showing that client's books with the banner → makes a change → exits → back on `/admin`; audit log shows start/stop + the change stamped with the admin. Non-admin can't reach the picker (gated by #1). Revoking admin mid-session drops `/dashboard` back to the redirect.

---

## 7. Open items / decisions for the plan

- **Signing secret:** dedicated `IMPERSONATION_SECRET` vs. reuse an existing server-only secret. (Lean: dedicated, documented in `.env.example`.)
- **`AuditEvent` exact shape:** confirm column/enum names for `impersonation_start`/`impersonation_stop` against `prisma/schema.prisma` during planning.
- **Org → workspace role:** fixed `owner` (full access) as decided. Revisit only if a future read-only mode is added.
