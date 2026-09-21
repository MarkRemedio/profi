"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CurrencyPicker } from "@/components/currency/currency-picker";
import { useCurrency } from "@/components/currency-provider";
import { ExchangeRateField } from "@/components/shared/exchange-rate-field";
import { Button } from "@/components/ui/button";
import { accountingToday } from "@/lib/accounting/accounting-today";
import {
  addIsoDays,
  BILLING_PERIOD_PRESETS,
  calculatePeriodEnd,
  formatPeriodRange,
  type BillingPeriodUnit,
} from "@/lib/accounting/billing-period";
import type { DocumentLineInput, VatTreatment } from "@/lib/accounting/documents";
import type { InvoiceBatchCreateResult } from "@/lib/accounting/invoice-batch";
import { nextScheduledDueDate } from "@/lib/accounting/payment-schedule";
import {
  collectionInvoiceTotalMinor,
  collectionLineAmount,
  validateInvoiceCollectionRow,
  type InvoiceCollectionLine,
} from "@/lib/sales/invoice-collection";
import { currencySymbol } from "@/lib/currency";
import type { TrackingAssignmentInput } from "@/lib/accounting/tracking-types";
import type { Invoice, InvoiceWorkspaceData, NewInvoiceInput } from "./invoice-types";

type InvoiceDraftRow = {
  id: string;
  issueDate: string;
  dueDate: string;
  periodPreset: string;
  servicePeriodUnit: BillingPeriodUnit | null;
  servicePeriodCount: number | null;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  trackingAssignments: TrackingAssignmentInput[];
  lines: InvoiceCollectionLine[];
  sourceInput: NewInvoiceInput;
  expanded: boolean;
  errors: string[];
};

type Props = {
  contacts: InvoiceWorkspaceData["contacts"];
  accounts: InvoiceWorkspaceData["accounts"];
  taxRates: InvoiceWorkspaceData["taxRates"];
  invoices: Invoice[];
  trackingSettings: InvoiceWorkspaceData["trackingSettings"];
  vatRegistered: boolean;
  creating: boolean;
  initialInvoice: NewInvoiceInput;
  onCancel: () => void;
  onCreateOne: (input: NewInvoiceInput) => Promise<boolean>;
  onCreate: (rows: Array<{ rowId: string; input: NewInvoiceInput }>) => Promise<InvoiceBatchCreateResult[]>;
};

let invoiceSequence = 0;
let lineSequence = 0;
const nextInvoiceId = () => `invoice-draft-${++invoiceSequence}`;
const nextLineId = () => `invoice-line-${++lineSequence}`;

function defaultTaxCode(taxRates: InvoiceWorkspaceData["taxRates"], vatRegistered: boolean) {
  if (!vatRegistered) return taxRates.find((rate) => rate.code.toLowerCase() === "no_vat")?.code ?? "no_vat";
  return taxRates.find((rate) => rate.code.toLowerCase() !== "no_vat")?.code ?? taxRates[0]?.code ?? "no_vat";
}

function suggestedDueDate(issueDate: string, contact: InvoiceWorkspaceData["contacts"][number] | undefined, termsDays: number) {
  const scheduled = contact?.paymentScheduleType === "end_of_month"
    ? nextScheduledDueDate(issueDate, { type: "end_of_month" })
    : contact?.paymentScheduleType === "day_of_month" && contact.paymentScheduleDay
      ? nextScheduledDueDate(issueDate, { type: "day_of_month", day: contact.paymentScheduleDay })
      : null;
  return scheduled ?? addIsoDays(issueDate, termsDays);
}

function lineFromInput(line: DocumentLineInput): InvoiceCollectionLine {
  return {
    id: nextLineId(),
    accountId: line.accountId,
    description: line.description,
    quantity: line.quantity ?? "1",
    unitPrice: line.unitPrice ?? line.amount ?? "",
    discount: line.discount ?? "",
    taxCode: line.taxCode,
  };
}

function emptyLine(accountId: string, taxCode: string): InvoiceCollectionLine {
  return { id: nextLineId(), accountId, description: "", quantity: "1", unitPrice: "", discount: "", taxCode };
}

function presetFor(unit: BillingPeriodUnit | null, count: number | null) {
  if (!unit || !count) return "none";
  return BILLING_PERIOD_PRESETS.find((preset) => preset.unit === unit && preset.count === count)?.id ?? "custom";
}

