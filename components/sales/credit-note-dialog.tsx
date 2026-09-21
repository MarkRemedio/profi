"use client";

import { useCurrency } from "@/components/currency-provider";
import { currencyInputInset } from "@/lib/currency";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Scale, Calendar, FileText, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CreditNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (note: any, id?: string) => void; // ✅ Changed to handle both Add and Edit
  contacts: any[];
  invoices: any[];
  /** False hides the VAT question: an unregistered business reverses no tax. */
  vatRegistered?: boolean;
  taxRates?: TaxRateOption[];
  /** Posted notes open to be read, not changed — see the guard on save. */
  readOnly?: boolean;
  initialData?: any | null; // ✅ Tells the form to pre-fill data
}

type TaxRateOption = { code: string; name: string; rate: number };

/**
 * The VAT a credit note reverses.
 *
 * A credit note against a VAT invoice credits the gross, of which part is tax —
 * so the rate is chosen here and the tax is backed out of the amount entered,
 * rather than added on top of it.
 *
 * The rates come from the workspace's own tax settings, not a list written into
 * this file. A hardcoded 20/5/0 is the right guess for most UK businesses and
 * the wrong one for anybody who has configured their own, and it would drift
 * silently the day a rate changes.
 *
 * Basis points and half-up rounding, matching extractInclusiveTax on the
 * server: gross * bps / (10000 + bps). The server recomputes the split and
 * refuses the save if net plus VAT does not equal the total, so a disagreement
 * between the two surfaces rather than posting a wrong journal.
 */
const NO_VAT: TaxRateOption = { code: "no_vat", name: "No VAT", rate: 0 };

function basisPointsOf(rate: TaxRateOption): number {
  return Math.round(rate.rate * 100);
}

function vatFromGross(grossMinor: number, basisPoints: number): number {
  if (basisPoints <= 0) return 0;
  const divisor = 10_000 + basisPoints;
  /* Math.floor, not Math.round. Adding half the divisor is what rounds to the
     nearest unit; the server then truncates, because BigInt division does.
     Rounding again here rounds twice and disagrees with the server on roughly
     half of all amounts — which the server would reject rather than post. */
  return Math.floor((grossMinor * basisPoints + divisor / 2) / divisor);
}

