import Link from "next/link";
import { AlertTriangle, ArrowRight, ArrowUpRight, Loader2, Sparkles, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoneyMajor } from "@/lib/currency";
import type { SpendAnomaly } from "@/lib/accounting/spend-anomalies";

export function SpendingAnomalyCard({
  anomalies,
  currency,
  isLoading = false,
  className,
}: {
  anomalies: SpendAnomaly[];
  currency: string | null | undefined;
  isLoading?: boolean;
  className?: string;
}) {
  const shown = anomalies.slice(0, 3);
  const hasAnomalies = shown.length > 0;

  return (
    <section className={cn("overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-white px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Sparkles className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-900">Unusual spending</h3>
            <p className="truncate text-xs text-slate-500">Supplier spikes against a 3-month baseline</p>
          </div>
        </div>
        <Badge variant="secondary" className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
          {isLoading ? "Checking" : hasAnomalies ? `${shown.length} alert${shown.length === 1 ? "" : "s"}` : "Clear"}
        </Badge>
      </div>

      <div className="space-y-3 p-5">
        {isLoading ? (
          <>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-2">
                    <div className="h-3.5 w-36 rounded bg-slate-200/80" />
                    <div className="h-3 w-52 rounded bg-slate-100" />
                  </div>
                  <div className="h-7 w-16 rounded-full bg-slate-100" />
                </div>
              </div>
            ))}
          </>
        ) : hasAnomalies ? (
          <>
            {shown.map((anomaly, index) => {
              const average = formatMoneyMajor(anomaly.baselineMonthlyMinor, currency);
              const current = formatMoneyMajor(anomaly.currentMonthMinor, currency);
              const delta = `${Math.round(anomaly.deltaPct)}%`;

              return (
                <Link
                  key={anomaly.supplierId}
                  href="/purchases/suppliers"
                  className="block rounded-xl border border-amber-100 bg-amber-50/40 p-3 transition-colors hover:border-amber-200 hover:bg-amber-50/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-slate-900">{anomaly.supplierName}</p>
                        {index === 0 ? (
                          <Badge variant="secondary" className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            Top spike
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {current} this month vs {average}/mo over the prior 3 months
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-700 shadow-sm ring-1 ring-amber-100">
                      <ArrowUpRight className="size-3.5" />
                      {delta}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{index === 0 ? "Biggest current spike" : "Other supplier anomaly"}</span>
                    <span className="font-semibold text-slate-700">View supplier</span>
                  </div>
                </Link>
              );
            })}

            {anomalies.length > shown.length && (
              <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/30 px-3 py-2 text-xs text-amber-900">
                {anomalies.length - shown.length} more supplier{anomalies.length - shown.length === 1 ? "" : "s"} are also running hot.
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <TrendingUp className="size-4" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-700">No unusual spending detected</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Supplier spend is staying within its recent pattern for the current month.
            </p>
            <Link href="/purchases/suppliers" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800">
              Review suppliers <ArrowRight className="size-3" />
            </Link>
          </div>
        )}

        {!isLoading && hasAnomalies && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span className="font-medium">
              Compare the largest spike against the 3-month average before approving more spend.
            </span>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-3 text-xs text-slate-500">
            <Loader2 className="size-3.5 animate-spin" />
            Checking supplier spend patterns...
          </div>
        )}
      </div>
    </section>
  );
}

