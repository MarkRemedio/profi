"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as actions from "@/app/(dashboard)/banking/actions";
import { INLINE_UPLOAD_LIMIT_BYTES } from "@/lib/banking/statement-storage";
import { uploadStatementToStorage } from "@/lib/banking/statement-upload";
import type { ImportedStatementRowUpdate } from "@/lib/banking/types";
import type { AiDocumentKind } from "@/lib/banking/types";

// ---------------------------------------------------------------------
// Re-export all shared types from lib/banking/types
// ---------------------------------------------------------------------

export type {
  BankAccount,
  CreateBankAccountInput,
  UpdateBankAccountInput,
  DashboardSummary,
  StatementImportPreview,
  FeedTransaction,
  FeedTransactionPage,
  ImportedStatement,
  ImportedStatementPage,
  ImportedStatementRowUpdate,
  ConfirmStatementResponse,
  AiMatchResult,
  BulkAcceptMatchesResult,
  AiDocumentKind,
  AiDocumentProposal,
  JournalCandidate,
  ReconciliationAnalysis,
  AccountBalance,
  ExpenseAccount,
  CategoryAccount,
  CategoryAllocation,
  Contact,
} from "@/lib/banking/types";

export type { ParsedTransaction } from "@/lib/banking/statement-parser";
export type { TrueLayerBankFeedStatus } from "@/lib/banking/truelayer-connection";
export type { TrueLayerAvailableAccount } from "@/lib/banking/truelayer-connection";

// ---------------------------------------------------------------------
// Query keys — preserved so React Query cache invalidation lines up.
// ---------------------------------------------------------------------

export const bankingKeys = {
  all: ["banking"] as const,
  accounts: () => [...bankingKeys.all, "accounts"] as const,
  dashboardSummary: () => [...bankingKeys.all, "dashboard-summary"] as const,
};

export const feedKeys = {
  all: (orgFilter?: string) => [...bankingKeys.all, "feed", orgFilter] as const,
};

// ---------------------------------------------------------------------
// Bank Account Hooks
// ---------------------------------------------------------------------

export function useBankAccounts() {
  return useQuery({
    queryKey: bankingKeys.accounts(),
    queryFn: () => actions.listBankAccounts(),
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof actions.createBankAccount>[0]) =>
      actions.createBankAccount(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankingKeys.accounts() });
      queryClient.invalidateQueries({ queryKey: bankingKeys.dashboardSummary() });
    },
  });
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof actions.updateBankAccount>[1];
    }) => actions.updateBankAccount(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankingKeys.accounts() });
      queryClient.invalidateQueries({ queryKey: bankingKeys.dashboardSummary() });
    },
  });
}

export function useDeleteBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => actions.deleteBankAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankingKeys.accounts() });
      queryClient.invalidateQueries({ queryKey: bankingKeys.dashboardSummary() });
    },
  });
}

export function useTrueLayerBankFeedStatuses() {
  return useQuery({
    queryKey: [...bankingKeys.all, "truelayer-connections"] as const,
    queryFn: () => actions.listTrueLayerBankFeedStatusesAction(),
  });
}
export function useTrueLayerAvailableAccounts(connectionId: string | null) {
  return useQuery({
    queryKey: [...bankingKeys.all, "truelayer", "available", connectionId],
    queryFn: () => actions.listTrueLayerAvailableAccountsAction(connectionId!),
    enabled: Boolean(connectionId),
  });
}
export function useCompleteTrueLayerAccountSelection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { connectionId: string; providerAccountIds: string[] }) =>
      actions.completeTrueLayerAccountSelectionAction(input.connectionId, input.providerAccountIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankingKeys.all }),
  });
}
export function useCancelTrueLayerAccountSelection() {
  return useMutation({
    mutationFn: (connectionId: string) => actions.cancelTrueLayerAccountSelectionAction(connectionId),
  });
}

export function useSyncTrueLayerBankFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => actions.syncTrueLayerBankFeedAction(connectionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankingKeys.all }),
  });
}

export function useSetTrueLayerBankFeedSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bankAccountId, enabled }: { bankAccountId: string; enabled: boolean }) =>
      actions.setTrueLayerBankFeedSyncAction(bankAccountId, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankingKeys.all }),
  });
}

export function useDisconnectTrueLayerBankFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bankAccountId: string) => actions.disconnectTrueLayerBankFeedAction(bankAccountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankingKeys.all }),
  });
}

// ---------------------------------------------------------------------
// Dashboard Summary Hook
// ---------------------------------------------------------------------

