"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createSalesReceiptAction,
  getSalesReceiptWorkspace,
  voidSalesReceiptAction,
} from "@/app/(dashboard)/sales/receipts/actions";
import { queryKeys } from "@/lib/query-keys";

import { ReceiptsView } from "./receipts-view";
import type { NewReceiptInput, ReceiptWorkspaceData } from "./receipt-types";

export function SalesReceipts({ initialReceiptId }: { initialReceiptId?: string }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.salesReceiptWorkspace,
    queryFn: () => getSalesReceiptWorkspace(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.salesReceiptWorkspace });

  const createMutation = useMutation({
    mutationFn: (input: NewReceiptInput) => createSalesReceiptAction(input),
    onSuccess: (result) => {
      toast.success(`Sales receipt ${result.documentNo} posted.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidSalesReceiptAction(id),
    onSuccess: (result) => {
      toast.success(`Sales receipt ${result.documentNo} voided.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <ReceiptsView
      title="Sales Receipts"
      description="Record sales paid on the spot — posts straight to the ledger, no invoice needed."
      numberLabel="Receipt #"
      bankFieldLabel="Deposit to"
      showReference={false}
      data={query.data as ReceiptWorkspaceData | undefined}
      isLoading={query.isLoading}
      isCreating={createMutation.isPending}
      onCreate={(input) => createMutation.mutateAsync(input)}
      onVoid={(id) => voidMutation.mutateAsync(id)}
      initialReceiptId={initialReceiptId}
    />
  );
}
