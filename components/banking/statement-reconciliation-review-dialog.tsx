"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, BriefcaseBusiness, Check, CheckCircle2, CircleX, Info, ListChecks, Loader2, Minus, Sparkles, UserRound, X } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { toast } from "sonner";
import { type FeedTransaction, useCategorizationAccounts, useRecordStatementReviewRows } from "@/lib/banking/api";
import { formatMoney } from "@/lib/currency";
import { WindowedPager } from "@/components/ui/windowed-pager";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MinimizedTaskIndicator } from "@/components/ui/minimized-task-indicator";

const PAGE_SIZE = 50;
const NO_CATEGORY = "__no_category__";
type Level = "success" | "warning" | "error";
type Notice = { level: Level; title: string; message: string; details?: { message: string; count: number; examples: string[] }[] };

function friendlyError(message: string) {
  if (/choose a category/i.test(message)) return "Choose a category for this transaction.";
  if (/personal transactions/i.test(message)) return "Personal transactions were saved as personal and were not added to the business accounts.";
  if (/category.*not available|selected category/i.test(message)) return "The selected category is no longer available. Choose another category and try again.";
  if (/already reconciled/i.test(message)) return "This transaction has already been reconciled. Refresh the list to see its latest status.";
  if (/closed|lock(ed)? period|accounting period/i.test(message)) return "This transaction falls in a closed accounting period. Reopen that period or change the transaction date before trying again.";
  if (/foreign-currency|exchange rate|currency/i.test(message)) return "This bank account uses a different currency from your workspace. Add or confirm an exchange rate before trying again.";
  if (/bank account.*not found|bank.*chart|chart.*bank/i.test(message)) return "This bank account is not fully set up for accounting. Check the account linked to it in your Chart of Accounts.";
  if (/customer or supplier|could not be identified|no suitable customer|no suitable supplier/i.test(message)) return "We could not confidently identify the customer or supplier. Choose the correct contact and create this record manually.";
  if (/VAT|tax treatment|tax detail/i.test(message)) return "This transaction needs its VAT treatment checked before a record can be created.";
  if (/excluded|transfer|loan|payroll|refund/i.test(message)) return "This type of transaction needs a manual review and was not recorded automatically.";
  if (/AI document suggestions are unavailable|AI response/i.test(message)) return "We could not prepare a reliable record suggestion right now. Please try again or review this transaction manually.";
  return "We could not record this transaction. Check its category and bank-account setup, then try again.";
}

function groupErrors(errors: { tx_id: string; message: string }[], transactions: FeedTransaction[]) {
  const byId = new Map(transactions.map((tx) => [tx.id, tx]));
  const groups = new Map<string, { count: number; examples: string[] }>();
  for (const error of errors) {
    const message = friendlyError(error.message);
    const group = groups.get(message) ?? { count: 0, examples: [] };
    const description = byId.get(error.tx_id)?.description?.trim();
    group.count += 1;
    if (description && group.examples.length < 3 && !group.examples.includes(description)) group.examples.push(description);
    groups.set(message, group);
  }
  return [...groups].map(([message, group]) => ({ message, ...group }));
}

const noticeStyle: Record<Level, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  error: "border-red-200 bg-red-50 text-red-950",
};