export function useDashboardSummary() {
  return useQuery({
    queryKey: bankingKeys.dashboardSummary(),
    queryFn: () => actions.getDashboardSummary(),
  });
}

// ---------------------------------------------------------------------
// Statement Import
// ---------------------------------------------------------------------

export type StatementImportPhase = "uploading" | "parsing";

export async function importStatement(
  file: File,
  bankAccountId: string,
  allowUnverified = false,
  /** Called as the import crosses from sending bytes to reading them. */
  onPhase?: (phase: StatementImportPhase) => void,
) {
  const fd = new FormData();
  fd.append("bank_account_id", bankAccountId);
  fd.append("filename", file.name);
  if (allowUnverified) fd.append("allow_unverified", "true");

  // Files that would breach Vercel's 4.5 MB request-body cap go to storage
  // first; only the path travels through the Server Action. Smaller files keep
  // the direct route so the common case costs no extra round trip.
  if (file.size >= INLINE_UPLOAD_LIMIT_BYTES) {
    onPhase?.("uploading");
    fd.append("storage_path", await uploadStatementToStorage(file, bankAccountId));
  } else {
    fd.append("file", file);
  }

  onPhase?.("parsing");
  return actions.importStatement(fd);
}

export async function confirmStatementImport(
  bankAccountId: string,
  transactions: import("@/lib/banking/statement-parser").ParsedTransaction[],
) {
  return actions.confirmStatementImport(bankAccountId, transactions);
}

export async function checkStatementDuplicates(
  bankAccountId: string,
  transactions: import("@/lib/banking/statement-parser").ParsedTransaction[],
) {
  return actions.checkStatementDuplicates(bankAccountId, transactions);
}

// ---------------------------------------------------------------------
// Feed Transactions
// ---------------------------------------------------------------------

export function useFeedTransactions(bankAccountId?: string, search?: string) {
  return useQuery({
    queryKey: [...feedKeys.all(), bankAccountId, search],
    queryFn: () => actions.listFeedTransactions({ bankAccountId, search }),
  });
}

export function useFeedTransactionPage(
  page: number,
  pageSize: number,
  bankAccountId?: string,
  search?: string,
  reconcileStatus?: import("@/lib/banking/types").FeedTransaction["reconcile_status"],
) {
  return useQuery({
    queryKey: [...feedKeys.all(), "page", page, pageSize, bankAccountId, search, reconcileStatus],
    queryFn: () =>
      actions.getFeedTransactionPage({ bankAccountId, search, reconcileStatus, page, pageSize }),
  });
}

export function useImportedStatements(enabled = true) {
  return useQuery({
    queryKey: [...bankingKeys.all, "imported-statements"] as const,
    queryFn: () => actions.listImportedStatements(),
    enabled,
  });
}

export function useImportedStatementPage(
  importedStatementId: string | null,
  page: number,
  search: string,
) {
  return useQuery({
    queryKey: [...bankingKeys.all, "imported-statement", importedStatementId, page, search] as const,
    queryFn: () => actions.getImportedStatementPage(importedStatementId!, { page, pageSize: 50, search }),
    enabled: Boolean(importedStatementId),
    placeholderData: (previous) => previous,
  });
}

export function useUpdateImportedStatementRows() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ importedStatementId, updates }: { importedStatementId: string; updates: ImportedStatementRowUpdate[] }) =>
      actions.updateImportedStatementRows(importedStatementId, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankingKeys.all }),
  });
}

export function useBulkDeleteFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => actions.bulkDeleteFeed(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
    },
  });
}

export function useBulkDeleteAllFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      search?: string;
      reconcileStatus?: import("@/lib/banking/types").FeedTransaction["reconcile_status"];
    }) => actions.bulkDeleteAllFeed(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankingKeys.all }),
  });
}

export function useBulkAcceptSuggestedMatches() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids?: string[]; minConfidence?: number } = {}) =>
      actions.bulkAcceptSuggestedMatches(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
    },
  });
}

export function useReconcileFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ txId, journalId }: { txId: string; journalId: string }) =>
      actions.reconcileFeed(txId, journalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
    },
  });
}

export function useUnreconcileFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (txId: string) => actions.unreconcileFeed(txId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
    },
  });
}

export function useRecordFeedTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      txId,
      input,
    }: {
      txId: string;
      input: {
        category_account_id?: string;
        expense_account_id?: string;
        contact_id?: string | null;
        memo?: string;
      };
    }) => actions.recordFeedTransaction(txId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
    },
  });
}

