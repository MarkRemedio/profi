# Feedback Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A floating feedback bubble on every logged-in page (module select, details, up to 3 image attachments) feeding a sortable, status-tracked report queue in the admin area.

**Architecture:** New org-scoped `FeedbackReport` Prisma model. Business logic in `lib/feedback/feedback.ts` (testable without auth), thin server actions on top (`requireAccountingWorkspace` for submit, `requirePlatformAdmin` + `runAsSystem` for admin). Client bubble mounted once in the root layout, self-hiding on `/admin`, `/print`, and for anonymous visitors. Attachments go to the existing public `workspace_assets` Supabase bucket under `feedback/`.

**Tech Stack:** Next.js 16.2.4 App Router, Prisma (multiSchema, tenancy extension), Supabase (auth + storage), shadcn UI (`components/ui/*`), sonner toasts, lucide icons, vitest.

**Spec:** `docs/superpowers/specs/2026-07-21-feedback-center-design.md`

## Global Constraints

- **NEVER run `prisma migrate dev`** — local migration history diverges from the DB. Author SQL by hand in `prisma/migrations/<timestamp>_<name>/migration.sql` and apply with `pnpm exec prisma migrate deploy`.
- **Do NOT commit** — the user commits manually. No `git commit` steps anywhere.
- **Testing is consolidated in the final task** (user preference — no per-task TDD). Each task still ends with a typecheck.
- This repo's Next.js is v16 with breaking changes — consult `node_modules/next/dist/docs/` if an API behaves unexpectedly. `revalidatePath` single-arg form is fine (used throughout the codebase).
- Every Prisma model carrying `organizationId` MUST be registered in `lib/tenancy/scoped-models.ts` `ORG_SCOPED` — a registry-completeness test fails otherwise.
- Cross-org admin queries MUST be wrapped in `runAsSystem()` from `@/lib/tenancy/context`.
- Package manager is **pnpm**.
- Follow existing conventions: uuid PKs via `gen_random_uuid()`, snake_case `@map` column names, `@@schema("public")`, `Timestamptz(6)` timestamps.

---

### Task 1: Schema, migration, tenancy registration

**Files:**
- Modify: `prisma/schema.prisma` (add enum + model; back-relations on `Organization` ~line 64 and `users` ~line 1191)
- Create: `prisma/migrations/20260721120000_feedback_reports/migration.sql`
- Modify: `lib/tenancy/scoped-models.ts:58` (add to `ORG_SCOPED`)

**Interfaces:**
- Produces: Prisma model `FeedbackReport` (client accessor `prisma.feedbackReport`), enum `FeedbackStatus` (`NEW | IN_PROGRESS | DONE`) importable from `@prisma/client`.

- [ ] **Step 1: Add enum + model to `prisma/schema.prisma`** (place near the other public-schema models, e.g. after `WorkspaceInvitation`):

```prisma
enum FeedbackStatus {
  NEW         @map("new")
  IN_PROGRESS @map("in_progress")
  DONE        @map("done")

  @@map("feedback_status")
  @@schema("public")
}

model FeedbackReport {
  id             String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String         @map("org_id") @db.Uuid
  userId         String         @map("user_id") @db.Uuid
  module         String
  details        String
  attachments    String[]       @default([])
  pageUrl        String         @map("page_url")
  userAgent      String?        @map("user_agent")
  status         FeedbackStatus @default(NEW)
  createdAt      DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime       @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  user         users        @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([status], map: "idx_feedback_reports_status")
  @@index([createdAt], map: "idx_feedback_reports_created_at")
  @@map("feedback_reports")
  @@schema("public")
}
```

- [ ] **Step 2: Add back-relations.** In `model Organization` (alongside the other `[]` relations, ~line 47): `feedbackReports FeedbackReport[]`. In `model users` (after `user_roles UserRole[]`, ~line 1191): `feedback_reports FeedbackReport[]`.

- [ ] **Step 3: Create `prisma/migrations/20260721120000_feedback_reports/migration.sql`:**

