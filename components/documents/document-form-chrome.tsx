"use client";

import { cn } from "@/lib/utils";

/**
 * The shell a document form is built from: cards with a labelled head, and the
 * field styles that go inside them.
 *
 * Lifted out of the invoice form so the bill form can look the same. The two
 * are the same task seen from either side of a trade — one party's invoice is
 * the other's bill — and they had drifted into two different layouts, so moving
 * between them meant relearning where things are.
 *
 * Presentation only. Nothing here knows what a document is.
 */

export function SectionCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_30px_rgba(15,23,42,0.035)] transition-colors hover:border-slate-300/80",
        className
      )}
    >
      {children}
    </section>
  );
}

export function SectionHead({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-4 py-2">
      <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-600">
        <span className="size-[7px] rounded-full bg-gradient-to-br from-blue-400 to-blue-600 ring-4 ring-blue-50" />
        {title}
      </h2>
      {badge ? (
        <span className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.07em] text-blue-600">
          {badge}
        </span>
      ) : null}
      {children}
    </header>
  );
}

/** A full-height field input. */
export const DOC_INPUT_CLS =
  "h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.025)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

/** The tighter input used inside a line-items table cell. */
export const DOC_CELL_INPUT_CLS =
  "h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

export const DOC_LABEL_CLS =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500";

export const DOC_TH_CLS =
  "whitespace-nowrap border-b border-slate-200 bg-slate-100/80 px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500";

/**
 * A panel that opens and closes at a height the eye can follow.
 *
 * `height: auto` cannot be transitioned, and animating a fixed max-height guesses
 * at a number that is wrong the moment the content changes. A grid with one
 * track does transition, between `0fr` and `1fr`, whatever is inside it.
 *
 * The content stays mounted rather than being conditionally rendered, which is
 * what lets the close animate at all — an element already removed from the tree
 * cannot animate its own departure — and has the side benefit that half-typed
 * input survives a collapse.
 */
export function CollapsibleSection({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        className
      )}
      // Hidden from assistive technology and from tab order while collapsed:
      // zero height still leaves the inputs reachable otherwise.
      aria-hidden={!open}
    >
      <div className={cn("overflow-hidden", !open && "invisible")}>{children}</div>
    </div>
  );
}
