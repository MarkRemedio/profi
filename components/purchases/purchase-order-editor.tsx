"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { ExchangeRateField } from "@/components/shared/exchange-rate-field";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  DOC_CELL_INPUT_CLS,
  DOC_LABEL_CLS,
  DOC_TH_CLS,
  SectionCard,
  SectionHead,
} from "@/components/documents/document-form-chrome";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_CODES, formatMoney } from "@/lib/currency";
import { CurrencyPicker } from "@/components/currency/currency-picker";
import type {
  PurchaseOrderDraftInput,
  PurchaseOrderDto,
  PurchaseOrderStatus,
} from "@/lib/accounting/purchase-orders";

import { usePurchaseOrders } from "./use-purchase-orders";

type PurchaseOrderFormState = {
  poNumber: string;
  supplierName: string;
  supplierEmail: string;
  orderDate: string;
  expectedDate: string;
  currency: string;
  exchangeRate?: number;
  reference: string;
  notes: string;
  status: PurchaseOrderStatus;
  lines: Array<{
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
  }>;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function decimalOnly(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  return decimalParts.length > 0 ? `${whole}.${decimalParts.join("")}` : whole;
}

function amountToMinor(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function lineSubtotalMinor(line: { quantity: string; unitPrice: string }) {
  const quantity = Number(line.quantity || 0);
  const unitMinor = amountToMinor(line.unitPrice);
  return Number.isFinite(quantity) ? Math.round(quantity * unitMinor) : 0;
}

function orderSubtotalMinor(lines: PurchaseOrderFormState["lines"]) {
  return lines.reduce((sum, line) => sum + lineSubtotalMinor(line), 0);
}

function currencyCode(value: string | null | undefined): string {
  return CURRENCY_CODES.includes(value as any) ? String(value) : "GBP";
}

function blankForm(baseCurrency: string): PurchaseOrderFormState {
  return {
    poNumber: "",
    supplierName: "",
    supplierEmail: "",
    orderDate: today(),
    expectedDate: "",
    currency: currencyCode(baseCurrency),
    exchangeRate: 1,
    reference: "",
    notes: "",
    status: "DRAFT",
    lines: [
      {
        id: crypto.randomUUID(),
        description: "",
        quantity: "1.00",
        unitPrice: "0.00",
      },
    ],
  };
}

function orderToForm(order: PurchaseOrderDto): PurchaseOrderFormState {
  return {
    poNumber: order.poNumber,
    supplierName: order.supplierName,
    supplierEmail: order.supplierEmail ?? "",
    orderDate: order.orderDate,
    expectedDate: order.expectedDate ?? "",
    currency: currencyCode(order.currency),
    exchangeRate: order.exchangeRate,
    reference: order.reference ?? "",
    notes: order.notes ?? "",
    status: order.status,
    lines: order.lines.length > 0
      ? order.lines.map((line) => ({
          id: line.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: (line.unitAmountMinor / 100).toFixed(2),
        }))
      : [
          {
            id: crypto.randomUUID(),
            description: "",
            quantity: "1.00",
            unitPrice: "0.00",
          },
        ],
  };
}

function nextPurchaseOrderNumber(orders: PurchaseOrderDto[]) {
  const matches = orders
    .map((order) => order.poNumber)
    .map((value) => {
      const match = value.match(/^PO-(\d+)$/i);
      return match ? Number(match[1]) : null;
    })
    .filter((value): value is number => Number.isFinite(value));

  const next = matches.length > 0 ? Math.max(...matches) + 1 : 1001;
  return `PO-${String(next).padStart(4, "0")}`;
}

type PurchaseOrderEditorProps = {
  orderId?: string | null;
};

export function PurchaseOrderEditor({ orderId = null }: PurchaseOrderEditorProps) {
  const {
    orders,
    contacts,
    baseCurrency,
    loading,
    saving,
    error,
    saveOrder,
  } = usePurchaseOrders();

  const order = useMemo(
    () => (orderId ? orders.find((item) => item.id === orderId) ?? null : null),
    [orderId, orders]
  );

  if (loading && !order) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading purchase order...
      </div>
    );
  }

  if (error) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error}</div>;
  }

  return (
    <PurchaseOrderEditorForm
      key={order?.id ?? "new"}
      order={order}
      orders={orders}
      contacts={contacts}
      baseCurrency={baseCurrency}
      saving={saving}
      saveOrder={saveOrder}
    />
  );
}

