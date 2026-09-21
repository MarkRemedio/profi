import { cn } from "@/lib/utils";

/**
 * Loading skeletons for every page under /admin.
 *
 * Each skeleton mirrors its page's real layout region-for-region so the swap to
 * live data causes no shift. Real chrome (card borders, table grid, spacing) is
 * kept; only text/values are pulsed.
 *
 * Two-tone rule, matching components/sales/skeletons.tsx:
 *   bg-slate-200 → prominent values and headings
 *   bg-slate-100 → secondary text
 *   bg-slate-50  → large fill areas
 *
 * Consumed by the route-level loading.tsx files in
 * app/(admin)/admin/(protected)/*.
 */

function Bar({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-slate-100", className)} />;
}

function Root({
  label,
  className = "space-y-6",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Header: h1 + subtitle on the left, action buttons on the right. */
function PageHeader({
  titleWidth = "w-64",
  subtitleWidth = "w-80",
  buttons = [],
}: {
  titleWidth?: string;
  subtitleWidth?: string;
  buttons?: string[];
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <Bar className={cn("h-8 rounded-lg bg-slate-200", titleWidth)} />
        <Bar className={cn("mt-2 h-4", subtitleWidth)} />
      </div>
      {buttons.length > 0 && (
        <div className="flex shrink-0 items-center gap-2">
          {buttons.map((width, i) => (
            <Bar key={i} className={cn("h-9 rounded-lg bg-slate-200", width)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The `grid-cols-2 lg:grid-cols-4` KPI strip used across the admin pages. */
function KpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <Bar className="h-3 w-24" />
            <Bar className="size-6 rounded-lg bg-slate-50" />
          </div>
          <Bar className="mt-3 h-7 w-20 bg-slate-200" />
          <div className="mt-2 flex items-center gap-1.5">
            <Bar className="h-3 w-10" />
            <Bar className="h-3 w-16 bg-slate-50" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A bordered white panel with an optional title row. */
function Panel({
  className,
  titled = true,
  children,
}: {
  className?: string;
  titled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}
    >
      {titled && (
        <div className="mb-4 flex items-center justify-between">
          <Bar className="h-4 w-44 bg-slate-200" />
          <Bar className="h-3 w-16" />
        </div>
      )}
      {children}
    </div>
  );
}

/** Stacked rows used as generic panel filler. */
function Rows({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Bar className="size-8 shrink-0 rounded-lg bg-slate-50" />
          <div className="flex-1 space-y-1.5">
            <Bar className="h-3.5 w-1/3 bg-slate-200" />
            <Bar className="h-3 w-1/2" />
          </div>
          <Bar className="h-6 w-16 rounded-full bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

/** A bordered table card: header row plus `rows` body rows of `columns` cells. */
function TableCard({
  columns = 5,
  rows = 6,
  minWidth = "min-w-[800px]",
}: {
  columns?: number;
  rows?: number;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={cn("w-full", minWidth)}>
        {/* Header band */}
        <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50/50 px-4 py-3">
          {Array.from({ length: columns }).map((_, i) => (
            <Bar key={i} className={cn("h-3", i === 0 ? "w-32" : "w-24")} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 border-b border-slate-100 px-4 py-4">
            {Array.from({ length: columns }).map((_, c) => (
              <Bar
                key={c}
                className={cn(
                  "h-4",
                  c === 0 ? "w-32 bg-slate-200" : c === columns - 1 ? "w-16" : "w-24"
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A responsive grid of equal cards. */
function CardGrid({
  count = 3,
  cols = "lg:grid-cols-3",
  height = "h-56",
}: {
  count?: number;
  cols?: string;
  height?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-5", cols)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
            height
          )}
        >
          <Bar className="h-5 w-32 bg-slate-200" />
          <Bar className="mt-3 h-3 w-full" />
          <Bar className="mt-1.5 h-3 w-4/5" />
          <Bar className="mt-5 h-8 w-28 bg-slate-200" />
          <div className="mt-5 space-y-2">
            <Bar className="h-3 w-3/4" />
            <Bar className="h-3 w-2/3" />
            <Bar className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────── OVERVIEW ────────────────────────────── */

export function AdminOverviewSkeleton() {
  return (
    <Root label="Loading master overview">
      <PageHeader
        titleWidth="w-72"
        subtitleWidth="w-96"
        buttons={["h-10 w-10", "h-10 w-28", "h-10 w-36"]}
      />
      <KpiRow />
      <KpiRow />
      <Panel>
        <Bar className="h-3 w-full rounded-full bg-slate-100" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bar key={i} className="h-10 rounded-lg bg-slate-50" />
          ))}
        </div>
      </Panel>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <Rows count={5} />
        </Panel>
        <Panel>
          <Rows count={4} />
        </Panel>
      </div>
    </Root>
  );
}

/* ────────────────────────────── CLIENTS ────────────────────────────── */

export function AdminClientsSkeleton() {
  return (
    <Root label="Loading client directory">
      <PageHeader titleWidth="w-64" subtitleWidth="w-96" buttons={["w-24", "w-32"]} />
      {/* Directory / onboarding tab strip */}
      <div className="flex items-center gap-2">
        <Bar className="h-9 w-28 rounded-lg bg-slate-200" />
        <Bar className="h-9 w-32 rounded-lg" />
      </div>
      <TableCard columns={6} rows={8} />
    </Root>
  );
}

/* ──────────────────────────── SUBSCRIPTIONS ──────────────────────────── */

export function AdminSubscriptionsSkeleton() {
  return (
    <Root label="Loading subscriptions">
      <PageHeader titleWidth="w-60" subtitleWidth="w-96" buttons={["w-24", "w-28"]} />
      <KpiRow />
      <TableCard columns={6} rows={8} minWidth="min-w-[860px]" />
    </Root>
  );
}

/* ────────────────────────────── PLANS ────────────────────────────── */

export function AdminPlansSkeleton() {
  return (
    <Root label="Loading plans">
      <PageHeader titleWidth="w-56" subtitleWidth="w-80" buttons={["w-28"]} />
      <CardGrid count={3} cols="lg:grid-cols-3" height="h-72" />
    </Root>
  );
}

/* ──────────────────────── BILLING CONTROLS ──────────────────────── */

export function AdminBillingExtrasSkeleton() {
  return (
    <Root label="Loading billing controls">
      <PageHeader titleWidth="w-64" subtitleWidth="w-96" />
      <Panel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bar key={i} className="h-9 rounded-md bg-slate-50" />
          ))}
        </div>
      </Panel>
      <TableCard columns={5} rows={5} minWidth="min-w-[700px]" />
      <Panel>
        <Rows count={3} />
      </Panel>
    </Root>
  );
}

/* ────────────────────────── SUPPORT & CHAT ────────────────────────── */

export function AdminSupportSkeleton() {
  return (
    <Root label="Loading support queue">
      <PageHeader titleWidth="w-64" subtitleWidth="w-96" buttons={["w-24", "w-28"]} />
      <div className="grid gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <Bar className="h-4 w-1/3 bg-slate-200" />
                <Bar className="h-3 w-2/3" />
              </div>
              <Bar className="h-6 w-20 rounded-full bg-slate-50" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Bar className="h-3 w-24" />
              <Bar className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </Root>
  );
}

/* ───────────────────────────── CHAT INBOX ───────────────────────────── */

export function AdminChatInboxSkeleton() {
  return (
    <Root label="Loading chat inbox" className="space-y-6">
      <PageHeader titleWidth="w-52" subtitleWidth="w-80" />
      {/* Three-pane split: conversation list, thread, context sidebar */}
      <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
        <div className="w-72 shrink-0 space-y-3 border-r border-slate-200 bg-white p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3">
              <Bar className="h-3.5 w-2/3 bg-slate-200" />
              <Bar className="mt-2 h-3 w-full" />
            </div>
          ))}
        </div>
        <div className="flex flex-1 flex-col justify-end gap-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bar
              key={i}
              className={cn(
                "h-12 rounded-xl bg-white",
                i % 2 === 0 ? "w-2/3" : "ml-auto w-1/2 bg-slate-200"
              )}
            />
          ))}
          <Bar className="mt-2 h-14 rounded-xl bg-white" />
        </div>
        <div className="hidden w-64 shrink-0 space-y-3 border-l border-slate-200 bg-white p-3 xl:block">
          <Bar className="h-4 w-32 bg-slate-200" />
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-4/5" />
          <Bar className="mt-4 h-8 w-full rounded-md bg-slate-50" />
          <Bar className="h-8 w-full rounded-md bg-slate-50" />
        </div>
      </div>
    </Root>
  );
}

/* ──────────────────────────── FEEDBACK ──────────────────────────── */

export function AdminFeedbackSkeleton() {
  return (
    <Root label="Loading feedback center">
      <div className="flex items-center justify-between">
        <div>
          <Bar className="h-6 w-48 rounded-lg bg-slate-200" />
          <Bar className="mt-2 h-4 w-72" />
        </div>
        <Bar className="h-9 w-28 rounded-lg bg-slate-200" />
      </div>
      <TableCard columns={6} rows={7} />
    </Root>
  );
}

/* ────────────────────────── SYSTEM HEALTH ────────────────────────── */

export function AdminHealthSkeleton() {
  return (
    <Root label="Loading system health">
      <PageHeader titleWidth="w-60" subtitleWidth="w-96" buttons={["w-24"]} />
      {/* Overall status banner */}
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <Bar className="size-10 shrink-0 rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <Bar className="h-4 w-48 bg-slate-200" />
          <Bar className="h-3 w-72" />
        </div>
      </div>
      <Panel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bar key={i} className="h-16 rounded-lg bg-slate-50" />
          ))}
        </div>
      </Panel>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <Bar className="mb-4 h-4 w-40 bg-slate-200" />
          <TableCard columns={4} rows={3} minWidth="min-w-[600px]" />
        </div>
      ))}
    </Root>
  );
}

/* ───────────────────────── FEATURE REQUESTS ───────────────────────── */

export function AdminRoadmapSkeleton() {
  return (
    <Root label="Loading feature requests">
      <PageHeader titleWidth="w-64" subtitleWidth="w-96" buttons={["w-32"]} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="space-y-4">
          <Panel>
            <Rows count={3} />
          </Panel>
        </div>
        <div className="space-y-4 xl:col-span-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <Bar className="size-10 shrink-0 rounded-xl bg-slate-200" />
              <div className="flex-1 space-y-2">
                <Bar className="h-4 w-1/2 bg-slate-200" />
                <Bar className="h-3 w-full" />
                <Bar className="h-3 w-3/5" />
              </div>
              <Bar className="h-6 w-20 shrink-0 rounded-full bg-slate-50" />
            </div>
          ))}
        </div>
      </div>
    </Root>
  );
}

/* ──────────────────────────── ANALYTICS ──────────────────────────── */

export function AdminAnalyticsSkeleton() {
  return (
    <Root label="Loading support analytics">
      <PageHeader titleWidth="w-64" subtitleWidth="w-96" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <Bar className="h-3 w-24" />
            <Bar className="mt-3 h-7 w-16 bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <Bar className="h-48 rounded-lg bg-slate-50" />
        </Panel>
        <Panel>
          <Rows count={4} />
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <Rows count={3} />
        </Panel>
        <Panel>
          <Rows count={3} />
        </Panel>
      </div>
    </Root>
  );
}

/* ─────────────────────────── IMPERSONATE ─────────────────────────── */

export function AdminImpersonateSkeleton() {
  return (
    <Root label="Loading impersonation">
      <PageHeader titleWidth="w-64" subtitleWidth="w-96" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <Bar className="size-9 shrink-0 rounded-lg bg-slate-50" />
              <div className="flex-1 space-y-1.5">
                <Bar className="h-4 w-2/3 bg-slate-200" />
                <Bar className="h-3 w-1/2" />
              </div>
            </div>
            <Bar className="mt-4 h-9 w-full rounded-md bg-slate-200" />
          </div>
        ))}
      </div>
    </Root>
  );
}

