"use client";

import { BriefcaseBusiness, Loader2, UserRound } from "lucide-react";
import { type FeedTransaction, useSetFeedTransactionScope } from "@/lib/banking/api";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function TransactionScopeSelect({ transaction, className }: { transaction: FeedTransaction; className?: string }) {
  const setScope = useSetFeedTransactionScope();
  const scope = setScope.isPending && setScope.variables?.txId === transaction.id
    ? setScope.variables.scope
    : transaction.transaction_scope;
  const personal = scope === "personal";

  return <Select value={scope} disabled={setScope.isPending} onValueChange={(value) => void setScope.mutateAsync({ txId: transaction.id, scope: value as FeedTransaction["transaction_scope"] })}>
    <SelectTrigger size="sm" aria-label={`Transaction type for ${transaction.description}`} className={cn("h-8 min-w-28 gap-1 border text-[11px] font-semibold shadow-none", personal ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800", className)}>
      {setScope.isPending ? <Loader2 className="size-3 animate-spin" /> : personal ? <UserRound className="size-3" /> : <BriefcaseBusiness className="size-3" />}
      <SelectValue />
    </SelectTrigger>
    <SelectContent className="z-[100001] min-w-44"><SelectGroup><SelectLabel>Transaction type</SelectLabel><SelectItem value="company">Company</SelectItem><SelectItem value="personal">Personal</SelectItem></SelectGroup></SelectContent>
  </Select>;
}
