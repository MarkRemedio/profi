"use client";

import { useCurrency } from "@/components/currency-provider";
import { useEffect, useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { CheckCircle2, Loader2, MinusCircle, XCircle, XIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import type { BulkPayResult, ChartAccountOption } from "@/lib/accounting/documents";

export type BulkPayableInvoice = {
  id: string;
  invoiceNo: string;
  contactName: string;
  totalMinor: number;
  amountPaidMinor: number; // already provided on invoice rows in invoices.tsx
  status: string; // "approved" | "sent" | "draft" | "void"
};

type PaymentMethod = "cash" | "cheque" | "bank_transfer";

type RowState = {
  amountStr: string;
  accountId?: string;
  included: boolean;
};

export interface BulkMarkPaidSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: BulkPayableInvoice[]; // the selected rows
  bankAccounts: ChartAccountOption[];
  submitting: boolean;
  results: BulkPayResult[] | null; // set after submit
  onSubmit: (
    items: { invoiceId: string; amountMinor: number; depositAccountId?: string }[],
    paymentMethod: PaymentMethod
  ) => void;
}

const SHARED_ACCOUNT_VALUE = "__shared";

function skipReason(invoice: BulkPayableInvoice, balanceMinor: number): string {
  if (invoice.status === "draft") return "draft";
  if (invoice.status === "void") return "void";
  if (balanceMinor <= 0) return "already paid";
  return "not payable";
}

function partitionInvoices(invoices: BulkPayableInvoice[]) {
  const payable: BulkPayableInvoice[] = [];
  const skipped: { invoice: BulkPayableInvoice; reason: string }[] = [];
  for (const invoice of invoices) {
    const balanceMinor = invoice.totalMinor - invoice.amountPaidMinor;
    const isPayableStatus = invoice.status === "approved" || invoice.status === "sent";
    if (isPayableStatus && balanceMinor > 0) {
      payable.push(invoice);
    } else {
      skipped.push({ invoice, reason: skipReason(invoice, balanceMinor) });
    }
  }
  return { payable, skipped };
}

function buildInitialRows(payable: BulkPayableInvoice[]): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  for (const invoice of payable) {
    const balanceMinor = Math.max(0, invoice.totalMinor - invoice.amountPaidMinor);
    rows[invoice.id] = {
      amountStr: (balanceMinor / 100).toFixed(2),
      accountId: undefined,
      included: true,
    };
  }
  return rows;
}

function defaultAccountId(bankAccounts: ChartAccountOption[]): string | undefined {
  const main = bankAccounts.find((account) => account.code === "1000");
  return (main ?? bankAccounts[0])?.id;
}

