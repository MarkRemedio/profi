"use client";

import { useCurrency } from "@/components/currency-provider";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  approveInvoiceDocument,
  getInvoiceWorkspace,
  saveInvoice,
  voidInvoiceDocument,
  payInvoiceDocument,
  revertInvoiceDocument, // <-- NEW
  bulkPayInvoices,
  createInvoiceBatch,
} from "@/app/(dashboard)/sales/invoices/actions";
import type { InvoiceBatchCreateResult } from "@/lib/accounting/invoice-batch";
import { queryKeys } from "@/lib/query-keys";
import type { Invoice, InvoiceSubmitResult, InvoiceWorkspaceData, NewInvoiceInput } from "./invoice-types";

// Optimistic rows carry this id prefix so the list can render them as
// read-only "saving…" placeholders until the refetched server row replaces them.
const OPTIMISTIC_INVOICE_PREFIX = "optimistic:";
export function isOptimisticInvoice(id: string) {
  return id.startsWith(OPTIMISTIC_INVOICE_PREFIX);
}

function toMinor(value: string | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

// Mirrors CreateInvoiceView's totals maths (which mirrors the server) so the
// placeholder row shows the same figures the saved invoice will.
// Status is deliberately always "draft": approval posts to the ledger, and the
// money tiles derive from statuses in this cache, so an approved/sent status
// must only ever come from the server.
function buildOptimisticInvoice(
  input: any,
  taxRates: InvoiceWorkspaceData["taxRates"],
  // The placeholder shown before the server responds must match the currency
  // the server will actually stamp, or the row visibly flips after saving.
  currency: string
): Invoice {
  const amountsAre = input.amountsAre ?? "exclusive";
  let subtotal = 0;
  let discount = 0;
  let tax = 0;

  const lines = (input.lines ?? []).map((line: any, index: number) => {
    const amountMinor = toMinor(line.amount);
    const discountMinor = toMinor(line.discount);
    const net = amountMinor - discountMinor;
    const rate = taxRates.find((t) => t.code === line.taxCode)?.rate ?? 0;
    let taxMinor = 0;
    if (amountsAre === "exclusive") taxMinor = Math.round((net * rate) / 100);
    else if (amountsAre === "inclusive") taxMinor = Math.round((net * rate) / (100 + rate));
    subtotal += amountMinor;
    discount += discountMinor;
    tax += taxMinor;
    return {
      id: `${OPTIMISTIC_INVOICE_PREFIX}line-${index}`,
      accountId: line.accountId,
      accountCode: "",
      accountName: "",
      description: line.description ?? "",
      amountMinor,
      quantity: line.quantity ?? "1",
      unitPriceMinor: toMinor(line.unitPrice),
      discountMinor,
      subtotalMinor: amountMinor,
      taxCode: line.taxCode,
      taxRate: rate,
      taxMinor,
      totalMinor: amountsAre === "exclusive" ? net + taxMinor : net,
    };
  });

  const net = subtotal - discount;
  return {
    id: `${OPTIMISTIC_INVOICE_PREFIX}${input.documentNo ?? ""}`,
    contactId: input.contactId ?? "",
    contactName: input.contactName ?? "",
    // The authoritative value is joined from the contact when the server row
    // replaces this optimistic placeholder.
    contactRegistrationNumber: null,
    paymentTermsDays: 30,
    invoiceNo: input.documentNo ?? "",
    issueDate: input.issueDate,
    dueDate: input.dueDate || null,
    status: "draft",
    currency: currency as Invoice["currency"],
    // The optimistic row is only shown until the server responds, but it
    // still feeds the summary tiles, so it needs a rate to convert with.
    exchangeRate: input.exchangeRate ?? 1,
    // Stored convention: inclusive subtotals are net of the extracted VAT so
    // subtotal - discount + tax = total holds.
    subtotalMinor: amountsAre === "inclusive" ? subtotal - tax : subtotal,
    discountMinor: discount,
    taxMinor: tax,
    totalMinor: amountsAre === "exclusive" ? net + tax : net,
    // A draft placeholder is never on a report, but the field is part of the
    // row's shape and the aging views read it, so it is converted rather than
    // left at zero.
    baseTotalMinor: Math.round(
      (amountsAre === "exclusive" ? net + tax : net) * (input.exchangeRate ?? 1)
    ),
    baseAmountPaidMinor: 0,
    billingAddress: input.billingAddress ?? null,
    poNumber: input.poNumber ?? null,
    reference: input.reference ?? null,
    servicePeriodUnit: input.servicePeriodUnit ?? null,
    servicePeriodCount: input.servicePeriodCount ?? null,
    servicePeriodStart: input.servicePeriodStart || null,
    servicePeriodEnd: input.servicePeriodEnd || null,
    trackingAssignments: [],
    postedJournalId: null,
    createdAt: new Date().toISOString(),
    amountPaidMinor: 0,
    payments: [],
    attachments: [],
    amountsAre,
    lines,
  } as Invoice;
}


/**
 * A document's value in the workspace currency.
 *
 * Every tile below sums across invoices, so each has to be converted first.
 * totalMinor is the face value in the document's own currency — adding a
 * PHP 412.50 invoice to a GBP total as-is reads as GBP 412.50 when it is
 * really about GBP 5.
 */
function toBase(minor: number, rate: number | undefined) {
  return Math.round(minor * (rate ?? 1));
}

export function useInvoices() {
  const { currency: workspaceCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const workspaceQuery = useQuery({
    queryKey: queryKeys.invoiceWorkspace,
    queryFn: async () => (await getInvoiceWorkspace()) as InvoiceWorkspaceData,
  });

  const runMutation = async (mutation: () => Promise<unknown>) => {
    setError(null);

    try {
      await mutation();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.invoiceWorkspace,
      });
      return true;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Something went wrong."
      );
      return false;
    }
  };

  const saveMutation = useMutation({
    mutationFn: (input: NewInvoiceInput) => saveInvoice(input),
  });
  const approveMutation = useMutation({
    // NEW: Allow the mutation to accept the Cash Sale routing details!
    mutationFn: ({ id, status, isCashSale, depositAccountId }: { id: string; status?: "approved" | "sent", isCashSale?: boolean, depositAccountId?: string | null }) => 
      approveInvoiceDocument(id, status, isCashSale, depositAccountId),
  });
  const voidMutation = useMutation({
    mutationFn: (id: string) => voidInvoiceDocument(id),
  });
  
  // NEW: Process the invoice payment into the ledger (now with partial payment support!)
  const payMutation = useMutation({
    mutationFn: ({
      id,
      amountMinor,
      depositAccountId,
      paymentMethod,
    }: {
      id: string;
      amountMinor?: number;
      depositAccountId?: string;
      paymentMethod?: "cash" | "cheque" | "bank_transfer";
    }) => payInvoiceDocument(id, amountMinor, depositAccountId, paymentMethod),
  });

  const revertMutation = useMutation({
    mutationFn: (id: string) => revertInvoiceDocument(id),
  });

  // NEW: Bulk mark-as-paid — independent per-invoice results (paid/skipped/failed).
  const bulkPayMutation = useMutation({
    mutationFn: ({
      items,
      paymentMethod,
    }: {
      items: { invoiceId: string; amountMinor: number; depositAccountId?: string }[];
      paymentMethod?: "cash" | "cheque" | "bank_transfer";
    }) => bulkPayInvoices(items, paymentMethod),
    onSuccess: () => workspaceQuery.refetch(),
  });
  const createBatchMutation = useMutation({
    mutationFn: (rows: Array<{ rowId: string; input: NewInvoiceInput }>) =>
      createInvoiceBatch(rows),
    onSuccess: () => workspaceQuery.refetch(),
  });

  const data = workspaceQuery.data;
  const invoices = data?.invoices ?? [];
  const saving =
    saveMutation.isPending || 
    approveMutation.isPending || 
    voidMutation.isPending || 
    payMutation.isPending ||
    revertMutation.isPending; // <-- ADD THIS
  const queryError =
    workspaceQuery.error instanceof Error ? workspaceQuery.error.message : null;

  // Receivables = posted (approved/sent) invoices only, net of payments.
  // Drafts aren't posted so they owe nothing yet, and paid invoices keep
  // their approved/sent status with amountPaidMinor recorded against them.
  const totalOutstanding = invoices
    .filter((invoice) => invoice.status === "approved" || invoice.status === "sent")
    .reduce(
      (sum, invoice) =>
        // amountPaidMinor is already in the document's currency, so both sides
        // of this subtraction match before conversion.
        sum +
        Math.max(
          0,
          toBase(invoice.totalMinor - (invoice.amountPaidMinor || 0), invoice.exchangeRate)
        ),
      0
    );

  // Posted Sales is what actually hit the ledger as income: the VAT portion
  // is a liability owed to HMRC, not sales, so it's excluded.
  const approved = invoices
    .filter((invoice) => invoice.status === "approved" || invoice.status === "sent")
    .reduce((sum, invoice) => sum + toBase(invoice.totalMinor - (invoice.taxMinor || 0), invoice.exchangeRate), 0);
    
  const draft = invoices
    .filter((invoice) => invoice.status === "draft")
    .reduce((sum, invoice) => sum + toBase(invoice.totalMinor, invoice.exchangeRate), 0);
  const total = invoices
    .filter((invoice) => invoice.status !== "void")
    .reduce((sum, invoice) => sum + toBase(invoice.totalMinor, invoice.exchangeRate), 0);
  const approvedPct = total > 0 ? Math.round((approved / total) * 100) : 0;

  // Save for the create/edit view: a placeholder row lands in the cache
  // immediately so the list behind the form updates without waiting, but the
  // returned promise resolves only once the server has actually saved (and,
  // when asked, approved). Resolving early looked faster, but it told the
  // caller "saved" about an invoice that could still fail — and made
  // follow-ups like emailing race a row that did not exist yet.
  const submitInvoice = (input: any, existingId?: string): Promise<InvoiceSubmitResult> => {
    setError(null);
    const isApproving = input.status === "approved" || input.status === "sent";

    const run = async (): Promise<InvoiceSubmitResult> => {
      await queryClient.cancelQueries({ queryKey: queryKeys.invoiceWorkspace });
      const previous = queryClient.getQueryData<InvoiceWorkspaceData>(
        queryKeys.invoiceWorkspace
      );
      if (previous) {
        const optimistic = buildOptimisticInvoice(input, previous.taxRates, workspaceCurrency);
        const nextInvoices = existingId
          ? previous.invoices.map((item) =>
              item.id === existingId
                ? {
                    ...optimistic,
                    id: existingId,
                    createdAt: item.createdAt,
                    paymentTermsDays: item.paymentTermsDays,
                  }
                : item
            )
          : [optimistic, ...previous.invoices];
        queryClient.setQueryData(queryKeys.invoiceWorkspace, {
          ...previous,
          invoices: nextInvoices,
        });
      }

      try {
        const saved = (await saveMutation.mutateAsync(
          existingId ? { ...input, id: existingId } : input
        )) as any;
        const invoiceId =
          existingId ?? (typeof saved === "string" ? saved : saved?.id);

        if (isApproving && invoiceId) {
          try {
            await approveMutation.mutateAsync({
              id: invoiceId,
              status: input.status,
              isCashSale: input.isCashSale,
              depositAccountId: input.depositAccountId,
            });
          } catch (approveError) {
            // The draft made it to the server — don't roll it back, just
            // surface why it isn't approved/sent.
            const message =
              approveError instanceof Error
                ? approveError.message
                : "Something went wrong.";
            setError(message);
            toast.error("Invoice saved as a draft, but approval failed", {
              description: message,
            });
            return { success: true, id: invoiceId, approved: false };
          }
        }
        return { success: true, id: invoiceId, approved: isApproving };
      } catch (saveError) {
        if (previous) {
          queryClient.setQueryData(queryKeys.invoiceWorkspace, previous);
        }
        const message =
          saveError instanceof Error ? saveError.message : "Something went wrong.";
        setError(message);
        toast.error(
          existingId ? "Invoice changes could not be saved" : "Invoice could not be saved",
          { description: message }
        );
        return { success: false };
      } finally {
        // Not awaited by the caller: the refetch swaps the placeholder for
        // the real server row whenever it lands.
        queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
      }
    };

    return run();
  };

  const validateInvoiceForApproval = (id: string) => {
    const invoice = invoices.find((item) => item.id === id);
    if (!invoice) return "Invoice is not available.";
    if (invoice.totalMinor <= 0) {
      return `Invoice ${invoice.invoiceNo} has a zero total. Edit the draft and add a positive line amount before approving.`;
    }
    const invalidLine = invoice.lines.find((line) => line.amountMinor <= 0);
    if (invalidLine) {
      return `Invoice ${invoice.invoiceNo} has an invalid line amount${
        invalidLine.description ? ` for "${invalidLine.description}"` : ""
      }. Edit the draft and save a positive amount before approving.`;
    }
    return null;
  };

  return {
    invoices,
    contacts: data?.contacts ?? [],
    accounts: data?.accounts ?? [],
    bankAccounts: data?.bankAccounts ?? [],
    taxRates: data?.taxRates ?? [],
    chargeItems: data?.chargeItems ?? [],
    trackingSettings: data?.trackingSettings ?? { enabled: false, dimensions: [] },
    // Mirrors the column default. Assuming VAT while the workspace loads
    // flashes tax controls at a business that is not registered.
    vatRegistered: data?.vatRegistered ?? false,
    canManage: data?.canManage ?? false,
    loading: workspaceQuery.isPending,
    saving,
    error: error ?? queryError,
    // 1. FOR CREATING NEW INVOICES & COPIED DRAFTS (the list shows an
    //    optimistic placeholder immediately; the promise resolves with the
    //    real outcome — and the saved invoice's id — once the server confirms)
    addInvoice: (input: any) => submitInvoice(input),

    // 2. FOR EDITING EXISTING DRAFTS (same optimistic flow, patching in place)
    updateInvoice: (id: string, input: any) => submitInvoice(input, id),
    approveInvoice: (id: string) => {
      const validationError = validateInvoiceForApproval(id);
      if (validationError) {
        setError(validationError);
        return Promise.resolve(false);
      }

      return runMutation(() => approveMutation.mutateAsync({ id }));
    },
    voidInvoice: (id: string) => runMutation(() => voidMutation.mutateAsync(id)),
    payInvoice: (
      id: string,
      amountMinor?: number,
      depositAccountId?: string,
      paymentMethod?: "cash" | "cheque" | "bank_transfer"
    ) =>
      runMutation(() =>
        payMutation.mutateAsync({ id, amountMinor, depositAccountId, paymentMethod })
      ),
    revertInvoice: (id: string) => runMutation(() => revertMutation.mutateAsync(id)), // <-- NEW
    bulkMarkPaid: (
      items: { invoiceId: string; amountMinor: number; depositAccountId?: string }[],
      paymentMethod?: "cash" | "cheque" | "bank_transfer"
    ) => bulkPayMutation.mutateAsync({ items, paymentMethod }),
    bulkPaying: bulkPayMutation.isPending,
    createBatch: (
      rows: Array<{ rowId: string; input: NewInvoiceInput }>
    ): Promise<InvoiceBatchCreateResult[]> => createBatchMutation.mutateAsync(rows),
    creatingBatch: createBatchMutation.isPending,
    /**
     * Re-reads the workspace.
     *
     * The mutations here refetch on their own, but actions called directly from
     * a component — bulk approve, for one — leave this cache holding rows the
     * server has already changed.
     */
    refresh: () => workspaceQuery.refetch(),
    stats: {
      totalOutstanding,
      approved,
      draft,
      approvedPct,
      avgDaysToPay: null,
    },
  };
}
