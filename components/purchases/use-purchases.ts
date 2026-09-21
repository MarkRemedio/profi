"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  approveBillDocument,
  createSupplier,
  getBillWorkspace,
  getPurchaseOrderDocument,
  payBillDocument,
  revertBillToDraftDocument,
  saveBill,
  voidBillDocument,
  type CreateSupplierInput,
} from "@/app/(dashboard)/purchases/actions";
import type { PaymentMethod } from "@/lib/accounting/documents";
import { queryKeys } from "@/lib/query-keys";
import type { ContactSummary } from "@/lib/accounting/documents";
import type { BillWorkspaceData, NewBillInput } from "./purchase-types";


/**
 * A bill's value in the workspace currency. Every tile here sums across bills,
 * so face values in different currencies cannot simply be added.
 */
function toBase(minor: number, rate: number | undefined) {
  return Math.round(minor * (rate ?? 1));
}

export function usePurchases(initialPurchaseOrderId?: string | null) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const workspaceQuery = useQuery({
    queryKey: queryKeys.billWorkspace,
    queryFn: async () => (await getBillWorkspace()) as BillWorkspaceData,
  });

  const purchaseOrderQuery = useQuery({
    queryKey: [...queryKeys.purchaseOrdersWorkspace, "prefill", initialPurchaseOrderId ?? ""] as const,
    queryFn: async () =>
      initialPurchaseOrderId ? await getPurchaseOrderDocument(initialPurchaseOrderId) : null,
    enabled: Boolean(initialPurchaseOrderId),
  });

  const runMutation = async (mutation: () => Promise<unknown>) => {
    setError(null);

    try {
      await mutation();
      await queryClient.invalidateQueries({ queryKey: queryKeys.billWorkspace });
      return true;
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Something went wrong.";
      setError(message);
      toast.error(message);
      return false;
    }
  };

  const saveMutation = useMutation({
    mutationFn: (input: NewBillInput) => saveBill(input),
    onSuccess: () => toast.success("Bill saved as draft."),
  });
  const approveMutation = useMutation({
    mutationFn: (id: string) => approveBillDocument(id),
    onSuccess: () => toast.success("Bill approved and posted."),
  });
  const voidMutation = useMutation({
    mutationFn: (id: string) => voidBillDocument(id),
    onSuccess: () => toast.success("Bill voided."),
  });
  const payMutation = useMutation({
    mutationFn: (input: {
      id: string;
      paymentAccountId?: string;
      paymentMethod?: "cash" | "cheque" | "bank_transfer";
    }) => payBillDocument(input.id, input.paymentAccountId, input.paymentMethod),
    onSuccess: () => toast.success("Bill marked as paid."),
  });
  const bulkPayMutation = useMutation({
    mutationFn: async (
      inputs: Array<{
        id: string;
        paymentAccountId?: string;
        paymentMethod?: PaymentMethod;
      }>
    ) => {
      for (const input of inputs) {
        await payBillDocument(input.id, input.paymentAccountId, input.paymentMethod);
      }
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.length === 1
          ? "1 bill marked as paid."
          : `${variables.length} bills marked as paid.`
      );
    },
  });
  const revertMutation = useMutation({
    mutationFn: (id: string) => revertBillToDraftDocument(id),
    onSuccess: () => toast.success("Bill reverted to draft."),
  });
  const createSupplierMutation = useMutation({
    mutationFn: (input: CreateSupplierInput) => createSupplier(input),
  });

  const addSupplier = async (
    input: CreateSupplierInput
  ): Promise<ContactSummary | null> => {
    setError(null);

    try {
      const supplier = await createSupplierMutation.mutateAsync(input);
      await queryClient.invalidateQueries({ queryKey: queryKeys.billWorkspace });
      return supplier;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Something went wrong."
      );
      return null;
    }
  };

  const data = workspaceQuery.data;
  const bills = data?.bills ?? [];
  const saving =
    saveMutation.isPending ||
    approveMutation.isPending ||
    voidMutation.isPending ||
    payMutation.isPending ||
    bulkPayMutation.isPending ||
    revertMutation.isPending ||
    createSupplierMutation.isPending;
  const queryError =
    workspaceQuery.error instanceof Error ? workspaceQuery.error.message : null;

  const upcomingBills = bills
    .filter((bill) => bill.status === "draft")
    .reduce((sum, bill) => sum + toBase(bill.totalMinor, (bill as any).exchangeRate), 0);
  const totalExpenses = bills
    .filter((bill) => bill.status === "approved")
    .reduce((sum, bill) => sum + toBase(bill.totalMinor, (bill as any).exchangeRate), 0);
  const pendingApprovals = bills.filter((bill) => bill.status === "draft").length;
  const voided = bills
    .filter((bill) => bill.status === "void")
    .reduce((sum, bill) => sum + toBase(bill.totalMinor, (bill as any).exchangeRate), 0);

  return {
    bills,
    contacts: data?.contacts ?? [],
    accounts: data?.accounts ?? [],
    bankAccounts: data?.bankAccounts ?? [],
    taxRates: data?.taxRates ?? [],
    purchaseOrderToConvert: purchaseOrderQuery.data ?? null,
    // Mirrors the column default. Assuming VAT while the workspace loads
    // flashes tax controls at a business that is not registered.
    vatRegistered: data?.vatRegistered ?? false,
    canManage: data?.canManage ?? false,
    loading: workspaceQuery.isPending,
    saving,
    error: error ?? queryError,
    addBill: (input: NewBillInput) =>
      runMutation(() => saveMutation.mutateAsync(input)),
    addSupplier,
    approveBill: (id: string) =>
      runMutation(() => approveMutation.mutateAsync(id)),
    voidBill: (id: string) => runMutation(() => voidMutation.mutateAsync(id)),
    payBill: (
      id: string,
      paymentAccountId?: string,
      paymentMethod?: "cash" | "cheque" | "bank_transfer"
    ) => runMutation(() => payMutation.mutateAsync({ id, paymentAccountId, paymentMethod })),
    payBills: (
      inputs: Array<{
        id: string;
        paymentAccountId?: string;
        paymentMethod?: PaymentMethod;
      }>
    ) => runMutation(() => bulkPayMutation.mutateAsync(inputs)),
    revertBillToDraft: (id: string) =>
      runMutation(() => revertMutation.mutateAsync(id)),
    stats: { upcomingBills, totalExpenses, pendingApprovals, overdue: voided },
  };
}