function rowFromInput(input: NewInvoiceInput, accountId: string, taxCode: string, expanded: boolean): InvoiceDraftRow {
  const unit = input.servicePeriodUnit ?? null;
  const count = input.servicePeriodCount ?? null;
  return {
    id: nextInvoiceId(),
    issueDate: input.issueDate || accountingToday(),
    dueDate: input.dueDate || "",
    periodPreset: presetFor(unit, count),
    servicePeriodUnit: unit,
    servicePeriodCount: count,
    servicePeriodStart: input.servicePeriodStart ?? "",
    servicePeriodEnd: input.servicePeriodEnd ?? "",
    trackingAssignments: (input.trackingAssignments ?? []).map((assignment) => ({ ...assignment })),
    lines: input.lines.length > 0 ? input.lines.map(lineFromInput) : [emptyLine(accountId, taxCode)],
    sourceInput: input,
    expanded,
    errors: [],
  };
}

function nextRow(
  previous: InvoiceDraftRow,
  accountId: string,
  taxCode: string,
  contact: InvoiceWorkspaceData["contacts"][number] | undefined,
  paymentTermsDays: number,
  trackingAssignments: TrackingAssignmentInput[]
): InvoiceDraftRow {
  const issueDate = previous.issueDate || accountingToday();
  const servicePeriodStart = previous.servicePeriodEnd ? addIsoDays(previous.servicePeriodEnd, 1) : previous.servicePeriodStart || "";
  const servicePeriodEnd = servicePeriodStart && previous.servicePeriodUnit && previous.servicePeriodCount
    ? calculatePeriodEnd(servicePeriodStart, previous.servicePeriodUnit, previous.servicePeriodCount)
    : "";
  return {
    id: nextInvoiceId(),
    issueDate,
    dueDate: suggestedDueDate(issueDate, contact, paymentTermsDays),
    periodPreset: previous.periodPreset,
    servicePeriodUnit: previous.servicePeriodUnit,
    servicePeriodCount: previous.servicePeriodCount,
    servicePeriodStart,
    servicePeriodEnd,
    trackingAssignments: trackingAssignments.map((assignment) => ({ ...assignment })),
    lines: previous.lines.length > 0
      ? previous.lines.map((line) => ({ ...line, id: nextLineId() }))
      : [emptyLine(accountId, taxCode)],
    sourceInput: {
      ...previous.sourceInput,
      id: undefined,
      contactId: contact?.id,
      contactName: contact?.name ?? "",
      documentNo: "",
      issueDate,
      dueDate: suggestedDueDate(issueDate, contact, paymentTermsDays),
      attachments: [],
      poNumber: "",
      reference: "",
      lines: [],
    },
    expanded: true,
    errors: [],
  };
}

const fieldClass = "h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
const compactFieldClass = "h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500";

function sourceExtrasTotalMinor(
  input: NewInvoiceInput,
  taxRates: InvoiceWorkspaceData["taxRates"],
  amountsAre: VatTreatment
) {
  const extras = [
    ...(Number(input.shippingAmount) > 0
      ? [{ amountMinor: Math.round(Number(input.shippingAmount) * 100), taxCode: input.shippingTaxCode }]
      : []),
    ...(input.additionalCharges ?? []).map((charge) => ({
      amountMinor: charge.amountMinor,
      taxCode: charge.taxCode,
    })),
  ];
  return extras.reduce((total, extra) => {
    if (amountsAre !== "exclusive") return total + extra.amountMinor;
    const rate = taxRates.find((taxRate) => taxRate.code === extra.taxCode)?.rate ?? 0;
    return total + extra.amountMinor + Math.round((extra.amountMinor * rate) / 100);
  }, 0);
}

