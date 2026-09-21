import { cn } from "@/lib/utils";

/**
 * Loading skeletons for the POS module.
 *
 * Unlike the admin skeletons, these are not route-level: POS components fetch
 * their own data client-side, so each skeleton renders *inside* an already
 * painted card and stands in only for the region that is still loading. That
 * keeps the page chrome stable and avoids a second spinner on top of it.
 *
 * Two-tone rule, matching components/admin/skeletons.tsx:
 *   bg-slate-200 → prominent values and headings
 *   bg-slate-100 → secondary text
 *   bg-slate-50  → large fill areas
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

/**
 * Stands in for a `<table>` inside an existing bordered card. Reproduces the
 * slate-50 header band and row dividers so the swap to real rows does not shift
 * the layout.
 */
export function PosTableSkeleton({
  columns = 6,
  rows = 6,
  minWidth = "min-w-[700px]",
  label = "Loading records",
}: {
  columns?: number;
  rows?: number;
  minWidth?: string;
  label?: string;
}) {
  return (
    <Root label={label} className={cn("w-full", minWidth)}>
      <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Bar key={i} className={cn("h-3", i === 0 ? "w-28" : "w-20")} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-slate-100 px-4 py-4">
          {Array.from({ length: columns }).map((_, c) => (
            <Bar
              key={c}
              className={cn(
                "h-4",
                c === 0 ? "w-28 bg-slate-200" : c === columns - 1 ? "w-14" : "w-20"
              )}
            />
          ))}
        </div>
      ))}
    </Root>
  );
}

/** The tile grid on the terminal, matching its 2 / 3 / 4 column breakpoints. */
export function PosProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <Root
      label="Loading products"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 content-start flex-1"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
          <Bar className="aspect-square w-full rounded-lg bg-slate-50" />
          <Bar className="mt-2.5 h-3.5 w-4/5 bg-slate-200" />
          <Bar className="mt-1.5 h-3 w-1/2" />
          <Bar className="mt-2.5 h-4 w-16 bg-slate-200" />
        </div>
      ))}
    </Root>
  );
}

/** A divided vertical list, as used by the customer directory. */
export function PosListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Root label="Loading list" className="divide-y divide-slate-100">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Bar className="size-10 shrink-0 rounded-full bg-slate-50" />
          <div className="flex-1 space-y-1.5">
            <Bar className="h-3.5 w-1/3 bg-slate-200" />
            <Bar className="h-3 w-1/2" />
          </div>
          <Bar className="h-6 w-14 rounded-full bg-slate-50" />
        </div>
      ))}
    </Root>
  );
}

/** A responsive row of equal cards, e.g. the slow-moving inventory watchlist. */
export function PosCardsSkeleton({
  count = 3,
  cols = "sm:grid-cols-3",
}: {
  count?: number;
  cols?: string;
}) {
  return (
    <Root label="Loading cards" className={cn("grid gap-4", cols)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4"
        >
          <div className="space-y-1.5">
            <Bar className="h-3.5 w-24 bg-slate-200" />
            <Bar className="h-3 w-16" />
          </div>
          <Bar className="h-6 w-12 rounded-lg bg-slate-200" />
        </div>
      ))}
    </Root>
  );
}

/**
 * The Z-report slip. Rendered in place of the receipt lines rather than as an
 * overlay, so there is no blurred spinner sitting on top of stale figures.
 */
export function PosReceiptSkeleton() {
  return (
    <Root label="Loading Z-report" className="space-y-4">
      <div className="border-b border-dashed border-slate-300 pb-3 text-center">
        <Bar className="mx-auto h-4 w-40 bg-slate-200" />
        <Bar className="mx-auto mt-1.5 h-3 w-32" />
        <Bar className="mx-auto mt-1.5 h-3 w-24" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Bar className="h-3 w-32" />
            <Bar className="h-3 w-14 bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="space-y-2.5 border-t border-dashed border-slate-300 pt-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Bar className="h-3 w-28" />
            <Bar className="h-3 w-12" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-dashed border-slate-300 pt-3">
        <Bar className="h-4 w-32 bg-slate-200" />
        <Bar className="h-4 w-16 bg-slate-200" />
      </div>
    </Root>
  );
}
