"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { evaluatePassword, PASSWORD_RULES } from "@/lib/auth/password-rules";

/**
 * The strength meter and requirement checklist shown while a password is typed.
 *
 * Reads the same rules the server enforces, so the ticks cannot promise
 * something the action then refuses.
 *
 * The checklist is always visible once typing starts, rather than appearing
 * only on failure: a list of what is still needed is more use than an error
 * naming what was wrong after the attempt.
 */
export function PasswordRequirements({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  const rules = evaluatePassword(password);
  const metCount = rules.filter((rule) => rule.met).length;
  const percent = Math.round((metCount / PASSWORD_RULES.length) * 100);

  const label = metCount <= 2 ? "Weak" : metCount <= 4 ? "Fair" : "Strong";
  const barColour =
    metCount <= 2 ? "bg-red-500" : metCount <= 4 ? "bg-amber-500" : "bg-emerald-500";
  const textColour =
    metCount <= 2 ? "text-red-600" : metCount <= 4 ? "text-amber-600" : "text-emerald-600";

  return (
    <div className={cn("space-y-3", className)}>
      {password.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Password strength</span>
            <span className={textColour}>{label}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn("h-full rounded-full transition-all duration-300", barColour)}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-1.5 rounded-xl border border-slate-200/60 bg-slate-50/80 p-3.5 text-xs">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-2">
            {rule.met ? (
              <Check className="size-3.5 shrink-0 text-blue-600" />
            ) : (
              <div className="size-3.5 shrink-0 rounded-full border border-slate-300" />
            )}
            <span
              className={cn(
                "transition-colors",
                rule.met ? "font-medium text-slate-900" : "text-slate-500"
              )}
            >
              {rule.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