function parseAmountMinor(amountStr: string): number | null {
  const trimmed = amountStr.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function ResultBadge({ result }: { result: BulkPayResult }) {
  if (result.status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="size-3.5" /> Paid
      </span>
    );
  }
  if (result.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
        <XCircle className="size-3.5" /> Failed{result.reason ? ` · ${result.reason}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
      <MinusCircle className="size-3.5" /> Skipped{result.reason ? ` · ${result.reason}` : ""}
    </span>
  );
}

export function BulkMarkPaidSheet({
  open,
  onOpenChange,
  invoices,
  bankAccounts,
  submitting,
  results,
  onSubmit,
}: BulkMarkPaidSheetProps) {
  const { format: formatMinor, symbol } = useCurrency();
  const { payable, skipped } = useMemo(() => partitionInvoices(invoices), [invoices]);
  const selectionKey = useMemo(() => invoices.map((invoice) => invoice.id).join(","), [invoices]);

  const [rows, setRows] = useState<Record<string, RowState>>(() => buildInitialRows(payable));
  const [sharedAccountId, setSharedAccountId] = useState<string | undefined>(() =>
    defaultAccountId(bankAccounts)
  );
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  // Reset all local editing state whenever the sheet is (re)opened, or the
  // underlying selection changes while it's open. This is a presentational
  // component: the parent owns the selection and re-mounts / re-opens it
  // fresh each time, so we don't want stale amounts/overrides to linger.
  useEffect(() => {
    if (!open) return;
    setRows(buildInitialRows(payable));
    setSharedAccountId(defaultAccountId(bankAccounts));
    setMethod("bank_transfer");
    setExpandedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectionKey]);

  const evaluatedRows = useMemo(() => {
    return payable.map((invoice) => {
      const row = rows[invoice.id];
      const balanceMinor = Math.max(0, invoice.totalMinor - invoice.amountPaidMinor);
      const amountMinor = row ? parseAmountMinor(row.amountStr) : null;
      const valid = amountMinor !== null && amountMinor > 0 && amountMinor <= balanceMinor;
      return { invoice, row, balanceMinor, amountMinor, valid };
    });
  }, [payable, rows]);

  const includedRows = evaluatedRows.filter((r) => r.row?.included);
  const validIncludedRows = includedRows.filter((r) => r.valid);
  const anyIncludedInvalid = includedRows.some((r) => !r.valid);
  const totalSelectedMinor = validIncludedRows.reduce((sum, r) => sum + (r.amountMinor ?? 0), 0);
  const confirmDisabled = validIncludedRows.length === 0 || anyIncludedInvalid || submitting;

  const resultsById = useMemo(() => {
    const map = new Map<string, BulkPayResult>();
    for (const result of results ?? []) map.set(result.invoiceId, result);
    return map;
  }, [results]);

  const summary = useMemo(() => {
    if (!results) return null;
    let paid = 0;
    let skippedCount = 0;
    let failed = 0;
    for (const result of results) {
      if (result.status === "paid") paid += 1;
      else if (result.status === "skipped") skippedCount += 1;
      else failed += 1;
    }
    return { paid, skipped: skippedCount, failed };
  }, [results]);

  function updateRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const existing = prev[id] ?? { amountStr: "", accountId: undefined, included: true };
      return { ...prev, [id]: { ...existing, ...patch } };
    });
  }

  function handleConfirm() {
    const items = validIncludedRows.map((r) => ({
      invoiceId: r.invoice.id,
      amountMinor: r.amountMinor as number,
      depositAccountId: r.row?.accountId ?? sharedAccountId,
    }));
    onSubmit(items, method);
  }

  const readOnly = results !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[520px] flex-col gap-0",
            "border-l border-slate-200 bg-white p-0 shadow-2xl outline-none",
            "data-open:animate-in data-open:slide-in-from-right data-open:duration-300",
            "data-closed:animate-out data-closed:slide-out-to-right data-closed:duration-200"
          )}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900">
                Mark invoices as paid
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                {payable.length} payable{skipped.length ? ` · ${skipped.length} skipped` : ""}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon-sm">
                <XIcon className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            {payable.length > 0 && (
              <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Deposit into
                  </label>
                  <Select value={sharedAccountId} onValueChange={setSharedAccountId} disabled={readOnly}>
                    <SelectTrigger className="h-9 w-full bg-white">
                      <SelectValue placeholder="Select bank account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Payment method
                  </label>
                  <Select
                    value={method}
                    onValueChange={(value) => setMethod(value as PaymentMethod)}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="h-9 w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {summary && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                {summary.paid} paid · {summary.skipped} skipped · {summary.failed} failed
              </div>
            )}

            {payable.length > 0 ? (
              <Accordion
                type="multiple"
                value={expandedIds}
                onValueChange={setExpandedIds}
                className="space-y-2"
              >
                {evaluatedRows.map(({ invoice, row, balanceMinor, valid }) => {
                  const result = resultsById.get(invoice.id);
                  return (
                    <AccordionItem
                      key={invoice.id}
                      value={invoice.id}
                      className={cn(
                        "not-last:border-b-0 rounded-lg border border-slate-200 px-3",
                        result?.status === "paid" && "border-emerald-200 bg-emerald-50/40",
                        result?.status === "failed" && "border-red-200 bg-red-50/40",
                        result?.status === "skipped" && "bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-3 py-2.5">
                        <Checkbox
                          checked={row?.included ?? false}
                          onCheckedChange={(checked) =>
                            updateRow(invoice.id, { included: checked === true })
                          }
                          disabled={readOnly}
                        />
                        <AccordionTrigger className="flex-1 gap-2 py-0 hover:no-underline">
                          <div className="min-w-0 text-left">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {invoice.invoiceNo}
                            </p>
                            <p className="truncate text-xs text-slate-500">{invoice.contactName}</p>
                          </div>
                        </AccordionTrigger>
                        <div className="shrink-0 text-right text-xs font-medium text-slate-500">
                          {formatMinor(balanceMinor)}
                        </div>
                        <div className="relative w-24 shrink-0">
                          <span className="pointer-events-none absolute left-2 top-1.5 text-xs font-medium text-slate-400">
                            {symbol}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={row?.amountStr ?? ""}
                            onChange={(e) => updateRow(invoice.id, { amountStr: e.target.value })}
                            disabled={readOnly}
                            className={cn(
                              "h-8 w-full rounded-md border bg-white pl-5 pr-2 text-sm font-semibold text-slate-900 outline-none focus:ring-1",
                              valid
                                ? "border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                                : "border-red-300 focus:border-red-500 focus:ring-red-500"
                            )}
                          />
                        </div>
                      </div>

                      {result && (
                        <div className="pb-2 pl-7">
                          <ResultBadge result={result} />
                        </div>
                      )}

                      <AccordionContent>
                        <div className="pl-7">
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                            Deposit into (override)
                          </label>
                          <Select
                            value={row?.accountId ?? SHARED_ACCOUNT_VALUE}
                            onValueChange={(value) =>
                              updateRow(invoice.id, {
                                accountId: value === SHARED_ACCOUNT_VALUE ? undefined : value,
                              })
                            }
                            disabled={readOnly}
                          >
                            <SelectTrigger className="h-9 w-full bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={SHARED_ACCOUNT_VALUE}>Use shared account</SelectItem>
                              {bankAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.code} - {account.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                No payable invoices in this selection.
              </p>
            )}

            {skipped.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Skipped ({skipped.length})
                </p>
                <div className="space-y-1.5">
                  {skipped.map(({ invoice, reason }) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-semibold text-slate-700">{invoice.invoiceNo}</span>
                        <span className="ml-1.5 text-slate-400">{invoice.contactName}</span>
                      </div>
                      <span className="shrink-0 font-medium capitalize text-slate-500">{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-6 py-4">
            {!readOnly && (
              <p className="mb-3 text-sm font-medium text-slate-600">
                {validIncludedRows.length > 0
                  ? `Recording ${formatMinor(totalSelectedMinor)} across ${validIncludedRows.length} invoice${
                      validIncludedRows.length === 1 ? "" : "s"
                    }`
                  : "Select at least one invoice to record a payment"}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                {readOnly ? "Close" : "Cancel"}
              </Button>
              {!readOnly && (
                <Button className="flex-1" onClick={handleConfirm} disabled={confirmDisabled}>
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : "Confirm"}
                </Button>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