export function CreditNoteDialog({
  open,
  onOpenChange,
  onSave,
  contacts,
  invoices,
  vatRegistered = false,
  taxRates = [],
  readOnly = false,
  initialData,
}: CreditNoteDialogProps) {
  /* No VAT always first, and the only option at all for a business that is not
     registered — which is also why the field below is hidden entirely rather
     than shown with one choice in it. */
  const rateOptions: TaxRateOption[] = vatRegistered
    ? [NO_VAT, ...taxRates.filter((rate) => rate.code !== "no_vat")]
    : [NO_VAT];
  const { symbol, format, currency } = useCurrency();
  // ✅ 1. State to safely use portals in Next.js
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customerName: "",
    invoiceNo: "",
    amount: "",
    reason: "",
    date: new Date().toISOString().split("T")[0],
    taxCode: "no_vat",
  });

  // ✅ Mount effect for the portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // ✅ Auto-fill the form if we are Editing an existing note!
  useEffect(() => {
    if (open && initialData) {
      setFormData({
        customerName: initialData.contactName || "",
        invoiceNo: initialData.invoiceRef !== "N/A" ? initialData.invoiceRef : "",
        amount: (initialData.totalMinor / 100).toFixed(2),
        reason: "",
        date: String(initialData.date ?? "").slice(0, 10),
        taxCode: initialData.taxCode ?? "no_vat",
      });
    } else if (open && !initialData) {
      setFormData({ customerName: "", invoiceNo: "", amount: "", reason: "", date: new Date().toISOString().split("T")[0], taxCode: "no_vat" });
    }
  }, [open, initialData]);

  // ✅ Wait until mounted so document.body is available for the portal
  if (!open || !mounted) return null;

  const availableInvoices = invoices.filter(
    (inv) =>
      inv.contactName === formData.customerName ||
      inv.name === formData.customerName ||
      inv.customerName === formData.customerName
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    setTimeout(() => {
      const amountMinor = Math.round(parseFloat(formData.amount) * 100);

      // Pass the ID back if we are editing, otherwise it's undefined
      const rate = rateOptions.find((r) => r.code === formData.taxCode) ?? NO_VAT;

      onSave({
        contactName: formData.customerName,
        invoiceRef: formData.invoiceNo || "N/A",
        date: formData.date,
        totalMinor: amountMinor,
        // Backed out of the amount entered, not added to it.
        taxMinor: vatFromGross(amountMinor, basisPointsOf(rate)),
        taxCode: rate.code,
        remainingMinor: amountMinor,
        status: "open",
      }, initialData?.id);

      setSubmitting(false);
      onOpenChange(false);
    }, 600);
  };

  const isEditing = !!initialData;

  // ✅ 2. Wrap the entire return inside createPortal()
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl animate-in zoom-in-95 duration-200">

        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <X className="size-4" />
        </button>

        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-orange-50 border border-orange-100">
            <Scale className="size-4 text-orange-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {readOnly ? "Credit Note" : isEditing ? "Edit Credit Note" : "Issue Credit Note Adjustment"}
            </h2>
            <p className="text-xs text-slate-400">
              {readOnly
                ? "Posted to the ledger. Void it to reverse — the journal cannot be changed."
                : "Reduce open customer account receivables ledger points."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm font-medium text-slate-700">

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Customer</label>
            {/* A styled select rather than a native one wearing
                appearance-none, which stripped the chevron and left a menu
                looking exactly like a text box. z-[10000] because this dialog
                sits at z-[9999] and the menu portals to the body. */}
            <Select
              disabled={readOnly || !contacts?.length}
              value={formData.customerName}
              onValueChange={(value) => setFormData({ ...formData, customerName: value, invoiceNo: "" })}
            >
              <SelectTrigger className="h-10 w-full justify-between bg-white pl-9">
                <User className="pointer-events-none absolute left-3 size-4 text-slate-400" />
                <SelectValue placeholder={contacts?.length ? "Select a customer" : "No customers yet"} />
              </SelectTrigger>
              <SelectContent className="z-[10000]">
                {contacts?.map((contact: any) => (
                  <SelectItem key={contact.id} value={contact.name || contact.contactName}>
                    {contact.name || contact.contactName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice Reference</label>
              <Select
                disabled={readOnly || !formData.customerName || availableInvoices.length === 0}
                value={formData.invoiceNo}
                onValueChange={(value) => setFormData({ ...formData, invoiceNo: value })}
              >
                <SelectTrigger className="h-10 w-full justify-between bg-white pl-9 disabled:opacity-50">
                  <FileText className="pointer-events-none absolute left-3 size-4 text-slate-400" />
                  <SelectValue
                    placeholder={
                      !formData.customerName
                        ? "Select customer first"
                        : availableInvoices.length === 0
                          ? "No invoices found"
                          : "Select an invoice"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  {availableInvoices.map((inv: any) => {
                    const invRef = inv.invoiceNo || inv.invoiceNumber || inv.id;
                    return <SelectItem key={inv.id} value={invRef}>{invRef}</SelectItem>;
                  })}

                  {/* An edited note may name an invoice that has since left the
                      list. Kept as an option so opening it does not blank the
                      field it was saved with. */}
                  {isEditing && formData.invoiceNo && !availableInvoices.some((inv: any) => (inv.invoiceNo || inv.invoiceNumber || inv.id) === formData.invoiceNo) && (
                    <SelectItem value={formData.invoiceNo}>{formData.invoiceNo}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Adjustment Date</label>
              <div className="relative flex items-center">
                <Calendar className="absolute left-3 size-4 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  required
                  disabled={readOnly}
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.025)] outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            {/* The workspace currency, not a hardcoded GBP. A workspace keeping
                books in Canadian dollars was asked for a credit value in
                pounds, next to a field prefixed CA$. */}
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Credit Value ({currency})
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-xs font-bold text-slate-400">{symbol}</span>
              <input
                type="number"
                step="0.01"
                required
                disabled={readOnly}
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                /* Padding measured from the symbol rather than fixed at pl-7,
                   which is sized for one glyph. "CA$" and "TSh" are three, so
                   the amount began underneath its own prefix. */
                style={{ paddingLeft: currencyInputInset(symbol, 0.875) }}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 text-sm font-bold text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.025)] outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Always shown, and locked to "No VAT" for a business that is not
              registered — the same way the tax column on a bill line behaves.
              Hiding it made the field appear and disappear between workspaces
              with no explanation; a greyed box says "this exists and does not
              apply to you", which is the true answer.

              Without the field at all, a credit note against a VAT invoice
              reversed the sale but not the tax on it, so the return still
              claimed VAT on money given back. */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              VAT included in this amount
            </label>
            {!vatRegistered ? (
              <div className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-400">
                No VAT
              </div>
            ) : (
              <Select
                disabled={readOnly}
                value={formData.taxCode}
                onValueChange={(value) => setFormData({ ...formData, taxCode: value })}
              >
                <SelectTrigger className="h-10 w-full justify-between bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                  {rateOptions.map((rate) => (
                    <SelectItem key={rate.code} value={rate.code}>
                      {rate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Shown rather than left to be worked out: the amount above is the
                gross, and somebody crediting 120 at twenty percent needs to see
                that 20 of it is the VAT being reversed. Nothing to show at No
                VAT, which is also every case for an unregistered business. */}
            {(() => {
              const gross = Math.round(parseFloat(formData.amount || "0") * 100);
              const rate = rateOptions.find((r) => r.code === formData.taxCode) ?? NO_VAT;
              const tax = Number.isFinite(gross) ? vatFromGross(gross, basisPointsOf(rate)) : 0;
              if (tax <= 0) return null;
              return (
                <p className="m-0 text-[11px] leading-relaxed text-slate-500">
                  {format(gross - tax)} net + {format(tax)} VAT
                </p>
              );
            })()}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs font-semibold bg-white border-slate-200"
            >
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {/* No Save on a posted note. Offering one that always refuses is
                worse than not offering it: it invites somebody to fill the form
                in before telling them it was never going to be accepted. */}
            {!readOnly && (
              <Button
                type="submit"
                disabled={submitting}
                className="h-9 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs px-4"
              >
                {submitting ? (
                  <><Loader2 className="size-3.5 animate-spin mr-1.5" /> {isEditing ? "Saving..." : "Posting..."}</>
                ) : (
                  isEditing ? "Save Changes" : "Post Adjustment"
                )}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body // ✅ Forces the modal to the top layer
  );
}