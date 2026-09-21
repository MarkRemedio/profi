# Admin Side — Context, Audit & Access-Control Design

**Date:** 2026-06-25
**Status:** Design (sub-project #1 of the admin build) — pending approval → implementation plan
**Scope of this doc:** (a) the current state of the entire admin area (audit), (b) the decomposition into sub-projects, (c) the detailed design for sub-project #1: **Access Control & Identity**.

---

## 1. Current state (audit)

The admin area (`app/(admin)/admin/*` + `components/admin/*`, ~14 pages / ~16 components) is a **high-fidelity UI prototype with no backend and no working access control.** Two findings dominate: security, and "everything is mock".

### 1a. 🔴 P0 — Access control is effectively absent
1. **`/admin/*` is reachable with no authentication.** There is no route gate — the middleware (`proxy.ts` → `lib/supabase/proxy.ts` `updateSession`) only refreshes the Supabase session; it does not gate `/admin`. The admin pages don't check a session: [app/(admin)/admin/page.tsx](../../../app/(admin)/admin/page.tsx) just renders `<MasterOverview />`, and [app/(admin)/admin/layout.tsx](../../../app/(admin)/admin/layout.tsx) is a `"use client"` shell with zero auth. Anyone can navigate directly to `/admin/clients` or `/admin/security`. The login page is decorative.
2. **Hardcoded backdoor.** [app/(admin)/admin/login/actions.ts](../../../app/(admin)/admin/login/actions.ts) grants god-mode to `admin@gmail.com` and any `@wawprofi.com` email, and treats a staff email alone (no role flag) as authorized.
3. **Login establishes no real session.** It uses the **anon-key** client server-side with no `@supabase/ssr` cookie handling, so `signInWithPassword` validates credentials but never persists a browser session. The gate is cosmetic; nothing downstream checks a session anyway.
4. **Impersonation is security theater.** `components/admin/impersonate.tsx` stores the "impersonated client" in React state only — it never swaps the server session and no data page reads it. The banner promises *"actions are marked in the audit log"* and *"read-only by default"* — neither exists. It can also impersonate a `suspended` client (wrong disabled check).

> Note: commit `9337eb8` ("Fix admin routing exports, stabilize shell layout, wire secure logout") wired up logout and stabilized the shell, but did **not** address findings 1–4 above.

### 1b. 🟠 P1 — Every page renders mock data, no persistence
All buttons are `toast.*()` no-ops or local React state; nothing persists.

| Page | Verdict | Reality (file evidence) |
|---|---|---|
| Overview | Stub | 7 hardcoded arrays; file self-labels "Stub data" (`overview.tsx:38`) |
| Clients | Stub | 15 hardcoded clients; "Add Client" has no handler; actions are toasts (`clients.tsx:60`) |
| Subscriptions | Stub | Hardcoded subs/KPIs; Retry/Convert/Export are toasts (`subscriptions.tsx:38`) |
| Plans | Stub | Edits update React state only; reset on reload (`plans.tsx:39`) |
| Billing Controls | Stub | Coupons/usage hardcoded; create/delete in-memory (`billing-extras.tsx:37`) |
| System Health | Stub | Fake latencies/uptime; "Refresh" just spins an icon (`health.tsx:34`) |
| Security & Audit | Stub | Hardcoded staff/audit-log/IP-rules; toggles are toasts (`security.tsx:61`) |
| Chat Inbox | Stub | Hardcoded conversations; messages vanish on refresh; no realtime |
| Support / Tickets | Stub | Hardcoded tickets; Resolve/New Ticket are toasts (`support-new.tsx:53`) |
| Support Analytics | Stub | Hardcoded charts; "AI sentiment" is 3 static rows |
| Roadmap | Partial | Voting works but in-memory; "Add Request" = "coming soon" |

### 1c. 🟡 P1 — Structural
- **Duplicate shell**: [app/(admin)/admin/layout.tsx](../../../app/(admin)/admin/layout.tsx) and [components/admin/shell.tsx](../../../components/admin/shell.tsx) both define the shell; one had a broken (handler-less) logout. (Partly addressed by `9337eb8` — verify at implementation.)
- Admin identity hardcoded as "Super Admin / admin@wawprofi.com" instead of the session; Cmd+K search and the notification bell ("4") are static.

### 1d. Data that already exists (what real wiring would use)
- **"Clients" = the `organizations` table** (real; 21 rows), with `subscription_status`, `stripeCustomerId`, `stripeSubscriptionId` → billing is intended via **Stripe**.
- **Admin flag**: `users.is_super_admin` exists ([schema.prisma:967](../../../prisma/schema.prisma)) — but the design below uses a JWT claim instead (see §3).
- **Real audit log**: the `AuditEvent` table is real and written by accounting/banking flows — the Security page's "audit log" should surface it.
- **No tables** exist for Plans, Coupons, Support tickets, or Roadmap — those need new models.

---

## 2. Decomposition (each its own spec → plan → build)

| # | Sub-project | Backing data |
|---|---|---|
| **1** | **Access control & identity** *(this doc — foundation)* | `app_metadata` JWT claim |
| 2 | Clients management | `organizations` (real) |
| 3 | Subscriptions & billing | Stripe + org fields |
| 4 | Plans & billing controls | new models |
| 5 | Support & chat | new models |
| 6 | Impersonation (real) | session swap + audit |
| 7 | Health & security-audit surface | real checks + existing `AuditEvent` |
| 8 | Roadmap | new models |

**Sequencing:** #1 first — lock the door before wiring real data behind it. Then #2 (Clients), then the rest.

---

## 3. Sub-project #1 design: Access Control & Identity

### Goal
Make `/admin/*` a real, locked admin area: only users with a platform-admin JWT claim can reach it; login establishes a proper cookie session; the backdoor is gone; the shell shows the real admin identity with working logout. **Not** building admin features here — just the secure foundation.

### 3.1 Admin identity & provisioning
- Admin = Supabase **JWT claim** `app_metadata.role === "platform_admin"` (tamper-proof, in the token, cheap to check in middleware).
- **`scripts/grant-admin.cjs`** — uses the **service-role key** (`supabase.auth.admin.updateUserById`) to set that claim for a user by email; a `revoke-admin` counterpart removes it.
- **New env var `SUPABASE_SERVICE_ROLE_KEY`** (server-only secret; never `NEXT_PUBLIC_`). User adds it to `.env.local`.

### 3.2 Fix the login (`app/(admin)/admin/login/actions.ts`)
- Replace the anon-key singleton with the **`@supabase/ssr` server client** (same cookie-session pattern as [lib/supabase/server.ts](../../../lib/supabase/server.ts)) so `signInWithPassword` **sets the session cookies**.
- **Delete the `admin@gmail.com` / `@wawprofi.com` backdoor.** After sign-in, require `app_metadata.role === "platform_admin"`; otherwise `signOut()` + return an error.

### 3.3 Enforcement — two layers
- **Edge gate** in [lib/supabase/proxy.ts](../../../lib/supabase/proxy.ts) `updateSession`: for any `/admin/*` path except `/admin/login`, if the authenticated user is not a platform admin → redirect to `/admin/login`. Hooks into the existing `getUser()` call.
- **Server guard** `requirePlatformAdmin()` in a new **`lib/admin/auth.ts`** — called by the admin layout (converted to a **server component**). Defense-in-depth; also hands the real admin identity to the shell. Add a pure helper `isPlatformAdmin(user)` for unit testing.

### 3.4 Shell & identity cleanup
- Collapse the **duplicate shell** into one: the layout becomes a thin **server component** (runs the guard, fetches identity) wrapping a single client shell. Remove the redundant implementation.
- Shell shows the **real** admin email/name (from session) instead of hardcoded values, with a **working logout**. (Verify what `9337eb8` already fixed; finish rather than rebuild.)

### 3.5 Impersonation — neutralize (don't build yet)
The impersonate page/banner falsely promise audit-logging + read-only. For now, **hide the Impersonate nav item and gate the page behind a "coming soon" state** so it can't mislead. Real impersonation is sub-project #6.

### 3.6 Testing
- Unit-test the pure `isPlatformAdmin(user)` helper and the claim shape the grant script writes.
- Manual smoke: non-admin hitting `/admin` → bounced to `/admin/login`; admin → in; logout works; login with a non-admin account is rejected.
- (Middleware redirect itself is covered by the smoke check, not a unit test.)

### 3.7 Files
**Create:** `lib/admin/auth.ts` (`requirePlatformAdmin`, `isPlatformAdmin`), `scripts/grant-admin.cjs` (+ revoke), a test for the helper.
**Modify:** `app/(admin)/admin/login/actions.ts` (ssr session + remove backdoor + claim check), `lib/supabase/proxy.ts` (admin edge gate), `app/(admin)/admin/layout.tsx` (server-component guard + single shell), `components/admin/shell.tsx` (real identity), the admin nav (hide Impersonate), `.env.example` (add `SUPABASE_SERVICE_ROLE_KEY`, once restored).

### 3.8 Out of scope (later sub-projects)
Real impersonation (#6), any page's data wiring (#2–8), in-panel admin-staff management (#7).

---

## 4. Open items / decisions made
- ✅ Admin identity = JWT `app_metadata` claim (over `is_super_admin` column or a dedicated table).
- ✅ Provisioning = CLI script with the service-role key.
- ⏳ Requires adding `SUPABASE_SERVICE_ROLE_KEY` to env (user action).
- ⏳ `.env.example` is currently deleted from the working tree (unrelated, flagged separately) — restore before adding the new var to it.
