"use client";

import { AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
  variant?: "warning" | "destructive";
};

/** A shared, accessible replacement for browser confirm dialogs. */
export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Continue",
  onConfirm,
  loading = false,
  variant = "warning",
}: ConfirmationDialogProps) {
  const destructive = variant === "destructive";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!loading} className="gap-5 p-6 sm:max-w-md">
        <DialogHeader className="gap-3 pr-8">
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              destructive ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600",
            )}
          >
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <DialogTitle className="text-lg font-bold text-slate-950">{title}</DialogTitle>
          <DialogDescription className="leading-6 text-slate-600">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="-mx-6 -mb-6 border-slate-100 bg-white p-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={cn(
              "h-9 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50",
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700",
            )}
          >
            {loading ? "Working..." : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