function label(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function StatementReconciliationReviewDialog({
  transactions = [], autoReconciled, loading = false, error, warning, onRetry, onClose,
}: {
  transactions?: FeedTransaction[]; autoReconciled: number; loading?: boolean; error?: string | null; warning?: string | null; onRetry?: () => void; onClose: () => void;
}) {
  const { data: accounts } = useCategorizationAccounts();
  const unmatched = useMemo(() => transactions.filter((tx) => tx.reconcile_status === "unmatched"), [transactions]);
  // Opening the bulk review means reviewing the whole unresolved set. Keep
  // every recordable row selected and clearly flag the ones that still need a
  // category instead of silently leaving them out of the selected count.
  const [selected, setSelected] = useState(() => new Set(unmatched.map((tx) => tx.id)));
  const [categories, setCategories] = useState<Record<string, string>>(() => Object.fromEntries(unmatched.map((tx) => [tx.id, tx.category_allocations[0]?.account_id ?? ""])));
  const [scopes, setScopes] = useState<Record<string, FeedTransaction["transaction_scope"]>>(() => Object.fromEntries(unmatched.map((tx) => [tx.id, tx.transaction_scope])));
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Notice | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const record = useRecordStatementReviewRows();

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => setLoadingStep((step) => Math.min(step + 1, 3)), 900);
    return () => window.clearInterval(timer);
  }, [loading]);

  const recordable = useMemo(() => unmatched.filter((tx) => !completed.has(tx.id) && scopes[tx.id] !== "personal"), [completed, unmatched, scopes]);
  const ordered = useMemo(() => [...transactions].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id))), [transactions, selected]);
  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const visible = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const missing = [...selected].filter((id) => !categories[id]).length;
  const changedScopes = unmatched.filter((tx) => scopes[tx.id] !== tx.transaction_scope);
  const locked = result?.level === "success";
  const clearNonSuccess = () => { if (result?.level !== "success") setResult(null); };

  const toggle = (id: string) => {
    clearNonSuccess();
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    if (missing) {
      const notice: Notice = {
        level: "warning",
        title: "Choose the missing categories",
        message: `${missing} selected transaction${missing === 1 ? " needs" : "s need"} a category before ${missing === 1 ? "it can" : "they can"} be recorded.`,
      };
      setResult(notice);
      toast.warning(notice.title, { description: notice.message });
      return;
    }

    const submittedIds = [...selected];
    try {
      const response = await record.mutateAsync({
        items: submittedIds.map((txId) => ({ txId, categoryAccountId: categories[txId] })),
        scopeUpdates: changedScopes.map((tx) => ({ txId: tx.id, scope: scopes[tx.id] })),
      });
      const failedIds = new Set(response.errors.map((item) => item.tx_id));
      const successfulIds = submittedIds.filter((id) => !failedIds.has(id));
      setCompleted((current) => new Set([...current, ...successfulIds]));
      if (!response.errors.length) {
        const notice: Notice = {
          level: "success",
          title: "Transactions recorded successfully",
          message: response.recorded
            ? `${response.recorded} transaction${response.recorded === 1 ? " was" : "s were"} recorded and reconciled.`
            : "Your transaction type changes were saved.",
        };
        setSelected(new Set());
        setResult(notice);
        toast.success(notice.title, { description: notice.message });
        return;
      }
      const level: Level = response.recorded ? "warning" : "error";
      const notice: Notice = {
        level,
        title: response.recorded ? "Some transactions still need attention" : "Nothing was recorded",
        message: response.recorded
          ? `${response.recorded} transaction${response.recorded === 1 ? " was" : "s were"} recorded and reconciled. ${response.errors.length} ${response.errors.length === 1 ? "was" : "were"} not recorded.`
          : `We could not record the ${response.errors.length} selected transaction${response.errors.length === 1 ? "" : "s"}. Review the reasons below, make any needed changes, and try again.`,
        details: groupErrors(response.errors, transactions),
      };
      setSelected(failedIds);
      setResult(notice);
      if (level === "warning") toast.warning(notice.title, { description: notice.message });
      else toast.error(notice.title, { description: notice.message });
    } catch (cause) {
      const notice: Notice = { level: "error", title: "We could not record these transactions", message: friendlyError(cause instanceof Error ? cause.message : "") };
      setResult(notice);
      toast.error(notice.title, { description: notice.message });
    }
  };

  const loadingLabels = ["Loading unreconciled transactions", "Checking for existing matches", "Preparing category suggestions", "Building your review list"];

  if (isMinimized) {
    const minimizedLabel = error
      ? "Unreconciled transaction review needs attention"
      : loading
        ? loadingLabels[loadingStep]
        : "Unreconciled transactions ready to review";

    return (
      <MinimizedTaskIndicator
        status={error ? "error" : loading ? "working" : "ready"}
        label={minimizedLabel}
        icon={<ListChecks className="size-5" />}
        onOpen={() => setIsMinimized(false)}
      />
    );
  }

  if (loading || error) return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <Header onClose={onClose} subtitle="Nothing will be recorded while we prepare this review." />
        {loading ? <div className="py-10 text-center"><Loader2 className="mx-auto size-8 animate-spin text-blue-600" /><p className="mt-4 text-sm font-semibold text-slate-900">{loadingLabels[loadingStep]}</p><p className="mt-1 text-xs text-slate-500">Large transaction lists can take a moment.</p></div> :
          <div className="py-8"><div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"><p className="font-semibold">We could not prepare your review</p><p className="mt-1">{error ?? "Please try again. If this continues, refresh the page and check your connection."}</p></div><div className="mt-5 flex justify-end gap-2"><SecondaryButton onClick={onClose}>Close</SecondaryButton>{onRetry ? <button type="button" onClick={onRetry} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Try again</button> : null}</div></div>}
      </div>
    </div>, document.body,
  );

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-4"><Header onClose={onClose} subtitle={`${autoReconciled ? `${autoReconciled} strong matches were reconciled automatically. ` : ""}Changes stay here until you confirm.`} /></div>
        <div className="overflow-y-auto px-6 py-4">
          {warning ? <div role="status" className="mb-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{warning}</span></div> : null}
          <div className="mb-3 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 text-xs text-violet-900"><Sparkles className="mr-1 inline size-3.5" /> Categories come from your Chart of Accounts and confirmed history. You can change them before recording.</div>
          <div className="mb-3 flex justify-end gap-2">
            <button type="button" onClick={() => { clearNonSuccess(); setSelected(new Set(recordable.map((tx) => tx.id))); }} disabled={record.isPending || locked} className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-40">Select all ({recordable.length})</button>
            <button type="button" onClick={() => { clearNonSuccess(); setSelected(new Set()); }} disabled={!selected.size || record.isPending || locked} className="text-xs font-semibold text-slate-600 hover:underline disabled:opacity-40">Clear selection</button>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-3 py-2.5" /><th className="px-3 py-2.5">Transaction</th><th className="w-40 px-3 py-2.5">Type</th><th className="px-3 py-2.5">Category</th><th className="px-3 py-2.5 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{visible.map((tx) => {
                const done = completed.has(tx.id);
                const canRecord = tx.reconcile_status === "unmatched" && !done && scopes[tx.id] !== "personal";
                const selectedAccount = (accounts ?? []).find((account) => account.id === categories[tx.id]);
                return <tr key={tx.id} className={canRecord ? "hover:bg-slate-50" : "bg-slate-50/60"}>
                  <td className="px-3 py-3"><button type="button" role="checkbox" aria-label={`${selected.has(tx.id) ? "Deselect" : "Select"} ${tx.description}`} aria-checked={selected.has(tx.id)} disabled={!canRecord || record.isPending || locked} onClick={() => toggle(tx.id)} className={`grid size-4 place-items-center rounded border transition ${selected.has(tx.id) ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-transparent hover:border-emerald-500"} disabled:cursor-not-allowed disabled:opacity-40`}><Check className="size-3" /></button></td>
                  <td className="max-w-[240px] px-3 py-3"><p className="truncate font-medium text-slate-900">{tx.description}</p><p className="mt-0.5 text-xs text-slate-500">{new Date(tx.transaction_date).toLocaleDateString("en-GB")}</p></td>
                  <td className="px-3 py-3"><Select value={scopes[tx.id]} disabled={done || record.isPending || locked} onValueChange={(value) => { const scope = value as FeedTransaction["transaction_scope"]; clearNonSuccess(); setScopes((current) => ({ ...current, [tx.id]: scope })); setSelected((current) => { const next = new Set(current); if (scope === "personal") next.delete(tx.id); else next.add(tx.id); return next; }); }}><SelectTrigger className="h-8 w-36 bg-white text-xs"><SelectValue /></SelectTrigger><SelectContent className="z-[100001]"><SelectGroup><SelectLabel>Transaction type</SelectLabel><SelectItem value="company"><span className="flex items-center gap-2"><BriefcaseBusiness className="size-3.5 text-blue-600" /> Company</span></SelectItem><SelectItem value="personal"><span className="flex items-center gap-2"><UserRound className="size-3.5 text-amber-600" /> Personal</span></SelectItem></SelectGroup></SelectContent></Select></td>
                  <td className="px-3 py-3 text-xs">{canRecord ? <div className="flex items-center gap-2"><Select value={categories[tx.id] || NO_CATEGORY} onValueChange={(value) => { clearNonSuccess(); setCategories((current) => ({ ...current, [tx.id]: value === NO_CATEGORY ? "" : value })); }}><SelectTrigger className="h-8 w-28 bg-white font-mono text-xs font-bold text-slate-700"><span>{selectedAccount?.code ?? "Choose"}</span></SelectTrigger><SelectContent position="popper" className="z-[100001] max-h-80 w-[min(42rem,calc(100vw-2rem))] min-w-0 p-1"><SelectGroup><SelectLabel>Chart of Accounts category</SelectLabel><SelectItem value={NO_CATEGORY}>Choose category</SelectItem><SelectSeparator /><div className="grid grid-cols-[4rem_minmax(12rem,1fr)_7rem_10rem] gap-3 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400" aria-hidden="true"><span>Code</span><span>Account</span><span>Type</span><span>Report</span></div>{(accounts ?? []).map((account) => <SelectItem key={account.id} value={account.id} textValue={`${account.code} ${account.name}`}><span className="grid min-w-0 flex-1 grid-cols-[4rem_minmax(12rem,1fr)_7rem_10rem] items-center gap-3"><span className="font-mono text-[10px] font-bold text-slate-400">{account.code}</span><span className="truncate">{account.name}</span><span className="truncate text-[10px] font-semibold text-slate-500">{label(account.account_type)}</span><span className="truncate text-[10px] font-semibold text-slate-500" title={label(account.report_category)}>{label(account.report_category)}</span></span></SelectItem>)}</SelectGroup></SelectContent></Select>{selectedAccount ? <CategoryInfo account={selectedAccount} /> : null}</div> : <span className={done ? "font-medium text-emerald-700" : scopes[tx.id] === "personal" ? "font-medium text-amber-700" : "text-slate-500"}>{done ? "Recorded and reconciled" : scopes[tx.id] === "personal" ? "Not recorded in business accounts" : "Existing match needs review"}</span>}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatMoney(tx.credit_minor || tx.debit_minor, tx.currency)}</td>
                </tr>;
              })}</tbody>
            </table>
            <WindowedPager page={page} totalPages={totalPages} totalItems={transactions.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </div>
        </div>
        {result ? <ResultPanel result={result} /> : null}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <p className="text-xs text-slate-500">{selected.size} selected{missing ? ` · ${missing} need categories` : ""}{changedScopes.length ? ` · ${changedScopes.length} type change${changedScopes.length === 1 ? "" : "s"}` : ""}</p>
          <div className="flex gap-2"><SecondaryButton onClick={onClose}>{result?.level === "success" ? "Done" : "Review later"}</SecondaryButton>{result?.level !== "success" ? <button type="button" disabled={(!selected.size && !changedScopes.length) || record.isPending} onClick={() => void confirm()} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{record.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{record.isPending ? "Saving..." : result ? "Try selected again" : selected.size ? "Record selected & reconcile" : "Save type changes"}</button> : null}</div>
        </div>
      </div>
    </div>, document.body,
  );
}

