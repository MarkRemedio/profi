"use client";

import { useCurrency } from "@/components/currency-provider";
import { formatMoney } from "@/lib/currency";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Eye, Plus, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOC_CELL_INPUT_CLS,
  DOC_INPUT_CLS,
  DOC_LABEL_CLS,
  DOC_TH_CLS,
  SectionCard,
  SectionHead,
} from "@/components/documents/document-form-chrome";
import { ReceiptsSkeleton } from "../skeletons";

import { accountingToday } from "@/lib/accounting/accounting-today";
import type {
  NewReceiptInput,
  NewReceiptLine,
  Receipt,
  ReceiptWorkspaceData,
} from "./receipt-types";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  bank_transfer: "Bank Transfer",
};

function formatMinor(minor: number, currency: string) {
  return formatMoney(minor, currency);
}

function emptyLine(): NewReceiptLine {
  return { accountId: "", description: "", quantity: "1", unitPrice: "", taxCode: "no_vat" };
}

// Mirrors the server maths in normalizeLines so the dialog totals match
// what will be saved.
function computeTotals(
  lines: NewReceiptLine[],
  amountsAre: NewReceiptInput["amountsAre"],
  taxRates: ReceiptWorkspaceData["taxRates"]
) {
  let subtotal = 0;
  let tax = 0;
  for (const line of lines) {
    const qty = Number(line.quantity || "1");
    const unit = Math.round(Number(line.unitPrice || 0) * 100);
    if (!Number.isFinite(qty) || !Number.isFinite(unit)) continue;
    const gross = Math.round(unit * qty);
    const rate = taxRates.find((t) => t.code === line.taxCode)?.rate ?? 0;
    if (amountsAre === "no_vat") {
      subtotal += gross;
    } else if (amountsAre === "inclusive") {
      const lineTax = Math.round((gross * rate) / (100 + rate));
      tax += lineTax;
      subtotal += gross - lineTax;
    } else {
      subtotal += gross;
      tax += Math.round((gross * rate) / 100);
    }
  }
  // In every mode subtotal holds net and tax holds VAT, so total = net + VAT.
  return { subtotal, tax, total: subtotal + tax };
}

export type ReceiptsViewProps = {
  title: string;
  description: string;
  numberLabel: string;
  bankFieldLabel: string;
  showReference: boolean;
  data: ReceiptWorkspaceData | undefined;
  isLoading: boolean;
  isCreating: boolean;
  onCreate: (input: NewReceiptInput) => Promise<unknown>;
  onVoid: (id: string) => Promise<unknown>;
  initialReceiptId?: string;
};

