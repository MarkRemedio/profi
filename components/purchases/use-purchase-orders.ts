"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  deletePurchaseOrderDocument,
  getPurchaseOrderWorkspace,
  savePurchaseOrderDocument,
  updatePurchaseOrderStatusDocument,
} from "@/app/(dashboard)/purchases/actions";
import { queryKeys } from "@/lib/query-keys";
import type {
  PurchaseOrderDraftInput,
  PurchaseOrderDto,
  PurchaseOrderStatus,
} from "@/lib/accounting/purchase-orders";

type PurchaseOrdersWorkspaceData = {
  orders: PurchaseOrderDto[];
  contacts: Array<{ id: string; name: string; email?: string | null; contactType: string }>;
  baseCurrency: string;
  canManage: boolean;
};

export function usePurchaseOrders() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const workspaceQuery = useQuery({
    queryKey: queryKeys.purchaseOrdersWorkspace,
    queryFn: async () => (await getPurchaseOrderWorkspace()) as PurchaseOrdersWorkspaceData,
  });

  const runMutation = async <T,>(mutation: () => Promise<T>) => {
    setError(null);

    try {
      const result = await mutation();
      await queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrdersWorkspace });
      return result;
    } catch (mutationError) {
      const message =
        mutationError instanceof Error ? mutationError.message : "Something went wrong.";
      setError(message);
      toast.error(message);
      return null;
    }
  };

  const saveMutation = useMutation({
    mutationFn: (input: PurchaseOrderDraftInput) => savePurchaseOrderDocument(input),
    onSuccess: () => toast.success("Purchase order saved."),
  });

  const deleteMutation = useMutation({
    mutationFn: (orderId: string) => deletePurchaseOrderDocument(orderId),
    onSuccess: () => toast.success("Purchase order deleted."),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { orderId: string; status: PurchaseOrderStatus }) =>
      updatePurchaseOrderStatusDocument(input.orderId, input.status),
    onSuccess: (_, variables) => {
      toast.success(`Purchase order marked as ${variables.status.replace(/_/g, " ")}.`);
    },
  });

  const data = workspaceQuery.data;

  return {
    orders: data?.orders ?? [],
    contacts: data?.contacts ?? [],
    baseCurrency: data?.baseCurrency ?? "GBP", // currency:allow last-resort default while the workspace query is still pending
    canManage: data?.canManage ?? false,
    loading: workspaceQuery.isPending,
    saving: saveMutation.isPending || deleteMutation.isPending || statusMutation.isPending,
    error: error ?? (workspaceQuery.error instanceof Error ? workspaceQuery.error.message : null),
    saveOrder: (input: PurchaseOrderDraftInput) =>
      runMutation(() => saveMutation.mutateAsync(input)),
    deleteOrder: (orderId: string) => runMutation(() => deleteMutation.mutateAsync(orderId)),
    setOrderStatus: (orderId: string, status: PurchaseOrderStatus) =>
      runMutation(() => statusMutation.mutateAsync({ orderId, status })),
  };
}