type PurchaseOrderEditorFormProps = {
  order: PurchaseOrderDto | null;
  orders: PurchaseOrderDto[];
  contacts: Array<{ id: string; name: string; email?: string | null; contactType: string }>;
  baseCurrency: string;
  saving: boolean;
  saveOrder: (input: PurchaseOrderDraftInput) => Promise<unknown>;
};

function PurchaseOrderEditorForm({
  order,
  orders,
  contacts,
  baseCurrency,
  saving,
  saveOrder,
}: PurchaseOrderEditorFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<PurchaseOrderFormState>(() =>
    order ? orderToForm(order) : blankForm(baseCurrency)
  );

  const supplierOptions = useMemo(() => {
    const suppliers = new Map<string, string | null>();

    contacts.forEach((contact) => {
      if (contact.contactType !== "supplier" && contact.contactType !== "both") return;

      const current = suppliers.get(contact.name);
      if (!suppliers.has(contact.name) || (!current && contact.email)) {
        suppliers.set(contact.name, contact.email ?? null);
      }
    });

    orders.forEach((item) => {
      if (!suppliers.has(item.supplierName)) {
        suppliers.set(item.supplierName, item.supplierEmail ?? null);
      }
    });

    return Array.from(suppliers.entries())
      .map(([name, email]) => ({ name, email }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [contacts, orders]);

  function selectSupplier(name: string) {
    const selectedSupplier = supplierOptions.find((supplier) => supplier.name === name);
    setForm((current) => ({
      ...current,
      supplierName: name,
      supplierEmail: selectedSupplier?.email ?? "",
    }));
  }

  const nextNumber = useMemo(() => nextPurchaseOrderNumber(orders), [orders]);

  function updateLine(index: number, patch: Partial<PurchaseOrderFormState["lines"][number]>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      ),
    }));
  }

  function addLine() {
    setForm((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          id: crypto.randomUUID(),
          description: "",
          quantity: "1.00",
          unitPrice: "0.00",
        },
      ],
    }));
  }

  function removeLine(index: number) {
    setForm((current) => ({
      ...current,
      lines:
        current.lines.length === 1
          ? [
              {
                id: crypto.randomUUID(),
                description: "",
                quantity: "1.00",
                unitPrice: "0.00",
              },
            ]
          : current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  async function submitOrder() {
    const supplierName = form.supplierName.trim();
    if (!supplierName) {
      toast.error("Supplier name is required.");
      return;
    }

    const lines = form.lines
      .map((line) => ({
        ...line,
        description: line.description.trim(),
        quantity: decimalOnly(line.quantity || "1"),
        unitPrice: decimalOnly(line.unitPrice || "0"),
      }))
      .filter((line) => line.description.length > 0);

    if (lines.length === 0) {
      toast.error("Add at least one line item.");
      return;
    }

    const payload: PurchaseOrderDraftInput = {
      id: order?.id,
      poNumber: form.poNumber.trim() || nextNumber,
      supplierName,
      supplierEmail: form.supplierEmail.trim() || undefined,
      orderDate: form.orderDate,
      expectedDate: form.expectedDate || undefined,
      currency: currencyCode(form.currency) as any,
      exchangeRate: form.exchangeRate,
      reference: form.reference.trim() || undefined,
      notes: form.notes.trim() || undefined,
      status: form.status,
      lines,
    };

    const result = await saveOrder(payload);
    if (result) {
      toast.success(order ? "Purchase order saved." : "Purchase order created.");
      router.push("/purchases/orders");
    }
  }

  const draftTotalMinor = orderSubtotalMinor(form.lines);
  const baseTotalPreviewMinor =
    form.currency === baseCurrency || !form.exchangeRate
      ? draftTotalMinor
      : Math.round(draftTotalMinor * form.exchangeRate);

  return (
    <div className="space-y-6">
      {/* The header every other document form uses: a way back, then the
          title. The orange pill restated the section already highlighted in the
          sidebar, and font-black at a fixed 3xl was heavier and larger than the
          heading on any neighbouring page. */}
      <div className="mb-6 flex flex-col gap-2">
        <Link
          href="/purchases/orders"
          className="group flex w-fit items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          Back to orders
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            {order ? "Edit purchase order" : "Create purchase order"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Keep the order lean: supplier, lines, dates, and a note for the team.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-4">
          {/* The same card the invoice and bill forms use, so a purchase
              order stops being the one document with its own corner radius. */}
          <SectionCard>
            <SectionHead title="Order details" badge="Required" />
            <FieldGroup className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel className={DOC_LABEL_CLS}>Purchase order number</FieldLabel>
                <Input value={form.poNumber} onChange={(event) => setForm((current) => ({ ...current, poNumber: event.target.value }))} placeholder={nextNumber} />
              </Field>
              <Field>
                <FieldLabel className={DOC_LABEL_CLS}>Status</FieldLabel>
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as PurchaseOrderStatus }))}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {["DRAFT","SENT","PARTIALLY_RECEIVED","RECEIVED","CANCELLED"].map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel className={DOC_LABEL_CLS}>Supplier name</FieldLabel>
                <Select
                  value={form.supplierName}
                  onValueChange={selectSupplier}
                  disabled={supplierOptions.length === 0}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue
                      placeholder={supplierOptions.length === 0 ? "No suppliers yet" : "Select supplier"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {supplierOptions.map((supplier) => (
                      <SelectItem key={supplier.name} value={supplier.name}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel className={DOC_LABEL_CLS}>Supplier email</FieldLabel>
                <Input type="email" value={form.supplierEmail} onChange={(event) => setForm((current) => ({ ...current, supplierEmail: event.target.value }))} placeholder="orders@vendor.com" />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel className={DOC_LABEL_CLS}>Order date</FieldLabel>
                <Input type="date" value={form.orderDate} onChange={(event) => setForm((current) => ({ ...current, orderDate: event.target.value }))} />
              </Field>
              <Field>
                <FieldLabel className={DOC_LABEL_CLS}>Expected date</FieldLabel>
                <Input type="date" value={form.expectedDate} onChange={(event) => setForm((current) => ({ ...current, expectedDate: event.target.value }))} />
              </Field>
              <Field>
                <FieldLabel className={DOC_LABEL_CLS}>Currency</FieldLabel>
                {/* Searchable, matched on country name. This was a bare column
                    of codes with no names at all, which at a hundred and one
                    entries is unreadable. availableOnly: an order can only be
                    placed in a currency the books can keep. */}
                <CurrencyPicker
                  value={form.currency}
                  onChange={(value) => setForm((current) => ({ ...current, currency: value, exchangeRate: value === baseCurrency ? 1 : current.exchangeRate ?? 1 }))}
                  availableOnly
                  size="field"
                />
              </Field>
            </div>

            <ExchangeRateField documentCurrency={form.currency} baseCurrency={baseCurrency} issueDate={form.orderDate} rate={form.exchangeRate} onRateChange={(rate) => setForm((current) => ({ ...current, exchangeRate: rate }))} />

            <Field>
              <FieldLabel className={DOC_LABEL_CLS}>Reference</FieldLabel>
              <Input value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Requisition, cost centre, or project reference" />
            </Field>
          </FieldGroup>
          </SectionCard>

          <SectionCard>
            <SectionHead title="Line items">
              <div className="ml-auto flex items-center gap-2">
                <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.07em] text-slate-500">
                  {form.lines.length} {form.lines.length === 1 ? "line" : "lines"}
                </span>
                <Button variant="outline" size="sm" onClick={addLine} className="h-8 gap-1.5">
                  <Plus className="size-3.5" />
                  Add line
                </Button>
              </div>
            </SectionHead>
            <div className="space-y-3 p-4">
              <p className="text-xs text-slate-500">Describe what you are ordering and the agreed price.</p>

              {/* A table, as on a bill. Each line was a card carrying its own
                  three labels and its own total strip, so four lines repeated
                  the word "Description" four times and the prices never lined
                  up in a column that could be read down. */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={DOC_TH_CLS}>Description</th>
                      <th className={cn(DOC_TH_CLS, "text-right")}>Qty</th>
                      <th className={cn(DOC_TH_CLS, "text-right")}>Unit price</th>
                      <th className={cn(DOC_TH_CLS, "text-right")}>Line total</th>
                      <th className={cn(DOC_TH_CLS, "w-10")}>
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((line, index) => (
                      <tr
                        key={line.id}
                        className="document-row border-t border-slate-100 transition-colors hover:bg-blue-50/40"
                      >
                        <td className="px-2 py-2">
                          <Input
                            aria-label={`Line ${index + 1} description`}
                            value={line.description}
                            onChange={(event) => updateLine(index, { description: event.target.value })}
                            placeholder="PPE gloves, shipping cartons, or replacement parts"
                            className={cn(DOC_CELL_INPUT_CLS, "h-9 min-w-[240px]")}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label={`Line ${index + 1} quantity`}
                            value={line.quantity}
                            onChange={(event) => updateLine(index, { quantity: decimalOnly(event.target.value) })}
                            placeholder="1.00"
                            className={cn(DOC_CELL_INPUT_CLS, "h-9 w-24 text-right font-mono")}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label={`Line ${index + 1} unit price`}
                            value={line.unitPrice}
                            onChange={(event) => updateLine(index, { unitPrice: decimalOnly(event.target.value) })}
                            placeholder="0.00"
                            className={cn(DOC_CELL_INPUT_CLS, "h-9 w-28 text-right font-mono")}
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-semibold text-slate-900">
                          {formatMoney(lineSubtotalMinor(line), form.currency)}
                        </td>
                        <td className="px-1 py-2 text-center">
                          <button
                            type="button"
                            aria-label={`Remove line ${index + 1}`}
                            disabled={form.lines.length === 1}
                            onClick={() => removeLine(index)}
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
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <SectionCard>
            <SectionHead title="Notes" />
            <FieldGroup className="p-4">
              <Field>
                <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Add delivery instructions, approval notes, or a supplier reminder." className="min-h-32" />
              </Field>
            </FieldGroup>
          </SectionCard>

          {/* The summary every other document carries. The dark preview panel
              this replaces restated the number and supplier already filled in
              above it, and put the total in a shape found nowhere else. */}
          <SectionCard className="border-blue-200 shadow-[0_10px_30px_rgba(37,99,235,0.08)]">
            <SectionHead title="Order summary" badge="Calculated" />
            <div className="p-4 pb-0">
              <dl className="text-sm tabular-nums">
                <div className="flex justify-between py-1.5 text-slate-500">
                  <dt>Lines</dt>
                  <dd className="font-semibold text-slate-900">{form.lines.length}</dd>
                </div>
                {form.currency !== baseCurrency && (
                  <div className="flex justify-between py-1.5 text-slate-500">
                    <dt>In {baseCurrency}</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatMoney(baseTotalPreviewMinor, baseCurrency)}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="-mx-4 mt-3 flex items-center justify-between bg-gradient-to-br from-slate-900 to-blue-800 px-4 py-4 text-white">
                <span className="text-[13px] font-bold uppercase tracking-[0.06em]">Order total</span>
                <span className="text-xl font-extrabold tabular-nums">
                  {formatMoney(draftTotalMinor, form.currency)}
                </span>
              </div>
            </div>
          </SectionCard>
        </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" asChild>
              <Link href="/purchases/orders">Cancel</Link>
            </Button>
            <Button onClick={submitOrder} className="gap-2 bg-orange-600 font-semibold text-white hover:bg-orange-700" disabled={saving}>
              <CheckCircle2 className="size-4" />
              {saving ? "Saving..." : order ? "Save changes" : "Create purchase order"}
            </Button>
          </div>
      </div>
    </div>
  );
}