export function ReceiptsView({
  title,
  description,
  numberLabel,
  bankFieldLabel,
  showReference,
  data,
  isLoading,
  isCreating,
  onCreate,
  onVoid,
  initialReceiptId,
}: ReceiptsViewProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<Receipt | null>(null);
  const [initialReceiptDismissed, setInitialReceiptDismissed] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const receipts = useMemo(() => data?.receipts ?? [], [data?.receipts]);
  const requestedReceipt = initialReceiptDismissed
    ? null
    : receipts.find((receipt) => receipt.id === initialReceiptId) ?? null;
  const displayedReceipt = viewReceipt ?? requestedReceipt;

  const handleVoid = async (receipt: Receipt) => {
    if (!window.confirm(`Void ${receipt.receiptNo}? A reversal journal dated today will be posted.`)) {
      return;
    }
    setVoidingId(receipt.id);
    try {
      await onVoid(receipt.id);
    } finally {
      setVoidingId(null);
    }
  };

  // Placed after every hook so the hook order stays stable across renders.
  // Covers both /sales/receipts and /sales/refund-receipts.
  if (isLoading) return <ReceiptsSkeleton label={`Loading ${title.toLowerCase()}`} />;

  return (
    <div className="w-full space-y-6">
      {/* HEADER WITH EXPORT/IMPORT BULK OPTIONS WRAPPED IN */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {data?.canManage && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-blue-700"
            >
              <Plus className="size-4" /> New {title.replace(/s$/, "")}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">{numberLabel}</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Nothing here yet.
                </td>
              </tr>
            )}
            {receipts.map((receipt) => (
              <tr key={receipt.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 font-semibold text-slate-900">{receipt.receiptNo}</td>
                <td className="px-4 py-3 text-slate-600">{receipt.receiptDate}</td>
                <td className="px-4 py-3 text-slate-600">{receipt.contactName}</td>
                <td className="px-4 py-3 text-slate-600">
                  {receipt.paymentMethod ? PAYMENT_METHOD_LABELS[receipt.paymentMethod] : "—"}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {formatMinor(receipt.totalMinor, receipt.currency)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
                      receipt.status === "posted"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-400 line-through"
                    )}
                  >
                    {receipt.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => { setInitialReceiptDismissed(true); setViewReceipt(receipt); }}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      title="View"
                    >
                      <Eye className="size-4" />
                    </button>
                    {data?.canManage && receipt.status === "posted" && (
                      <button
                        type="button"
                        onClick={() => handleVoid(receipt)}
                        disabled={voidingId === receipt.id}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Void"
                      >
                        <Ban className="size-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isCreateOpen && data && (
        <CreateReceiptDialog
          data={data}
          bankFieldLabel={bankFieldLabel}
          showReference={showReference}
          isCreating={isCreating}
          onClose={() => setIsCreateOpen(false)}
          onCreate={async (input) => {
            await onCreate(input);
            setIsCreateOpen(false);
          }}
        />
      )}

      {displayedReceipt && (
        <ViewReceiptDialog
          receipt={displayedReceipt}
          bankFieldLabel={bankFieldLabel}
          showReference={showReference}
          onClose={() => { setInitialReceiptDismissed(true); setViewReceipt(null); }}
        />
      )}
    </div>
  );
}

function CreateReceiptDialog({
  data,
  bankFieldLabel,
  showReference,
  isCreating,
  onClose,
  onCreate,
}: {
  data: ReceiptWorkspaceData;
  bankFieldLabel: string;
  showReference: boolean;
  isCreating: boolean;
  onClose: () => void;
  onCreate: (input: NewReceiptInput) => Promise<void>;
}) {
  const { currency: workspaceCurrency } = useCurrency();
  const [contactId, setContactId] = useState("");
  const [receiptDate, setReceiptDate] = useState(() => accountingToday());
  const [bankAccountId, setBankAccountId] = useState(data.bankAccounts[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<NewReceiptInput["paymentMethod"]>("cash");
  // A receipt is a sale, so it follows the same rule as an invoice: a business
  // below the registration threshold has no right to charge VAT.
  //
  // Keyed off the flag again, as the original code did. It was pinned to No VAT
  // in d91d9f5 while VAT registration was not yet wired through onboarding,
  // with a note to revert once it was — that is now the case, and a registered
  // business having to switch this on every single receipt would quietly
  // under-declare its output VAT.
  const [amountsAre, setAmountsAre] = useState<NewReceiptInput["amountsAre"]>(
    data.vatRegistered ? "exclusive" : "no_vat"
  );
  const vatAvailable = data.vatRegistered;
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<NewReceiptLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(
    () => computeTotals(lines, amountsAre, data.taxRates),
    [lines, amountsAre, data.taxRates]
  );

  const updateLine = (index: number, patch: Partial<NewReceiptLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!contactId) return setError("Choose a customer.");
    if (!bankAccountId) return setError("Choose a bank account.");
    const usable = lines.filter((l) => l.accountId && l.description.trim() && Number(l.unitPrice) > 0);
    if (usable.length === 0) return setError("Add at least one line with an account, description and amount.");
    try {
      await onCreate({
        contactId,
        receiptDate,
        amountsAre,
        paymentMethod,
        bankAccountId,
        reference: showReference ? reference.trim() || undefined : undefined,
        notes: notes.trim() || undefined,
        lines: usable,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        /* Wider than the 3xl it was: the line row carries six controls, and
           at 768px the tax name had nowhere to go but under the modal edge,
           which overflow-x-hidden then cut off rather than scrolled. */
        className="max-h-[90vh] w-full max-w-4xl overflow-x-hidden overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              New {showReference ? "Refund Receipt" : "Sales Receipt"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {showReference
                ? "Money going back to a customer. Posts to the ledger as soon as you save."
                : "Money taken at the point of sale. Posts to the ledger as soon as you save."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <SectionCard>
            <SectionHead title="Details" badge="Required" />
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
              <div>
                <label className={DOC_LABEL_CLS} htmlFor="receipt-customer">
                  Customer
                </label>
                <Select
                  value={contactId}
                  onValueChange={setContactId}
                  disabled={data.contacts.length === 0}
                >
                  {/* z-[10000]: this dialog sits at z-[9999] and the menu is
                      portalled to the body, where the default z-50 would put it
                      behind the very modal that opened it. */}
                  <SelectTrigger id="receipt-customer" className={cn(DOC_INPUT_CLS, "justify-between")}>
                    <SelectValue
                      placeholder={data.contacts.length === 0 ? "No customers yet" : "Select customer"}
                    />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    {data.contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className={DOC_LABEL_CLS} htmlFor="receipt-date">
                  Date
                </label>
                <input
                  id="receipt-date"
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className={DOC_INPUT_CLS}
                />
              </div>

              <div>
                <label className={DOC_LABEL_CLS} htmlFor="receipt-bank">
                  {bankFieldLabel}
                </label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger id="receipt-bank" className={cn(DOC_INPUT_CLS, "justify-between")}>
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    {data.bankAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className={DOC_LABEL_CLS} htmlFor="receipt-method">
                  Payment method
                </label>
                <Select
                  value={paymentMethod ?? ""}
                  onValueChange={(value) => setPaymentMethod((value || null) as NewReceiptInput["paymentMethod"])}
                >
                  <SelectTrigger id="receipt-method" className={cn(DOC_INPUT_CLS, "justify-between")}>
                    <SelectValue placeholder="Select a method" />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className={DOC_LABEL_CLS} htmlFor="receipt-amounts">
                  Amounts are
                </label>
                {vatAvailable ? (
                  <Select
                    value={amountsAre}
                    onValueChange={(value) => setAmountsAre(value as NewReceiptInput["amountsAre"])}
                  >
                    <SelectTrigger id="receipt-amounts" className={cn(DOC_INPUT_CLS, "justify-between")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10000]">
                      <SelectItem value="exclusive">Tax exclusive</SelectItem>
                      <SelectItem value="inclusive">Tax inclusive</SelectItem>
                      <SelectItem value="no_vat">No VAT</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  /* One option is not a choice. Shown flat rather than as a menu
                     that opens onto a single line, matching every other form. */
                  <div className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-400">
                    No VAT
                  </div>
                )}
              </div>

              {showReference && (
                <div>
                  <label className={DOC_LABEL_CLS} htmlFor="receipt-reference">
                    Original invoice or receipt
                  </label>
                  <input
                    id="receipt-reference"
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. INV-0042"
                    className={DOC_INPUT_CLS}
                  />
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard>
            <SectionHead title="Lines">
              <span className="ml-auto rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.07em] text-slate-500">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
              </span>
            </SectionHead>

            <div className="space-y-3 p-4">
              {/* A table with headings rather than a row of unlabelled boxes:
                  the placeholders vanish the moment anything is typed, taking
                  with them the only clue to what each column is. */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[680px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={DOC_TH_CLS}>Account</th>
                      <th className={DOC_TH_CLS}>Description</th>
                      <th className={cn(DOC_TH_CLS, "text-right")}>Qty</th>
                      <th className={cn(DOC_TH_CLS, "text-right")}>Unit price</th>
                      <th className={DOC_TH_CLS}>VAT</th>
                      <th className={cn(DOC_TH_CLS, "w-10")}>
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => (
                      <tr
                        key={index}
                        className="document-row border-t border-slate-100 transition-colors hover:bg-blue-50/40"
                      >
                        <td className="px-2 py-2">
                          <Select
                            value={line.accountId}
                            onValueChange={(value) => updateLine(index, { accountId: value })}
                            disabled={data.accounts.length === 0}
                          >
                            <SelectTrigger
                              aria-label={`Line ${index + 1} account`}
                              className={cn(DOC_CELL_INPUT_CLS, "h-9 min-w-[170px] justify-between")}
                            >
                              <SelectValue
                                placeholder={data.accounts.length === 0 ? "No accounts yet" : "Choose an account"}
                              />
                            </SelectTrigger>
                            <SelectContent className="z-[10000]">
                              {data.accounts.map((a) => (
                                <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            aria-label={`Line ${index + 1} description`}
                            type="text"
                            placeholder="What was sold"
                            value={line.description}
                            onChange={(e) => updateLine(index, { description: e.target.value })}
                            className={cn(DOC_CELL_INPUT_CLS, "h-9 min-w-[150px]")}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            aria-label={`Line ${index + 1} quantity`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.quantity}
                            onChange={(e) => updateLine(index, { quantity: e.target.value })}
                            className={cn(DOC_CELL_INPUT_CLS, "h-9 w-20 text-right font-mono")}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            aria-label={`Line ${index + 1} unit price`}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                            className={cn(DOC_CELL_INPUT_CLS, "h-9 w-28 text-right font-mono")}
                          />
                        </td>
                        <td className="px-2 py-2">
                          {vatAvailable ? (
                            <Select
                              value={line.taxCode}
                              onValueChange={(value) => updateLine(index, { taxCode: value })}
                              disabled={amountsAre === "no_vat"}
                            >
                              <SelectTrigger
                                aria-label={`Line ${index + 1} VAT`}
                                className={cn(
                                  DOC_CELL_INPUT_CLS,
                                  "h-9 min-w-[170px] justify-between disabled:bg-slate-100 disabled:text-slate-400"
                                )}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="z-[10000]">
                                {data.taxRates.map((t) => (
                                  <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="flex h-9 min-w-[170px] items-center rounded-md border border-slate-200 bg-slate-100 px-2 text-xs text-slate-400">
                              No VAT
                            </div>
                          )}
                        </td>
                        <td className="px-1 py-2 text-center">
                          <button
                            type="button"
                            aria-label={`Remove line ${index + 1}`}
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                            disabled={lines.length === 1}
                            className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                <Plus className="size-4" /> Add line
              </button>
            </div>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <SectionCard>
              <SectionHead title="Notes" />
              <div className="p-4">
                <textarea
                  aria-label="Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Anything worth recording against this receipt."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </SectionCard>

            {/* The same summary the invoice and bill forms carry, so a total
                reads the same wherever it appears. */}
            <SectionCard className="border-blue-200 shadow-[0_10px_30px_rgba(37,99,235,0.08)]">
              <SectionHead title="Summary" badge="Calculated" />
              <div className="p-4 pb-0">
                <dl className="text-sm tabular-nums">
                  <div className="flex justify-between py-1.5 text-slate-500">
                    <dt>{amountsAre === "inclusive" ? "Subtotal (incl. VAT)" : "Subtotal"}</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatMinor(totals.subtotal, workspaceCurrency)}
                    </dd>
                  </div>
                  <div className="flex justify-between py-1.5 text-slate-500">
                    <dt>VAT</dt>
                    <dd
                      className={
                        amountsAre === "no_vat" || !vatAvailable
                          ? "font-semibold text-slate-400"
                          : "font-semibold text-slate-900"
                      }
                    >
                      {amountsAre === "no_vat" || !vatAvailable
                        ? "Not applied"
                        : formatMinor(totals.tax, workspaceCurrency)}
                    </dd>
                  </div>
                </dl>

                <div className="-mx-4 mt-3 flex items-center justify-between bg-gradient-to-br from-slate-900 to-blue-800 px-4 py-4 text-white">
                  <span className="text-[13px] font-bold uppercase tracking-[0.06em]">Total</span>
                  <span className="text-xl font-extrabold tabular-nums">
                    {formatMinor(totals.total, workspaceCurrency)}
                  </span>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse items-center justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row">
          <p className="text-xs text-slate-500">
            This posts straight to the ledger — there is no draft step.
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="h-10 flex-1 rounded-lg px-4 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100 sm:flex-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isCreating}
              className="h-10 flex-1 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 sm:flex-none"
            >
              {isCreating ? "Saving…" : "Save & Post"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ViewReceiptDialog({
  receipt,
  bankFieldLabel,
  showReference,
  onClose,
}: {
  receipt: Receipt;
  bankFieldLabel: string;
  showReference: boolean;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-x-hidden overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">{receipt.receiptNo}</h2>
            <p className="text-sm text-slate-500">{receipt.contactName} · {receipt.receiptDate}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><dt className="text-xs font-bold text-slate-400">Status</dt><dd className="font-semibold uppercase">{receipt.status}</dd></div>
          <div><dt className="text-xs font-bold text-slate-400">{bankFieldLabel}</dt><dd>{receipt.bankAccountName}</dd></div>
          <div><dt className="text-xs font-bold text-slate-400">Payment method</dt><dd>{receipt.paymentMethod ? PAYMENT_METHOD_LABELS[receipt.paymentMethod] : "—"}</dd></div>
          {showReference && (
            <div><dt className="text-xs font-bold text-slate-400">Reference</dt><dd>{receipt.reference ?? "—"}</dd></div>
          )}
        </dl>

        <div className="mt-5 w-full overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-2">Description</th>
              <th className="py-2">Account</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Net</th>
              <th className="py-2 text-right">VAT</th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((line) => (
              <tr key={line.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2 text-slate-900">{line.description}</td>
                <td className="py-2 text-slate-500">{line.accountCode} — {line.accountName}</td>
                <td className="py-2 text-right text-slate-600">{line.quantity}</td>
                <td className="py-2 text-right text-slate-900">{formatMinor(line.subtotalMinor, receipt.currency)}</td>
                <td className="py-2 text-right text-slate-600">{formatMinor(line.taxMinor, receipt.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="mt-4 flex flex-col items-end gap-1 border-t border-slate-100 pt-3 text-sm">
          <p className="text-slate-500">Subtotal: <span className="font-semibold text-slate-900">{formatMinor(receipt.subtotalMinor, receipt.currency)}</span></p>
          <p className="text-slate-500">VAT: <span className="font-semibold text-slate-900">{formatMinor(receipt.taxMinor, receipt.currency)}</span></p>
          <p className="text-base font-black text-slate-900">Total: {formatMinor(receipt.totalMinor, receipt.currency)}</p>
        </div>

        {receipt.notes && (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{receipt.notes}</p>
        )}
      </div>
    </div>,
    document.body
  );
}
