# Admin Email OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin login requires a 6-digit code emailed after the password check; admin routes stay locked until the code is verified.

**Architecture:** The existing `adminSignIn` action, after its password/claim/profile checks, issues a hashed OTP row (`AdminOtpCode`), emails the code via the existing Nodemailer/SMTP pattern, and redirects to `/admin/login/verify`. A verify action consumes the code and sets an HMAC-signed `admin_otp` cookie (same `body.sig` format as `lib/admin/impersonation.ts`). The proxy (`lib/supabase/proxy.ts`, Node runtime in Next 16) additionally requires that cookie for all `/admin/*` paths except `/admin/login*`.

**Tech Stack:** Next.js 16 App Router (server actions, `proxy.ts`), Supabase auth, Prisma, `node:crypto` (HMAC-SHA256, no new deps), Nodemailer/SMTP, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-31-admin-email-otp-design.md`
- Code policy: 6 digits; expiry 10 min; 5 attempts; resend cooldown 60 s; cookie TTL 12 h; plaintext code never persisted or logged.
- New env var: `ADMIN_OTP_SECRET` (signs both the code HMAC and the cookie).
- Migrations: hand-authored SQL + `pnpm exec prisma migrate deploy` — **never `migrate dev`** (history divergence), then `pnpm prisma generate`.
- **No git commits** — the user commits manually (project preference). Skip every "commit" step.
- **Testing cadence** — per project preference: implement first, one consolidated test pass at the end (Task 8). Individual tasks only need to compile.
- New Prisma model must be added to `KNOWN_EXCLUDED` in `lib/tenancy/scoped-models.ts` with a justifying comment (registry test enforces it).
- `proxy.ts` must not import Prisma or nodemailer (bundle rule in `lib/admin/auth.ts` comments); `node:crypto` is fine (Node runtime).
- Full vitest suite has 8 known pre-existing failures and takes ~21 min — run targeted files only.

---

### Task 1: `AdminOtpCode` model + migration + tenancy registry

**Files:**
- Modify: `prisma/schema.prisma` (append near `AdminProfile`, ~line 1581)
- Create: `prisma/migrations/20260731090000_admin_otp_codes/migration.sql`
- Modify: `lib/tenancy/scoped-models.ts` (platform-level section of `KNOWN_EXCLUDED`, ~line 76)

**Interfaces:**
- Produces: Prisma model `AdminOtpCode` → client accessor `prisma.adminOtpCode` with fields `userId: string`, `codeHash: string`, `expiresAt: Date`, `attempts: number`, `createdAt: Date`.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`** (after the `AdminAuditEvent` model block):

```prisma
model AdminOtpCode {
  userId    String   @id @map("user_id") @db.Uuid
  codeHash  String   @map("code_hash")
  expiresAt DateTime @map("expires_at") @db.Timestamptz(6)
  attempts  Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@map("admin_otp_codes")
  @@schema("public")
}
```

`userId` as primary key = one active code per admin; resend replaces the row. No FK to `auth.users` — a stale row is harmless and expires; avoids touching the Supabase-managed model.

- [ ] **Step 2: Create the migration SQL**

`prisma/migrations/20260731090000_admin_otp_codes/migration.sql`:

```sql
-- Admin login email-OTP second factor. One active code per admin (PK = user_id).
CREATE TABLE "public"."admin_otp_codes" (
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "admin_otp_codes_pkey" PRIMARY KEY ("user_id")
);
```

- [ ] **Step 3: Register in tenancy registry** — in `lib/tenancy/scoped-models.ts`, platform-level section of `KNOWN_EXCLUDED` (alongside `"SubscriptionPlan"`), add:

```ts
  "AdminOtpCode",       // platform-admin login OTP, keyed by auth user id; no org column
```

- [ ] **Step 4: Apply and generate**

Run: `pnpm exec prisma migrate deploy` then `pnpm prisma generate`
Expected: migration `20260731090000_admin_otp_codes` applied; generate succeeds.

---

### Task 2: Signed cookie module (proxy-safe)

**Files:**
- Create: `lib/admin/otp-cookie.ts`

