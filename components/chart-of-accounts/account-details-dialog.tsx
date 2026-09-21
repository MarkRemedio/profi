"use client";

import { useCurrency } from "@/components/currency-provider";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Calculator,
  FileText,
  Loader2,
  TriangleAlert,
} from "lucide-react";

import {
  getAccountActivity,
  type AccountActivityRow,
} from "@/app/(dashboard)/accounting/chart-of-accounts/actions";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { reportCategoryLabels, taxOptions, typeMeta } from "./constants";
import type { ChartAccount } from "./types";

type AccountDetailsDialogProps = {
  open: boolean;
  account: ChartAccount | null;
  onOpenChange: (open: boolean) => void;
};

export function AccountDetailsDialog({
  open,
  account,
  onOpenChange,
}: AccountDetailsDialogProps) {
  const [activity, setActivity] = useState<AccountActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !account) return;

    let active = true;

    void Promise.resolve().then(async () => {
      setLoading(true);
      setError("");
      setActivity([]);

      try {
        const rows = await getAccountActivity(account.id);
        if (active) setActivity(rows);
      } catch (activityError) {
        if (!active) return;
        setError(
          activityError instanceof Error
            ? activityError.message
            : "Could not load account activity."
        );
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [account, open]);

  if (!account) return null;

  const meta = typeMeta[account.account_type];
  const Icon = meta.icon;
  const tax = taxOptions.find((option) => option.code === account.tax_code);
  const normalDebitAccount =
    account.account_type === "asset" || account.account_type === "expense";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] flex-col overflow-hidden sm:max-w-7xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Account details</DialogTitle>
          <DialogDescription>
            Trace balances from account setup through posted journal activity.
          </DialogDescription>
        </DialogHeader>

        {/* Two panes on large screens — details left, activity right — each
            with its own scroll. Below lg it stacks and the wrapper scrolls. */}
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:overflow-hidden">
          <div className="space-y-5 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded",
                    meta.iconClass
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-blue-700">
                      {account.code}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "border-transparent font-bold uppercase",
                        meta.badgeClass
                      )}
                    >
                      {meta.label}
                    </Badge>
                    <Badge variant="outline">
                      {account.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline">
                      {account.is_system ? "System" : "Custom"}
                    </Badge>
                  </div>
                  <h2 className="mt-2 text-xl font-bold text-slate-950">
                    {account.name}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    {account.description || "No description has been added."}
                  </p>
                </div>
              </div>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <DetailItem
                  label="Report category"
                  value={reportCategoryLabels[account.report_category]}
                />
                <DetailItem
                  label="Default tax"
                  value={tax?.label ?? meta.taxLabel}
                />
                <DetailItem
                  label="Created"
                  value={new Date(account.created_at).toLocaleDateString("en-GB")}
                />
                <DetailItem
                  label="Balance formula"
                  value={
                    normalDebitAccount
                      ? "Debits - Credits"
                      : "Credits - Debits"
                  }
                />
              </dl>
            </div>

            <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <Calculator className="size-4 text-blue-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Amount source
                </h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Amounts include posted journal entries only. Draft invoices,
                draft bills, and unposted journals are not included.
              </p>
              <p className="mt-3 rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs font-semibold text-slate-700">
                Balance ={" "}
                {normalDebitAccount ? "Debits - Credits" : "Credits - Debits"}
              </p>
            </aside>

            <section className="grid gap-3 sm:grid-cols-2 pb-3">
              <Metric
                label="Current balance"
                value={account.balance_minor}
                strong
                className="sm:col-span-2"
              />
              <Metric label="Total debits" value={account.debit_minor} />
              <Metric label="Total credits" value={account.credit_minor} />
              <Metric label="MTD movement" value={account.mtd_movement_minor} />
              <Metric label="YTD movement" value={account.ytd_movement_minor} />
            </section>
          </div>

          <section className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white lg:min-h-0">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-blue-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Posted activity
                </h3>
              </div>
              <p className="text-xs font-semibold text-slate-400">
                {activity.length} entries
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-14 text-sm font-semibold text-slate-500 lg:flex-1">
                <Loader2 className="size-4 animate-spin text-blue-700" />
                Loading posted activity...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center gap-2 px-4 py-14 text-sm font-semibold text-red-600 lg:flex-1">
                <TriangleAlert className="size-4" />
                {error}
              </div>
            ) : activity.length === 0 ? (
              <div className="px-4 py-14 text-center lg:flex lg:flex-1 lg:flex-col lg:items-center lg:justify-center">
                <FileText className="mx-auto size-9 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-800">
                  No posted activity exists for this account yet.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Posted bills, invoices, and journals will appear here.
                </p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-auto lg:max-h-none lg:flex-1">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Source</th>
                      <th className="px-4 py-3 text-right">Debit</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                      <th className="px-4 py-3 text-right">Running balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activity.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-600">
                          {row.journalDate}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">
                            {row.memo || row.journalMemo || "Posted journal"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.sourceLabel}
                            {row.contactName ? ` / ${row.contactName}` : ""}
                          </p>
                          <p className="mt-1 font-mono text-[11px] text-slate-300">
                            {row.journalId.slice(0, 8)}
                          </p>
                        </td>
                        <AmountCell value={row.debitMinor} />
                        <AmountCell value={row.creditMinor} />
                        <AmountCell value={row.runningBalanceMinor} strong />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function Metric({
  label,
  value,
  strong = false,
  className,
}: {
  label: string;
  value: number;
  strong?: boolean;
  className?: string;
}) {
  const { format: formatMinor } = useCurrency();
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        strong
          ? "border-blue-100 bg-blue-50"
          : "border-slate-200 bg-white",
        className
      )}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-mono text-sm font-bold",
          strong ? "text-blue-900" : "text-slate-900"
        )}
      >
        {formatMinor(value)}
      </p>
    </div>
  );
}

function AmountCell({
  value,
  strong = false,
}: {
  value: number;
  strong?: boolean;
}) {
  const { format: formatMinor } = useCurrency();
  return (
    <td
      className={cn(
        "px-4 py-3 text-right font-mono text-sm",
        strong ? "font-bold text-slate-950" : "font-semibold text-slate-700"
      )}
    >
      {value === 0 ? (
        <span className="text-slate-300">-</span>
      ) : (
        formatMinor(value)
      )}
    </td>
  );
}
