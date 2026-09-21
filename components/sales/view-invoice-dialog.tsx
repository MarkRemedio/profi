"use client";

import { useCurrency } from "@/components/currency-provider";
import { formatMoney, currencySymbol, currencyInputInset } from "@/lib/currency";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom"; // 🚀 Added React Portal
import { CalendarPlus, ChevronDown, ChevronUp, Download, Loader2, Send, X } from "lucide-react";
import { formatPeriodRange } from "@/lib/accounting/billing-period";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { celebrateSettlement } from "@/lib/celebrate";
import { cn } from "@/lib/utils";
import type { ChartAccountOption } from "@/lib/accounting/documents";
import type { Invoice } from "./invoice-types";
import { toast } from "sonner";
import { sendInvoiceReminder } from "@/app/(dashboard)/sales/invoice-email-actions";
import { exportInvoiceWithAttachments } from "@/app/(dashboard)/sales/invoice-export-actions";
import {
  listInvoiceReminderLogs,
  type ReminderLogRow,
} from "@/app/(dashboard)/sales/payment-schedule-actions";

interface ViewInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  bankAccounts?: ChartAccountOption[];
  onRecordPayment?: (
    invoiceId: string,
    amountMinor: number,
    depositAccountId?: string,
    paymentMethod?: "cash" | "cheque" | "bank_transfer",
  ) => Promise<void>;
  onAutoApprove?: (invoiceId: string) => Promise<boolean | void>;
  onPrint?: (invoice: Invoice) => void; // 🚀 Added print prop
  /** Opens the create form prefilled for the following service period. */
  onCreateNext?: (invoice: Invoice) => void;
}