function Header({ subtitle, onClose }: { subtitle: string; onClose: () => void }) {
  return <div className="flex items-start justify-between"><div><h2 className="text-base font-extrabold text-slate-950">Review unreconciled transactions</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="size-5" /></button></div>;
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{children}</button>;
}

function ResultPanel({ result }: { result: Notice }) {
  const Icon = result.level === "success" ? CheckCircle2 : result.level === "warning" ? AlertTriangle : CircleX;
  return <div className="px-6 pb-4"><div role={result.level === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${noticeStyle[result.level]}`}><div className="flex gap-3"><Icon className="mt-0.5 size-5 shrink-0" /><div><p className="font-bold">{result.title}</p><p className="mt-1">{result.message}</p>{result.details?.length ? <ul className="mt-3 space-y-2 border-t border-current/15 pt-3">{result.details.map((detail) => <li key={detail.message}><span className="font-semibold">{detail.count} transaction{detail.count === 1 ? "" : "s"}:</span> {detail.message}{detail.examples.length ? <span className="mt-0.5 block text-xs opacity-80">Examples: {detail.examples.join(", ")}</span> : null}</li>)}</ul> : null}</div></div></div></div>;
}

function CategoryInfo({ account }: { account: { code: string; name: string; account_type: string; report_category: string } }) {
  return <TooltipPrimitive.Provider delayDuration={250}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild><button type="button" aria-label={`Details for account ${account.code}`} className="grid size-6 place-items-center rounded-full text-slate-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Info className="size-4" aria-hidden="true" /></button></TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal><TooltipPrimitive.Content side="top" sideOffset={6} className="z-[100002] w-64 rounded-lg bg-slate-950 px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-xl"><span className="block font-semibold">{account.code} · {account.name}</span><span className="mt-1 block text-slate-300">Type: {label(account.account_type)}</span><span className="block text-slate-300">Report: {label(account.report_category)}</span><TooltipPrimitive.Arrow className="fill-slate-950" /></TooltipPrimitive.Content></TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>;
}
