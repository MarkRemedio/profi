import * as React from "react";
import { cn } from "@/lib/utils";

const RadioGroupContext = React.createContext<{ value: string; onValueChange: (v: string) => void } | null>(null);

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, onValueChange, children, ...props }, ref) => {
    return (
      <RadioGroupContext.Provider value={{ value: value ?? "", onValueChange: onValueChange ?? (() => {}) }}>
        <div ref={ref} className={cn("space-y-2", className)} role="radiogroup" {...props}>
          {children}
        </div>
      </RadioGroupContext.Provider>
    );
  }
);
RadioGroup.displayName = "RadioGroup";

const RadioGroupItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, ...props }, ref) => {
  const ctx = React.useContext(RadioGroupContext);
  if (!ctx) throw new Error("RadioGroupItem must be used within RadioGroup");

  const isChecked = ctx.value === value;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isChecked}
      data-state={isChecked ? "checked" : "unchecked"}
      ref={ref}
      className={cn(
        "aspect-square size-4 rounded-full border-2 border-slate-300 text-blue-600 ring-offset-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        isChecked && "border-blue-600 bg-blue-600",
        className
      )}
      onClick={() => ctx.onValueChange(value)}
      {...props}
    >
      {isChecked && (
        <span className="flex items-center justify-center">
          <span className="size-2 rounded-full bg-white" />
        </span>
      )}
    </button>
  );
});
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };