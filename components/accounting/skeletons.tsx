import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, X } from "lucide-react";

/**
 * What the manual journals page looks like before its data arrives.
 *
 * A placeholder is only worth having if it stands where the real thing will.
 * This one used to draw an export button, a new-entry button, a search box,
 * two filters and a six-column register — none of which that page has. The
 * screen therefore settled twice: once into the imagined layout, then again
 * into the real one, which reads as the page loading wrong and correcting
 * itself.
 *
 * So it mirrors the page as built: the entry form first, with the fields and
 * the line table it actually shows, then the register beneath it.
 */
export function JournalsSkeleton() {
  return (
    <div className="w-full space-y-6 text-left">
      {/* Page heading. The real words, because they are known before any data
          is fetched and a grey bar where a title belongs helps nobody. */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
          Manual Journals
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Post balanced double-entry adjustments directly into the ledger.
        </p>
      </div>

      {/* The entry form */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_30px_rgba(15,23,42,0.035)]">
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-4 py-2">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-400">
            <span className="size-[7px] rounded-full bg-slate-200" />
            New journal entry
          </span>
          <div className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3">
            <Plus className="size-3.5 text-slate-300" />
            <Skeleton className="h-3 w-14" />
          </div>
        </header>

        <div className="space-y-4 p-4">
          <Skeleton className="h-14 w-full rounded-lg bg-blue-50" />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5 xl:col-span-2">
              <Skeleton className="h-2.5 w-24 bg-slate-100" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-10 bg-slate-100" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-28 bg-slate-100" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>

          {/* The line table, headings and all — they are fixed, so showing them
              means only the rows change when the data lands. */}
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100/80 text-[10px] font-bold uppercase tracking-[0.04em] text-slate-400">
                  <th className="px-2 py-2.5 text-left">Account</th>
                  <th className="px-2 py-2.5 text-left">Description</th>
                  <th className="px-2 py-2.5 text-right">Debit (in)</th>
                  <th className="px-2 py-2.5 text-right">Credit (out)</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {[0, 1].map((row) => (
                  <tr key={row} className="border-t border-slate-100">
                    <td className="px-2 py-2">
                      <Skeleton className="h-9 w-[190px] rounded-md" />
                    </td>
                    <td className="px-2 py-2">
                      <Skeleton className="h-9 w-[160px] rounded-md" />
                    </td>
                    <td className="px-2 py-2">
                      <Skeleton className="ml-auto h-9 w-28 rounded-md" />
                    </td>
                    <td className="px-2 py-2">
                      <Skeleton className="ml-auto h-9 w-28 rounded-md" />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <X className="mx-auto size-4 text-slate-200" />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/70">
                  <td className="px-2 py-2.5 text-sm font-semibold text-slate-400" colSpan={2}>
                    Totals
                  </td>
                  <td className="px-2 py-2.5">
                    <Skeleton className="ml-auto h-4 w-16 bg-slate-200" />
                  </td>
                  <td className="px-2 py-2.5">
                    <Skeleton className="ml-auto h-4 w-16 bg-slate-200" />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* The balance bar. Solid rather than pulsing: it is the one element
              whose position must not move, because it is what the eye returns
              to once the numbers are real. */}
          <div className="h-[50px] rounded-lg bg-gradient-to-br from-slate-900 to-blue-800 opacity-30" />

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <Skeleton className="h-3 w-72 max-w-[60%] bg-slate-100" />
            <Skeleton className="h-9 w-40 rounded-md bg-blue-100" />
          </div>
        </div>
      </section>

      {/* The register */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6">
          <span className="text-sm font-bold text-slate-400 sm:text-base">Journal Register</span>
          <Skeleton className="h-3 w-16 bg-slate-100" />
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="size-10 text-slate-200" />
          <Skeleton className="mt-3 h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-56 bg-slate-100" />
        </div>
      </section>
    </div>
  );
}
