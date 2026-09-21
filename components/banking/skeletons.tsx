import { Skeleton } from "@/components/ui/skeleton";
import { QuickActionsSkeleton } from "@/components/shared/quick-actions";

/**
 * Route-level placeholders for the banking pages.
 *
 * These render while the server component resolves, so the shape of the page
 * arrives before its data does. Deliberately mirroring the real layout — same
 * card grid, same table columns, same row height — because a placeholder that
 * does not match causes the page to jump when the content lands, which is worse
 * than a brief blank.
 *
 * Spinners are still correct on buttons: a spinner says "the thing you just
 * clicked is happening", a skeleton says "this content is arriving". Only the
 * second one belongs here.
 */

function TableRowsSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} className="border-b border-slate-50">
          {Array.from({ length: cols }).map((_, col) => (
            <td key={col} className="px-4 py-3">
              <Skeleton
                className={
                  // The last two columns are money, right-aligned and narrower,
                  // so the placeholder sits where the figures will.
                  col >= cols - 2 ? "ml-auto h-3.5 w-16" : col === 0 ? "h-3.5 w-20" : "h-3.5 w-40"
                }
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Bank Dashboard — action strip, three summary cards, feed table, account cards. */
export function BankingDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <QuickActionsSkeleton count={4} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="mt-4 h-8 w-32" />
            <Skeleton className="mt-4 h-3 w-full" />
          </div>
        ))}
      </div>

      <div>
        <Skeleton className="mb-3 h-5 w-40" />
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-8 w-48 rounded-lg" />
          </div>
          <table className="w-full text-sm">
            <tbody>
              <TableRowsSkeleton rows={5} cols={5} />
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <Skeleton className="mb-3 h-5 w-52" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <Skeleton className="size-10 rounded-lg" />
                <Skeleton className="h-4 w-14 rounded-md" />
              </div>
              <Skeleton className="mt-4 h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Account Transactions — account picker, ledger balance card, transaction table. */
export function BankTransactionsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-64 rounded-lg" />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-xl" />
          <div>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-1.5 h-3 w-28" />
          </div>
        </div>
        <div className="text-right">
          <Skeleton className="ml-auto h-3 w-24" />
          <Skeleton className="ml-auto mt-1.5 h-6 w-28" />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-8 w-52 rounded-lg" />
        </div>
        <table className="w-full text-sm">
          <tbody>
            <TableRowsSkeleton rows={8} cols={5} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Bank Statements — summary tiles above the imported statement feed. */
export function BankStatementsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Skeleton className="h-7 w-52" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-8 w-48 rounded-lg" />
        </div>
        <table className="w-full text-sm">
          <tbody>
            <TableRowsSkeleton rows={7} cols={5} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
