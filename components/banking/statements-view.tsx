"use client";
import { createPortal } from "react-dom";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Upload,
  Download,
  FileText,
  Search,
  Trash2,
  CheckCircle2,
  Sparkles,
  Loader2,
  X,
  FileUp,
  AlertCircle,
  Building2,
  Table2,
} from "lucide-react";

import {
  useBankAccounts,
  useFeedTransactions,
  useFeedTransactionPage,
  useBulkDeleteFeed,
  useBulkDeleteAllFeed,
  useReconciliationReview,
  useBulkAcceptSuggestedMatches,
  useReconcileFeed,
  useRejectAiSuggestion,
  useUnreconcileFeed,
  importStatement,
  confirmStatementImport,
  runAiMatch,
  findJournalCandidates,
  bankingKeys,
  reconcileFeed,
  type FeedTransaction,
  type StatementImportPreview,
  type JournalCandidate,
} from "@/lib/banking/api";
import { useQueryClient } from "@tanstack/react-query";
import { ImportStatementModal } from "./import-statement-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { WindowedPager } from "@/components/ui/windowed-pager";
import { formatMoney } from "@/lib/currency";
import { useCurrency } from "@/components/currency-provider";
import { TransactionCategorySelect } from "./transaction-category-select";
import { StatementReconciliationReviewDialog } from "./statement-reconciliation-review-dialog";
import { StatementSpreadsheetDialog } from "./statement-spreadsheet-dialog";
import { TransactionScopeSelect } from "./transaction-scope-select";
import { AiDocumentProposalDialog } from "./ai-document-proposal-dialog";
import { ReconciliationAnalysisDialog } from "./reconciliation-analysis-dialog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// Statement lines belong to a bank account, which carries its own currency —
// a business may hold a dollar account alongside a pound one. Callers pass it;
// the shared registry covers every supported currency, where the hardcoded
// pound sign this replaced was simply wrong for any other.
function formatMinor(n: number, currency?: string | null) {
  return n > 0 ? formatMoney(n, currency) : "—";
}

