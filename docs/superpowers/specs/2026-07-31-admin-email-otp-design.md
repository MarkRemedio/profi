# Admin Email OTP — Design

Date: 2026-07-31
Status: Approved

## Goal

Add a second factor to platform-admin login: after the existing password check, a
6-digit code is emailed to the admin; admin routes stay locked until the code is
verified. Every login requires a fresh code (no trusted devices).

## Flow

1. **Password stage** — `adminSignIn` (app/(admin)/admin/login/actions.ts)
   validates via `supabase.auth.signInWithPassword`, `isPlatformAdmin`, and the
   Active `AdminProfile` check, exactly as today. On success it:
   - generates a 6-digit code (crypto-random),
   - upserts its HMAC-SHA256 hash into `AdminOtpCode` (one active code per admin),
   - emails the code via the existing Nodemailer/SMTP pattern,
   - redirects to `/admin/login/verify`.
   If the email fails to send: sign the session out and surface an error on the
   login form.
2. **Verify stage** — new page `app/(admin)/admin/login/verify/page.tsx`
   (outside the `(protected)` group). Client view with a 6-digit input and a
   resend button. Server action `verifyAdminOtp`:
   - loads the current Supabase user; must be a platform admin with a pending
     code, else redirect to `/admin/login`,
   - rejects expired codes and codes with ≥5 failed attempts,
   - on mismatch increments `attempts` and returns an error,
   - on success deletes the row, sets the signed `admin_otp` cookie, writes an
     audit event, and redirects to `adminHomeHref(...)`.
   `resendAdminOtp` re-issues a code with a 60-second cooldown (based on
   `createdAt` of the existing row).
3. **Gate** — the edge proxy (`lib/supabase/proxy.ts`) already redirects
   non-admins away from `/admin/*`. It additionally requires a valid `admin_otp`
   cookie (JWT verified with `jose`, edge-compatible) whose `sub` equals the
   current user id, for every `/admin` path except `/admin/login*`. Missing or
   invalid → redirect to `/admin/login`.
4. **Sign-out** — `adminSignOut` deletes the `admin_otp` cookie along with the
   Supabase session.

## Data model

New Prisma model (public schema, platform-level → `KNOWN_EXCLUDED` in
`lib/tenancy/scoped-models.ts` with a justifying comment):

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

`userId` as primary key enforces a single active code; resend replaces the row.
Hand-authored migration SQL in `prisma/migrations/<ts>_admin_otp_codes/`,
applied with `pnpm exec prisma migrate deploy` (never `migrate dev` — history
divergence).

## Security policy

- Code: 6 digits, generated with `crypto.randomInt`.
- Storage: HMAC-SHA256 of the code keyed by `ADMIN_OTP_SECRET`; plaintext never
  persisted or logged.
- Expiry: 10 minutes.
- Attempts: 5 wrong entries invalidate the code (must resend).
- Resend cooldown: 60 seconds.
- Verified cookie: JWT (HS256, `jose`) with `sub` = user id, 12-hour expiry,
  httpOnly, secure in production, sameSite lax, path `/`.
- New env var: `ADMIN_OTP_SECRET` (long random string; signs both the cookie and
  the code HMAC).
- Audit: `logAdminAction` events for code sent, verify success, verify failure.

## Accepted scope limits

- Between password and OTP a Supabase session exists, but the proxy blocks all
  `/admin` routes until the OTP cookie is set. Non-admin app routes are not
  gated by this feature.
- No trusted-device / remember-me: every admin login sends a code.

## Files touched

- `prisma/schema.prisma` + new migration folder
- `lib/admin/otp.ts` (new: generate/hash/verify/cooldown helpers, cookie
  sign/verify, email send)
- `app/(admin)/admin/login/actions.ts` (password stage + sign-out cookie clear)
- `app/(admin)/admin/login/verify/page.tsx` + `actions.ts` +
  `components/admin/admin-otp-view.tsx` (new)
- `lib/supabase/proxy.ts` (OTP cookie gate; edge-safe — `jose` only, no
  Prisma/nodemailer)
- `lib/tenancy/scoped-models.ts` (`KNOWN_EXCLUDED` entry)

## Testing

One consolidated pass at the end (per project preference): unit tests for OTP
helpers (hashing, expiry, attempt cap, cooldown), tenancy registry test stays
green, plus a manual login walkthrough.
