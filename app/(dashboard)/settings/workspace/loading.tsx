import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the workspace cards so the page does not jump when the data lands. */
export default function WorkspaceSettingsLoading() {
  return (
    <div role="status" aria-busy="true" className="w-full space-y-6 pb-16">
      <span className="sr-only">Loading workspace settings</span>

      <div className="border-b border-slate-100 pb-5">
        <Skeleton className="h-8 w-64 bg-slate-200" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>

      {/* Currency and VAT share a row on wide screens, as on the real page. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-2 border-b border-slate-100 p-6">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded bg-blue-100" />
          <Skeleton className="h-5 w-40 bg-slate-200" />
        </div>
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      <div className="flex flex-1 flex-col space-y-4 p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full max-w-sm rounded-md" />
        <Skeleton className="h-3 w-3/4" />
        <div className="mt-auto flex justify-end border-t border-slate-100 pt-4">
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}
