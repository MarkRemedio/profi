"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createRefundReceiptAction,
  getRefundReceiptWorkspace,
  voidRefundReceiptAction,
} from "@/app/(dashboard)/sales/refund-receipts/actions";
import { queryKeys } from "@/lib/query-keys";

import { ReceiptsView } from "./receipts-view";
import type { NewReceiptInput, ReceiptWorkspaceData } from "./receipt-types";

export function RefundReceipts() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.refundReceiptWorkspace,
    queryFn: () => getRefundReceiptWorkspace(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.refundReceiptWorkspace });

  const createMutation = useMutation({
    mutationFn: (input: NewReceiptInput) => createRefundReceiptAction(input),
    onSuccess: (result) => {
      toast.success(`Refund receipt ${result.documentNo} posted.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidRefundReceiptAction(id),
    onSuccess: (result) => {
      toast.success(`Refund receipt ${result.documentNo} voided.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <ReceiptsView
      title="Refund Receipts"
      description="Record money refunded to customers straight out of a bank or cash account."
      numberLabel="Refund #"
      bankFieldLabel="Refund from"
      showReference
      data={query.data as ReceiptWorkspaceData | undefined}
      isLoading={query.isLoading}
      isCreating={createMutation.isPending}
      onCreate={(input) => createMutation.mutateAsync(input)}
      onVoid={(id) => voidMutation.mutateAsync(id)}
    />
  );
}