**Interfaces:**
- Produces: `ADMIN_OTP_COOKIE = "admin_otp"`, `ADMIN_OTP_COOKIE_TTL_MS`, `signAdminOtpCookie(payload, secret): string`, `verifyAdminOtpCookie(value, secret, now?): AdminOtpCookiePayload | null` with `AdminOtpCookiePayload = { sub: string; exp: number }`.
- Constraint: NO `next/headers`, NO Prisma, NO nodemailer imports — this module is imported by `lib/supabase/proxy.ts`.

- [ ] **Step 1: Write the module** (mirrors `lib/admin/impersonation.ts` sign/verify):

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

// Kept free of next/headers, Prisma, and nodemailer: this module is imported by
// the proxy, which must stay lean.

export const ADMIN_OTP_COOKIE = "admin_otp";
export const ADMIN_OTP_COOKIE_TTL_MS = 12 * 60 * 60 * 1000;

export interface AdminOtpCookiePayload {
  /** Supabase user id the OTP was verified for. */
  sub: string;
  /** Expiry, epoch ms. */
  exp: number;
}

export function signAdminOtpCookie(payload: AdminOtpCookiePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Returns null if absent, malformed, tampered, wrongly signed, or expired. */
export function verifyAdminOtpCookie(
  value: string | undefined,
  secret: string,
  now: number = Date.now()
): AdminOtpCookiePayload | null {
  if (!value || !secret) return null;
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
    if (typeof parsed?.sub !== "string" || typeof parsed?.exp !== "number") return null;
    if (parsed.exp <= now) return null;
    return parsed as AdminOtpCookiePayload;
  } catch {
    return null;
  }
}
```

---

### Task 3: OTP helper module + audit actions

**Files:**
- Create: `lib/admin/otp.ts`
- Modify: `lib/admin/audit.ts` (extend `AdminAuditAction` union ~line 31 and `ADMIN_AUDIT_LABELS` ~line 94)

**Interfaces:**
- Consumes: `prisma.adminOtpCode` (Task 1).
- Produces: `OTP_EXPIRY_MS`, `OTP_MAX_ATTEMPTS = 5`, `OTP_RESEND_COOLDOWN_MS`, `requireOtpSecret(): string`, `generateOtpCode(): string`, `hashOtpCode(code, secret): string`, `evaluateOtpAttempt(row, submittedCode, secret, now?): "ok" | "expired" | "locked" | "mismatch"`, `issueAdminOtp(userId, email): Promise<void>`. Audit union gains `"admin.otp_send" | "admin.otp_verify" | "admin.otp_fail"`.

- [ ] **Step 1: Write `lib/admin/otp.ts`**:

```ts
import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

import { prisma } from "@/lib/prisma";

