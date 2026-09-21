import { cn } from "@/lib/utils";
import { QuickActionsSkeleton } from "@/components/shared/quick-actions";

/**
 * Loading skeletons for every section under /sales.
 *
 * Each skeleton mirrors its section's real layout region-for-region so the
 * swap to live data causes no shift. Real chrome (card borders, table grid,
 * spacing) is kept; only text/values are pulsed.
 *
 * Two-tone rule, matching app/(dashboard)/dashboard/loading.tsx:
 *   bg-slate-200 → prominent values and headings
 *   bg-slate-100 → secondary text
 *   bg-slate-50  → large fill areas
 *
 * Used both by the route-level loading.tsx files and, in-component, while
 * client-side fetches are in flight.
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Bar className={cn("h-8 rounded-lg bg-slate-200", titleWidth)} />
        <Bar className={cn("mt-2 h-4", subtitleWidth)} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {buttons.map((b, i) => (
          <Bar key={i} className={cn("h-9 rounded-lg bg-slate-200", b.width, b.tone)} />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────── CUSTOMERS ────────────────────────────── */

export function CustomersSkeleton() {
  return (
    <Root label="Loading customers" className="space-y-6">
      <PageHeader
        titleWidth="w-56"
        subtitleWidth="w-96"
        buttons={[
          { width: "w-28" },
          { width: "w-28" },
          { width: "w-28" },
          { width: "w-44", tone: "bg-orange-200" },
        ]}
      />

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <Bar className="h-2.5 w-24 rounded" />
              <Bar className="size-4 rounded bg-slate-200" />
            </div>
            <Bar className="mt-2 h-7 w-16 rounded-lg bg-slate-200" />
            {i === 0 ? (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                <Bar className="h-full w-full rounded-full bg-slate-200" />
              </div>
            ) : null}
            <Bar className={cn("h-3 w-32 rounded", i === 0 ? "mt-1" : "mt-2")} />
          </div>
        ))}
      </div>

      {/* TABLE CONTAINER */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/40 px-4 py-3 sm:flex-row sm:items-center sm:px-6 sm:py-4">
          <Bar className="h-5 w-36 bg-slate-200" />
          <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-end">
            <Bar className="hidden h-9 w-40 rounded-lg sm:block" />
            <Bar className="h-9 w-full rounded-md sm:w-64" />
            <Bar className="hidden h-3 w-20 rounded md:block" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/20">
                <th className="w-10 py-3 pl-4 pr-2">
                  <Bar className="size-4 rounded" />
                </th>
                <th className="px-4 py-3">
                  <Bar className="h-2.5 w-12 rounded" />
                </th>
                <th className="px-3 py-3">
                  <Bar className="h-2.5 w-12 rounded" />
                </th>
                <th className="px-3 py-3">
                  <Bar className="h-2.5 w-12 rounded" />
                </th>
                <th className="px-3 py-3">
                  <Bar className="ml-auto h-2.5 w-14 rounded" />
                </th>
                <th className="px-3 py-3">
                  <Bar className="mx-auto h-2.5 w-12 rounded" />
                </th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...Array(8)].map((_, i) => (
                <tr key={i}>
                  <td className="w-10 py-3.5 pl-4 pr-2">
                    <Bar className="size-4 rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Bar className="size-7 shrink-0 rounded-full bg-slate-200" />
                      <div className="min-w-0 space-y-1">
                        <Bar className="h-3.5 w-32 rounded bg-slate-200" />
                        <Bar className="h-2.5 w-20 rounded" />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="h-3 w-40 rounded" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="h-3 w-28 rounded" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="ml-auto h-3.5 w-20 rounded bg-slate-200" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="mx-auto h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-3 py-3 pr-4">
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

/* ────────────────────────────── INVOICES ────────────────────────────── */

export function InvoicesSkeleton() {
  return (
    <Root label="Loading invoices" className="min-h-screen space-y-6 bg-slate-50/50 pb-12 print:hidden">
      <div className="flex flex-col gap-4 px-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Bar className="h-9 w-56 rounded-lg bg-slate-200" />
          <Bar className="mt-2 h-4 w-96 max-w-lg" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Bar className="h-9 w-24 rounded-lg bg-slate-200" />
          <Bar className="h-9 w-24 rounded-lg bg-slate-200" />
          <Bar className="size-9 rounded-lg bg-slate-200" />
          <Bar className="h-9 w-32 rounded-lg bg-blue-200" />
        </div>
      </div>

      {/* 6 METRIC CARDS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="flex h-[140px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Bar className="size-7 rounded-full bg-slate-200" />
                <Bar className="h-3 w-28 rounded" />
              </div>
              <Bar className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex items-end justify-between">
              <div>
                <Bar className="h-8 w-28 rounded-lg bg-slate-200" />
                <Bar className="mt-2 h-3 w-24 rounded" />
              </div>
              <Bar className="mb-2 h-5 w-[60px] rounded bg-slate-50" />
            </div>
          </div>
        ))}
      </div>

      {/* FILTER TOOLBAR */}
      <div className="flex flex-wrap items-center gap-3 py-2">
        <Bar className="h-10 w-full rounded-xl sm:w-[320px]" />
        <Bar className="h-10 w-36 rounded-xl" />
        <Bar className="h-10 w-40 rounded-xl" />
        <Bar className="h-10 w-32 rounded-xl" />
        <Bar className="ml-auto h-10 w-32 rounded-xl xl:ml-2" />
      </div>

      {/* SPLIT GRID */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* LEFT: table card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex min-h-[72px] items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <Bar className="h-5 w-28 bg-slate-200" />
              <Bar className="h-5 w-24 rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <Bar className="h-9 w-20 rounded-lg" />
              <Bar className="h-9 w-24 rounded-lg" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="w-10 py-4 pl-6 pr-2">
                    <Bar className="size-4 rounded" />
                  </th>
                  {["w-14", "w-20", "w-14"].map((w, i) => (
                    <th key={i} className="px-3 py-4">
                      <Bar className={cn("h-2.5 rounded", w)} />
                    </th>
                  ))}
                  <th className="px-3 py-4">
                    <Bar className="ml-auto h-2.5 w-14 rounded" />
                  </th>
                  <th className="px-3 py-4">
                    <Bar className="h-2.5 w-16 rounded" />
                  </th>
                  <th className="px-3 py-4">
                    <Bar className="h-2.5 w-16 rounded" />
                  </th>
                  <th className="px-3 py-4">
                    <Bar className="h-2.5 w-12 rounded" />
                  </th>
                  <th className="w-10 pl-2 pr-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...Array(7)].map((_, i) => (
                  <tr key={i}>
                    <td className="w-10 py-3 pl-6 pr-2">
                      <Bar className="size-4 rounded" />
                    </td>
                    <td className="px-3 py-3">
                      <Bar className="h-3.5 w-24 rounded bg-slate-200" />
                      <Bar className="mt-1.5 h-2.5 w-28 rounded" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Bar className="size-8 shrink-0 rounded-full bg-slate-200" />
                        <div className="space-y-1">
                          <Bar className="h-3.5 w-28 rounded bg-slate-200" />
                          <Bar className="h-2.5 w-16 rounded" />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Bar className="h-6 w-20 rounded-full" />
                    </td>
                    <td className="px-3 py-3">
                      <Bar className="ml-auto h-3.5 w-20 rounded bg-slate-200" />
                      <Bar className="ml-auto mt-1.5 h-2.5 w-16 rounded" />
                    </td>
                    <td className="px-3 py-3">
                      <Bar className="h-3.5 w-24 rounded bg-slate-200" />
                      <Bar className="mt-1.5 h-2.5 w-16 rounded" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="min-w-[120px] space-y-1.5">
                        <Bar className="h-2.5 w-full rounded" />
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <Bar className="h-full w-1/2 rounded-full bg-slate-200" />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Bar className="mx-auto size-7 rounded-full bg-slate-200" />
                    </td>
                    <td className="w-10 pl-2 pr-6">
                      <Bar className="ml-auto size-4 rounded" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
            <Bar className="h-3 w-40 rounded" />
            <div className="flex items-center gap-2">
              <Bar className="h-3 w-20 rounded" />
              <Bar className="h-8 w-24 rounded-lg" />
              <Bar className="h-8 w-16 rounded-lg" />
            </div>
          </div>
        </div>

        {/* RIGHT: 4 widgets */}
        <div className="flex flex-col gap-6">
          {/* Insights */}
          <div className="flex min-h-16 items-center justify-between gap-4 rounded-2xl bg-slate-100 px-6 py-4">
            <div className="flex min-w-0 items-center gap-2">
              <Bar className="size-7 shrink-0 rounded-md bg-slate-200" />
              <div className="space-y-1.5">
                <Bar className="h-4 w-20 bg-slate-200" />
                <Bar className="h-3 w-36" />
              </div>
            </div>
            <Bar className="h-8 w-20 shrink-0 rounded-full bg-slate-200" />
          </div>

          {/* Top Customers */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <Bar className="h-4 w-32 bg-slate-200" />
              <Bar className="h-3 w-16 rounded" />
            </div>
            <div className="mt-4 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Bar className="size-8 shrink-0 rounded-full bg-slate-200" />
                    <div className="space-y-1">
                      <Bar className="h-3 w-24 rounded bg-slate-200" />
                      <Bar className="h-2.5 w-16 rounded" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Bar className="ml-auto h-3 w-16 rounded bg-slate-200" />
                    <Bar className="ml-auto h-2.5 w-10 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Collections */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <Bar className="h-4 w-28 bg-slate-200" />
            <div className="mt-4 grid grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Bar className="h-2.5 w-20 rounded" />
                  <Bar className="h-5 w-16 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </div>

          {/* Collection Goal */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-4">
              <Bar className="size-[72px] shrink-0 rounded-full bg-slate-100" />
              <div className="flex-1 space-y-2">
                <Bar className="h-4 w-28 rounded bg-slate-200" />
                <Bar className="h-3 w-32 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Root>
  );
}

/* ──────────────────────────────── QUOTES ──────────────────────────────── */

export function QuotesSkeleton() {
  return (
    <Root label="Loading quotes" className="space-y-6">
      <PageHeader
        titleWidth="w-80"
        subtitleWidth="w-96"
        buttons={[{ width: "w-32", tone: "bg-orange-200" }]}
      />

      {/* REVENUE TARGET TRACKER */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Bar className="size-8 shrink-0 rounded-lg bg-slate-200" />
            <div className="space-y-1.5">
              <Bar className="h-4 w-56 rounded bg-slate-200" />
              <Bar className="h-3 w-64 rounded" />
            </div>
          </div>
          <Bar className="h-10 w-44 rounded-lg" />
        </div>
        <div className="mt-4 h-3.5 w-full overflow-hidden rounded-full bg-slate-100">
          <Bar className="h-full w-1/3 rounded-full bg-slate-200" />
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5">
          <Bar className="h-3 w-40 rounded" />
          <Bar className="h-3 w-24 rounded" />
        </div>
      </div>

      {/* 3 METRIC CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Bar className="h-2.5 w-32 rounded" />
            <Bar className="mt-3 h-7 w-24 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>

      {/* PIPELINE CARD */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/40 px-4 py-3 sm:flex-row sm:items-center sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <Bar className="size-4 rounded bg-slate-200" />
            <Bar className="h-5 w-44 bg-slate-200" />
          </div>
          <Bar className="h-9 w-full rounded-md sm:w-64" />
        </div>

        <div className="divide-y divide-slate-100">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div className="min-w-0 space-y-1.5">
                <Bar className="h-3.5 w-44 rounded bg-slate-200" />
                <Bar className="h-2.5 w-56 rounded" />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Bar className="mr-1 h-4 w-20 rounded bg-slate-200" />
                <Bar className="size-8 rounded-lg" />
                <Bar className="h-8 w-36 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Root>
  );
}

/* ───────────────────────────── ADJUSTMENTS ───────────────────────────── */

export function AdjustmentsSkeleton() {
  return (
    <Root label="Loading credit notes" className="space-y-6">
      <PageHeader
        titleWidth="w-80"
        subtitleWidth="w-96"
        buttons={[{ width: "w-40", tone: "bg-orange-200" }]}
      />

      {/* 3 STAT CARDS */}
      <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <Bar className="h-2.5 w-32 rounded" />
              <Bar className="size-4 rounded bg-slate-200" />
            </div>
            <Bar className="mt-3 h-7 w-28 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>

      {/* TABLE CARD */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/40 px-4 py-3 sm:px-6 sm:py-4 xl:flex-row xl:items-center">
          <Bar className="h-5 w-40 bg-slate-200" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Bar className="h-9 w-64 rounded-lg" />
            <Bar className="h-9 w-full rounded-md sm:w-64" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/20">
                <th className="w-10 px-4 py-3">
                  <Bar className="size-4 rounded" />
                </th>
                <th className="px-2 py-3">
                  <Bar className="h-2.5 w-24 rounded" />
                </th>
                <th className="px-3 py-3">
                  <Bar className="h-2.5 w-12 rounded" />
                </th>
                <th className="px-3 py-3">
                  <Bar className="h-2.5 w-16 rounded" />
                </th>
                <th className="px-3 py-3">
                  <Bar className="h-2.5 w-20 rounded" />
                </th>
                <th className="px-3 py-3">
                  <Bar className="ml-auto h-2.5 w-24 rounded" />
                </th>
                <th className="px-3 py-3">
                  <Bar className="ml-auto h-2.5 w-28 rounded" />
                </th>
                <th className="px-3 py-3">
                  <Bar className="mx-auto h-2.5 w-12 rounded" />
                </th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...Array(8)].map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <Bar className="size-4 rounded" />
                  </td>
                  <td className="px-2 py-3">
                    <Bar className="h-3.5 w-24 rounded bg-slate-200" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="h-3.5 w-32 rounded bg-slate-200" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="h-2.5 w-20 rounded" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="h-3 w-24 rounded" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="ml-auto h-3.5 w-20 rounded bg-slate-200" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="ml-auto h-3.5 w-20 rounded bg-slate-200" />
                  </td>
                  <td className="px-3 py-3">
                    <Bar className="mx-auto h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-3 py-3 pr-4">
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

/* ────────────────────── RECEIPTS / REFUND RECEIPTS ────────────────────── */

export function ReceiptsSkeleton({ label = "Loading receipts" }: { label?: string }) {
  return (
    <Root label={label} className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Bar className="h-9 w-56 rounded-lg bg-slate-200" />
          <Bar className="mt-2 h-4 w-96" />
        </div>
        <Bar className="h-11 w-36 shrink-0 rounded-xl bg-blue-200" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left">
              <th className="px-4 py-3">
                <Bar className="h-2.5 w-20 rounded" />
              </th>
              <th className="px-4 py-3">
                <Bar className="h-2.5 w-12 rounded" />
              </th>
              <th className="px-4 py-3">
                <Bar className="h-2.5 w-20 rounded" />
              </th>
              <th className="px-4 py-3">
                <Bar className="h-2.5 w-16 rounded" />
              </th>
              <th className="px-4 py-3">
                <Bar className="ml-auto h-2.5 w-12 rounded" />
              </th>
              <th className="px-4 py-3">
                <Bar className="h-2.5 w-14 rounded" />
              </th>
              <th className="px-4 py-3">
                <Bar className="ml-auto h-2.5 w-14 rounded" />
              </th>
            </tr>
          </thead>
          <tbody>
            {[...Array(6)].map((_, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3">
                  <Bar className="h-3.5 w-24 rounded bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Bar className="h-3 w-20 rounded" />
                </td>
                <td className="px-4 py-3">
                  <Bar className="h-3 w-32 rounded" />
                </td>
                <td className="px-4 py-3">
                  <Bar className="h-3 w-20 rounded" />
                </td>
                <td className="px-4 py-3">
                  <Bar className="ml-auto h-3.5 w-20 rounded bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Bar className="h-5 w-16 rounded-full" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Bar className="size-7 rounded-md" />
                    <Bar className="size-7 rounded-md" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Root>
  );
}

/* ────────────────────────────── STATEMENTS ────────────────────────────── */

export function StatementsSkeleton() {
  return (
    <Root label="Loading customer statements" className="flex-1 space-y-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <Bar className="h-9 w-72 rounded-lg bg-slate-200" />
          <Bar className="mt-2 h-4 w-96" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Bar className="h-11 w-24 rounded-lg" />
          <Bar className="h-11 w-40 rounded-lg" />
        </div>
      </div>

      {/* CONTROLS CARD */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3 print:hidden">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Bar className="h-3 w-24 rounded" />
            <Bar className="h-11 w-full rounded-lg" />
          </div>
        ))}
      </div>

      {/* RECIPIENT CARD */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-6 md:flex-row">
          <div className="space-y-2">
            <Bar className="h-3 w-32 rounded" />
            <Bar className="h-6 w-56 rounded-lg bg-slate-200" />
            <Bar className="h-3 w-44 rounded" />
          </div>
          <div className="space-y-2 md:text-right">
            <Bar className="h-3 w-28 rounded md:ml-auto" />
            <Bar className="h-3 w-48 rounded md:ml-auto" />
            <Bar className="h-3 w-32 rounded md:ml-auto" />
          </div>
        </div>
      </div>

      {/* 4 SUMMARY TILES */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 print:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-5 shadow-sm",
              i === 3 ? "border-indigo-100 bg-indigo-50/50" : "border-slate-200 bg-white"
            )}
          >
            <Bar className="h-3 w-28 rounded" />
            <Bar className="mt-3 h-7 w-24 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>

      {/* ACTIVITY TABLE */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6">
          <div className="flex items-center gap-2">
            <Bar className="size-4 rounded bg-slate-200" />
            <Bar className="h-5 w-56 bg-slate-200" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
                <th className="px-4 py-3">
                  <Bar className="h-2.5 w-12 rounded" />
                </th>
                <th className="px-4 py-3">
                  <Bar className="h-2.5 w-20 rounded" />
                </th>
                <th className="px-4 py-3">
                  <Bar className="h-2.5 w-16 rounded" />
                </th>
                <th className="px-4 py-3">
                  <Bar className="ml-auto h-2.5 w-14 rounded" />
                </th>
                <th className="px-4 py-3">
                  <Bar className="ml-auto h-2.5 w-16 rounded" />
                </th>
                <th className="px-4 py-3">
                  <Bar className="ml-auto h-2.5 w-14 rounded" />
                </th>
              </tr>
            </thead>
            <tbody>
              {[...Array(7)].map((_, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3.5">
                    <Bar className="h-3 w-20 rounded" />
                  </td>
                  <td className="px-4 py-3.5">
                    <Bar className="h-3.5 w-24 rounded bg-slate-200" />
                  </td>
                  <td className="px-4 py-3.5">
                    <Bar className="h-3 w-40 rounded" />
                  </td>
                  <td className="px-4 py-3.5">
                    <Bar className="ml-auto h-3 w-16 rounded" />
                  </td>
                  <td className="px-4 py-3.5">
                    <Bar className="ml-auto h-3 w-16 rounded" />
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

      {/* AGING FOOTER */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-3">
          <Bar className="h-4 w-32 bg-slate-200" />
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-100 sm:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-4">
              <Bar className="h-2.5 w-16 rounded" />
              <Bar className="mt-2 h-5 w-20 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </Root>
  );
}

/* ─────────────────────────────── SETTINGS ─────────────────────────────── */

export function InvoiceSettingsSkeleton() {
  return (
    <Root label="Loading document templates" className="w-full space-y-6 pb-16">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <Bar className="h-9 w-80 rounded-lg bg-slate-200" />
          <Bar className="mt-2 h-4 w-96" />
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          <Bar className="h-9 w-28 rounded-lg bg-slate-200" />
          <Bar className="h-9 w-32 rounded-lg bg-slate-50" />
          <Bar className="h-9 w-36 rounded-lg bg-slate-50" />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* LEFT: 5 config cards */}
        <div className="space-y-6 lg:col-span-7">
          {[
            { titleWidth: "w-28", bodyHeight: "h-24" },
            { titleWidth: "w-44", bodyHeight: "h-20" },
            { titleWidth: "w-36", bodyHeight: "h-40" },
            { titleWidth: "w-40", bodyHeight: "h-32" },
            { titleWidth: "w-52", bodyHeight: "h-16" },
          ].map((card, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
                <Bar className="size-4 rounded bg-slate-200" />
                <Bar className={cn("h-4 rounded bg-slate-200", card.titleWidth)} />
              </div>
              <div className="p-5 sm:p-6">
                <Bar className={cn("w-full rounded-lg bg-slate-50", card.bodyHeight)} />
              </div>
            </div>
          ))}

          {/* Action hub */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <Bar className="h-9 w-44 rounded-lg" />
            <div className="flex items-center gap-3">
              <Bar className="h-9 w-32 rounded-lg" />
              <Bar className="h-9 w-44 rounded-lg bg-blue-200" />
            </div>
          </div>
        </div>

        {/* RIGHT: live preview */}
        <div className="space-y-3 lg:sticky lg:top-24 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bar className="size-4 rounded bg-slate-200" />
              <Bar className="h-3 w-28 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <Bar className="h-5 w-12 rounded" />
              <Bar className="size-6 rounded" />
            </div>
          </div>
          <div className="aspect-[210/297] w-full rounded-xl border border-slate-200 bg-white p-5 shadow-md sm:p-6">
            <div className="flex items-start justify-between">
              <Bar className="size-12 rounded-lg bg-slate-100" />
              <div className="space-y-2">
                <Bar className="ml-auto h-5 w-24 rounded bg-slate-200" />
                <Bar className="ml-auto h-3 w-16 rounded" />
              </div>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Bar className="h-2 w-12 rounded" />
                  <Bar className="h-2.5 w-full rounded" />
                  <Bar className="h-2.5 w-4/5 rounded" />
                </div>
              ))}
            </div>
            <div className="mt-8 space-y-2">
              <Bar className="h-6 w-full rounded bg-slate-100" />
              {[...Array(4)].map((_, i) => (
                <Bar key={i} className="h-4 w-full rounded bg-slate-50" />
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <div className="w-1/2 space-y-2">
                <Bar className="h-3 w-full rounded" />
                <Bar className="h-3 w-full rounded" />
                <Bar className="h-5 w-full rounded bg-slate-200" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Root>
  );
}

/* ────────────────────────── REVENUE DASHBOARD ────────────────────────── */

export function RevenueDashboardSkeleton() {
  return (
    <Root label="Loading revenue dashboard" className="flex-1 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Bar className="h-9 w-64 rounded-lg bg-slate-200" />
          <Bar className="mt-2 h-4 w-96" />
        </div>
        <QuickActionsSkeleton count={3} />
      </div>

      {/* 4 KPI CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <Bar className="h-4 w-28 rounded" />
              <Bar className="size-8 rounded-lg bg-slate-50" />
            </div>
            <Bar className="mt-4 h-7 w-32 rounded-lg bg-slate-200" />
            <Bar className="mt-2 h-3 w-36 rounded" />
          </div>
        ))}
      </div>

      {/* CHART + RECENT INVOICES */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-7">
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-4">
          <div className="mb-6 flex items-center justify-between">
            <Bar className="h-5 w-40 bg-slate-200" />
            <Bar className="h-9 w-36 rounded-lg" />
          </div>
          <div className="relative flex min-h-[250px] flex-1 items-end gap-2 pb-8">
            {[45, 70, 55, 85, 60, 75].map((h, i) => (
              <div key={i} className="flex w-full max-w-[48px] flex-1 flex-col items-center">
                <div
                  className="w-full animate-pulse rounded-t-sm bg-slate-100"
                  style={{ height: `${h}%` }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-3">
          <div className="mb-6 flex items-center justify-between">
            <Bar className="h-5 w-36 bg-slate-200" />
            <Bar className="h-3 w-16 rounded" />
          </div>
          <div className="flex-1 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Bar className="size-9 shrink-0 rounded-lg bg-slate-100" />
                  <div className="space-y-1.5">
                    <Bar className="h-3 w-28 rounded bg-slate-200" />
                    <Bar className="h-2.5 w-20 rounded" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Bar className="ml-auto h-3 w-16 rounded bg-slate-200" />
                  <Bar className="ml-auto h-2 w-12 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3 WIDGETS */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {[...Array(3)].map((_, w) => (
          <div
            key={w}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-6 flex items-center justify-between">
              <Bar className="h-5 w-40 bg-slate-200" />
              <Bar className="h-3 w-16 rounded" />
            </div>
            <div className="flex-1 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Bar
                      className={cn(
                        "size-9 shrink-0 bg-slate-100",
                        w === 1 ? "rounded-full" : "rounded-lg"
                      )}
                    />
                    <div className="space-y-1.5">
                      <Bar className="h-3 w-24 rounded bg-slate-200" />
                      <Bar className="h-2.5 w-16 rounded" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Bar className="ml-auto h-3 w-14 rounded bg-slate-200" />
                    <Bar className="ml-auto h-2 w-12 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

    </Root>
  );
}
