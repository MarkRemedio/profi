"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export function CollapsibleInsightsCard({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white transition-[box-shadow,transform] duration-300 ease-out motion-reduce:transition-none",
        isExpanded ? "shadow-xl" : "shadow-md",
      )}
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() => setIsExpanded((current) => !current)}
        className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 px-6 py-4 text-left outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80 motion-reduce:transition-none"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/20">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">Insights</span>
            <span className="block truncate text-xs font-medium text-blue-100">
              Sales and collection highlights
            </span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/15">
          {isExpanded ? "Collapse" : "Expand"}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-300 ease-out motion-reduce:transition-none",
              isExpanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </span>
      </button>

      <div
        id={contentId}
        aria-hidden={!isExpanded}
        inert={!isExpanded}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-white/10 px-6 pb-6 pt-5">{children}</div>
        </div>
      </div>
    </section>
  );
}