export const OTP_EXPIRY_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export function requireOtpSecret(): string {
  const s = process.env.ADMIN_OTP_SECRET;
  if (!s) {
    throw new Error("ADMIN_OTP_SECRET is not set — required for admin login verification.");
  }
  return s;
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

export type OtpAttemptOutcome = "ok" | "expired" | "locked" | "mismatch";

/** Pure decision function so the policy is unit-testable without a DB. */
export function evaluateOtpAttempt(
  row: { codeHash: string; expiresAt: Date; attempts: number },
  submittedCode: string,
  secret: string,
  now: Date = new Date()
): OtpAttemptOutcome {
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  if (row.attempts >= OTP_MAX_ATTEMPTS) return "locked";
  const submitted = Buffer.from(hashOtpCode(submittedCode, secret));
  const stored = Buffer.from(row.codeHash);
  if (submitted.length !== stored.length || !timingSafeEqual(submitted, stored)) {
    return "mismatch";
  }
  return "ok";
}

/**
 * Create (or replace) the admin's pending code and email it.
 * Throws on SMTP failure — the caller decides how to unwind the session.
 */
export async function issueAdminOtp(userId: string, email: string): Promise<void> {
  const secret = requireOtpSecret();
  const code = generateOtpCode();
  const now = new Date();
  const data = {
    codeHash: hashOtpCode(code, secret),
    expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
    attempts: 0,
    createdAt: now,
  };

  await prisma.adminOtpCode.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: `"WAWPROFI Cloud" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `${code} is your WAWPROFI admin verification code`,
    html: otpEmailHtml(code),
  });
}

function otpEmailHtml(code: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px;">
      <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">

        <div style="text-align: center; margin-bottom: 30px;">
          <div style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 900; font-size: 24px; width: 50px; height: 50px; line-height: 50px; border-radius: 14px;">W</div>
          <div style="color: #0f172a; font-size: 18px; font-weight: 900; margin-top: 16px; letter-spacing: -0.5px;">WAWPROFI</div>
        </div>

        <h2 style="color: #0f172a; font-size: 24px; font-weight: 800; text-align: center; margin: 0 0 24px; letter-spacing: -0.5px;">
          Admin verification code
        </h2>

        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
          Enter this code to finish signing in to the WAWPROFI admin portal.
        </p>

        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px 28px; font-size: 32px; font-weight: 900; letter-spacing: 10px; color: #0f172a;">${code}</div>
        </div>

        <p style="color: #64748b; font-size: 13px; line-height: 1.6; text-align: center; margin: 0;">
          The code expires in 10 minutes. If you did not try to sign in, someone
          may know your password — change it immediately.
        </p>
      </div>
    </div>
  `;
}
```

- [ ] **Step 2: Extend the audit union** in `lib/admin/audit.ts` — add to `AdminAuditAction` after `"admin.reactivate"`:

```ts
  | "admin.otp_send"
  | "admin.otp_verify"
  | "admin.otp_fail"
```

and to `ADMIN_AUDIT_LABELS` after `"admin.reactivate": ...`:

```ts
  "admin.otp_send": "Sent login verification code",
  "admin.otp_verify": "Verified login code",
  "admin.otp_fail": "Failed login code attempt",
```

---

### Task 4: Server actions — password stage, verify, resend, sign-out

**Files:**
- Modify: `app/(admin)/admin/login/actions.ts`
- Create: `app/(admin)/admin/login/verify/actions.ts`

**Interfaces:**
- Consumes: `issueAdminOtp`, `evaluateOtpAttempt`, `requireOtpSecret`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_MS` (Task 3); `signAdminOtpCookie`, `ADMIN_OTP_COOKIE`, `ADMIN_OTP_COOKIE_TTL_MS` (Task 2); `logAdminAction` (Task 3 union).
- Produces: `verifyAdminOtp(prevState, formData): Promise<AdminOtpState>` and `resendAdminOtp(prevState, formData): Promise<AdminOtpState>` where `AdminOtpState = { error?: string; info?: string } | null` — consumed by the view in Task 5 via `useActionState`.

- [ ] **Step 1: Rework `adminSignIn`** — replace the destination/redirect block (lines 56-65) so a successful password check issues a code and lands on `/admin/login/verify`. Also add the `cookies` import and clear the OTP cookie in `adminSignOut`:

```ts
"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin/auth";
import { ADMIN_OTP_COOKIE } from "@/lib/admin/otp-cookie";

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

  // signInWithPassword via the @supabase/ssr server client persists the
  // session as httpOnly cookies (this runs inside a Server Action).
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: error?.message || "Invalid administrative credentials." };
  }

  if (!isPlatformAdmin(data.user)) {
    await supabase.auth.signOut();
    return {
      error: "Access Denied: this account does not have platform-admin privileges.",
    };
  }

  // A suspended admin still holds the claim, so reject here with a real message
  // rather than letting the layout guard bounce them back to this page silently.
  const { prisma } = await import("@/lib/prisma");
  const profile = await prisma.adminProfile.findUnique({
    where: { userId: data.user.id },
    select: { status: true },
  });

  if (profile && profile.status !== "Active") {
    await supabase.auth.signOut();
    return { error: "This administrator account has been suspended." };
  }

  // Second factor: the password session alone cannot pass the proxy's OTP
  // cookie gate, so nothing under /admin is reachable until the emailed code
  // is verified. A failed send unwinds the session entirely.
  if (!data.user.email) {
    await supabase.auth.signOut();
    return { error: "This administrator account has no email address on file." };
  }

  const { issueAdminOtp } = await import("@/lib/admin/otp");
  try {
    await issueAdminOtp(data.user.id, data.user.email);
  } catch (sendError) {
    console.error("Failed to send admin verification code:", sendError);
    await supabase.auth.signOut();
    return { error: "Could not send the verification code email. Please try again." };
  }

  const { logAdminAction } = await import("@/lib/admin/audit");
  await logAdminAction({
    actor: { userId: data.user.id, email: data.user.email },
    action: "admin.otp_send",
    targetType: "admin",
    targetId: data.user.id,
  });

  // redirect() throws by design — keep it outside any try/catch.
  redirect("/admin/login/verify");
}

export async function adminSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const store = await cookies();
  store.delete(ADMIN_OTP_COOKIE);
  redirect("/admin/login");
}
```

Note: the `role`/`permissions` selection and `adminHomeHref` destination logic move out of `adminSignIn` (the redirect target is now always the verify page); the verify action picks the landing module instead. Drop the now-unused `adminHomeHref`/`resolveAdminPermissions`/`AdminRoleValue` imports.

- [ ] **Step 2: Create `app/(admin)/admin/login/verify/actions.ts`**:

```ts
"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin/auth";
import {
  adminHomeHref,
  resolveAdminPermissions,
  type AdminRoleValue,
} from "@/lib/admin/permissions";
import {
  ADMIN_OTP_COOKIE,
  ADMIN_OTP_COOKIE_TTL_MS,
  signAdminOtpCookie,
} from "@/lib/admin/otp-cookie";

export type AdminOtpState = { error?: string; info?: string } | null;

export async function verifyAdminOtp(
  prevState: AdminOtpState,
  formData: FormData
): Promise<AdminOtpState> {
  const code = ((formData.get("code") as string | null) ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { error: "Enter the 6-digit code from your email." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user)) {
    redirect("/admin/login");
  }

  const { prisma } = await import("@/lib/prisma");
  const {
    evaluateOtpAttempt,
    requireOtpSecret,
    OTP_MAX_ATTEMPTS,
  } = await import("@/lib/admin/otp");
  const { logAdminAction } = await import("@/lib/admin/audit");

  const row = await prisma.adminOtpCode.findUnique({ where: { userId: user.id } });
  if (!row) {
    return { error: "No pending verification code. Use resend to get a new one." };
  }

  const actor = { userId: user.id, email: user.email ?? null };
  const outcome = evaluateOtpAttempt(row, code, requireOtpSecret());

  if (outcome === "expired") {
    return { error: "This code has expired. Request a new one below." };
  }
  if (outcome === "locked") {
    return { error: "Too many incorrect attempts. Request a new code below." };
  }
  if (outcome === "mismatch") {
    await prisma.adminOtpCode.update({
      where: { userId: user.id },
      data: { attempts: { increment: 1 } },
    });
    await logAdminAction({
      actor,
      action: "admin.otp_fail",
      targetType: "admin",
      targetId: user.id,
      severity: "warning",
    });
    const remaining = OTP_MAX_ATTEMPTS - (row.attempts + 1);
    return {
      error:
        remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Too many incorrect attempts. Request a new code below.",
    };
  }

  await prisma.adminOtpCode.delete({ where: { userId: user.id } });

  const store = await cookies();
  store.set(
    ADMIN_OTP_COOKIE,
    signAdminOtpCookie(
      { sub: user.id, exp: Date.now() + ADMIN_OTP_COOKIE_TTL_MS },
      requireOtpSecret()
    ),
    { httpOnly: true, secure: true, sameSite: "lax", path: "/" }
  );

  await logAdminAction({
    actor,
    action: "admin.otp_verify",
    targetType: "admin",
    targetId: user.id,
  });

  // Land them on a module they actually hold (same logic the password stage
  // used before the OTP step was inserted).
  const profile = await prisma.adminProfile.findUnique({
    where: { userId: user.id },
    select: { role: true, permissions: true },
  });
  const destination = profile
    ? adminHomeHref(
        resolveAdminPermissions(profile.role as AdminRoleValue, profile.permissions)
      )
    : "/admin";

  // redirect() throws by design — keep it outside any try/catch.
  redirect(destination);
}

export async function resendAdminOtp(
  prevState: AdminOtpState,
  formData: FormData
): Promise<AdminOtpState> {
  void formData;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user) || !user.email) {
    redirect("/admin/login");
  }

  const { prisma } = await import("@/lib/prisma");
  const { issueAdminOtp, OTP_RESEND_COOLDOWN_MS } = await import("@/lib/admin/otp");
  const { logAdminAction } = await import("@/lib/admin/audit");

  const existing = await prisma.adminOtpCode.findUnique({
    where: { userId: user.id },
  });
  if (
    existing &&
    Date.now() - existing.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    return { error: "Please wait a minute before requesting another code." };
  }

  try {
    await issueAdminOtp(user.id, user.email);
  } catch (sendError) {
    console.error("Failed to resend admin verification code:", sendError);
    return { error: "Could not send the code. Please try again." };
  }

  await logAdminAction({
    actor: { userId: user.id, email: user.email },
    action: "admin.otp_send",
    targetType: "admin",
    targetId: user.id,
  });

  return { info: "A new code is on its way to your email." };
}
```

---

### Task 5: Verify page + OTP view component

**Files:**
- Create: `app/(admin)/admin/login/verify/page.tsx`
- Create: `components/admin/admin-otp-view.tsx`

**Interfaces:**
- Consumes: `verifyAdminOtp`, `resendAdminOtp`, `AdminOtpState` (Task 4).
- Produces: route `/admin/login/verify` (inside the `login` segment, so the proxy's `/admin/login` carve-out already covers it).

- [ ] **Step 1: Create `app/(admin)/admin/login/verify/page.tsx`**:

```tsx
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin/auth";
import AdminOtpView from "@/components/admin/admin-otp-view";

export default async function AdminOtpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only a half-authenticated admin (password ok, code pending) belongs here.
  if (!user || !isPlatformAdmin(user)) {
    redirect("/admin/login");
  }

  return <AdminOtpView email={user.email ?? ""} />;
}
```

- [ ] **Step 2: Create `components/admin/admin-otp-view.tsx`** (styled to match `admin-login-view.tsx`):

```tsx
"use client";

import { useActionState } from "react";
import {
  verifyAdminOtp,
  resendAdminOtp,
  type AdminOtpState,
} from "@/app/(admin)/admin/login/verify/actions";
import { AlertCircle, KeyRound, MailCheck } from "lucide-react";

const initialState: AdminOtpState = null;

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 2)}•••@${domain}`;
}

export default function AdminOtpView({ email }: { email: string }) {
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyAdminOtp as (state: AdminOtpState, formData: FormData) => Promise<AdminOtpState>,
    initialState
  );
  const [resendState, resendAction, resending] = useActionState(
    resendAdminOtp as (state: AdminOtpState, formData: FormData) => Promise<AdminOtpState>,
    initialState
  );

  const error = verifyState?.error ?? resendState?.error;
  const info = resendState?.info;

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-slate-50 font-sans text-slate-900 px-4 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative w-full max-w-md p-8 sm:p-10 border border-slate-200/80 rounded-[2rem] bg-white/80 backdrop-blur-xl shadow-2xl shadow-blue-900/5 flex flex-col">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-b-full" />

        <div className="mb-8 text-center flex flex-col items-center">
          <div className="size-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-blue-100/50">
            <MailCheck className="size-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Check your email</h1>
          <p className="text-slate-500 text-sm mt-2 font-medium">
            We sent a 6-digit verification code to{" "}
            <span className="font-bold text-slate-700">{maskEmail(email)}</span>.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-red-50 p-4 text-xs font-semibold text-red-800 border border-red-100 animate-in fade-in-50 slide-in-from-top-2 duration-300 shadow-sm">
            <AlertCircle className="size-4 shrink-0 text-red-600 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {!error && info && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 border border-emerald-100 animate-in fade-in-50 slide-in-from-top-2 duration-300 shadow-sm">
            <MailCheck className="size-4 shrink-0 text-emerald-600 mt-0.5" />
            <span className="leading-relaxed">{info}</span>
          </div>
        )}

        <form action={verifyAction} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="code" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
              Verification Code
            </label>
            <div className="relative group">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                required
                disabled={verifying}
                placeholder="••••••"
                className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-white/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white text-lg tracking-[0.5em] font-bold transition-all shadow-sm disabled:opacity-60"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={verifying}
            className="w-full h-12 mt-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm transition-all shadow-md shadow-blue-600/20 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {verifying ? "Verifying Code..." : "Verify & Continue"}
          </button>
        </form>

        <form action={resendAction} className="mt-6 text-center">
          <button
            type="submit"
            disabled={resending || verifying}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {resending ? "Sending..." : "Didn't get it? Resend code"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

(The 60-second resend cooldown is enforced server-side in `resendAdminOtp`; a premature click just shows the "wait a minute" error — no client timer needed. YAGNI.)

---

### Task 6: Proxy gate

**Files:**
- Modify: `lib/supabase/proxy.ts` (admin gate block, lines 67-76)

**Interfaces:**
- Consumes: `ADMIN_OTP_COOKIE`, `verifyAdminOtpCookie` (Task 2).
- Constraint: keep this file free of Prisma/nodemailer imports; `node:crypto` via `otp-cookie` is fine (proxy runs the Node runtime in Next 16).

- [ ] **Step 1: Add the import** at the top of `lib/supabase/proxy.ts`:

```ts
import { ADMIN_OTP_COOKIE, verifyAdminOtpCookie } from "@/lib/admin/otp-cookie";
```

- [ ] **Step 2: Replace the admin gate block** (currently lines 67-76) with:

```ts
  // Optimistic edge gate: lock /admin/* (except the login + OTP pages) to
  // platform admins who have also passed the email-OTP step. Defense-in-depth
  // is re-checked server-side in the (protected) layout.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const otp = user
      ? verifyAdminOtpCookie(
          request.cookies.get(ADMIN_OTP_COOKIE)?.value,
          process.env.ADMIN_OTP_SECRET ?? ""
        )
      : null;

    // Fail closed: no admin claim, no OTP cookie, a stale cookie, or a cookie
    // minted for a different user all bounce to the login page.
    if (!user || !isPlatformAdmin(user) || !otp || otp.sub !== user.id) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }
```

---

### Task 7: Environment + docs

**Files:**
- Modify: `.env.local` (append)
- Modify: `README.md` (env var table/section, ~line 280 where SMTP vars are documented)

- [ ] **Step 1: Generate a secret and append to `.env.local`**

Run: `node -e "console.log('ADMIN_OTP_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env.local`
Expected: line appended (verify with a read; do not print the secret into logs beyond this).

- [ ] **Step 2: Document in `README.md`** next to the SMTP variables:

```markdown
| `ADMIN_OTP_SECRET` | Signs admin login email-OTP codes and the `admin_otp` verification cookie. Required for admin login. |
```

(Match the exact table/format found at that spot in the README.)

---

### Task 8: Consolidated test pass + manual verification

**Files:**
- Create: `tests/admin-otp.test.ts`

**Interfaces:**
- Consumes: `generateOtpCode`, `hashOtpCode`, `evaluateOtpAttempt`, `OTP_MAX_ATTEMPTS` (Task 3); `signAdminOtpCookie`, `verifyAdminOtpCookie` (Task 2).

- [ ] **Step 1: Write `tests/admin-otp.test.ts`** (model on `tests/impersonation-cookie.test.ts` — same shims cover `server-only`/`next/headers`):

```ts
import { describe, expect, it } from "vitest";

import {
  evaluateOtpAttempt,
  generateOtpCode,
  hashOtpCode,
  OTP_MAX_ATTEMPTS,
} from "@/lib/admin/otp";
import {
  signAdminOtpCookie,
  verifyAdminOtpCookie,
} from "@/lib/admin/otp-cookie";

const SECRET = "test-secret";

function row(overrides: Partial<{ codeHash: string; expiresAt: Date; attempts: number }> = {}) {
  return {
    codeHash: hashOtpCode("123456", SECRET),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    ...overrides,
  };
}

describe("generateOtpCode", () => {
  it("always returns 6 digits", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashOtpCode", () => {
  it("is deterministic for the same code and secret", () => {
    expect(hashOtpCode("123456", SECRET)).toBe(hashOtpCode("123456", SECRET));
  });

  it("differs across secrets", () => {
    expect(hashOtpCode("123456", SECRET)).not.toBe(hashOtpCode("123456", "other"));
  });
});

describe("evaluateOtpAttempt", () => {
  it("accepts the right code", () => {
    expect(evaluateOtpAttempt(row(), "123456", SECRET)).toBe("ok");
  });

  it("rejects a wrong code as mismatch", () => {
    expect(evaluateOtpAttempt(row(), "654321", SECRET)).toBe("mismatch");
  });

  it("rejects an expired code even when correct", () => {
    const expired = row({ expiresAt: new Date(Date.now() - 1) });
    expect(evaluateOtpAttempt(expired, "123456", SECRET)).toBe("expired");
  });

  it("locks after the attempt cap even when correct", () => {
    const locked = row({ attempts: OTP_MAX_ATTEMPTS });
    expect(evaluateOtpAttempt(locked, "123456", SECRET)).toBe("locked");
  });
});

describe("admin OTP cookie", () => {
  it("round-trips a valid payload", () => {
    const value = signAdminOtpCookie({ sub: "user-1", exp: Date.now() + 1000 }, SECRET);
    expect(verifyAdminOtpCookie(value, SECRET)?.sub).toBe("user-1");
  });

  it("rejects a tampered body", () => {
    const value = signAdminOtpCookie({ sub: "user-1", exp: Date.now() + 1000 }, SECRET);
    const [body, sig] = value.split(".");
    const forged =
      Buffer.from(JSON.stringify({ sub: "attacker", exp: Date.now() + 1000 })).toString("base64url") +
      "." +
      sig;
    expect(verifyAdminOtpCookie(forged, SECRET)).toBeNull();
    expect(body).toBeTruthy();
  });

  it("rejects the wrong secret", () => {
    const value = signAdminOtpCookie({ sub: "user-1", exp: Date.now() + 1000 }, SECRET);
    expect(verifyAdminOtpCookie(value, "other")).toBeNull();
  });

  it("rejects an expired cookie", () => {
    const value = signAdminOtpCookie({ sub: "user-1", exp: Date.now() - 1 }, SECRET);
    expect(verifyAdminOtpCookie(value, SECRET)).toBeNull();
  });

  it("rejects garbage and empty values", () => {
    expect(verifyAdminOtpCookie(undefined, SECRET)).toBeNull();
    expect(verifyAdminOtpCookie("", SECRET)).toBeNull();
    expect(verifyAdminOtpCookie("not-a-cookie", SECRET)).toBeNull();
  });
});
```

- [ ] **Step 2: Run targeted tests**

Run: `pnpm exec vitest run tests/admin-otp.test.ts tests/tenancy tests/admin-auth.test.ts tests/impersonation-cookie.test.ts`
Expected: all pass (tenancy registry test proves the `KNOWN_EXCLUDED` entry; do NOT run the full suite — 8 known unrelated failures, ~21 min).

- [ ] **Step 3: Type-check the touched app code**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors (compare against a pre-change baseline if the repo has existing ones).

- [ ] **Step 4: Manual walkthrough** (requires SMTP env vars + `ADMIN_OTP_SECRET` set)

1. `pnpm dev`, open `/admin/login`, sign in with an admin account → lands on `/admin/login/verify`, email arrives with a 6-digit code.
2. While on the verify page, open `/admin` directly in another tab → bounced to `/admin/login` (no OTP cookie yet).
3. Enter a wrong code → "Incorrect code. 4 attempts remaining."
4. Enter the right code → lands on the admin overview; `/admin` now loads.
5. Click resend twice quickly → second click shows the cooldown message.
6. Sign out → `/admin` bounces to `/admin/login` again (cookie cleared).
7. Check the Security page audit log shows "Sent login verification code" / "Verified login code" events.
