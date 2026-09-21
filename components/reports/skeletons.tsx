import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  ArrowLeft,
  Download,
  ChevronDown,
  ShieldAlert,
  Search,
  Layers,
  ArrowUpDown,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// 1. REPORT CENTER LANDING MENU SKELETON
// ─────────────────────────────────────────────────────────────
export function ReportCenterMenuSkeleton() {
  return (
    <div className="w-full space-y-10 text-left">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48 sm:h-10" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="space-y-12">
        {[
          { titleWidth: "w-48", cardCount: [1, 2, 3] },
          { titleWidth: "w-40", cardCount: [1, 2, 3] },
          { titleWidth: "w-52", cardCount: [1] }
        ].map((category, index) => (
          <div key={index} className="space-y-6">
            <div className="space-y-2">
              <Skeleton className={`h-5 ${category.titleWidth}`} />
              <Skeleton className="h-4 w-72" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {category.cardCount.map((card) => (
                <div
                  key={card}
                  className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-8 min-h-[160px] shadow-sm"
                >
                  <div className="flex items-start gap-5">
                    <div className="size-12 shrink-0 rounded-lg bg-slate-100" />
                    <div className="space-y-2.5 flex-1 pt-1">
                      <Skeleton className="h-5 w-36" />
                      <div className="space-y-1.5 pr-8">
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-5/6" />
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="absolute bottom-6 right-6 size-5 text-slate-200" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. ACTIVE SHEET WORKSPACE SKELETON (Trial Balance, P&L, Balance Sheet, Ledger)
// ─────────────────────────────────────────────────────────────

/**
 * The Suspense fallback for a statement.
 *
 * It has to mirror the loaded layout closely or the page jumps as it swaps in.
 * The version this replaces drew a full 380px drilldown drawer down the right —
 * a panel that only exists once you click an account, so it promised a column
 * that never arrived. It also still showed the pre-redesign chrome: no report
 * tabs, fixed 140px date fields and pill-shaped balance checks.
 */
export function ReportsWorkspaceSkeleton() {
  return (
    <div className="w-full text-left">
      <div className="min-w-0">
        {/* Back to Report Center */}
        <div className="mb-4 inline-flex items-center gap-1.5 font-bold text-slate-300">
          <ArrowLeft className="size-4" />
          <Skeleton className="h-4 w-36" />
        </div>

        {/* Statement tabs */}
        {/* Keyed by position, not by the width class — the widths repeat, and
            keying on them collided. */}
        <div className="mb-5 flex w-full gap-1 rounded-xl bg-slate-100 p-1">
          {["w-20", "w-16", "w-20", "w-20"].map((width, index) => (
            <div
              key={index}
              className={`flex flex-1 items-center justify-center rounded-lg py-2 ${
                index === 0 ? "bg-white shadow-2xs" : ""
              }`}
            >
              <Skeleton className={`h-3.5 ${width}`} />
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-2.5 w-20" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-10 w-full rounded-lg sm:w-[150px]" />
                <span className="shrink-0 text-sm text-slate-300">to</span>
                <Skeleton className="h-10 w-full rounded-lg sm:w-[150px]" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-10 flex-1 rounded-lg xl:w-24 xl:flex-none" />
              <div className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 shadow-sm xl:flex-none">
                <Download className="size-4 text-slate-300" />
                <Skeleton className="h-3 w-12" />
                <ChevronDown className="size-3 text-slate-300" />
              </div>
            </div>
          </div>
        </div>

        {/* Balance checks */}
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {["w-24", "w-28", "w-20"].map((width, index) => (
              <div key={index} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <Skeleton className={`h-2.5 ${width}`} />
                <div className="mt-1.5 space-y-1">
                  <Skeleton className="h-2.5 w-full" />
                  <Skeleton className="h-2.5 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* The statement itself */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Letterhead: organisation, statement, period */}
          <div className="border-b border-slate-100 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-2 h-7 w-56 rounded-lg sm:h-8" />
            <Skeleton className="mt-2 h-3.5 w-40" />
          </div>

          {/* Section filters */}
          <div className="border-b border-slate-100 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-1.5 overflow-hidden">
              {["w-12", "w-16", "w-20", "w-16", "w-20", "w-18"].map((width, index) => (
                <Skeleton key={index} className={`h-7 shrink-0 rounded-lg ${width}`} />
              ))}
            </div>
          </div>

          {/* Column headings — table layout only, matching the sm breakpoint
              where the real report stops using cards. */}
          <div className="hidden border-b border-slate-200 bg-slate-50/60 px-6 py-3 sm:block lg:px-8">
            <div className="flex items-center gap-3">
              <Skeleton className="h-2.5 w-16 flex-1" />
              <Skeleton className="h-2.5 w-10" />
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          </div>

          {/* Phones: card rows */}
          <div className="divide-y divide-slate-100 sm:hidden">
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-14 shrink-0 rounded-md" />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[1, 2].map((box) => (
                    <div key={box} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <Skeleton className="h-2.5 w-10" />
                      <Skeleton className="mt-1 h-3.5 w-20" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tablet and up: table rows */}
          <div className="hidden divide-y divide-slate-100 sm:block">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
              <div key={row} className="flex items-center gap-3 px-6 py-3.5 lg:px-8">
                <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${240 - row * 12}px` }} />
                <Skeleton className="ml-auto h-4 w-14 shrink-0 rounded-md" />
                <Skeleton className="h-3.5 w-20 shrink-0" />
                <Skeleton className="h-3.5 w-20 shrink-0" />
              </div>
            ))}
          </div>

          {/* Totals band */}
          <div className="border-t-2 border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20 rounded-md" />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:flex sm:items-center sm:gap-8">
                {[1, 2].map((box) => (
                  <div key={box} className="sm:text-right">
                    <Skeleton className="h-2.5 w-10 sm:ml-auto" />
                    <Skeleton className="mt-1 h-5 w-24 sm:ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. SYSTEM AUDIT TRAIL LOGS SKELETON
// ─────────────────────────────────────────────────────────────
export function AuditTrailSkeleton() {
  return (
    <div className="w-full space-y-6 pb-8 text-left animate-pulse">
      <div className="inline-flex items-center gap-2 text-slate-300 font-bold">
        <ArrowLeft className="size-4" />
        <Skeleton className="h-4 w-36" />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 sm:h-9 bg-slate-200" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-10 px-4 rounded-lg border border-slate-200 bg-white flex items-center gap-2">
            <RefreshCw className="size-4 text-slate-300" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="h-10 px-4 rounded-lg border border-slate-200 bg-white flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-slate-300" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 flex gap-3 items-start shadow-sm">
        <ShieldAlert className="size-5 text-blue-200 mt-0.5 shrink-0" />
        <div className="space-y-1.5 flex-1 pt-0.5">
          <Skeleton className="h-3.5 w-48 bg-slate-200" />
          <Skeleton className="h-3 w-full bg-slate-100" />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
        <div className="relative w-full h-10 border border-slate-200 rounded-lg flex items-center pl-9 bg-white">
          <Search className="absolute left-3 size-4 text-slate-300" />
          <Skeleton className="h-3.5 w-32" />
        </div>
        <div className="relative w-full h-10 border border-slate-200 rounded-lg flex items-center pl-9 bg-white">
          <Layers className="absolute left-3 size-4 text-slate-300" />
          <Skeleton className="h-3.5 w-28" />
        </div>
        <div className="relative w-full h-10 border border-slate-200 rounded-lg flex items-center pl-9 bg-white">
          <ArrowUpDown className="absolute left-3 size-4 text-slate-300" />
          <Skeleton className="h-3.5 w-36" />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                {[1, 2, 3, 4, 5].map((th) => (
                  <th key={th} className="px-5 py-3.5"><Skeleton className="h-3 w-16" /></th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td className="px-5 py-4"><Skeleton className="h-3 w-20" /></td>
                  <td className="px-4 py-4 flex items-center gap-2">
                    <Skeleton className="size-6 rounded-full shrink-0" />
                    <Skeleton className="h-3 w-16" />
                  </td>
                  <td className="px-4 py-4"><Skeleton className="h-5 w-14 rounded-full" /></td>
                  <td className="px-4 py-4"><Skeleton className="h-3 w-12" /></td>
                  <td className="px-4 py-4 space-y-1"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-48" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. AGED PAYABLES SKELETON (AP Aging)
// ─────────────────────────────────────────────────────────────
export function AgedPayablesSkeleton() {
  return (
    <div className="w-full space-y-6 text-left animate-pulse">
      <div className="inline-flex items-center gap-2 text-slate-300 font-bold">
        <ArrowLeft className="size-4" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-8 w-52 bg-slate-200 rounded-lg" />
        <Skeleton className="h-4 w-80 bg-slate-100 rounded-md" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/20">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-48 rounded-md" />
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-3 w-1/3">
                <Skeleton className="size-7 rounded-full shrink-0" />
                <Skeleton className="h-4 w-full" />
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 5. AGED RECEIVABLES SKELETON (AR Aging)
// ─────────────────────────────────────────────────────────────
export function AgedReceivablesSkeleton() {
  return (
    <div className="w-full space-y-6 text-left animate-pulse">
      <div className="inline-flex items-center gap-2 text-slate-300 font-bold">
        <ArrowLeft className="size-4" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56 bg-slate-200 rounded-lg" />
        <Skeleton className="h-4 w-80 bg-slate-100 rounded-md" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/20">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-48 rounded-md" />
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-3 w-1/3">
                <Skeleton className="size-7 rounded-full shrink-0" />
                <Skeleton className="h-4 w-full" />
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}