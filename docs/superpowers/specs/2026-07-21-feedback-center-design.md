# Feedback Center — Design Spec

**Date:** 2026-07-21
**Status:** Approved
**Approach:** Native in-house (Prisma model + Supabase storage + admin queue)

## Overview

A floating chat-style feedback bubble, overlaid on every page a logged-in user can access, letting users report errors (module select, details, image attachments). Reports land in a queue in the admin area where admins sort, filter, and mark them New / In Progress / Done. Fire-and-forget for users: they get a thank-you confirmation and no visible report history.

## Decisions made during brainstorming

- **Visibility:** bubble shows on all pages when a session exists (dashboard, onboarding, public pages); hidden for anonymous visitors, on `/print` routes (PDF rendering), and in `/admin`.
- **Error source:** fixed module dropdown pre-selected from the current route, not free text. Page URL and browser user-agent captured silently.
- **User side:** fire-and-forget — no "my reports" history.
- **Admin notifications:** none (no email). Queue page + NEW-count badge on admin nav only.

## 1. Data model

New enum + model in `prisma/schema.prisma`, following existing conventions (uuid PK via `gen_random_uuid()`, snake_case `@map`, `@@schema("public")`):

```prisma
enum FeedbackStatus {
  NEW
  IN_PROGRESS
  DONE
}

model FeedbackReport {
  id             String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String         @map("org_id") @db.Uuid
  userId         String         @map("user_id") @db.Uuid
  module         String         // "dashboard" | "sales" | "purchases" | "banking" | "payroll" | "taxes" | "reports" | "pos" | "settings" | "other"
  details        String
  attachments    String[]       @default([]) // Supabase storage public URLs, max 3
  pageUrl        String         @map("page_url")
  userAgent      String?        @map("user_agent")
  status         FeedbackStatus @default(NEW)
  createdAt      DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime       @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization   Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  user           users          @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([status])
  @@index([createdAt])
  @@map("feedback_reports")
  @@schema("public")
}
```

- `module` is a plain string so new app areas don't require a migration.
- Migration authored as SQL and applied with `prisma migrate deploy` (local migration history diverges from the DB — never `migrate dev`; see memory note).
- Add the back-relations `feedbackReports FeedbackReport[]` on `Organization` and `users`.

## 2. User-side bubble

**Files:**
- `components/feedback/feedback-bubble.tsx` — client component: fixed bottom-right circular launcher (chat-widget style) expanding into a card panel. Built from the existing UI kit (shadcn `Button`, `Card`, `Select`, `Textarea`; `sonner` toasts; lucide icons).
- `components/feedback/feedback-provider.tsx` (or equivalent wrapper) — session-aware mount: renders nothing when logged out; self-hides when `usePathname()` starts with `/print` or `/admin`.
- Mounted once in the root `app/layout.tsx` (via `providers.tsx` if that's where client-side session context lives).

**Form fields:**
1. **Module select** — options: Dashboard, Sales, Purchases, Banking, Payroll, Taxes, Reports, POS, Settings, Other. Pre-selected by matching the first segment of the current route; falls back to Other.
2. **Details textarea** — required, trimmed non-empty.
3. **Image attachments** — up to 3 images, client-side checks (image MIME types only, ~5 MB each), preview thumbnails with remove buttons. Uploaded from the client to the existing public `workspace_assets` Supabase bucket under a `feedback/` prefix (path: `feedback/<userId>/<timestamp>-<n>.<ext>`), following the `upload-template-logo.ts` pattern — reusing the bucket avoids new storage policy setup since client uploads there are already proven to work.
4. **Submit** button.

**Silent capture:** current page URL (`window.location.pathname + search`) and `navigator.userAgent`.

**Submit flow:** client uploads images first (failures non-fatal — report still submits without them and the user is told images didn't attach), then calls `submitFeedbackAction` with `{ module, details, attachmentUrls, pageUrl, userAgent }`. On success the panel swaps to a thank-you state, then resets and closes. Fire-and-forget.

## 3. Server actions

- **`submitFeedbackAction`** in `components/feedback/actions.ts` (the bubble is global, not route-scoped, so its action lives beside the component).
- **`updateFeedbackStatusAction`** in `app/(admin)/admin/(protected)/feedback/actions.ts` (co-located with the admin page per repo convention).

Behavior:

- **`submitFeedbackAction`** — requires a valid session; resolves the user's active organization with the same helper existing dashboard actions use; validates: details non-empty, ≤ 3 attachments, attachment URLs point at the `workspace_assets/feedback/` storage path, module in the known list (else coerced to `other`). Creates the `FeedbackReport` row.
- **`updateFeedbackStatusAction`** — admin-only, guarded by the same admin auth used by other `(protected)` admin actions. Sets `status` to any of the three values.

## 4. Admin queue

**Page:** `app/(admin)/admin/(protected)/feedback/page.tsx`, added to the admin nav with a badge showing the count of `NEW` reports.

**Queue table** (newest-first default):
- Columns: status chip, module, details preview (truncated, expandable), reporter (name/email + organization name), submitted date, attachment thumbnails (click opens full image in new tab), status-change dropdown.
- **Sort:** by date (asc/desc) and status.
- **Filter:** status (All / New / In Progress / Done) and module.
- Status changes call `updateFeedbackStatusAction`; optimistic UI with toast on failure.
- No deletion in v1 — Done reports remain, filterable away.

## 5. Error handling

- Attachment upload failure: non-fatal; submit proceeds without the failed images, user notified.
- `submitFeedbackAction` rejects: no session, no resolvable org, empty details, > 3 attachments, non-bucket URLs.
- `updateFeedbackStatusAction` rejects non-admin callers.
- Bubble render is defensive: if session state is unresolved, render nothing (never block page load).

## 6. Testing

Per project preference, one consolidated test pass at the end of implementation (not per-task TDD):
- `submitFeedbackAction`: auth required, validation rules, org scoping, successful create.
- `updateFeedbackStatusAction`: admin-only guard, status transitions.
- Module-from-route mapping helper: route → module unit cases.

## Out of scope (v1)

- User-visible report history / statuses
- Email notifications
- Two-way replies (future: could become the real backend of the mock admin chat-inbox)
- Report deletion
- Anonymous submissions