export function InvoiceCollectionEditor({
  contacts, accounts, taxRates, invoices, trackingSettings, vatRegistered, creating,
  initialInvoice, onCancel, onCreateOne, onCreate,
}: Props) {
  const { currency: workspaceCurrency, multicurrencyEnabled } = useCurrency();
  const defaultTax = defaultTaxCode(taxRates, vatRegistered);
  const initialContact = contacts.find((contact) => contact.id === initialInvoice.contactId);
  const initialTerms = initialInvoice.paymentTermsDays ?? initialContact?.paymentTermsDays ?? 30;
  const initialTracking = initialInvoice.trackingAssignments ?? [];
  const [contactId, setContactId] = useState(initialInvoice.contactId ?? "");
  const [currency, setCurrency] = useState(String(initialInvoice.currency ?? workspaceCurrency));
  const [paymentTermsDays, setPaymentTermsDays] = useState(initialTerms);
  const [amountsAre, setAmountsAre] = useState<VatTreatment>(initialInvoice.amountsAre ?? (vatRegistered ? "exclusive" : "no_vat"));
  const [trackingDefaults, setTrackingDefaults] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialTracking.map((assignment) => [assignment.dimensionId, assignment.optionId]))
  );
  const [rows, setRows] = useState<InvoiceDraftRow[]>(() => {
    const first = rowFromInput(initialInvoice, accounts[0]?.id ?? "", defaultTax, false);
    return [
      first,
      nextRow(first, accounts[0]?.id ?? "", defaultTax, initialContact, initialTerms, initialTracking),
    ];
  });
  const rowElements = useRef(new Map<string, HTMLElement>());
  const contact = contacts.find((item) => item.id === contactId);
  const activeDimensions = trackingSettings.dimensions.filter((dimension) => dimension.isActive);
  const symbol = currencySymbol(currency);

  const overlapWarnings = useMemo(() => {
    const warnings = new Map<string, string[]>();
    if (!contactId) return warnings;
    const existing = invoices
      .filter((invoice) => invoice.contactId === contactId && invoice.status !== "void")
      .flatMap((invoice) => invoice.servicePeriodStart && invoice.servicePeriodEnd
        ? [{ start: invoice.servicePeriodStart, end: invoice.servicePeriodEnd, label: invoice.invoiceNo }]
        : []);
    rows.forEach((row, rowIndex) => {
      const messages: string[] = [];
      if (row.servicePeriodUnit && row.servicePeriodCount && row.servicePeriodStart && row.servicePeriodEnd) {
        const expected = calculatePeriodEnd(row.servicePeriodStart, row.servicePeriodUnit, row.servicePeriodCount);
        if (expected !== row.servicePeriodEnd) messages.push(`The selected period rule ends on ${expected}; your manual end date is preserved.`);
      }
      if (row.servicePeriodStart && row.servicePeriodEnd) {
        const candidates = [
          ...existing,
          ...rows.slice(0, rowIndex).flatMap((candidate, index) =>
            candidate.servicePeriodStart && candidate.servicePeriodEnd
              ? [{ start: candidate.servicePeriodStart, end: candidate.servicePeriodEnd, label: `Invoice ${index + 1} in this session` }]
              : []
          ),
        ];
        const overlap = candidates.find((candidate) => row.servicePeriodStart <= candidate.end && row.servicePeriodEnd >= candidate.start);
        if (overlap) messages.push(`Service period overlaps ${overlap.label}.`);
      }
      if (messages.length > 0) warnings.set(row.id, messages);
    });
    return warnings;
  }, [contactId, invoices, rows]);

  function updateRow(rowId: string, update: Partial<InvoiceDraftRow>) {
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, ...update, errors: [] } : row));
  }

  function updateLine(rowId: string, lineId: string, update: Partial<InvoiceCollectionLine>) {
    setRows((current) => current.map((row) => row.id === rowId
      ? { ...row, errors: [], lines: row.lines.map((line) => line.id === lineId ? { ...line, ...update } : line) }
      : row
    ));
  }

  function selectCustomer(nextContactId: string) {
    const selected = contacts.find((item) => item.id === nextContactId);
    const terms = selected?.paymentTermsDays ?? 30;
    setContactId(nextContactId);
    setPaymentTermsDays(terms);
    if (selected?.defaultCurrency) setCurrency(selected.defaultCurrency);
    setRows((current) => current.map((row) => ({ ...row, dueDate: suggestedDueDate(row.issueDate, selected, terms), errors: [] })));
  }

  function setTrackingDefault(dimensionId: string, optionId: string) {
    setTrackingDefaults((current) => ({ ...current, [dimensionId]: optionId }));
    setRows((current) => current.map((row) => {
      const remaining = row.trackingAssignments.filter((assignment) => assignment.dimensionId !== dimensionId);
      return { ...row, trackingAssignments: optionId ? [...remaining, { dimensionId, optionId }] : remaining };
    }));
  }

  function addInvoice() {
    setRows((current) => {
      const previous = current.at(-1);
      if (!previous) return current;
      const assignments = activeDimensions.flatMap((dimension) => {
        const optionId = trackingDefaults[dimension.id];
        return optionId ? [{ dimensionId: dimension.id, optionId }] : [];
      });
      return [
        ...current.map((row) => ({ ...row, expanded: false })),
        nextRow(previous, accounts[0]?.id ?? "", defaultTax, contact, paymentTermsDays, assignments),
      ];
    });
  }

  function removeInvoice(row: InvoiceDraftRow, index: number) {
    if (rows.length === 1) return;
    const containsEnteredData = row.lines.some((line) => line.description.trim() || Number(line.unitPrice) > 0);
    if (containsEnteredData && !window.confirm(`Remove Invoice ${index + 1} and its entered line items?`)) return;
    setRows((current) => current.filter((candidate) => candidate.id !== row.id));
  }

  function inputForRow(row: InvoiceDraftRow): NewInvoiceInput {
    const selectedContact = contacts.find((item) => item.id === contactId);
    const noVatCode = taxRates.find((rate) => rate.code.toLowerCase() === "no_vat")?.code ?? "no_vat";
    return {
      ...row.sourceInput,
      contactId: selectedContact?.id,
      contactName: selectedContact?.name ?? "",
      billingAddress: selectedContact?.billingAddress ?? undefined,
      documentNo: "",
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      currency: currency as NewInvoiceInput["currency"],
      paymentTermsDays,
      amountsAre,
      servicePeriodUnit: row.servicePeriodUnit,
      servicePeriodCount: row.servicePeriodCount,
      servicePeriodStart: row.servicePeriodStart || null,
      servicePeriodEnd: row.servicePeriodEnd || null,
      trackingAssignments: row.trackingAssignments.map((assignment) => ({ ...assignment })),
      lines: row.lines.map((line) => ({
        accountId: line.accountId,
        description: line.description.trim(),
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: collectionLineAmount(line).toFixed(2),
        discount: line.discount || "0",
        taxCode: amountsAre === "no_vat" ? noVatCode : line.taxCode,
      })),
    };
  }

  async function submit() {
    if (!contact) { toast.error("Choose a customer before saving the invoice."); return; }
    if (!currency) { toast.error("Choose a currency before saving the invoice."); return; }
    const validated = rows.map((row) => ({ ...row, errors: validateInvoiceCollectionRow(row) }));
    setRows(validated);
    const firstInvalid = validated.find((row) => row.errors.length > 0);
    if (firstInvalid) {
      setRows((current) => current.map((row) => row.id === firstInvalid.id ? { ...row, expanded: true } : row));
      queueMicrotask(() => rowElements.current.get(firstInvalid.id)?.scrollIntoView({ behavior: "smooth", block: "center" }));
      toast.error("One or more invoices need attention before saving.");
      return;
    }
    if (validated.length === 1) {
      const saved = await onCreateOne(inputForRow(validated[0]));
      if (saved) onCancel();
      return;
    }
    let results: InvoiceBatchCreateResult[];
    try {
      results = await onCreate(validated.map((row) => ({ rowId: row.id, input: inputForRow(row) })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The invoices could not be created.");
      return;
    }
    const failed = new Map(results.filter((result) => result.status === "failed").map((result) => [result.rowId, result.reason]));
    const createdCount = results.filter((result) => result.status === "created").length;
    if (failed.size === 0) {
      toast.success(`${createdCount} invoices created as drafts.`);
      onCancel();
      return;
    }
    setRows((current) => current.filter((row) => failed.has(row.id)).map((row) => ({
      ...row,
      expanded: true,
      errors: [failed.get(row.id) ?? "This invoice could not be created."],
    })));
    toast.error(`${createdCount} invoice${createdCount === 1 ? "" : "s"} created. ${failed.size} need attention.`);
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onCancel} disabled={creating} aria-label="Back to invoices"><ArrowLeft className="size-4" /></Button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">New Invoice</h1>
              <p className="text-xs text-slate-500">{rows.length === 1 ? "Review this invoice before saving." : `${rows.length} independent invoices with shared defaults.`}</p>
            </div>
          </div>
          <Button onClick={submit} disabled={creating} className="gap-2 bg-blue-600 font-bold hover:bg-blue-700">
            {creating ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            {rows.length === 1 ? "Save as draft" : `Save ${rows.length} drafts`}
          </Button>
        </div>
      </header>

      <main className="space-y-5 py-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Customer / Invoice Defaults</h2>
          <p className="mt-1 text-xs text-slate-500">Reused to reduce entry; every saved invoice remains independent.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label><span className={labelClass}>Customer</span><select className={fieldClass} value={contactId} onChange={(event) => selectCustomer(event.target.value)}><option value="">Select customer</option>{contacts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <div><span className={labelClass}>Currency</span><CurrencyPicker value={currency} onChange={setCurrency} availableOnly size="field" /></div>
            <label>
              <span className={labelClass}>Payment terms</span>
              <select className={fieldClass} value={paymentTermsDays} onChange={(event) => {
                const terms = Number(event.target.value);
                setPaymentTermsDays(terms);
                setRows((current) => current.map((row) => ({ ...row, dueDate: suggestedDueDate(row.issueDate, contact, terms), errors: [] })));
              }}>
                {[0, 7, 15, 30, 45, 60, 90].map((days) => <option key={days} value={days}>{days === 0 ? "Due on receipt" : `Net ${days}`}</option>)}
              </select>
            </label>
            <label>
              <span className={labelClass}>Amounts are</span>
              {vatRegistered ? (
                <select className={fieldClass} value={amountsAre} onChange={(event) => setAmountsAre(event.target.value as VatTreatment)}><option value="exclusive">VAT exclusive</option><option value="inclusive">VAT inclusive</option><option value="no_vat">No VAT</option></select>
              ) : <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500">No VAT</div>}
            </label>
          </div>
        </section>

        {trackingSettings.enabled && activeDimensions.length > 0 ? (
          <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Tracking</h2>
            <p className="mt-1 text-xs text-slate-500">Defaults copied into each invoice as independent tracking assignments.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {activeDimensions.map((dimension) => (
                <label key={dimension.id}><span className={labelClass}>{dimension.label}</span><select className={fieldClass} value={trackingDefaults[dimension.id] ?? ""} onChange={(event) => setTrackingDefault(dimension.id, event.target.value)}><option value="">Not set</option>{dimension.options.filter((option) => option.isActive).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
              ))}
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div><h2 className="text-sm font-bold text-slate-900">{rows.length === 1 ? "Invoice" : "Invoices"}</h2><p className="mt-1 text-xs text-slate-500">Expand an invoice to edit its dates and line items.</p></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">{rows.length} {rows.length === 1 ? "invoice" : "invoices"}</span>
          </div>

          <div className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const warnings = overlapWarnings.get(row.id) ?? [];
              const totalMinor = collectionInvoiceTotalMinor(row.lines, taxRates, amountsAre)
                + sourceExtrasTotalMinor(row.sourceInput, taxRates, amountsAre);
              const itemsLabel = row.lines.length === 1 ? row.lines[0].description.trim() || "1 item" : `${row.lines.length} items`;
              return (
                <article id={row.id} key={row.id} ref={(element) => { if (element) rowElements.current.set(row.id, element); else rowElements.current.delete(row.id); }} className={row.errors.length > 0 ? "bg-red-50/30" : "bg-white"}>
                  <div className="grid items-center gap-3 px-5 py-4 lg:grid-cols-[5rem_1fr_1.4fr_1fr_1.2fr_0.8fr_auto]">
                    <div><p className="text-xs font-extrabold text-slate-900">Invoice {index + 1}</p>{row.errors.length > 0 ? <p className="mt-1 text-[10px] font-bold text-red-600">Needs attention</p> : null}</div>
                    <div><span className={labelClass}>Issue date</span><p className="text-sm font-semibold text-slate-800">{row.issueDate || "Not set"}</p></div>
                    <div><span className={labelClass}>Service period</span><p className="text-sm font-semibold text-slate-800">{row.servicePeriodStart && row.servicePeriodEnd ? formatPeriodRange(row.servicePeriodStart, row.servicePeriodEnd) : "Not set"}</p></div>
                    <div><span className={labelClass}>Due date</span><p className="text-sm font-semibold text-slate-800">{row.dueDate || "Not set"}</p></div>
                    <div className="min-w-0"><span className={labelClass}>Items</span><p className="truncate text-sm font-semibold text-slate-800">{itemsLabel}</p></div>
                    <div className="text-left lg:text-right"><span className={labelClass}>Total</span><p className="text-sm font-extrabold tabular-nums text-slate-900">{symbol}{(totalMinor / 100).toFixed(2)}</p></div>
                    <div className="flex items-center justify-end gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => updateRow(row.id, { expanded: !row.expanded })} aria-label={`${row.expanded ? "Collapse" : "Expand"} Invoice ${index + 1}`} aria-expanded={row.expanded}>{row.expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</Button>
                      <Button type="button" variant="ghost" size="icon" disabled={rows.length === 1 || creating} onClick={() => removeInvoice(row, index)} aria-label={`Remove Invoice ${index + 1}`}><Trash2 className="size-4 text-slate-400" /></Button>
                    </div>
                  </div>

                  {row.expanded ? (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-5">
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                        <label><span className={labelClass}>Issue date</span><input type="date" className={fieldClass} value={row.issueDate} onChange={(event) => { const issueDate = event.target.value; updateRow(row.id, { issueDate, dueDate: issueDate ? suggestedDueDate(issueDate, contact, paymentTermsDays) : "" }); }} /></label>
                        <label>
                          <span className={labelClass}>Period rule</span>
                          <select className={fieldClass} value={row.periodPreset} onChange={(event) => {
                            const value = event.target.value;
                            if (value === "none") { updateRow(row.id, { periodPreset: "none", servicePeriodUnit: null, servicePeriodCount: null, servicePeriodStart: "", servicePeriodEnd: "" }); return; }
                            if (value === "custom") {
                              const count = row.servicePeriodUnit === "day" && row.servicePeriodCount ? row.servicePeriodCount : 30;
                              const start = row.servicePeriodStart || row.issueDate;
                              updateRow(row.id, { periodPreset: "custom", servicePeriodUnit: "day", servicePeriodCount: count, servicePeriodStart: start, servicePeriodEnd: start ? calculatePeriodEnd(start, "day", count) : "" });
                              return;
                            }
                            const preset = BILLING_PERIOD_PRESETS.find((item) => item.id === value);
                            if (!preset) return;
                            const start = row.servicePeriodStart || row.issueDate;
                            updateRow(row.id, { periodPreset: preset.id, servicePeriodUnit: preset.unit, servicePeriodCount: preset.count, servicePeriodStart: start, servicePeriodEnd: start ? calculatePeriodEnd(start, preset.unit, preset.count) : "" });
                          }}><option value="none">No service period</option>{BILLING_PERIOD_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}<option value="custom">Custom days</option></select>
                        </label>
                        <label><span className={labelClass}>Service start</span><input type="date" className={fieldClass} disabled={!row.servicePeriodUnit} value={row.servicePeriodStart} onChange={(event) => { const start = event.target.value; updateRow(row.id, { servicePeriodStart: start, servicePeriodEnd: start && row.servicePeriodUnit && row.servicePeriodCount ? calculatePeriodEnd(start, row.servicePeriodUnit, row.servicePeriodCount) : row.servicePeriodEnd }); }} /></label>
                        <label><span className={labelClass}>Service end</span><input type="date" className={fieldClass} disabled={!row.servicePeriodUnit} value={row.servicePeriodEnd} onChange={(event) => updateRow(row.id, { servicePeriodEnd: event.target.value })} /></label>
                        <label><span className={labelClass}>Due date</span><input type="date" className={fieldClass} value={row.dueDate} onChange={(event) => updateRow(row.id, { dueDate: event.target.value })} /></label>
                      </div>

                      {row.periodPreset === "custom" ? <label className="mt-3 block max-w-[12rem]"><span className={labelClass}>Custom period days</span><input type="number" min={1} max={3660} className={fieldClass} value={row.servicePeriodCount ?? 1} onChange={(event) => { const count = Math.max(1, Math.round(Number(event.target.value) || 1)); updateRow(row.id, { servicePeriodCount: count, servicePeriodEnd: row.servicePeriodStart ? calculatePeriodEnd(row.servicePeriodStart, "day", count) : "" }); }} /></label> : null}

                      {multicurrencyEnabled ? (
                        <div className="mt-4 max-w-sm">
                          <ExchangeRateField
                            documentCurrency={currency}
                            baseCurrency={workspaceCurrency}
                            issueDate={row.issueDate}
                            rate={row.sourceInput.exchangeRate}
                            readOnly
                            onRateChange={(exchangeRate) => updateRow(row.id, {
                              sourceInput: { ...row.sourceInput, exchangeRate },
                            })}
                          />
                        </div>
                      ) : null}

                      {warnings.length > 0 ? <div className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{warnings.map((warning) => <p key={warning} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{warning}</p>)}</div> : null}
                      {row.errors.length > 0 ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><p className="font-bold">Invoice {index + 1} needs attention:</p><ul className="mt-1 list-disc space-y-0.5 pl-4">{row.errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}

                      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                          <div><h3 className="text-xs font-bold text-slate-900">Line items</h3><p className="mt-0.5 text-[11px] text-slate-500">Each invoice owns its own lines.</p></div>
                          <Button type="button" variant="outline" size="sm" onClick={() => updateRow(row.id, { lines: [...row.lines, emptyLine(accounts[0]?.id ?? "", defaultTax)] })} className="gap-2"><Plus className="size-3.5" /> Add line item</Button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[980px] border-collapse">
                            <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="min-w-[15rem] px-3 py-2.5">Description</th><th className="min-w-[13rem] px-2 py-2.5">Income account</th><th className="w-24 px-2 py-2.5">Qty</th><th className="w-32 px-2 py-2.5">Rate</th><th className="w-28 px-2 py-2.5">Discount</th>{amountsAre !== "no_vat" ? <th className="w-32 px-2 py-2.5">Tax</th> : null}<th className="w-32 px-2 py-2.5 text-right">Amount</th><th className="w-12 px-2 py-2.5"><span className="sr-only">Actions</span></th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {row.lines.map((line, lineIndex) => (
                                <tr key={line.id}>
                                  <td className="px-3 py-2"><input aria-label={`Invoice ${index + 1} line ${lineIndex + 1} description`} className={compactFieldClass} value={line.description} onChange={(event) => updateLine(row.id, line.id, { description: event.target.value })} /></td>
                                  <td className="px-2 py-2"><select aria-label={`Invoice ${index + 1} line ${lineIndex + 1} income account`} className={compactFieldClass} value={line.accountId} onChange={(event) => updateLine(row.id, line.id, { accountId: event.target.value })}><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></td>
                                  <td className="px-2 py-2"><input aria-label={`Invoice ${index + 1} line ${lineIndex + 1} quantity`} inputMode="decimal" className={`${compactFieldClass} text-right`} value={line.quantity} onChange={(event) => updateLine(row.id, line.id, { quantity: event.target.value })} /></td>
                                  <td className="px-2 py-2"><div className="relative"><span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">{symbol}</span><input aria-label={`Invoice ${index + 1} line ${lineIndex + 1} rate`} inputMode="decimal" className={`${compactFieldClass} pl-7 text-right`} value={line.unitPrice} onChange={(event) => updateLine(row.id, line.id, { unitPrice: event.target.value })} /></div></td>
                                  <td className="px-2 py-2"><input aria-label={`Invoice ${index + 1} line ${lineIndex + 1} discount`} inputMode="decimal" className={`${compactFieldClass} text-right`} value={line.discount} onChange={(event) => updateLine(row.id, line.id, { discount: event.target.value })} /></td>
                                  {amountsAre !== "no_vat" ? <td className="px-2 py-2"><select aria-label={`Invoice ${index + 1} line ${lineIndex + 1} tax`} className={compactFieldClass} value={line.taxCode} onChange={(event) => updateLine(row.id, line.id, { taxCode: event.target.value })}>{taxRates.map((rate) => <option key={rate.code} value={rate.code}>{rate.name}</option>)}</select></td> : null}
                                  <td className="px-2 py-2 text-right text-xs font-bold tabular-nums text-slate-800">{symbol}{collectionLineAmount(line).toFixed(2)}</td>
                                  <td className="px-2 py-2"><Button type="button" variant="ghost" size="icon" disabled={row.lines.length === 1} onClick={() => updateRow(row.id, { lines: row.lines.filter((candidate) => candidate.id !== line.id) })} aria-label={`Remove line ${lineIndex + 1} from Invoice ${index + 1}`}><Trash2 className="size-3.5 text-slate-400" /></Button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
            <p className="text-xs text-slate-500">New invoices continue the preceding service period when possible.</p>
            <Button type="button" variant="outline" onClick={addInvoice} disabled={rows.length >= 50 || creating} className="gap-2 bg-white font-bold text-blue-700"><Plus className="size-4" /> Add another invoice</Button>
          </div>
        </section>

        <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={creating}>Cancel</Button>
          <Button onClick={submit} disabled={creating} className="gap-2 bg-blue-600 px-5 font-bold hover:bg-blue-700">{creating ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}{rows.length === 1 ? "Save as draft" : `Save ${rows.length} drafts`}</Button>
        </div>
      </main>
    </div>
  );
}
