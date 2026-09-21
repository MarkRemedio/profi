import { Activity } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* ─── HEADER SKELETON ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-64 rounded-lg bg-slate-200 animate-pulse" />
            <div className="h-6 w-16 rounded-md bg-slate-100 animate-pulse hidden sm:block" />
          </div>
          <div className="h-4 w-72 rounded-md bg-slate-100 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 rounded-md bg-slate-200 animate-pulse" />
          <div className="h-9 w-32 rounded-md bg-blue-200 animate-pulse" />
        </div>
      </div>

      {/* ─── KPI SKELETONS ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-slate-300 animate-pulse" />
          <div className="h-6 w-48 rounded-md bg-slate-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
                <div className="size-8 rounded-lg bg-slate-50 animate-pulse" />
              </div>
              <div className="mt-4 h-8 w-32 rounded-lg bg-slate-200 animate-pulse" />
              <div className="mt-3 h-3 w-24 rounded bg-slate-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* ─── 3 DONUT CHARTS SKELETON ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={`donut-${i}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col h-[320px]">
            <div className="mb-4 flex items-center gap-2">
              <div className="size-4 rounded bg-slate-200 animate-pulse" />
              <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="size-[180px] rounded-full border-[12px] border-slate-50 bg-slate-100/50 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      
      {/* ─── 4 WIDGETS SKELETON ─── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={`widget-${i}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm h-[250px] flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-4 rounded bg-slate-200 animate-pulse" />
                <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
              </div>
              <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
            </div>
            <div className="flex-1 rounded-lg bg-slate-50 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}