// Reuse the exact same status styles from your main page
const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  draft: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", label: "Draft" },
  approved: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", label: "Approved" },
  sent: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", label: "Sent" },
  paid: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Paid" },
  partially_paid: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    label: "Partial",
  },
  void: { bg: "bg-slate-100", text: "text-slate-500", dot: "bg-slate-400", label: "Void" },
  overdue: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Overdue" },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(date: string | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ViewInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  bankAccounts = [],
  onRecordPayment,
  onAutoApprove,
  onPrint, // 🚀 Destructured print prop
  onCreateNext,
}: ViewInvoiceDialogProps) {
  const { currency: workspaceCurrency } = useCurrency();
  // The payment input is denominated in the invoice's currency too — you record
  // what the customer actually paid, in their money.
  const symbol = currencySymbol(invoice?.currency ?? workspaceCurrency);

  // Every figure in this panel belongs to one invoice, so it shows in that
  // invoice's own currency. Using the workspace formatter made a TZS invoice
  // read as pounds — the amounts were the shilling values with a pound sign.
  const formatMinor = (minor: number | bigint | null | undefined) =>
    formatMoney(minor, invoice?.currency ?? workspaceCurrency);
  const [mounted, setMounted] = useState(false); // 🚀 Added mount state
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [depositAccountId, setDepositAccountId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "cheque" | "bank_transfer">(
    "bank_transfer",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [exportingCombinedPdf, setExportingCombinedPdf] = useState(false);
  const [reminderHistoryOpen, setReminderHistoryOpen] = useState(false);
  const [reminderLogs, setReminderLogs] = useState<ReminderLogRow[] | null>(null);
  const [reminderLogsInvoiceId, setReminderLogsInvoiceId] = useState<string | null>(null);
  const [loadingReminderLogs, setLoadingReminderLogs] = useState(false);

  /**
   * Chases this invoice.
   *
   * The button was rendered with no onClick at all — it looked live, showed a
   * pointer, and did nothing when pressed. The reminder is rendered on the
   * server from the stored invoice, so it quotes what is actually still due.
   */
  const handleSendReminder = async () => {
    if (!invoice?.id) return;

    setSendingReminder(true);
    const result = await sendInvoiceReminder(invoice.id);
    setSendingReminder(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Reminder sent for ${invoice.invoiceNo}`, {
      description: `Delivered to ${result.sentTo}.`,
    });
  };

  const handleCombinedPdfDownload = async () => {
    if (!invoice?.id || exportingCombinedPdf) return;
    setExportingCombinedPdf(true);
    try {
      const result = await exportInvoiceWithAttachments(invoice.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const binary = window.atob(result.pdfBase64);
      const buffer = new ArrayBuffer(binary.length);
      const bytes = new Uint8Array(buffer);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success("Combined PDF downloaded", {
        description: "The invoice is first, followed by every attachment or an explanatory note.",
      });
    } catch {
      toast.error("Could not download the combined PDF. Try again.");
    } finally {
      setExportingCombinedPdf(false);
    }
  };

  // 🚀 Tell React we are safely loaded in the browser
  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-fill the payment input with the remaining balance when opened
  useEffect(() => {
    if (invoice) {
      const balanceMinor = invoice.totalMinor - (invoice.amountPaidMinor || 0);
      setPaymentAmount((Math.max(0, balanceMinor) / 100).toFixed(2));
    }
  }, [invoice]);

  // Default the deposit account to the main bank (1000), or the first
  // available bank account, once per opened invoice. Keyed on the invoice id
  // (not the object) so live data refreshes don't reset the user's choice.
  const invoiceId = invoice?.id ?? null;
  const currentReminderLogs = reminderLogsInvoiceId === invoiceId ? reminderLogs : null;

  const toggleReminderHistory = async () => {
    const nextOpen = !reminderHistoryOpen;
    setReminderHistoryOpen(nextOpen);
    if (!nextOpen || currentReminderLogs || !invoiceId) return;
    setLoadingReminderLogs(true);
    const result = await listInvoiceReminderLogs(invoiceId);
    setLoadingReminderLogs(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setReminderLogs(result.logs);
    setReminderLogsInvoiceId(invoiceId);
  };
  useEffect(() => {
    if (invoiceId && bankAccounts.length > 0) {
      const main = bankAccounts.find((account) => account.code === "1000");
      setDepositAccountId((main ?? bankAccounts[0]).id);
    }
  }, [invoiceId, bankAccounts]);

  // Handle Escape key to close the sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    if (open) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  // Lock the page scroll while the sidebar is open — only the panel scrolls
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // 🚀 Added !mounted to prevent server-side hydration errors
  if (!open || !invoice || !mounted) return null;

  // 🧮 Math Calculations
  const paid = invoice.amountPaidMinor || 0;
  const total = invoice.totalMinor || 0;
  const balanceMinor = Math.max(0, total - paid);
  const isFullyPaid = paid > 0 && paid >= total;

  // How this invoice treats VAT (exclusive / inclusive / no VAT)
  const amountsAre = (invoice as any).amountsAre ?? "exclusive";
  const vatTreatmentLabel =
    amountsAre === "inclusive"
      ? "VAT Inclusive"
      : amountsAre === "no_vat"
        ? "No VAT"
        : "VAT Exclusive";

  // Ledger-derived payment details (which bank account each payment was deposited into)
  const payments = invoice.payments ?? [];
  const paidIntoLabel = payments.length
    ? [...new Set(payments.map((payment) => payment.accountName))].join(", ")
    : null;

  // Derive exact status
  let mappedStatus = invoice.status.toLowerCase();
  if (isFullyPaid) mappedStatus = "paid";
  else if (paid > 0) mappedStatus = "partially_paid";
  else if (
    mappedStatus !== "paid" &&
    mappedStatus !== "void" &&
    invoice.dueDate &&
    new Date(invoice.dueDate) < new Date()
  ) {
    mappedStatus = "overdue";
  }

  const sc = statusConfig[mappedStatus] || statusConfig.draft;

  // Handle clicking "Submit Payment"
  const handlePaymentSubmit = async () => {
    if (!invoice || !onRecordPayment || !paymentAmount) return;
    const amountMinor = Math.round(parseFloat(paymentAmount) * 100);

    if (amountMinor <= 0) return toast.error("Please enter a valid amount");
    if (amountMinor > balanceMinor) return toast.error("Amount exceeds balance due");
    if (bankAccounts.length > 0 && !depositAccountId) {
      return toast.error("Select the bank account this payment was deposited into");
    }

    setIsSubmitting(true);
    try {
      // Paying a draft approves it first, since a payment can only be applied to
      // an invoice that has posted. If that approval fails the payment must not
      // proceed: it would be applied to a still-draft invoice and rejected by
      // the server with a message about the draft, hiding the real reason.
      if (invoice.status === "draft" && onAutoApprove) {
        const approved = await onAutoApprove(invoice.id);
        if (approved === false) {
          toast.error("Could not approve this invoice, so the payment was not recorded.");
          return;
        }
      }

      await onRecordPayment(invoice.id, amountMinor, depositAccountId || undefined, paymentMethod);
      toast.success("Payment recorded successfully!");

      if (amountMinor >= balanceMinor) {
        celebrateSettlement(); // balance cleared — only settlement celebrates, not every payment
        setTimeout(() => onOpenChange(false), 500); // Close sidebar if fully paid
      } else {
        setPaymentAmount(((balanceMinor - amountMinor) / 100).toFixed(2)); // Update remaining
      }
    } catch (error) {
      toast.error("Failed to record payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 🚀 TELEPORT TO DOCUMENT BODY!
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Dark Overlay Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={() => onOpenChange(false)}
      />

      {/* Slide-out Sidebar Panel */}
      <div className="relative w-full max-w-[440px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-200">
        {/* Scrollable Main Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 hide-scrollbar">
          {/* Close Button (X) */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors outline-none"
          >
            <X className="size-5" />
          </button>

          {/* Top Header Section */}
          <div className="mb-8 mt-2">
            <p className="text-sm font-semibold text-slate-500 mb-1">
              {invoice.invoiceNo || "Draft Invoice"}
            </p>
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-3">
              {formatMinor(invoice.totalMinor)}
            </h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border",
                sc.bg,
                sc.text,
                sc.bg.replace("bg-", "border-"),
              )}
            >
              <span className={cn("size-1.5 rounded-full", sc.dot)} />
              {sc.label}
            </span>
          </div>

          {/* Customer Profile Card */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100 mb-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 border border-indigo-200">
              {getInitials(invoice.contactName)}
            </div>
            <div>
              <p className="font-bold text-slate-900">{invoice.contactName}</p>
              <p className="text-xs text-slate-500">Customer</p>
            </div>
          </div>

          {/* 2x2 Meta Details Grid */}
          <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-8">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Account
              </p>
              <p className="text-sm font-semibold text-slate-900 truncate">
                {invoice.lines?.[0]?.accountName || "Sales"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Due Date
              </p>
              <p className="text-sm font-semibold text-slate-900">{formatDate(invoice.dueDate)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Created
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {formatDate(invoice.issueDate)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                VAT
              </p>
              <p className="text-sm font-semibold text-slate-900">{vatTreatmentLabel}</p>
            </div>
            {invoice.servicePeriodStart && invoice.servicePeriodEnd && (
              <div className="col-span-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Service period</p>
                <p className="text-sm font-semibold text-slate-900">
                  {formatPeriodRange(invoice.servicePeriodStart, invoice.servicePeriodEnd)}
                </p>
              </div>
            )}
          </div>

          {/* 💰 Financial Totals */}
          {invoice.trackingAssignments.length > 0 ? (
            <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-blue-700">Tracking</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {invoice.trackingAssignments.map((assignment) => (
                  <div key={assignment.dimensionId}>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {assignment.dimensionLabel}
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                      {assignment.optionName}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div className="border-t border-slate-100 pt-6 mb-6 space-y-3 text-sm">
            <div className="flex justify-between text-slate-500 font-medium">
              <span>Subtotal</span>
              <span>{formatMinor(invoice.subtotalMinor || invoice.totalMinor)}</span>
            </div>
            {amountsAre !== "no_vat" && (
              <div className="flex justify-between text-slate-500 font-medium">
                <span>{amountsAre === "inclusive" ? "Includes VAT" : "VAT"}</span>
                <span>{formatMinor(invoice.taxMinor || 0)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-900 font-bold">
              <span>Total</span>
              <span>{formatMinor(invoice.totalMinor)}</span>
            </div>
            {(invoice.amountPaidMinor || 0) > 0 && (
              <>
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Amount Paid</span>
                  <span>-{formatMinor(paid)}</span>
                </div>
                {payments.length > 0 && (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700/70">
                      Paid into
                    </p>
                    {payments.map((payment, index) => (
                      <div key={index} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-emerald-900 truncate">
                          {payment.accountCode} - {payment.accountName}
                        </span>
                        <span className="shrink-0 font-medium text-emerald-700">
                          {formatDate(payment.paidAt)} · {formatMinor(payment.amountMinor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between text-blue-700 font-extrabold text-base pt-3 border-t border-slate-100 mt-2">
              <span>Balance Due</span>
              <span>{formatMinor(balanceMinor)}</span>
            </div>
          </div>

          {/* 💳 Record Payment Box */}
          {balanceMinor > 0 && mappedStatus !== "void" && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-5 mb-8">
              <h3 className="text-sm font-bold text-blue-900 mb-3">Record Payment</h3>
              {mappedStatus === "draft" && (
                <p className="text-xs text-blue-700 mb-3 font-medium opacity-80">
                  Recording a payment will automatically approve this draft to your ledger.
                </p>
              )}
              {bankAccounts.length > 0 && (
                <div className="mb-3">
                  <label className="mb-1.5 block text-xs font-semibold text-blue-900">
                    Deposit into
                  </label>
                  <Select value={depositAccountId} onValueChange={setDepositAccountId}>
                    <SelectTrigger className="h-10 w-full bg-white">
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
              )}
              <div className="mb-3">
                <label className="mb-1.5 block text-xs font-semibold text-blue-900">
                  Payment method
                </label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
                >
                  <SelectTrigger className="h-10 w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-slate-500 font-medium text-sm">
                    {symbol}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                    style={{ paddingLeft: currencyInputInset(symbol) }}
                  />
                </div>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 shadow-sm"
                  onClick={handlePaymentSubmit}
                  disabled={isSubmitting || !paymentAmount}
                >
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Submit"}
                </Button>
              </div>
            </div>
          )}

          {/* ⏳ Visual Timeline */}
          <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={toggleReminderHistory}
              aria-expanded={reminderHistoryOpen}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50"
            >
              <span>
                <span className="block text-sm font-bold text-slate-900">Reminder history</span>
                <span className="block text-xs text-slate-500">
                  See when automatic payment messages were attempted.
                </span>
              </span>
              {reminderHistoryOpen ? (
                <ChevronUp className="size-4 text-slate-500" />
              ) : (
                <ChevronDown className="size-4 text-slate-500" />
              )}
            </button>
            {reminderHistoryOpen && (
              <div className="border-t border-slate-100 px-4 py-3">
                {loadingReminderLogs ? (
                  <p className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="size-4 animate-spin" /> Loading history…
                  </p>
                ) : currentReminderLogs?.length ? (
                  <div className="space-y-3">
                    {currentReminderLogs.map((log) => (
                      <div
                        key={log.id}
                        className="grid gap-1 text-xs sm:grid-cols-[120px_1fr_auto] sm:gap-3"
                      >
                        <span className="font-semibold capitalize text-slate-700">
                          {log.kind.replace("_", "-")}
                        </span>
                        <span className="min-w-0 break-words text-slate-500" title={log.recipients}>
                          {log.recipients || "No recipient"}
                        </span>
                        <span
                          className={cn(
                            "font-semibold",
                            log.status === "sent" ? "text-emerald-600" : "text-red-600",
                          )}
                        >
                          {log.status === "sent" ? "Sent" : "Failed"} ·{" "}
                          {new Date(log.sentAt).toLocaleString("en-GB")}
                        </span>
                        {log.error && (
                          <p className="text-red-600 sm:col-start-2 sm:col-span-2">{log.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    No automatic reminders have been attempted.
                  </p>
                )}
              </div>
            )}
          </section>

          <div className="mb-6">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4">
              Invoice Timeline
            </h3>
            <div className="relative border-l-2 border-slate-100 ml-2 space-y-6 pb-2">
              <div className="relative pl-6">
                <span className="absolute -left-[9px] top-1 flex size-4 items-center justify-center rounded-full bg-white border-2 border-emerald-500"></span>
                <p className="text-sm font-bold text-slate-900">Created</p>
                <p className="text-xs font-medium text-slate-400">Issue date</p>
              </div>

              {(mappedStatus === "sent" ||
                mappedStatus === "paid" ||
                mappedStatus === "partially_paid") && (
                <div className="relative pl-6">
                  <span className="absolute -left-[9px] top-1 flex size-4 items-center justify-center rounded-full bg-white border-2 border-emerald-500"></span>
                  <p className="text-sm font-bold text-slate-900">Sent to customer</p>
                  <p className="text-xs font-medium text-slate-400">Emailed</p>
                </div>
              )}

              <div className="relative pl-6">
                <span
                  className={cn(
                    "absolute -left-[9px] top-1 flex size-4 items-center justify-center rounded-full bg-white border-2",
                    isFullyPaid ? "border-emerald-500" : "border-slate-300",
                  )}
                ></span>
                <p
                  className={cn(
                    "text-sm font-bold",
                    isFullyPaid ? "text-slate-900" : "text-slate-500",
                  )}
                >
                  {isFullyPaid ? "Payment received" : "Awaiting payment"}
                </p>
                <p className="text-xs font-medium text-slate-400">
                  {isFullyPaid
                    ? paidIntoLabel
                      ? `Paid in full into ${paidIntoLabel}`
                      : "Paid in full"
                    : "Pending"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Actions Fixed Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col gap-2 shrink-0 pb-6">
          {balanceMinor > 0 && mappedStatus !== "void" && mappedStatus !== "draft" && (
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 shadow-sm gap-2"
              disabled={sendingReminder}
              onClick={handleSendReminder}
            >
              {sendingReminder ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send className="size-4" /> Send payment reminder
                </>
              )}
            </Button>
          )}
          {/* Next-period continuation. Only for posted invoices carrying a
              service period — a draft's period may still change, and there is
              nothing to continue without one. Opens a prefilled editable
              draft; it never posts anything by itself. */}
          {onCreateNext &&
            invoice.servicePeriodEnd &&
            mappedStatus !== "draft" &&
            mappedStatus !== "void" && (
              <Button
                variant="outline"
                className="w-full h-10 font-semibold text-slate-700 bg-white gap-2"
                onClick={() => onCreateNext(invoice)}
              >
                <CalendarPlus className="size-4" /> Create next invoice
              </Button>
            )}

          {(invoice.attachments?.length ?? 0) > 0 && (
            <Button
              variant="outline"
              className="h-10 w-full gap-2 bg-white font-semibold text-slate-700"
              disabled={exportingCombinedPdf}
              onClick={handleCombinedPdfDownload}
            >
              {exportingCombinedPdf ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Preparing combined PDF...
                </>
              ) : (
                <>
                  <Download className="size-4" /> Download invoice + attachments (PDF)
                </>
              )}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="w-full h-10 font-semibold text-slate-700 bg-white"
              onClick={() => {
                if (onPrint && invoice) onPrint(invoice);
              }}
            >
              Download PDF
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body, // 🚀 The destination for our portal!
  );
}