```sql
-- Feedback Center: user-submitted error reports with admin status queue.
CREATE TYPE feedback_status AS ENUM ('new', 'in_progress', 'done');

CREATE TABLE feedback_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module      text NOT NULL,
  details     text NOT NULL,
  attachments text[] NOT NULL DEFAULT '{}',
  page_url    text NOT NULL,
  user_agent  text,
  status      feedback_status NOT NULL DEFAULT 'new',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_reports_status ON feedback_reports(status);
CREATE INDEX idx_feedback_reports_created_at ON feedback_reports(created_at);
```

- [ ] **Step 4: Register in tenancy registry.** In `lib/tenancy/scoped-models.ts`, add to `ORG_SCOPED` (after the `WorkspaceInvitation` entry):

```ts
  // Feedback Center
  FeedbackReport: "organizationId",
```

- [ ] **Step 5: Apply and generate.**

Run: `pnpm exec prisma migrate deploy`
Expected: `1 migration applied` (20260721120000_feedback_reports)

Run: `pnpm exec prisma generate`
Expected: generated client without errors

- [ ] **Step 6: Verify registry completeness.**

Run: `pnpm exec vitest run tests/tenancy`
Expected: PASS (FeedbackReport accepted as registered org-scoped model)

---

### Task 2: Feedback domain library

**Files:**
- Create: `lib/feedback/feedback.ts`

**Interfaces:**
- Consumes: `prisma.feedbackReport` from Task 1.
- Produces:
  - `FEEDBACK_MODULES: readonly string[]` and `FEEDBACK_MODULE_LABELS: Record<FeedbackModule, string>`
  - `moduleFromPathname(pathname: string): FeedbackModule`
  - `MAX_FEEDBACK_ATTACHMENTS = 3`, `FEEDBACK_STORAGE_PREFIX = "feedback/"`
  - `createFeedbackReportRecord(db, organizationId: string, userId: string, input: FeedbackReportInput): Promise<FeedbackReport>`
  - `type FeedbackReportInput = { module: string; details: string; attachments: string[]; pageUrl: string; userAgent?: string | null }`

- [ ] **Step 1: Write `lib/feedback/feedback.ts`:**

```ts
import type { Prisma, PrismaClient } from "@prisma/client";

export const FEEDBACK_MODULES = [
  "dashboard",
  "sales",
  "purchases",
  "banking",
  "payroll",
  "taxes",
  "reports",
  "pos",
  "settings",
  "other",
] as const;

export type FeedbackModule = (typeof FEEDBACK_MODULES)[number];

export const FEEDBACK_MODULE_LABELS: Record<FeedbackModule, string> = {
  dashboard: "Dashboard",
  sales: "Sales",
  purchases: "Purchases",
  banking: "Banking",
  payroll: "Payroll",
  taxes: "Taxes",
  reports: "Reports",
  pos: "POS",
  settings: "Settings",
  other: "Other",
};

export const MAX_FEEDBACK_ATTACHMENTS = 3;
export const FEEDBACK_STORAGE_PREFIX = "feedback/";

// Attachments must be public URLs into workspace_assets under the feedback/ prefix.
const ATTACHMENT_URL_RE =
  /^https?:\/\/.+\/storage\/v1\/object\/public\/workspace_assets\/feedback\//;

export function moduleFromPathname(pathname: string): FeedbackModule {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return (FEEDBACK_MODULES as readonly string[]).includes(first)
    ? (first as FeedbackModule)
    : "other";
}

export type FeedbackReportInput = {
  module: string;
  details: string;
  attachments: string[];
  pageUrl: string;
  userAgent?: string | null;
};

export async function createFeedbackReportRecord(
  db: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  input: FeedbackReportInput
) {
  const details = input.details?.trim();
  if (!details) throw new Error("Please describe the issue.");

  const attachments = input.attachments ?? [];
  if (attachments.length > MAX_FEEDBACK_ATTACHMENTS) {
    throw new Error(`At most ${MAX_FEEDBACK_ATTACHMENTS} images are allowed.`);
  }
  for (const url of attachments) {
    if (typeof url !== "string" || !ATTACHMENT_URL_RE.test(url)) {
      throw new Error("Invalid attachment URL.");
    }
  }

  const module = (FEEDBACK_MODULES as readonly string[]).includes(input.module)
    ? input.module
    : "other";

  return db.feedbackReport.create({
    data: {
      organizationId,
      userId,
      module,
      details,
      attachments,
      pageUrl: (input.pageUrl || "").slice(0, 2000),
      userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
    },
  });
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

---

### Task 3: Submit server action + client image upload helper

**Files:**
- Create: `components/feedback/actions.ts`
- Create: `components/feedback/upload-feedback-images.ts`

**Interfaces:**
- Consumes: `createFeedbackReportRecord`, `FeedbackReportInput` (Task 2); `requireAccountingWorkspace()` from `@/lib/accounting/dal` (returns `{ userId, organizationId, role }`, redirects to `/login` when unauthenticated, and enters the scoped tenant context so the org-scoped create passes the tenancy extension); `createClient` from `@/lib/supabase/client`.
- Produces:
  - `submitFeedbackAction(input: FeedbackReportInput): Promise<{ ok: true } | { ok: false; error: string }>`
  - `uploadFeedbackImages(files: File[], userId: string): Promise<{ urls: string[]; failedCount: number }>`
  - `MAX_IMAGE_BYTES = 5 * 1024 * 1024`

- [ ] **Step 1: Write `components/feedback/actions.ts`:**

```ts
"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import {
  createFeedbackReportRecord,
  type FeedbackReportInput,
} from "@/lib/feedback/feedback";

