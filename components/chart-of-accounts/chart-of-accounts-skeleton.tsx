import { Skeleton } from "@/components/ui/skeleton";

export function ChartOfAccountsSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500 mt-6 text-left w-full">
      
      {/* 🚀 Account Stats Grid Mockup */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <Skeleton className="h-3 w-[100px] mb-3" />
            <Skeleton className="h-8 w-[80px]" />
          </div>
        ))}
      </div>

      {/* 🚀 Table Controls (Search & Filters) Mockup */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <Skeleton className="h-10 w-full sm:w-[320px] rounded-lg" />
        <div className="flex gap-2 w-full sm:w-auto">
          <Skeleton className="h-10 w-[120px] rounded-lg hidden sm:block" />
          <Skeleton className="h-10 w-[120px] rounded-lg hidden sm:block" />
          <Skeleton className="h-10 w-[100px] rounded-lg" />
        </div>
      </div>

      {/* 🚀 Main Accounts Table Mockup */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="flex justify-between items-center px-2">
            <Skeleton className="h-4 w-[150px]" />
            <div className="flex gap-16 hidden md:flex">
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-[100px]" />
            </div>
          </div>
        </div>
        <div className="p-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex justify-between items-center px-4 py-4 border-b border-slate-50 last:border-0">
              <div className="space-y-2">
                <Skeleton className="h-4 w-[220px]" />
                <Skeleton className="h-3 w-[140px]" />
              </div>
              <div className="flex gap-12 items-center hidden md:flex">
                <Skeleton className="h-4 w-[90px]" />
                <Skeleton className="h-6 w-[80px] rounded-full" />
                <Skeleton className="size-8 rounded-md shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}