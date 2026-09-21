"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Stage labels mirror the real pipeline in lib/banking/statement-parser.
 * Durations are calibrated against measured runs (OCR ~2-3s, analysis ~1-3s);
 * the final stage holds until the server action returns, so no stage ever
 * claims to have finished work that is still running.
 */
const PARSE_STAGES = [
  { label: "Reading document", holdMs: 2600 },
  { label: "Working out the layout", holdMs: 2200 },
  { label: "Extracting transactions", holdMs: 1400 },
  { label: "Checking the balances", holdMs: Infinity },
] as const;

export function StatementParseProgress({
  isPdf,
  phase = "parsing",
  /**
   * Set only when the file is large enough to be routed via storage, in which
   * case sending it is a real wait of its own and gets its own stage.
   */
  uploadLabel,
}: {
  isPdf: boolean;
  phase?: "uploading" | "parsing";
  uploadLabel?: string;
}) {
  const [stage, setStage] = useState(0);
  const uploading = phase === "uploading";

  useEffect(() => {
    // Holding the timeline while bytes are still in flight keeps the stages
    // honest: nothing claims to be parsing a file the server hasn't got yet.
    if (!isPdf || uploading) return;
    const hold = PARSE_STAGES[stage]?.holdMs;
    if (!hold || hold === Infinity) return;
    const timer = setTimeout(() => setStage((s) => Math.min(s + 1, PARSE_STAGES.length - 1)), hold);
    return () => clearTimeout(timer);
  }, [stage, isPdf, uploading]);

  // CSV parsing is synchronous and local — staged progress would be theatre.
  if (!isPdf) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <Loader2 className="size-4 animate-spin text-blue-600" />
        {uploading ? `${uploadLabel ?? "Uploading your file"}…` : "Reading your file…"}
      </div>
    );
  }

  const rows = [
    ...(uploadLabel ? [{ label: uploadLabel, done: !uploading, active: uploading }] : []),
    ...PARSE_STAGES.map((s, i) => ({
      label: s.label,
      done: !uploading && i < stage,
      active: !uploading && i === stage,
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
        {rows.map(({ label, done, active }) => (
          <div
            key={label}
            className={cn(
              "flex items-center gap-2.5 text-sm transition-colors",
              done && "text-slate-500",
              active && "font-semibold text-slate-900",
              !done && !active && "text-slate-300"
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              {done ? (
                <Check className="size-4 text-green-600" />
              ) : active ? (
                <Loader2 className="size-4 animate-spin text-blue-600" />
              ) : (
                <span className="size-1.5 rounded-full bg-slate-200" />
              )}
            </span>
            {label}
          </div>
        ))}
      </div>

      {/* Preview skeleton — column widths match the real table below. */}
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-2.5 flex-1" />
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-14" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-2.5 last:border-0">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