/* ──────────────────────────── SECURITY ──────────────────────────── */

export function AdminSecuritySkeleton() {
  return (
    <Root label="Loading security and audit">
      <PageHeader titleWidth="w-64" subtitleWidth="w-96" buttons={["w-28"]} />
      <Panel>
        <TableCard columns={5} rows={4} minWidth="min-w-[700px]" />
      </Panel>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <Rows count={5} />
        </Panel>
        <Panel>
          <Rows count={4} />
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <Rows count={3} />
        </Panel>
        <Panel>
          <Rows count={3} />
        </Panel>
      </div>
    </Root>
  );
}

/* ────────────────────────────── TEAM ────────────────────────────── */

export function AdminTeamSkeleton() {
  return (
    <Root label="Loading team management" className="flex w-full flex-col gap-6">
      <div>
        <Bar className="h-9 w-72 rounded-lg bg-slate-200" />
        <Bar className="mt-2 h-4 w-96" />
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Bar className="h-6 w-36 bg-slate-200" />
          <Bar className="h-10 w-32 rounded-md bg-slate-200" />
        </div>
        <TableCard columns={6} rows={4} minWidth="min-w-[720px]" />
      </div>
    </Root>
  );
}

/* ──────────────────────────── SETTINGS ──────────────────────────── */

