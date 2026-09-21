import { cn } from "@/lib/utils";
import { QuickActionsSkeleton } from "@/components/shared/quick-actions";

/**
 * Loading skeletons for every section under /purchases.
 *
 * Each skeleton mirrors its section's real layout region-for-region so the
 * swap to live data causes no shift. Real chrome (card borders, table grid,
 * spacing) is kept; only text/values are pulsed.
 *
 * Two-tone rule, matching components/sales/skeletons.tsx:
 *   bg-slate-200 → prominent values and headings
 *   bg-slate-100 → secondary text
 *   bg-slate-50  → large fill areas
 *
 * Consumed by the route-level loading.tsx files under app/(dashboard)/purchases.
 */

function Bar({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-slate-100", className)} />;
}

function Root({
  label,
  className,
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
  buttons,
}: {
  titleWidth?: string;
  subtitleWidth?: string;
  buttons: { width: string; tone?: string }[];
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Bar className={cn("h-8 rounded-lg bg-slate-200", titleWidth)} />
        <Bar className={cn("mt-2 h-4", subtitleWidth)} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {buttons.map((b, i) => (
          <Bar key={i} className={cn("h-9 rounded-md bg-slate-200", b.width, b.tone)} />
        ))}
      </div>
    </div>
  );
}

/** Reusable table-column header cell. */
function Th({ w, align = "left" }: { w: string; align?: "left" | "right" | "center" }) {
  return (
    <th className="px-3 py-3">
      <Bar
        className={cn("h-2.5 rounded", w, align === "right" && "ml-auto", align === "center" && "mx-auto")}
      />
    </th>
  );
}

/* ───────────────────────────── OVERVIEW (/) ───────────────────────────── */

export function PurchaseDashboardSkeleton() {
  return (
    <Root label="Loading purchases overview" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Bar className="h-9 w-72 rounded-lg bg-slate-200" />
          <Bar className="mt-2 h-4 w-[28rem] max-w-full" />
        </div>
        <QuickActionsSkeleton count={3} />
      </div>

      {/* 4 METRIC CARDS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-5 shadow-sm",
              i === 0 ? "border-blue-100 bg-blue-50/30" : "border-slate-200 bg-white"
            )}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bar className="size-7 rounded-md bg-slate-100" />
                <Bar className="h-2.5 w-24 rounded" />
              </div>
              {i === 0 ? <Bar className="h-6 w-16 rounded-full bg-slate-100" /> : null}
            </div>
            <Bar className="mt-2 h-7 w-28 rounded-lg bg-slate-200" />
            <Bar className="mt-2 h-3 w-24 rounded" />
          </div>
        ))}
      </div>

      {/* CHART + TOP SUPPLIERS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Monthly expense comparison */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="border-b border-slate-100 bg-slate-50/40 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <Bar className="h-4 w-56 bg-slate-200" />
                <Bar className="h-3 w-64" />
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                <Bar className="h-3 w-20 rounded" />
                <Bar className="h-3 w-20 rounded" />
              </div>
            </div>
          </div>
          <div className="flex h-64 items-end justify-between gap-2 p-6 sm:gap-6">
            {[45, 70, 55, 85, 60, 75].map((h, i) => (
              <div key={i} className="flex flex-1 items-end justify-center gap-1 sm:gap-2">
                <div
                  className="w-full max-w-[24px] animate-pulse rounded-t-sm bg-slate-100"
                  style={{ height: `${Math.round(h * 0.65)}%` }}
                />
                <div
                  className="w-full max-w-[24px] animate-pulse rounded-t-sm bg-slate-200"
                  style={{ height: `${h}%` }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Top suppliers */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-1.5 border-b border-slate-100 bg-slate-50/40 px-6 py-4">
            <Bar className="h-4 w-32 bg-slate-200" />
            <Bar className="h-3 w-40" />
          </div>
          <ul className="divide-y divide-slate-100">
            {[...Array(4)].map((_, i) => (
              <li key={i} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Bar className="size-8 shrink-0 rounded-full bg-slate-100" />
                  <div className="space-y-1.5">
                    <Bar className="h-3.5 w-28 rounded bg-slate-200" />
                    <Bar className="h-2.5 w-16 rounded" />
                  </div>
                </div>
                <Bar className="h-3.5 w-16 rounded bg-slate-200" />
              </li>
            ))}
          </ul>
        </div>
      </div>

    </Root>
  );
}

/* ───────────────────────────── BILLS (/bills) ──────────────────────────── */

export function BillsSkeleton() {
  return (
    <Root label="Loading supplier bills" className="space-y-6">
      <PageHeader
        titleWidth="w-64"
        subtitleWidth="w-[30rem] max-w-full"
        buttons={[
          { width: "w-24" },
          { width: "w-24" },
          { width: "w-24" },
          { width: "w-28", tone: "bg-blue-200" },
        ]}
      />

      {/* 3 STAT CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <Bar className="h-2.5 w-24 rounded" />
                <Bar className="h-2.5 w-20 rounded" />
              </div>
              <Bar className="size-7 rounded-full bg-slate-100" />
            </div>
            <Bar className="mt-2 h-7 w-28 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>

      {/* TABLE (col-span-2) + SIDEBAR */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Table */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              <Bar className="h-5 w-32 bg-slate-200" />
              <Bar className="h-3 w-20 rounded" />
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Bar className="h-9 w-full rounded-md sm:w-56" />
              <Bar className="h-9 w-full rounded-md sm:w-40" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-4 py-3 sm:px-6">
                    <Bar className="h-2.5 w-16 rounded" />
                  </th>
                  <Th w="w-16" />
                  <Th w="w-12" />
                  <Th w="w-12" />
                  <Th w="w-12" align="right" />
                  <Th w="w-14" />
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[...Array(7)].map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 sm:px-6">
                      <div className="flex items-center gap-2.5">
                        <Bar className="size-7 shrink-0 rounded-full bg-slate-200" />
                        <Bar className="h-3.5 w-32 rounded bg-slate-200" />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Bar className="h-3 w-20 rounded" />
                    </td>
                    <td className="px-3 py-3">
                      <Bar className="h-3 w-16 rounded" />
                      <Bar className="mt-1 h-2.5 w-20 rounded" />
                    </td>
                    <td className="px-3 py-3">
                      <Bar className="h-3 w-20 rounded" />
                    </td>
                    <td className="px-3 py-3">
                      <Bar className="ml-auto h-3.5 w-20 rounded bg-slate-200" />
                    </td>
                    <td className="px-3 py-3">
                      <Bar className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="px-3 py-3">
                      <Bar className="ml-auto size-4 rounded" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="mt-auto flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-6">
            <Bar className="h-3 w-40 rounded" />
            <div className="flex items-center gap-1.5">
              <Bar className="size-8 rounded-md" />
              <Bar className="h-8 w-16 rounded-md" />
              <Bar className="size-8 rounded-md" />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-1.5 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
              <Bar className="h-5 w-40 bg-slate-200" />
              <Bar className="h-3 w-44 rounded" />
            </div>
            <ul className="divide-y divide-slate-50">
              {[...Array(3)].map((_, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Bar className="size-8 shrink-0 rounded-full bg-slate-100" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Bar className="h-3.5 w-32 rounded bg-slate-200" />
                    <Bar className="h-2.5 w-20 rounded" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-blue-100 p-4 shadow-sm sm:p-5">
            <Bar className="h-4 w-40 rounded bg-blue-200" />
            <Bar className="mt-3 h-3 w-full rounded bg-blue-200" />
            <Bar className="mt-1.5 h-3 w-3/4 rounded bg-blue-200" />
          </div>
        </div>
      </div>
    </Root>
  );
}

/* ─────────────────────────── SUPPLIERS (/suppliers) ─────────────────────── */

export function SuppliersSkeleton() {
  return (
    <Root label="Loading suppliers" className="flex-1 space-y-6">
      <PageHeader
        titleWidth="w-40"
        subtitleWidth="w-96 max-w-full"
        buttons={[{ width: "w-28" }, { width: "w-36", tone: "bg-emerald-200" }]}
      />

      <div className="flex min-h-[500px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/30 px-4 py-3 sm:flex-row sm:items-center sm:px-6 sm:py-4">
          <Bar className="h-5 w-40 bg-slate-200" />
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <Bar className="hidden h-3 w-16 rounded sm:block" />
            <Bar className="h-9 w-full rounded-md sm:w-64" />
          </div>
        </div>

        <div className="flex-1 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="w-12 px-4 py-3 sm:px-6">
                  <Bar className="size-4 rounded" />
                </th>
                <Th w="w-28" />
                <Th w="w-28" />
                <Th w="w-32" align="right" />
                <Th w="w-14" align="center" />
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...Array(8)].map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 sm:px-6">
                    <Bar className="size-4 rounded" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <Bar className="size-9 shrink-0 rounded-lg bg-slate-200" />
                      <div className="space-y-1.5">
                        <Bar className="h-3.5 w-32 rounded bg-slate-200" />
                        <Bar className="h-2.5 w-20 rounded" />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="h-3 w-36 rounded" />
                    <Bar className="mt-1.5 h-3 w-24 rounded" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="ml-auto h-3.5 w-20 rounded bg-slate-200" />
                    <Bar className="ml-auto mt-1.5 h-2.5 w-12 rounded" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="mx-auto h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="ml-auto size-4 rounded" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-6">
          <Bar className="h-3 w-48 rounded" />
          <div className="flex items-center gap-2">
            <Bar className="h-8 w-20 rounded-md" />
            <Bar className="h-8 w-16 rounded-md" />
          </div>
        </div>
      </div>
    </Root>
  );
}

/* ──────────────────── EXPENSE CLAIMS (/expense-claims) ──────────────────── */

export function ExpenseClaimsSkeleton() {
  return (
    <Root label="Loading expense claims" className="space-y-6">
      <PageHeader
        titleWidth="w-56"
        subtitleWidth="w-96 max-w-full"
        buttons={[{ width: "w-32", tone: "bg-orange-200" }]}
      />

      {/* 3 METRIC CARDS */}
      <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <Bar className="h-2.5 w-28 rounded" />
              <Bar className="size-4 rounded bg-slate-200" />
            </div>
            <Bar className="mt-2 h-7 w-24 rounded-lg bg-slate-200" />
            <Bar className="mt-2 h-2.5 w-32 rounded" />
          </div>
        ))}
      </div>

      {/* TABLE */}
      <div className="flex min-h-[400px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
          <Bar className="h-5 w-32 bg-slate-200" />
          <Bar className="h-3 w-20 rounded" />
        </div>

        <div className="flex-1 overflow-x-auto">
          <table className="w-full min-w-[750px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="w-12 px-4 py-3 sm:px-6">
                  <Bar className="size-4 rounded" />
                </th>
                <Th w="w-12" />
                <Th w="w-28" />
                <Th w="w-24" />
                <Th w="w-16" align="right" />
                <Th w="w-14" />
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...Array(8)].map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 sm:px-6">
                    <Bar className="size-4 rounded" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="h-3 w-20 rounded" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Bar className="size-6 shrink-0 rounded-full bg-slate-200" />
                      <Bar className="h-3.5 w-28 rounded bg-slate-200" />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="h-3 w-40 rounded" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="ml-auto h-3.5 w-16 rounded bg-slate-200" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="ml-auto size-4 rounded" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Root>
  );
}

/* ─────────────────── SUPPLIER STATEMENTS (/statements) ──────────────────── */

export function SupplierStatementsSkeleton() {
  return (
    <Root label="Loading supplier statements" className="flex-1 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Bar className="h-9 w-72 rounded-lg bg-slate-200" />
          <Bar className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Bar className="h-11 w-20 rounded-lg" />
          <Bar className="h-11 w-40 rounded-lg" />
        </div>
      </div>

      {/* SELECTOR CARD */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <Bar className="mb-2 h-3 w-40 rounded" />
        <Bar className="h-11 w-full max-w-md rounded-lg" />
      </div>

      {/* 3 SUMMARY TILES */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-6 shadow-sm",
              i === 2 ? "border-indigo-100 bg-indigo-50/50" : "border-slate-200 bg-white"
            )}
          >
            <Bar className="h-3.5 w-32 rounded" />
            <Bar className="mt-3 h-7 w-28 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>

      {/* STATEMENT SHEET */}
      <div className="space-y-6 overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Recipient header */}
        <div className="flex flex-col justify-between gap-6 border-b border-slate-100 pb-6 md:flex-row">
          <div className="space-y-2">
            <Bar className="h-4 w-36 rounded-md" />
            <Bar className="h-6 w-56 rounded-lg bg-slate-200" />
            <Bar className="h-3 w-44 rounded" />
          </div>
          <div className="space-y-2 md:text-right">
            <Bar className="h-2.5 w-40 rounded md:ml-auto" />
            <Bar className="h-3 w-48 rounded md:ml-auto" />
            <Bar className="h-3 w-32 rounded md:ml-auto" />
          </div>
        </div>

        {/* Activity table */}
        <div>
          <Bar className="mb-4 h-4 w-56 bg-slate-200" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70">
                  <Th w="w-24" />
                  <Th w="w-20" />
                  <Th w="w-16" />
                  <Th w="w-14" />
                  <Th w="w-20" align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...Array(6)].map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3.5">
                      <Bar className="h-3 w-24 rounded" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Bar className="h-3.5 w-24 rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Bar className="h-3 w-20 rounded" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Bar className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Bar className="ml-auto h-3.5 w-20 rounded bg-slate-200" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Root>
  );
}

/* ─────────────────────────── SETTINGS (/settings) ───────────────────────── */

export function PurchaseSettingsSkeleton() {
  return (
    <Root label="Loading purchase settings" className="w-full space-y-6 pb-16">
      {/* Header + tab pill */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
        <div>
          <Bar className="h-9 w-64 rounded-lg bg-slate-200" />
          <Bar className="mt-2 h-4 w-[28rem] max-w-full" />
        </div>
        <div className="flex shrink-0 items-center gap-1 self-start rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-sm">
          <Bar className="h-9 w-28 rounded-lg bg-slate-200" />
          <Bar className="h-9 w-28 rounded-lg bg-slate-50" />
        </div>
      </div>

      {/* SYSTEM TAB (default): 3-col grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT: 2 cards, span 2 */}
        <div className="space-y-6 lg:col-span-2">
          {/* Card A: prefixes (2 rows × 2 inputs) */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
              <Bar className="size-4 rounded bg-slate-200" />
              <Bar className="h-4 w-56 bg-slate-200" />
            </div>
            {[...Array(2)].map((_, r) => (
              <div key={r} className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
                {[...Array(2)].map((_, c) => (
                  <div key={c} className="space-y-1.5">
                    <Bar className="h-2.5 w-32 rounded" />
                    <Bar className="h-9 w-full rounded-md" />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Card B: ledger defaults (3 selects) */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
              <Bar className="size-4 rounded bg-slate-200" />
              <Bar className="h-4 w-48 bg-slate-200" />
            </div>
            <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Bar className="h-2.5 w-24 rounded" />
                  <Bar className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: governance card, 2 toggles */}
        <div className="space-y-6">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
              <Bar className="size-4 rounded bg-slate-200" />
              <Bar className="h-4 w-40 bg-slate-200" />
            </div>
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/30 p-3.5"
              >
                <div className="space-y-1.5">
                  <Bar className="h-3 w-36 rounded bg-slate-200" />
                  <Bar className="h-2.5 w-44 rounded" />
                </div>
                <Bar className="size-4 shrink-0 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SAVE BAR */}
      <div className="flex justify-end pt-6">
        <Bar className="h-9 w-44 rounded-md bg-blue-200" />
      </div>
    </Root>
  );
}

/* ─────────────────────── PURCHASE ORDERS (/orders) ───────────────────── */

export function PurchaseOrdersSkeleton() {
  return (
    <Root label="Loading purchase orders" className="space-y-6">
      <PageHeader
        titleWidth="w-80"
        subtitleWidth="w-[34rem] max-w-full"
        buttons={[
          { width: "w-24" },
          { width: "w-32", tone: "bg-orange-200" },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Bar className="h-2.5 w-20 rounded" />
            <Bar className="mt-3 h-8 w-28 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/40 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <Bar className="h-10 w-full max-w-md rounded-md" />
          <div className="flex gap-2">
            <Bar className="h-10 w-44 rounded-md" />
            <Bar className="h-10 w-32 rounded-md bg-orange-200" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <Th w="w-24" />
                <Th w="w-28" />
                <Th w="w-20" />
                <Th w="w-20" />
                <Th w="w-20" align="right" />
                <Th w="w-16" />
                <Th w="w-10" align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...Array(6)].map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-4">
                    <Bar className="h-3.5 w-24 rounded bg-slate-200" />
                  </td>
                  <td className="px-4 py-4">
                    <Bar className="h-3.5 w-40 rounded bg-slate-200" />
                    <Bar className="mt-1 h-2.5 w-24 rounded" />
                  </td>
                  <td className="px-4 py-4">
                    <Bar className="h-3.5 w-24 rounded" />
                  </td>
                  <td className="px-4 py-4">
                    <Bar className="h-3.5 w-20 rounded" />
                  </td>
                  <td className="px-4 py-4">
                    <Bar className="ml-auto h-3.5 w-24 rounded bg-slate-200" />
                  </td>
                  <td className="px-4 py-4">
                    <Bar className="h-5 w-24 rounded-full" />
                  </td>
                  <td className="px-4 py-4">
                    <Bar className="ml-auto size-8 rounded-full" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Root>
  );
}
