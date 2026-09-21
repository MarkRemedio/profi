"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type QuickActionsProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

type QuickActionProps = {
  label: string;
  description?: string;
  icon: LucideIcon;
  href?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  disabled?: boolean;
  loading?: boolean;
  primary?: boolean;
  tone?: "blue" | "orange" | "emerald" | "teal";
  /** A compact warning shown inside the action; its explanation appears on hover/focus. */
  warningMessage?: string;
  className?: string;
};

const primaryToneClasses = {
  blue: "border-blue-600 bg-blue-600 hover:border-blue-700 hover:bg-blue-700 focus-visible:ring-blue-500",
  orange:
    "border-orange-600 bg-orange-600 hover:border-orange-700 hover:bg-orange-700 focus-visible:ring-orange-500",
  emerald:
    "border-emerald-600 bg-emerald-600 hover:border-emerald-700 hover:bg-emerald-700 focus-visible:ring-emerald-500",
  teal: "border-teal-600 bg-teal-600 hover:border-teal-700 hover:bg-teal-700 focus-visible:ring-teal-500",
} as const;

export function QuickActions({ children, className, title = "Quick Actions" }: QuickActionsProps) {
  return (
    <div
      role="group"
      aria-label={title}
      className={cn(
        "grid w-full min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-1 sm:flex-wrap sm:items-center sm:justify-start xl:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function QuickAction({
  label,
  description,
  icon: Icon,
  href,
  onClick,
  disabled = false,
  loading = false,
  primary = false,
  tone = "blue",
  warningMessage,
  className,
}: QuickActionProps) {
  const classes = cn(
    "inline-flex h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors sm:w-auto sm:shrink-0",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    primary
      ? cn("text-white shadow-sm", primaryToneClasses[tone])
      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-slate-400",
    (disabled || loading) && "cursor-not-allowed opacity-60",
    className,
  );

  const content = (
    <>
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", loading && "animate-spin")} />
      <span className="truncate">{loading ? `${label}...` : label}</span>
      {warningMessage ? (
        <span className="group/alert relative flex shrink-0" aria-label={warningMessage}>
          <AlertTriangle aria-hidden="true" className="size-3.5 text-amber-500" />
          <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-64 rounded-md bg-slate-900 px-3 py-2 text-left text-xs font-medium leading-4 text-white shadow-lg group-hover/alert:block group-focus-within/alert:block">
            {warningMessage}
          </span>
        </span>
      ) : null}
      {description ? <span className="sr-only">. {description}</span> : null}
    </>
  );

  if (href && !disabled && !loading) {
    return (
      <Link href={href} className={classes} title={description}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
      title={warningMessage ?? description}
    >
      {content}
    </button>
  );
}

export function QuickActionsSkeleton({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "grid w-full min-w-0 animate-pulse grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-1 sm:flex-wrap sm:items-center sm:justify-start xl:justify-end",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="h-10 w-full rounded-lg bg-slate-100 sm:w-32 sm:shrink-0" />
      ))}
    </div>
  );
}