export async function submitFeedbackAction(
  input: FeedbackReportInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const workspace = await requireAccountingWorkspace();

  try {
    await createFeedbackReportRecord(
      prisma,
      workspace.organizationId,
      workspace.userId,
      input
    );
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to submit feedback.",
    };
  }
}
```

- [ ] **Step 2: Write `components/feedback/upload-feedback-images.ts`** (client-side, mirrors `components/sales/document-templates/shared/upload-template-logo.ts`):

```ts
import { createClient } from "@/lib/supabase/client";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image

/**
 * Upload feedback screenshots to the public workspace_assets bucket under
 * feedback/<userId>/. Per-file failures are non-fatal: the report is still
 * submitted without the failed images and the caller reports failedCount.
 */
export async function uploadFeedbackImages(
  files: File[],
  userId: string
): Promise<{ urls: string[]; failedCount: number }> {
  const supabase = createClient();
  const urls: string[] = [];
  let failedCount = 0;

  for (const [index, file] of files.entries()) {
    try {
      const ext = file.type.split("/")[1] || "png";
      const path = `feedback/${userId}/${Date.now()}-${index}.${ext}`;

      const { error } = await supabase.storage
        .from("workspace_assets")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("workspace_assets").getPublicUrl(path);
      urls.push(publicUrl);
    } catch (err) {
      console.error("Feedback image upload failed:", err);
      failedCount += 1;
    }
  }

  return { urls, failedCount };
}
```

Note: if uploads 403 at verification time, the `workspace_assets` storage policy is prefix-restricted — extend it in Supabase to allow authenticated inserts under `feedback/` (the template-logo flow proves authenticated client uploads to this bucket already work, so this is unlikely).

- [ ] **Step 3: Typecheck.**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

---

### Task 4: Feedback bubble UI + root layout mount

**Files:**
- Create: `components/feedback/feedback-bubble.tsx`
- Modify: `app/layout.tsx:36-39` (mount inside `<body>`, after `<Toaster />`)

**Interfaces:**
- Consumes: `submitFeedbackAction`, `uploadFeedbackImages`, `MAX_IMAGE_BYTES` (Task 3); `FEEDBACK_MODULES`, `FEEDBACK_MODULE_LABELS`, `MAX_FEEDBACK_ATTACHMENTS`, `moduleFromPathname` (Task 2); shadcn `Button`, `Select*`, `Textarea`, `Label` from `components/ui/*`; `toast` from `sonner`; `createClient` from `@/lib/supabase/client`.
- Produces: `<FeedbackBubble />` — default-export-free named export, self-gating (renders `null` when logged out or on `/admin` / `/print` routes).

- [ ] **Step 1: Write `components/feedback/feedback-bubble.tsx`:**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, ImagePlus, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  FEEDBACK_MODULES,
  FEEDBACK_MODULE_LABELS,
  MAX_FEEDBACK_ATTACHMENTS,
  moduleFromPathname,
  type FeedbackModule,
} from "@/lib/feedback/feedback";

import { submitFeedbackAction } from "./actions";
import { MAX_IMAGE_BYTES, uploadFeedbackImages } from "./upload-feedback-images";

export function FeedbackBubble() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<FeedbackModule>("other");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setUserId(session?.user?.id ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  const previews = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files]
  );
  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  // Hidden for anonymous visitors, in the admin area, and on print views.
  if (!userId || pathname.startsWith("/admin") || pathname.startsWith("/print")) {
    return null;
  }

  function openPanel() {
    setModule(moduleFromPathname(pathname));
    setSubmitted(false);
    setOpen(true);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FEEDBACK_ATTACHMENTS) {
        toast.error(`Up to ${MAX_FEEDBACK_ATTACHMENTS} images allowed.`);
        break;
      }
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image.`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is over 5 MB.`);
        continue;
      }
      next.push(file);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (!details.trim()) {
      toast.error("Please describe the issue.");
      return;
    }
    setSubmitting(true);
    try {
      const { urls, failedCount } = await uploadFeedbackImages(files, userId!);
      if (failedCount > 0) {
        toast.warning(
          `${failedCount} image${failedCount > 1 ? "s" : ""} failed to attach — sending report without ${failedCount > 1 ? "them" : "it"}.`
        );
      }
      const result = await submitFeedbackAction({
        module,
        details,
        attachments: urls,
        pageUrl: window.location.pathname + window.location.search,
        userAgent: navigator.userAgent,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSubmitted(true);
      setDetails("");
      setFiles([]);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 print:hidden">
      {open && (
        <div className="mb-3 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Report a problem</p>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setOpen(false)}
              aria-label="Close feedback panel"
            >
              <X className="size-4" />
            </Button>
          </div>

          {submitted ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <CheckCircle2 className="size-10 text-teal-500" />
              <p className="text-sm font-semibold">Thanks for the report!</p>
              <p className="text-xs text-muted-foreground">
                Our team will look into it.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setSubmitted(false)}
              >
                Report another issue
              </Button>
            </div>
          ) : (
            <div className="space-y-3 px-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="feedback-module">Where is the issue?</Label>
                <Select
                  value={module}
                  onValueChange={(v) => setModule(v as FeedbackModule)}
                >
                  <SelectTrigger id="feedback-module" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_MODULES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {FEEDBACK_MODULE_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="feedback-details">What happened?</Label>
                <Textarea
                  id="feedback-details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Describe the error, what you expected, and the steps to reproduce it…"
                  rows={4}
                />
              </div>

              <div className="space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => addFiles(e.target.files)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {previews.map((src, i) => (
                    <div key={src} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`Attachment ${i + 1}`}
                        className="size-12 rounded-md border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFiles(files.filter((_, idx) => idx !== i))
                        }
                        className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-foreground text-background"
                        aria-label={`Remove attachment ${i + 1}`}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                  {files.length < MAX_FEEDBACK_ATTACHMENTS && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="size-4" />
                      Add image
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Up to {MAX_FEEDBACK_ATTACHMENTS} images, 5 MB each.
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={submitting}
              >
                <Send className="size-4" />
                {submitting ? "Sending…" : "Send report"}
              </Button>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={open ? "Close feedback" : "Report a problem"}
        className={cn(
          "ml-auto flex size-14 items-center justify-center rounded-full shadow-lg transition-colors",
          "bg-teal-600 text-white hover:bg-teal-500"
        )}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Mount in `app/layout.tsx`.** Add the import and render after `<Toaster />`:

```tsx
import { FeedbackBubble } from "@/components/feedback/feedback-bubble";
```

```tsx
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <Toaster position="top-center" />
        <FeedbackBubble />
      </body>
```

- [ ] **Step 3: Typecheck.**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual smoke check.** `pnpm dev`, log in, confirm: bubble visible on dashboard pages; module pre-selected per route (e.g. `/banking` → Banking); hidden when logged out and on `/admin`; a submitted report row appears in the DB (`feedback_reports`).

---

### Task 5: Admin queue page + status action

**Files:**
- Create: `app/(admin)/admin/(protected)/feedback/actions.ts`
- Create: `app/(admin)/admin/(protected)/feedback/page.tsx`
- Create: `components/admin/feedback-queue.tsx`

**Interfaces:**
- Consumes: `requirePlatformAdmin()` from `@/lib/admin/auth`; `runAsSystem` from `@/lib/tenancy/context`; `FeedbackStatus` from `@prisma/client`; `FEEDBACK_MODULE_LABELS` (Task 2); shadcn `Badge`, `Button`, `Select*`, `Table*`.
- Produces:
  - `updateFeedbackStatusAction(reportId: string, status: FeedbackStatus): Promise<void>`
  - `type FeedbackQueueItem = { id: string; module: string; details: string; attachments: string[]; pageUrl: string; userAgent: string | null; status: FeedbackStatus; createdAt: string; orgName: string; reporterName: string; reporterEmail: string }` (exported from `components/admin/feedback-queue.tsx`)
  - `<FeedbackQueue items={FeedbackQueueItem[]} />`

- [ ] **Step 1: Write `app/(admin)/admin/(protected)/feedback/actions.ts`:**

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { FeedbackStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { runAsSystem } from "@/lib/tenancy/context";

const ALLOWED_STATUSES: FeedbackStatus[] = ["NEW", "IN_PROGRESS", "DONE"];

export async function updateFeedbackStatusAction(
  reportId: string,
  status: FeedbackStatus
): Promise<void> {
  await requirePlatformAdmin();
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error("Invalid status");
  }

  // Reports span all organizations; admin access is deliberate cross-org.
  await runAsSystem(() =>
    prisma.feedbackReport.update({ where: { id: reportId }, data: { status } })
  );

  revalidatePath("/admin/feedback");
}
```

- [ ] **Step 2: Write `app/(admin)/admin/(protected)/feedback/page.tsx`:**

```tsx
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { runAsSystem } from "@/lib/tenancy/context";
import {
  FeedbackQueue,
  type FeedbackQueueItem,
} from "@/components/admin/feedback-queue";

export const metadata = {
  title: "Feedback Center | Admin",
};

function reporterNameFrom(meta: unknown, email: string): string {
  if (meta && typeof meta === "object") {
    const record = meta as Record<string, unknown>;
    if (typeof record.name === "string" && record.name) return record.name;
    if (typeof record.full_name === "string" && record.full_name)
      return record.full_name;
  }
  return email;
}

export default async function AdminFeedbackPage() {
  await requirePlatformAdmin();

  // Queue spans all organizations; admin access is deliberate cross-org.
  const reports = await runAsSystem(() =>
    prisma.feedbackReport.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        organization: { select: { name: true } },
        user: { select: { email: true, raw_user_meta_data: true } },
      },
    })
  );

  const items: FeedbackQueueItem[] = reports.map((report) => {
    const email = report.user.email ?? "unknown";
    return {
      id: report.id,
      module: report.module,
      details: report.details,
      attachments: report.attachments,
      pageUrl: report.pageUrl,
      userAgent: report.userAgent,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      orgName: report.organization.name,
      reporterName: reporterNameFrom(report.user.raw_user_meta_data, email),
      reporterEmail: email,
    };
  });

  return <FeedbackQueue items={items} />;
}
```

- [ ] **Step 3: Write `components/admin/feedback-queue.tsx`:**

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FeedbackStatus } from "@prisma/client";
import { ArrowUpDown, Inbox } from "lucide-react";
import { toast } from "sonner";

import { updateFeedbackStatusAction } from "@/app/(admin)/admin/(protected)/feedback/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FEEDBACK_MODULE_LABELS } from "@/lib/feedback/feedback";

export type FeedbackQueueItem = {
  id: string;
  module: string;
  details: string;
  attachments: string[];
  pageUrl: string;
  userAgent: string | null;
  status: FeedbackStatus;
  createdAt: string;
  orgName: string;
  reporterName: string;
  reporterEmail: string;
};

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const STATUS_STYLES: Record<FeedbackStatus, string> = {
  NEW: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  IN_PROGRESS: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  DONE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

type StatusFilter = "ALL" | FeedbackStatus;

export function FeedbackQueue({ items }: { items: FeedbackQueueItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [newestFirst, setNewestFirst] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const modules = useMemo(
    () => Array.from(new Set(items.map((i) => i.module))).sort(),
    [items]
  );

  const visible = useMemo(() => {
    return items
      .filter((i) => statusFilter === "ALL" || i.status === statusFilter)
      .filter((i) => moduleFilter === "all" || i.module === moduleFilter)
      .sort((a, b) =>
        newestFirst
          ? b.createdAt.localeCompare(a.createdAt)
          : a.createdAt.localeCompare(b.createdAt)
      );
  }, [items, statusFilter, moduleFilter, newestFirst]);

  function changeStatus(id: string, status: FeedbackStatus) {
    startTransition(async () => {
      try {
        await updateFeedbackStatusAction(id, status);
        router.refresh();
      } catch {
        toast.error("Failed to update status.");
      }
    });
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Feedback Center</h1>
          <p className="text-sm text-muted-foreground">
            {items.filter((i) => i.status === "NEW").length} new ·{" "}
            {items.length} total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="IN_PROGRESS">In progress</SelectItem>
              <SelectItem value="DONE">Done</SelectItem>
            </SelectContent>
          </Select>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m} value={m}>
                  {FEEDBACK_MODULE_LABELS[
                    m as keyof typeof FEEDBACK_MODULE_LABELS
                  ] ?? m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNewestFirst((v) => !v)}
          >
            <ArrowUpDown className="size-4" />
            {newestFirst ? "Newest first" : "Oldest first"}
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-muted-foreground">
          <Inbox className="size-8" />
          <p className="text-sm">No reports match the current filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Module</TableHead>
                <TableHead className="min-w-64">Details</TableHead>
                <TableHead>Reporter</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Images</TableHead>
                <TableHead className="w-40">Set status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge
                      className={cn("border-none", STATUS_STYLES[item.status])}
                    >
                      {STATUS_LABELS[item.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">
                    {FEEDBACK_MODULE_LABELS[
                      item.module as keyof typeof FEEDBACK_MODULE_LABELS
                    ] ?? item.module}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="max-w-md text-left"
                      onClick={() =>
                        setExpandedId(expandedId === item.id ? null : item.id)
                      }
                    >
                      <p
                        className={cn(
                          "text-sm",
                          expandedId !== item.id && "line-clamp-2"
                        )}
                      >
                        {item.details}
                      </p>
                      {expandedId === item.id && (
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {item.pageUrl}
                          {item.userAgent ? ` · ${item.userAgent}` : ""}
                        </p>
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{item.reporterName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.reporterEmail} · {item.orgName}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(item.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {item.attachments.map((url, i) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Attachment ${i + 1}`}
                            className="size-10 rounded border object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.status}
                      disabled={isPending}
                      onValueChange={(v) =>
                        changeStatus(item.id, v as FeedbackStatus)
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NEW">New</SelectItem>
                        <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                        <SelectItem value="DONE">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck.**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

---

### Task 6: Admin nav item + NEW-count badge

**Files:**
- Modify: `app/(admin)/admin/(protected)/layout.tsx` (query count, pass prop)
- Modify: `components/admin/shell.tsx` (nav entry, badge rendering, prop threading)

**Interfaces:**
- Consumes: `prisma.feedbackReport.count`, `runAsSystem` (Task 1); `MasterShell` currently takes `{ identity, children }`.
- Produces: `MasterShell` accepts optional `feedbackNewCount?: number`.

- [ ] **Step 1: Query the count in `app/(admin)/admin/(protected)/layout.tsx`:**

```tsx
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import { MasterShell } from "@/components/admin/shell";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePlatformAdmin();

  const name =
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    "Platform Admin";

  // Cross-org by design: the feedback queue spans all organizations.
  const feedbackNewCount = await runAsSystem(() =>
    prisma.feedbackReport.count({ where: { status: "NEW" } })
  );

  return (
    <MasterShell
      identity={{ email: user.email ?? "", name }}
      feedbackNewCount={feedbackNewCount}
    >
      {children}
    </MasterShell>
  );
}
```

(Preserve the existing name-fallback comment style if desired; the shape above is the full file body.)

- [ ] **Step 2: Add the nav entry in `components/admin/shell.tsx`.** Import `MessageSquareWarning` from `lucide-react` (add to the existing lucide import block at lines 6–27). In the `navItems` "Operations" group (lines 55–64), add after the "Support & Chat" entry:

```ts
      { label: "Feedback Center",  href: "/admin/feedback",          icon: MessageSquareWarning },
```

- [ ] **Step 3: Thread `feedbackNewCount` through the shell.**

`MasterShell` signature (line 254) becomes:

```tsx
export function MasterShell({
  identity,
  feedbackNewCount = 0,
  children,
}: {
  identity: AdminIdentity;
  feedbackNewCount?: number;
  children: React.ReactNode;
}) {
```

Add `feedbackNewCount: number;` to `MasterSidebarProps` (line 74), add `feedbackNewCount` to the `MasterSidebar` function's destructured parameters (line 82), and pass `feedbackNewCount={feedbackNewCount}` at every `<MasterSidebar ... />` render site inside `MasterShell` (there may be one for desktop and one for the mobile drawer — update all of them).

- [ ] **Step 4: Render the badge.** In the nav item render (line 168–169), replace:

```tsx
                  <item.icon className="size-4 shrink-0" />
                  {(!isCollapsed || isMobileOpen) && <span>{item.label}</span>}
```

with:

```tsx
                  <item.icon className="size-4 shrink-0" />
                  {(!isCollapsed || isMobileOpen) && (
                    <span className="flex flex-1 items-center justify-between">
                      {item.label}
                      {item.href === "/admin/feedback" && feedbackNewCount > 0 && (
                        <span className="ml-2 rounded-full bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-400">
                          {feedbackNewCount}
                        </span>
                      )}
                    </span>
                  )}
```

- [ ] **Step 5: Typecheck.**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Manual smoke check.** With a report submitted in Task 4's smoke check: `/admin/feedback` shows the queue; the sidebar shows "Feedback Center" with a count badge; changing status to Done refreshes the row and (after navigation) decrements the badge; filters and sort behave.

---

### Task 7: Consolidated tests + verification

**Files:**
- Create: `tests/feedback.test.ts`

**Interfaces:**
- Consumes: `createTestOrg`/`dropTestOrg` from `tests/fixtures.ts` (NOTE: its `userId` is a random UUID with **no** `auth.users` row — `feedback_reports.user_id` has a real FK, so the test must create and clean up a real `users` row); `moduleFromPathname`, `createFeedbackReportRecord`, `MAX_FEEDBACK_ATTACHMENTS` from `@/lib/feedback/feedback`.

- [ ] **Step 1: Write `tests/feedback.test.ts`:**

```ts
import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  createFeedbackReportRecord,
  moduleFromPathname,
} from "@/lib/feedback/feedback";

import { createTestOrg, dropTestOrg, type TestOrg } from "./fixtures";

const VALID_URL =
  "https://example.supabase.co/storage/v1/object/public/workspace_assets/feedback/u1/1.png";

describe("moduleFromPathname", () => {
  it("maps known first segments to their module", () => {
    expect(moduleFromPathname("/banking/transactions")).toBe("banking");
    expect(moduleFromPathname("/sales")).toBe("sales");
    expect(moduleFromPathname("/dashboard")).toBe("dashboard");
  });

  it("falls back to other for unknown routes", () => {
    expect(moduleFromPathname("/")).toBe("other");
    expect(moduleFromPathname("/some-marketing-page")).toBe("other");
  });
});

describe("createFeedbackReportRecord", () => {
  let testOrg: TestOrg;
  let authUserId: string;

  beforeEach(async () => {
    testOrg = await createTestOrg();
    // feedback_reports.user_id has a real FK to auth.users, and the fixture's
    // userId is a bare UUID — create an actual auth user row for the FK.
    authUserId = randomUUID();
    await prisma.users.create({
      data: { id: authUserId, email: `feedback-${authUserId.slice(0, 8)}@test.local` },
    });
  });

  afterEach(async () => {
    await dropTestOrg(testOrg.orgId); // cascades feedback_reports via org FK
    await prisma.users.delete({ where: { id: authUserId } });
  });

  it("creates a report with status NEW and trimmed details", async () => {
    const report = await createFeedbackReportRecord(
      prisma,
      testOrg.orgId,
      authUserId,
      {
        module: "banking",
        details: "  Reconcile button crashes  ",
        attachments: [VALID_URL],
        pageUrl: "/banking/transactions?tab=all",
        userAgent: "test-agent",
      }
    );

    const row = await prisma.feedbackReport.findFirstOrThrow({
      where: { id: report.id, organizationId: testOrg.orgId },
    });
    expect(row.status).toBe("NEW");
    expect(row.details).toBe("Reconcile button crashes");
    expect(row.module).toBe("banking");
    expect(row.attachments).toEqual([VALID_URL]);
    expect(row.userId).toBe(authUserId);
  });

  it("rejects empty details", async () => {
    await expect(
      createFeedbackReportRecord(prisma, testOrg.orgId, authUserId, {
        module: "sales",
        details: "   ",
        attachments: [],
        pageUrl: "/sales",
      })
    ).rejects.toThrow(/describe the issue/i);
  });

  it("rejects more than 3 attachments", async () => {
    await expect(
      createFeedbackReportRecord(prisma, testOrg.orgId, authUserId, {
        module: "sales",
        details: "Too many images",
        attachments: [VALID_URL, VALID_URL, VALID_URL, VALID_URL],
        pageUrl: "/sales",
      })
    ).rejects.toThrow(/at most 3/i);
  });

  it("rejects attachment URLs outside the feedback storage path", async () => {
    await expect(
      createFeedbackReportRecord(prisma, testOrg.orgId, authUserId, {
        module: "sales",
        details: "Bad attachment",
        attachments: ["https://evil.example.com/x.png"],
        pageUrl: "/sales",
      })
    ).rejects.toThrow(/invalid attachment/i);
  });

  it("coerces unknown modules to other", async () => {
    const report = await createFeedbackReportRecord(
      prisma,
      testOrg.orgId,
      authUserId,
      {
        module: "not-a-module",
        details: "Weird module",
        attachments: [],
        pageUrl: "/x",
      }
    );
    expect(report.module).toBe("other");
  });
});
```

- [ ] **Step 2: Run the new tests.**

Run: `pnpm exec vitest run tests/feedback.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 3: Run the full suite.**

Run: `pnpm test`
Expected: PASS — pre-existing failures (if any) must be unrelated to feedback; investigate anything touching tenancy, fixtures, or admin auth.

- [ ] **Step 4: Final typecheck + lint.**

Run: `pnpm exec tsc --noEmit`
Expected: no errors

Run: `pnpm lint` (if the script exists; skip otherwise)
Expected: no new errors in changed files

- [ ] **Step 5: Verification summary.** Report results honestly: tests run + counts, typecheck status, and the manual smoke-check outcomes from Tasks 4 and 6. Remind the user that committing is theirs to do.
