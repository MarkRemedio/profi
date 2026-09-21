"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  className?: string;
};

/**
 * Password field with a show/hide toggle, matching the admin form input style
 * (lock icon on the left, control chrome identical to the plain inputs).
 *
 * The toggle is a real focusable button rather than a decorative icon so it
 * works by keyboard, and `type="button"` keeps it from submitting the
 * enclosing form.
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

      <input
        {...props}
        type={visible ? "text" : "password"}
        className={cn(
          "w-full rounded-md border border-slate-200 py-2 pl-9 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
          className
        )}
      />

      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded border-none bg-transparent text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
