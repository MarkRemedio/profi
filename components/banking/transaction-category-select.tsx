"use client";

import { useState } from "react";
import { Loader2, Tag } from "lucide-react";

import {
  type FeedTransaction,
  useCategorizationAccounts,
  useCategorizeFeedTransaction,
} from "@/lib/banking/api";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const UNCATEGORIZED_VALUE = "__uncategorized__";

function label(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function TransactionCategorySelect({
  transaction,
  className,
}: {
  transaction: FeedTransaction;
  className?: string;
}) {
  const persistedAccountId = transaction.category_allocations[0]?.account_id ?? "";
  const [error, setError] = useState<string | null>(null);
  const { data: accounts, isLoading } = useCategorizationAccounts();
  const categorize = useCategorizeFeedTransaction();
  const suggested = transaction.category_status === "suggested";
  const accountId =
    categorize.isPending && categorize.variables?.txId === transaction.id
      ? (categorize.variables.accountId ?? "")
      : persistedAccountId;

  const handleChange = async (nextAccountId: string) => {
    setError(null);
    try {
      await categorize.mutateAsync({
        txId: transaction.id,
        accountId: nextAccountId || null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save category.");
    }
  };

  return (
    <div className={cn("relative min-w-0", className)}>
      <Select
        value={accountId || UNCATEGORIZED_VALUE}
        disabled={isLoading || categorize.isPending}
        onValueChange={(value) => void handleChange(value === UNCATEGORIZED_VALUE ? "" : value)}
      >
        <SelectTrigger
          size="sm"
          aria-label={`Category for ${transaction.description}`}
          title={
            transaction.reconcile_status === "reconciled"
              ? "Changing this category will return the transaction to unreconciled"
              : suggested
                ? "Suggested from a prior confirmed category. It will be used when you record this transaction."
                : undefined
          }
          className={cn(
            "h-8 w-full gap-1 rounded-md border px-2 text-[11px] font-semibold shadow-none hover:bg-slate-50",
            accountId
              ? suggested
                ? "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"
                : "border-slate-200 bg-white text-slate-700"
              : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
          )}
        >
          <Tag
            aria-hidden="true"
            className={cn("size-3.5", accountId ? "text-slate-400" : "text-amber-600")}
          />
          <SelectValue placeholder="Uncategorized" />
          {categorize.isPending ? <Loader2 aria-hidden="true" className="size-3 animate-spin text-emerald-600" /> : null}
        </SelectTrigger>
        <SelectContent position="popper" className="z-[100001] max-h-80 w-[min(42rem,calc(100vw-2rem))] min-w-0 p-1">
          <SelectGroup>
            <SelectLabel>Transaction category</SelectLabel>
            <SelectItem value={UNCATEGORIZED_VALUE} className="text-slate-600">
              Uncategorized
            </SelectItem>
            <SelectSeparator />
            <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:grid-cols-[4rem_minmax(12rem,1fr)_7rem_10rem] sm:gap-3" aria-hidden="true">
              <span>Code</span>
              <span>Account</span>
              <span className="hidden sm:block">Type</span>
              <span className="hidden sm:block">Report</span>
            </div>
            {(accounts ?? []).map((account) => (
              <SelectItem
                key={account.id}
                value={account.id}
                textValue={`${account.code} ${account.name}`}
              >
                <span className="grid min-w-0 flex-1 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[4rem_minmax(12rem,1fr)_7rem_10rem] sm:gap-3">
                  <span className="font-mono text-[10px] font-bold text-slate-400">
                    {account.code}
                  </span>
                  <span className="min-w-0"><span className="block truncate">{account.name}</span><span className="block truncate text-[9px] font-medium text-slate-400 sm:hidden">{label(account.account_type)} · {label(account.report_category)}</span></span>
                  <span className="hidden truncate text-[10px] font-semibold text-slate-500 sm:block">
                    {label(account.account_type)}
                  </span>
                  <span className="hidden truncate text-[10px] font-semibold text-slate-500 sm:block" title={label(account.report_category)}>
                    {label(account.report_category)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {error ? (
        <p
          role="alert"
          className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 shadow-sm"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