export function AdminSettingsSkeleton() {
  return (
    <Root label="Loading account settings" className="flex w-full flex-col gap-6">
      <div>
        <Bar className="h-9 w-72 rounded-lg bg-slate-200" />
        <Bar className="mt-2 h-4 w-96" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account + password cards */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <Bar className="h-5 w-40 bg-slate-200" />
              <Bar className="mt-2 h-3 w-64" />
            </div>
            <div className="space-y-5 p-6">
              {Array.from({ length: i === 0 ? 2 : 3 }).map((_, f) => (
                <div key={f} className="space-y-2">
                  <Bar className="h-3.5 w-32" />
                  <Bar className="h-9 w-full rounded-md bg-slate-50" />
                </div>
              ))}
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <Bar className="h-9 w-32 rounded-md bg-slate-200" />
              </div>
            </div>
          </div>
        ))}
        {/* Access summary */}
        <div className="rounded-xl border bg-white shadow-sm lg:col-span-2">
          <div className="border-b px-6 py-4">
            <Bar className="h-5 w-32 bg-slate-200" />
            <Bar className="mt-2 h-3 w-72" />
          </div>
          <div className="space-y-4 p-6">
            <Bar className="h-4 w-36 bg-slate-200" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Bar key={i} className="h-6 w-24 rounded-full bg-slate-50" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Root>
  );
}