export function useRecordStatementReviewRows() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      items: Array<{ txId: string; categoryAccountId?: string }>;
      scopeUpdates?: Array<{ txId: string; scope: import("@/lib/banking/types").FeedTransaction["transaction_scope"] }>;
    }) => actions.recordStatementReviewRows(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankingKeys.all }),
  });
}

export function useReconciliationReview() {
  return useQuery({
    queryKey: [...bankingKeys.all, "reconciliation-review"] as const,
    queryFn: () => actions.getReconciliationReview(),
    enabled: false,
    staleTime: 30_000,
  });
}

export function useCategorizationAccounts() {
  return useQuery({
    queryKey: [...bankingKeys.all, "categorization-accounts"] as const,
    queryFn: () => actions.listCategorizationAccounts(),
  });
}

export function useCategorizeFeedTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ txId, accountId }: { txId: string; accountId: string | null }) =>
      actions.categorizeFeedTransaction(txId, accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankingKeys.all }),
  });
}

export function useSetFeedTransactionScope() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ txId, scope }: { txId: string; scope: import("@/lib/banking/types").FeedTransaction["transaction_scope"] }) =>
      actions.setFeedTransactionScope(txId, scope),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankingKeys.all }),
  });
}

export function useRejectAiSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (txId: string) => actions.rejectAiSuggestion(txId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
    },
  });
}

export function useAiDocumentProposal(txId: string | null) {
  return useQuery({
    queryKey: [...bankingKeys.all, "ai-document-proposal", txId] as const,
    queryFn: () => actions.getAiDocumentProposal(txId!),
    enabled: Boolean(txId),
    retry: false,
  });
}

export function useReconciliationAnalysis(txId: string | null) {
  return useQuery({
    queryKey: [...bankingKeys.all, "reconciliation-analysis", txId] as const,
    queryFn: () => actions.getReconciliationAnalysis(txId!),
    enabled: Boolean(txId),
    retry: false,
    staleTime: 60_000,
  });
}

export function useMarkAiReconciliationReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (txId: string) => actions.markAiReconciliationReviewed(txId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankingKeys.all }),
  });
}

export function useConfirmAiDocumentProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { txId: string }) =>
      actions.confirmAiDocumentProposal(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bankingKeys.all }),
  });
}

// ---------------------------------------------------------------------
// Plain reconcile wrapper (for imperative calls outside useMutation)
// ---------------------------------------------------------------------

export async function reconcileFeed(txId: string, journalId: string) {
  return actions.reconcileFeed(txId, journalId);
}

// ---------------------------------------------------------------------
// Account transactions (journal lines for a chart account)
// ---------------------------------------------------------------------

export async function getAccountTransactions(chartAccountId: string) {
  return actions.getAccountTransactions(chartAccountId);
}

// ---------------------------------------------------------------------
// AI Matching
// ---------------------------------------------------------------------

export async function runAiMatch() {
  return actions.runAiMatch();
}

// ---------------------------------------------------------------------
// Find & Match
// ---------------------------------------------------------------------

export async function findJournalCandidates(txId: string) {
  return actions.getFeedCandidates(txId);
}

// ---------------------------------------------------------------------
// Opening / Closing Balances
// ---------------------------------------------------------------------

export async function getOpeningClosingBalances() {
  return actions.getOpeningClosingBalances();
}

export async function setOpeningBalance(accountId: string, openingBalanceMinor: number) {
  return actions.setOpeningBalance(accountId, openingBalanceMinor);
}

// ---------------------------------------------------------------------
// Transfer / Received / Paid
// ---------------------------------------------------------------------

// ---- Lookup hooks ----

export function useExpenseAccounts() {
  return useQuery({
    queryKey: [...bankingKeys.all, "expense-accounts"] as const,
    queryFn: () => actions.listExpenseAccounts(),
  });
}

export function useContacts(type: "customer" | "supplier" | "both" = "both") {
  return useQuery({
    queryKey: [...bankingKeys.all, "contacts", type] as const,
    queryFn: () => actions.listContacts(type),
  });
}

// ---- Mutation hooks ----

function invalidateMoneyViews(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: bankingKeys.all });
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof actions.createTransfer>[0]) =>
      actions.createTransfer(input),
    onSuccess: () => invalidateMoneyViews(queryClient),
  });
}

export function useCreateReceivedPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof actions.createReceivedPayment>[0]) =>
      actions.createReceivedPayment(input),
    onSuccess: () => invalidateMoneyViews(queryClient),
  });
}

export function useCreatePaidExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof actions.createPaidExpense>[0]) =>
      actions.createPaidExpense(input),
    onSuccess: () => invalidateMoneyViews(queryClient),
  });
}