function FindAndMatchModal({ tx, onClose }: { tx: FeedTransaction; onClose: () => void }) {
  // The statement line is in its bank account's currency; the journals offered
  // as matches are posted in the workspace's. Both are on screen together, so
  // each is labelled with the currency it is actually in.
  const { currency: baseCurrency } = useCurrency();
  const [candidates, setCandidates] = useState<JournalCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    findJournalCandidates(tx.id)
      .then(setCandidates)
      .catch(() => setError("Failed to load candidates."))
      .finally(() => setLoading(false));
  }, [tx.id]);

  const handleReconcile = async (journalId: string) => {
    setReconciling(journalId);
    try {
      await reconcileFeed(tx.id, journalId);
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reconcile.");
    } finally {
      setReconciling(null);
    }
  };

  const txAmount = tx.credit_minor > 0 ? tx.credit_minor : tx.debit_minor;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-950">Find & Match</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[320px]">
              {tx.description} · {formatMinor(txAmount, tx.currency)} ·{" "}
              {new Date(tx.transaction_date).toLocaleDateString("en-GB")}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex-1 min-w-0">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="mt-1.5 h-3 w-28" />
                  </div>
                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-7 w-16 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

          {!loading && !error && candidates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="size-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-600">
                No journal candidates found
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Post a journal entry first, then try matching again.
              </p>
            </div>
          )}

          {!loading && candidates.length > 0 && (
            <div className="flex flex-col gap-2">
              {candidates.map((c) => {
                const amount = c.debit_minor > 0 ? c.debit_minor : c.credit_minor;
                const isExact = amount === txAmount;
                return (
                  <div
                    key={c.journal_id}
                    className={`flex items-center justify-between rounded-xl border p-3 ${
                      isExact ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {c.memo || "—"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(c.journal_date).toLocaleDateString("en-GB")} ·{" "}
                        {c.bank_account_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      <span
                        className={`text-sm font-bold ${
                          isExact ? "text-green-700" : "text-slate-700"
                        }`}
                      >
                        {formatMinor(amount, baseCurrency)}
                      </span>
                      <button
                        onClick={() => handleReconcile(c.journal_id)}
                        disabled={!!reconciling}
                        className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {reconciling === c.journal_id && (
                          <Loader2 className="size-3 animate-spin" />
                        )}
                        Match
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// Feed row
// ─────────────────────────────────────────────

function FeedRow({
  tx,
  selected,
  onToggle,
}: {
  tx: FeedTransaction;
  selected: boolean;
  onToggle: () => void;
}) {
  const isReconciled = tx.reconcile_status === "reconciled";
  const [showFindMatch, setShowFindMatch] = useState(false);
  const [showDocumentProposal, setShowDocumentProposal] = useState(false);
  const [showReconciliationAnalysis, setShowReconciliationAnalysis] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const reconcile = useReconcileFeed();
  const reject = useRejectAiSuggestion();
  const unreconcile = useUnreconcileFeed();

  const handleReconcile = async () => {
    if (!tx.matched_journal_id) {
      setShowFindMatch(true);
      return;
    }
    setRowError(null);
    try {
      await reconcile.mutateAsync({ txId: tx.id, journalId: tx.matched_journal_id });
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Failed to reconcile.");
    }
  };

  const handleReject = async () => {
    setRowError(null);
    try {
      await reject.mutateAsync(tx.id);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Failed to dismiss suggestion.");
    }
  };

  const handleUnreconcile = async () => {
    if (!confirm("Undo this reconciliation? The statement line will return to unmatched.")) return;
    setRowError(null);
    try {
      await unreconcile.mutateAsync(tx.id);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Failed to unreconcile.");
    }
  };

  const statusBadge = () => {
    if (isReconciled) {
      const needsAiReview = tx.ai_review_status === "needs_review";
      return (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-green-700">
            <CheckCircle2 className="size-4" /> Reconciled
          </div>
          {needsAiReview ? <span title="AI created the supporting record from the bank description. Check the contact, category, VAT treatment, and document type." className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800"><AlertCircle className="size-3" /> AI-created — review</span> : null}
          <button
            onClick={handleUnreconcile}
            disabled={unreconcile.isPending}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600 hover:underline disabled:opacity-40"
          >
            Undo
          </button>
        </div>
      );
    }
    if (tx.reconcile_status === "ai_suggested" && tx.ai_match_label) {
      return (
        <div className="flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50 px-2 py-1">
          <Sparkles className="size-3.5 text-purple-600" />
          <span className="text-xs font-semibold text-purple-800">Match: {tx.ai_match_label}</span>
          <button
            onClick={handleReconcile}
            disabled={reconcile.isPending}
            className="ml-auto text-xs font-bold text-blue-600 hover:underline disabled:opacity-40"
          >
            {reconcile.isPending ? "Saving..." : "Reconcile"}
          </button>
          <button
            onClick={handleReject}
            disabled={reject.isPending}
            title="Not a match"
            className="text-slate-400 hover:text-red-600 disabled:opacity-40"
          >
            <X className="size-3.5" />
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowFindMatch(true)}
          className="text-xs font-semibold text-red-500 hover:text-red-700 hover:underline underline-offset-2"
        >
          Find &amp; Match
        </button>
        {tx.transaction_scope === "company" && ["unmatched", "ai_suggested"].includes(tx.reconcile_status) ? <button onClick={() => setShowDocumentProposal(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-800 hover:underline"><Sparkles className="size-3" /> Create record</button> : null}
      </div>
    );
  };

  return (
    <>
      <tr className={`hover:bg-slate-50 ${isReconciled ? "opacity-60" : ""}`}>
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            disabled={isReconciled}
            className="rounded border-slate-300"
          />
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
          {new Date(tx.transaction_date).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </td>
        <td className="max-w-[340px] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" disabled={!isReconciled} onClick={() => setShowReconciliationAnalysis(true)} title={isReconciled ? "View reconciliation analysis" : undefined} className="min-w-0 flex-1 truncate text-left font-medium text-slate-900 enabled:hover:text-blue-700 enabled:hover:underline enabled:underline-offset-2 disabled:cursor-default">
              {tx.description}
            </button>
            <TransactionCategorySelect transaction={tx} className="w-40 shrink-0" />
          </div>
        </td>
        <td className="px-4 py-3">
          <TransactionScopeSelect transaction={tx} />
        </td>
        <td className="px-4 py-3 text-right font-bold text-slate-900">
          {formatMinor(tx.debit_minor, tx.currency)}
        </td>
        <td className="px-4 py-3 text-right font-bold text-green-600">
          {formatMinor(tx.credit_minor, tx.currency)}
        </td>
        <td className="px-4 py-3">
          {statusBadge()}
          {rowError && (
            <p className="mt-1 max-w-[260px] text-[11px] font-medium text-red-600">{rowError}</p>
          )}
        </td>
      </tr>

      {showFindMatch && <FindAndMatchModal tx={tx} onClose={() => setShowFindMatch(false)} />}
      {showDocumentProposal && <AiDocumentProposalDialog transaction={tx} onClose={() => setShowDocumentProposal(false)} />}
      {showReconciliationAnalysis && <ReconciliationAnalysisDialog transaction={tx} onClose={() => setShowReconciliationAnalysis(false)} />}
    </>
  );
}

// ─────────────────────────────────────────────
// Feed table (full page version — no xl:col-span-2 constraint)
// ─────────────────────────────────────────────

function StatementsFeedTable({
  statusFilter,
  onStatusFilterChange,
}: {
  statusFilter: "all" | FeedTransaction["reconcile_status"];
  onStatusFilterChange: (status: "all" | FeedTransaction["reconcile_status"]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<"selected" | "all" | null>(null);
  const PAGE_SIZE = 15;
  const HIGH_CONFIDENCE = 90;

  const { data: feedPage, isLoading } = useFeedTransactionPage(
    page,
    PAGE_SIZE,
    undefined,
    search,
    statusFilter === "all" ? undefined : statusFilter,
  );
  const transactions = feedPage?.transactions;
  const bulkDelete = useBulkDeleteFeed();
  const bulkDeleteAll = useBulkDeleteAllFeed();
  const bulkAccept = useBulkAcceptSuggestedMatches();
  const rejectSuggestion = useRejectAiSuggestion();

  const handleSearch = (val: string) => {
    setSearch(val);
    setSelected(new Set());
    setPage(1);
  };
  const handleStatusChange = (status: "all" | FeedTransaction["reconcile_status"]) => {
    onStatusFilterChange(status);
    setSelected(new Set());
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil((feedPage?.total ?? 0) / PAGE_SIZE));
  const paginated = useMemo(() => transactions ?? [], [transactions]);
  const suggested = useMemo(
    () =>
      (transactions ?? []).filter(
        (t) => t.reconcile_status === "ai_suggested" && t.matched_journal_id,
      ),
    [transactions],
  );
  const highConfidenceSuggested = useMemo(
    () => suggested.filter((t) => (t.ai_match_confidence ?? 0) >= HIGH_CONFIDENCE),
    [suggested],
  );
  const selectedSuggested = useMemo(
    () => suggested.filter((t) => selected.has(t.id)),
    [selected, suggested],
  );
  const selectedDeletable = useMemo(
    () =>
      (transactions ?? []).filter((t) => selected.has(t.id) && t.reconcile_status !== "reconciled"),
    [selected, transactions],
  );
  const firstSuggestedOnPage = useMemo(
    () => paginated.find((t) => t.reconcile_status === "ai_suggested" && t.matched_journal_id),
    [paginated],
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectable = (transactions ?? []).filter((t) => t.reconcile_status !== "reconciled");

  const toggleAll = () => {
    if (selectable.length === 0) return;
    setSelected(
      selected.size === selectable.length ? new Set() : new Set(selectable.map((t) => t.id)),
    );
  };

  const allDeletableCount = Math.max(0, (feedPage?.total ?? 0) - (feedPage?.reconciled ?? 0));

  const confirmBulkDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = deleteTarget === "all"
        ? await bulkDeleteAll.mutateAsync({ search: search.trim() || undefined, reconcileStatus: statusFilter === "all" ? undefined : statusFilter })
        : await bulkDelete.mutateAsync(selectedDeletable.map((t) => t.id));
      setSelected(new Set());
      setPage(1);
      setDeleteTarget(null);
      setBulkMessage(result.deleted > 0 ? `Deleted ${result.deleted} transaction${result.deleted === 1 ? "" : "s"}.` : "No transactions were deleted. Reconciled transactions are protected.");
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "The transactions could not be deleted. Please try again.");
    }
  };

  const handleBulkAccept = useCallback(
    async (ids?: string[]) => {
      const targetCount = ids?.length ?? highConfidenceSuggested.length;
      if (targetCount === 0) return;
      const result = await bulkAccept.mutateAsync({
        ids,
        minConfidence: ids ? 0 : HIGH_CONFIDENCE,
      });
      setSelected(new Set());
      setBulkMessage(
        result.accepted > 0
          ? `Accepted ${result.accepted} suggested match${result.accepted !== 1 ? "es" : ""}.`
          : (result.errors[0]?.message ?? "No suggestions were accepted."),
      );
    },
    [bulkAccept, highConfidenceSuggested.length],
  );

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "a") {
        const ids =
          selectedSuggested.length > 0
            ? selectedSuggested.map((t) => t.id)
            : firstSuggestedOnPage
              ? [firstSuggestedOnPage.id]
              : [];
        if (ids.length === 0 || bulkAccept.isPending) return;
        event.preventDefault();
        void handleBulkAccept(ids);
      }
      if (event.key.toLowerCase() === "x" && firstSuggestedOnPage && !rejectSuggestion.isPending) {
        event.preventDefault();
        void rejectSuggestion.mutateAsync(firstSuggestedOnPage.id).then(() => {
          setBulkMessage("Dismissed the first visible suggestion.");
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    bulkAccept.isPending,
    firstSuggestedOnPage,
    handleBulkAccept,
    rejectSuggestion,
    selectedSuggested,
  ]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={selectable.length > 0 && selected.size === selectable.length}
            onChange={toggleAll}
          />
          <button
            onClick={() => setDeleteTarget("selected")}
            disabled={selectedDeletable.length === 0 || bulkDelete.isPending}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
            {selectedDeletable.length > 0
              ? `Delete (${selectedDeletable.length})`
              : "Bulk Remove / Delete"}
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget("all")}
            disabled={allDeletableCount === 0 || bulkDeleteAll.isPending}
            className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
            Delete all matching ({allDeletableCount})
          </button>
          <button
            onClick={() => handleBulkAccept(selectedSuggested.map((t) => t.id))}
            disabled={selectedSuggested.length === 0 || bulkAccept.isPending}
            title="Shortcut: A accepts selected suggestions, or first visible suggestion when none are selected."
            className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-800 disabled:opacity-40"
          >
            <CheckCircle2 className="size-3.5" />
            {selectedSuggested.length > 0
              ? `Accept selected (${selectedSuggested.length})`
              : "Accept selected"}
          </button>
          <button
            onClick={() => handleBulkAccept()}
            disabled={highConfidenceSuggested.length === 0 || bulkAccept.isPending}
            className="flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-800 disabled:opacity-40"
          >
            <Sparkles className="size-3.5" />
            Accept high-confidence ({highConfidenceSuggested.length})
          </button>
        </div>
        <div className="flex items-center gap-2">
          {bulkMessage && (
            <span className="text-xs font-semibold text-slate-500">{bulkMessage}</span>
          )}
          {suggested.length > 0 && (
            <span className="hidden text-xs text-slate-400 lg:inline">
              Shortcuts: A accept, X dismiss
            </span>
          )}
          <span className="text-xs text-slate-400">
            {feedPage?.total ?? 0} transaction{(feedPage?.total ?? 0) !== 1 ? "s" : ""}
          </span>
          <select
            value={statusFilter}
            onChange={(event) =>
              handleStatusChange(event.target.value as "all" | FeedTransaction["reconcile_status"])
            }
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            aria-label="Filter statement transactions by status"
          >
            <option value="all">All statuses</option>
            <option value="ai_suggested">Suggested match</option>
            <option value="unmatched">Unmatched</option>
            <option value="reconciled">Reconciled</option>
            <option value="ignored">Ignored</option>
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search feed..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-8 w-56 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Spent</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <Skeleton className="size-4 rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-3.5 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-3.5 w-36" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-7 w-24" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Skeleton className="ml-auto h-3.5 w-14" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Skeleton className="ml-auto h-3.5 w-14" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-3.5 w-20" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !transactions || transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FileText className="size-10 text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-700">No statement transactions yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Import a PDF or CSV bank statement to populate this feed.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Spent</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((tx) => (
                <FeedRow
                  key={tx.id}
                  tx={tx}
                  selected={selected.has(tx.id)}
                  onToggle={() => toggleSelect(tx.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WindowedPager
        page={page}
        totalPages={totalPages}
        totalItems={feedPage?.total ?? 0}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
      <ConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={deleteTarget === "all" ? "Delete transactions across all pages?" : "Delete selected transactions?"}
        description={deleteTarget === "all"
          ? `This will delete ${allDeletableCount} non-reconciled transaction${allDeletableCount === 1 ? "" : "s"} matching the current search and status filters, including transactions on other pages. Reconciled transactions will not be deleted.`
          : `This will delete ${selectedDeletable.length} selected transaction${selectedDeletable.length === 1 ? "" : "s"}. Reconciled transactions will not be deleted.`}
        confirmLabel={deleteTarget === "all" ? "Delete all matching" : "Delete selected"}
        onConfirm={() => void confirmBulkDelete()}
        loading={bulkDelete.isPending || bulkDeleteAll.isPending}
        variant="destructive"
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Export helper — download feed as CSV
// ─────────────────────────────────────────────

function exportFeedAsCSV(transactions: FeedTransaction[]) {
  const header = "Date,Description,Spent,Received,Status";
  const rows = transactions.map((tx) => {
    const date = new Date(tx.transaction_date).toLocaleDateString("en-GB");
    const desc = `"${tx.description.replace(/"/g, '""')}"`;
    const spent = tx.debit_minor > 0 ? (tx.debit_minor / 100).toFixed(2) : "";
    const received = tx.credit_minor > 0 ? (tx.credit_minor / 100).toFixed(2) : "";
    return `${date},${desc},${spent},${received},${tx.reconcile_status}`;
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bank-statements-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// Main StatementsView
// ─────────────────────────────────────────────

export function StatementsView() {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSpreadsheetOpen, setIsSpreadsheetOpen] = useState(false);
  const [feedStatusFilter, setFeedStatusFilter] = useState<
    "all" | FeedTransaction["reconcile_status"]
  >("all");
  // This compact query returns authoritative workspace totals without loading
  // every statement line into the browser.
  const { data: feedSummary, isLoading: transactionsLoading } = useFeedTransactionPage(1, 1);
  // Kept separately while the existing CSV export endpoint has its own
  // export-size limit; it must not be used for dashboard counts.
  const { data: exportTransactions } = useFeedTransactions(undefined, "");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [showReconciliationReview, setShowReconciliationReview] = useState(false);
  const [reconciliationReviewError, setReconciliationReviewError] = useState<string | null>(null);
  const reconciliationReview = useReconciliationReview();
  const queryClient = useQueryClient();

  const handleAiMatch = async () => {
    setAiRunning(true);
    setAiResult(null);
    try {
      const result = await runAiMatch();
      setAiResult(
        result.matched > 0
          ? `✓ Found ${result.matched} match${result.matched !== 1 ? "es" : ""}!`
          : (result.message ?? "No matches found."),
      );
      if (result.matched > 0) setFeedStatusFilter("ai_suggested");
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
    } catch {
      setAiResult("Failed to run matching.");
    } finally {
      setAiRunning(false);
    }
  };

  const unreconciledCount = (feedSummary?.unmatched ?? 0) + (feedSummary?.ai_suggested ?? 0);
  const openReconciliationReview = async () => {
    setReconciliationReviewError(null);
    if (reconciliationReview.data && !reconciliationReview.isStale) {
      setShowReconciliationReview(true);
      return;
    }
    const result = await reconciliationReview.refetch();
    if (result.data && !result.error) {
      setShowReconciliationReview(true);
      return;
    }
    setReconciliationReviewError(
      result.error instanceof Error
        ? result.error.message
        : "We could not prepare the unreconciled transactions. Please try again.",
    );
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Bank Statements
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            View, import, and manage your parsed bank statements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSpreadsheetOpen(true)}
            className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Table2 className="size-4" />
            <span className="hidden sm:inline">Spreadsheet view</span>
          </button>
          <button
            onClick={() => exportFeedAsCSV(exportTransactions ?? [])}
            disabled={!exportTransactions || exportTransactions.length === 0}
            className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Upload className="size-4" />
            <span className="hidden sm:inline">Import Statement</span>
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Total Transactions</p>
          {transactionsLoading ? (
            <Skeleton className="mt-1.5 h-7 w-10" />
          ) : (
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{feedSummary?.total ?? 0}</p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Reconciled</p>
          {transactionsLoading ? (
            <Skeleton className="mt-1.5 h-7 w-10" />
          ) : (
            <p className="mt-1 text-2xl font-extrabold text-green-700">
              {feedSummary?.reconciled ?? 0}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-red-700">Unmatched</p>
            <AlertCircle className="size-4 text-red-500" />
          </div>
          {transactionsLoading ? (
            <Skeleton className="mt-1.5 h-7 w-10 bg-red-200/70" />
          ) : (
            <p className="mt-1 text-2xl font-extrabold text-red-900">{unreconciledCount}</p>
          )}
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-purple-700">AI Suggested</p>
            <Sparkles className="size-4 text-purple-500" />
          </div>
          {transactionsLoading ? (
            <Skeleton className="mt-1.5 h-7 w-10 bg-purple-200/70" />
          ) : (
            <p className="mt-1 text-2xl font-extrabold text-purple-900">
              {feedSummary?.ai_suggested ?? 0}
            </p>
          )}
        </div>
      </div>

      {/* Feed table — full width here (not constrained to xl:col-span-2) */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">Statement Feed</h2>
        <div className="flex items-center gap-2">
          {aiResult && <span className="text-xs font-semibold text-purple-700">{aiResult}</span>}
          <button
            onClick={handleAiMatch}
            disabled={aiRunning}
            className="flex items-center gap-2 rounded-lg bg-purple-100 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-200 transition-colors disabled:opacity-50"
          >
            {aiRunning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {aiRunning ? "Matching..." : "AI Powered Matching"}
          </button>
          <button
            onClick={() => void openReconciliationReview()}
            disabled={unreconciledCount === 0 || reconciliationReview.isFetching}
            className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {reconciliationReview.isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <AlertCircle className="size-3.5" />}
            {reconciliationReview.isFetching ? "Preparing review..." : `Review unreconciled (${unreconciledCount})`}
          </button>
        </div>
      </div>
      {reconciliationReview.isFetching ? <div role="status" aria-live="polite" className="-mt-4 flex items-center justify-end gap-2 text-xs font-medium text-slate-500"><Loader2 className="size-3.5 animate-spin text-amber-600" /><span>Checking matches and preparing category suggestions. You can keep using this page.</span></div> : null}
      {reconciliationReviewError ? <div role="alert" className="-mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"><span>{reconciliationReviewError}</span><button type="button" onClick={() => void openReconciliationReview()} className="font-bold text-red-700 underline underline-offset-2 hover:text-red-900">Try again</button></div> : null}
      <StatementsFeedTable
        statusFilter={feedStatusFilter}
        onStatusFilterChange={setFeedStatusFilter}
      />

      {isImportOpen && <ImportStatementModal onClose={() => setIsImportOpen(false)} />}
      <StatementSpreadsheetDialog open={isSpreadsheetOpen} onOpenChange={setIsSpreadsheetOpen} />
      {showReconciliationReview ? (
        <StatementReconciliationReviewDialog
          key={`${reconciliationReview.data?.transactions[0]?.id ?? "loading"}:${reconciliationReview.data?.transactions.length ?? 0}`}
          transactions={reconciliationReview.data?.transactions}
          autoReconciled={0}
          warning={reconciliationReview.data?.categorizationWarning}
          onClose={() => setShowReconciliationReview(false)}
        />
      ) : null}
    </div>
  );
}
