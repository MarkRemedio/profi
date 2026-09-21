"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

export type MinimizedTaskStatus = "working" | "ready" | "success" | "error";

const ringStyles: Record<MinimizedTaskStatus, string> = {
  working: "animate-spin border-blue-200 border-t-blue-600",
  ready: "border-emerald-500",
  success: "border-emerald-500",
  error: "border-red-500",
};

const iconStyles: Record<MinimizedTaskStatus, string> = {
  working: "text-blue-600",
  ready: "text-emerald-600",
  success: "text-emerald-600",
  error: "text-red-600",
};

export function MinimizedTaskIndicator({
  status,
  label,
  icon,
  onOpen,
  notifyWhenFinished = true,
  notificationActionLabel = "Open",
  className,
}: {
  status: MinimizedTaskStatus;
  label: string;
  icon: ReactNode;
  onOpen: () => void;
  notifyWhenFinished?: boolean;
  notificationActionLabel?: string;
  className?: string;
}) {
  const previousStatus = useRef(status);

  useEffect(() => {
    const wasWorking = previousStatus.current === "working";
    previousStatus.current = status;

    if (!notifyWhenFinished || !wasWorking || status === "working") return;

    const options = {
      action: {
        label: notificationActionLabel,
        onClick: onOpen,
      },
    };

    if (status === "error") toast.error(label, options);
    else toast.success(label, options);
  }, [label, notificationActionLabel, notifyWhenFinished, onOpen, status]);

  return createPortal(
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}. Open details.`}
      title={`${label} — open details`}
      className={cn(
        "group fixed bottom-24 right-5 z-[60] flex size-14 items-center justify-center rounded-full print:hidden",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-0 rounded-full border-[3px]", ringStyles[status])}
      />
      <span
        aria-hidden="true"
        className={cn(
          "flex size-11 items-center justify-center rounded-full bg-white shadow-lg transition-transform group-hover:scale-105",
          iconStyles[status],
        )}
      >
        {icon}
      </span>
      <span className="sr-only" aria-live="polite">{label}</span>
    </button>,
    document.body,
  );
}
