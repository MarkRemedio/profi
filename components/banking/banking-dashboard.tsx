"use client";
import { createPortal } from "react-dom";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { formatMoney, formatMoneyMajor } from "@/lib/currency";
import { CurrencyPicker } from "@/components/currency/currency-picker";
import { useCurrency } from "@/components/currency-provider";
import {
  Building2,
  ArrowRightLeft,
  ArrowRight,
  Sparkles,
  Upload,
  Wifi,
  MoreHorizontal,
  AlertCircle,
  Search,
  CheckCircle2,
  Trash2,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Calculator,
  Plus,
  Loader2,
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Receipt,
  FileUp,
  FileText,
  ChevronDown,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { WindowedPager } from "@/components/ui/windowed-pager";
import { QuickAction, QuickActions } from "@/components/shared/quick-actions";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  useBankAccounts,
  useCreateBankAccount,
  useDeleteBankAccount,
  useDashboardSummary,
  useFeedTransactionPage,
  useBulkDeleteFeed,
  useRejectAiSuggestion,
  runAiMatch,
  type BankAccount,
  type CreateBankAccountInput,
  type FeedTransaction,
  findJournalCandidates,
  type JournalCandidate,
  importStatement,
  confirmStatementImport,
  type StatementImportPreview,
  type ParsedTransaction,
  bankingKeys,
  reconcileFeed,
  getAccountTransactions,
  useTrueLayerBankFeedStatuses,
  useSetTrueLayerBankFeedSync,
  useDisconnectTrueLayerBankFeed,
  useTrueLayerAvailableAccounts,
  useCompleteTrueLayerAccountSelection,
  useCancelTrueLayerAccountSelection,
  type TrueLayerBankFeedStatus,
  type TrueLayerAvailableAccount,
} from "@/lib/banking/api";

import { TransferMoneyModal, ReceivedPaymentModal, PaidExpenseModal } from "./money-modals";
import { ImportStatementModal } from "./import-statement-modal";
import { TransactionCategorySelect } from "./transaction-category-select";
import { TransactionScopeSelect } from "./transaction-scope-select";
import { Switch } from "@/components/ui/switch";

// ──────────────────────────────────────────────────────────────────────

import { useQuery, useQueryClient } from "@tanstack/react-query";

type BankTransaction = {
  id: string;
  journal_id: string;
  journal_date: string;
  memo: string | null;
  debit_minor: number;
  credit_minor: number;
  source_type: string | null;
};

function useBankAccountTransactions(chartAccountId: string | null) {
  return useQuery({
    queryKey: [...bankingKeys.all, "transactions", chartAccountId],
    queryFn: () => getAccountTransactions(chartAccountId!),
    enabled: !!chartAccountId,
  });
}
// ──────────────────────────────────────────────────────────────────────

const TONE_STYLES: Record<string, { bg: string; text: string }> = {
  blue: { bg: "bg-blue-100", text: "text-blue-600" },
  orange: { bg: "bg-orange-100", text: "text-orange-600" },
  green: { bg: "bg-green-100", text: "text-green-600" },
  purple: { bg: "bg-purple-100", text: "text-purple-600" },
  slate: { bg: "bg-slate-100", text: "text-slate-600" },
};

// A bank account is denominated in its own currency — a business may hold a
// dollar account and a pound account side by side — so figures belonging to one
// account are shown in that account's currency. Both helpers now defer to the
// shared registry, which covers every supported currency; the local symbol table
// they replaced knew only three and rendered pesos and shillings unsigned.
function formatCurrency(amount: string | number, currency?: string | null) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return formatMoneyMajor(Number.isFinite(num) ? num : 0, currency);
}

function formatMinor(minor: number, currency?: string | null) {
  return formatMoney(minor, currency);
}

// =====================================================================
// Transactions Modal
// =====================================================================

function TransactionsModal({ account, onClose }: { account: BankAccount; onClose: () => void }) {
  const tone = TONE_STYLES[account.color_tone] ?? TONE_STYLES.blue;
  // Every figure in this modal is summed from journal lines, and the ledger is
  // kept in one currency. `account.currency` describes what the real-world bank
  // account is denominated in — it does not describe these amounts, so using it
  // here labelled a peso balance as pounds.
  const { currency: ledgerCurrency } = useCurrency();
  const {
    data: transactions,
    isLoading,
    error,
  } = useBankAccountTransactions(account.chart_account_id);
  const [search, setSearch] = useState("");

  const filtered = (transactions ?? []).filter((t) =>
    (t.memo ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div
            className={`flex size-9 items-center justify-center rounded-lg ${tone.bg} ${tone.text}`}
          >
            <Building2 className="size-4" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-extrabold text-slate-950">{account.display_name}</h2>
            <p className="text-xs text-slate-500">
              {account.bank_name}
              {account.sort_code ? ` • Sort: ${account.sort_code}` : ""}
              {account.account_number_last4 ? ` • ****${account.account_number_last4}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-400">Balance</p>
            <p className="text-base font-extrabold text-slate-900">
              {formatCurrency(account.balance ?? "0.00", ledgerCurrency)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-slate-100 px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-left">Description</th>
                  <th className="px-6 py-3 text-right">Spent</th>
                  <th className="px-6 py-3 text-right">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-3">
                      <Skeleton className="h-3.5 w-16" />
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="size-6 shrink-0 rounded-full" />
                        <Skeleton className="h-3.5 w-32" />
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Skeleton className="ml-auto h-3.5 w-14" />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Skeleton className="ml-auto h-3.5 w-14" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="size-10 text-red-300" />
              <p className="mt-3 text-sm font-semibold text-red-600">Failed to load transactions</p>
              <p className="mt-1 text-xs text-slate-400">Please try again, or reload the page.</p>
            </div>
          )}

          {!isLoading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Receipt className="size-10 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-600">
                {search ? "No matching transactions" : "No transactions yet"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {search
                  ? "Try a different search term."
                  : "Transactions will appear here once journals are posted to this account."}
              </p>
            </div>
          )}

          {!isLoading && !error && filtered.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-left">Description</th>
                  <th className="px-6 py-3 text-right">Spent</th>
                  <th className="px-6 py-3 text-right">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((tx) => {
                  const isDebit = tx.debit_minor > 0;
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-6 py-3 text-xs text-slate-500">
                        {new Date(tx.journal_date).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                              isDebit ? "bg-green-100 text-green-600" : "bg-red-100 text-red-500"
                            }`}
                          >
                            {isDebit ? (
                              <ArrowDownLeft className="size-3" />
                            ) : (
                              <ArrowUpRight className="size-3" />
                            )}
                          </div>
                          <span className="max-w-[220px] truncate font-medium text-slate-900">
                            {tx.memo || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-slate-900">
                        {tx.credit_minor > 0 ? formatMinor(tx.credit_minor, ledgerCurrency) : "—"}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-green-600">
                        {tx.debit_minor > 0 ? formatMinor(tx.debit_minor, ledgerCurrency) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
          <p className="text-xs text-slate-400">
            {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// =====================================================================
// Bank Account Card — Quick Actions Grid Style
// =====================================================================

function BankAccountCard({
  account,
  trueLayerConnection,
}: {
  account: BankAccount;
  trueLayerConnection?: TrueLayerBankFeedStatus;
}) {
  const tone = TONE_STYLES[account.color_tone] ?? TONE_STYLES.blue;
  // The balance on this card is a sum of posted journal lines, so it is stated
  // in the workspace's currency, not whatever the bank account is labelled.
  const { currency: ledgerCurrency } = useCurrency();
  const [showTransactions, setShowTransactions] = useState(false);
  const [confirmation, setConfirmation] = useState<"disconnect" | "remove" | null>(null);
  const setSyncEnabled = useSetTrueLayerBankFeedSync();
  const disconnect = useDisconnectTrueLayerBankFeed();
  const deleteAccount = useDeleteBankAccount();

  const beginConnection = () => {
    window.location.assign(`/api/banking/truelayer/connect?bankAccountId=${encodeURIComponent(account.id)}`);
  };
  const toggleSync = async (enabled: boolean) => {
    if (!trueLayerConnection) return;
    try {
      const result = await setSyncEnabled.mutateAsync({ bankAccountId: account.id, enabled });
      toast.success(enabled
        ? `Automatic syncing is on. ${result.imported} new transaction${result.imported === 1 ? " was" : "s were"} added, and this account will check again every 5 minutes.`
        : "Automatic syncing is paused. No new transactions will be checked until you turn it on again.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change bank-feed syncing.");
    }
  };
  const disconnectFeed = async () => {
    try {
      await disconnect.mutateAsync(account.id);
      toast.success("Bank feed disconnected.");
      setConfirmation(null);
    } catch {
      toast.error("Could not disconnect the bank feed.");
    }
  };
  const removeAccount = async () => {
    try {
      await deleteAccount.mutateAsync(account.id);
      toast.success("Bank account removed.");
      setConfirmation(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the bank account.");
    }
  };

  // 🚀 Dynamic hover styles to perfectly match the bank's brand color
  const getHoverStyles = (colorTone: string) => {
    switch (colorTone) {
      case "green":
        return {
          border: "hover:border-green-300",
          bg: "group-hover:bg-green-600",
          arrow: "group-hover:text-green-600",
        };
      case "orange":
        return {
          border: "hover:border-orange-300",
          bg: "group-hover:bg-orange-600",
          arrow: "group-hover:text-orange-600",
        };
      case "purple":
        return {
          border: "hover:border-purple-300",
          bg: "group-hover:bg-purple-600",
          arrow: "group-hover:text-purple-600",
        };
      case "slate":
        return {
          border: "hover:border-slate-300",
          bg: "group-hover:bg-slate-600",
          arrow: "group-hover:text-slate-600",
        };
      default:
        return {
          border: "hover:border-blue-300",
          bg: "group-hover:bg-blue-600",
          arrow: "group-hover:text-blue-600",
        };
    }
  };
  const hoverStyle = getHoverStyles(account.color_tone);

  const connectionBadge =
    setSyncEnabled.isPending ? (
      <span className="flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-blue-700"><Loader2 className="size-2.5 animate-spin" /> SYNCING…</span>
    ) : trueLayerConnection?.status === "CONNECTED" || account.connection_type === "live_feed" ? (
      <span className="flex items-center gap-1 rounded-md bg-green-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-green-600">
        <span className="size-1 rounded-full bg-green-500" /> LIVE
      </span>
    ) : trueLayerConnection?.status === "PAUSED" ? (
      <span className="flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-600"><span className="size-1 rounded-full bg-slate-400" /> PAUSED</span>
    ) : account.status === "disconnected" ? (
      <span className="flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-700">
        <span className="size-1 rounded-full bg-amber-500" /> DISCONNECTED
      </span>
    ) : account.connection_type === "plaid" || account.connection_type === "truelayer" ? (
      <span className="flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-blue-600">
        <span className="size-1 rounded-full bg-blue-500" /> SYNC
      </span>
    ) : (
      <span className="flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
        MANUAL
      </span>
    );

  return (
    <>
      <div
        className={cn(
          "group relative flex w-full flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:shadow-md",
          hoverStyle.border,
        )}
      >
        {trueLayerConnection ? <div className="absolute right-12 top-4 z-10 flex items-center gap-1.5 rounded-md bg-white/90 px-1.5 py-1 text-[10px] font-bold text-slate-500 shadow-sm ring-1 ring-slate-200" onClick={(event) => event.stopPropagation()}>
          <span className="hidden sm:inline">Sync</span>
          <Switch checked={trueLayerConnection.status === "CONNECTED"} disabled={setSyncEnabled.isPending} onCheckedChange={(enabled) => void toggleSync(enabled)} aria-label={`Automatic TrueLayer syncing for ${account.display_name}`} />
        </div> : null}
        <div className="absolute right-3 top-3 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${account.display_name}`}
                className="flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {trueLayerConnection?.status === "CONNECTED" ? (
                <DropdownMenuItem
                    disabled={disconnect.isPending}
                    onSelect={() => setConfirmation("disconnect")}
                    className="cursor-pointer"
                  >
                    Disconnect feed
                </DropdownMenuItem>
              ) : (trueLayerConnection || (account.connection_type === "truelayer" && account.status === "disconnected")) ? (
                <DropdownMenuItem onSelect={beginConnection} className="cursor-pointer">
                  <Wifi className="mr-2 size-4" /> Reconnect TrueLayer
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={deleteAccount.isPending}
                onSelect={() => setConfirmation("remove")}
                className="cursor-pointer text-red-600 focus:text-red-700"
              >
                <Trash2 className="mr-2 size-4" /> Remove bank account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <button
          type="button"
          onClick={() => setShowTransactions(true)}
          className="flex w-full flex-1 flex-col justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
        {/* Top Row: Icon Square & Badge */}
        <div className="mb-4 flex w-full items-start justify-between pr-9">
          <div
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-lg transition-colors group-hover:text-white",
              tone.bg,
              tone.text,
              hoverStyle.bg,
            )}
          >
            <Building2 className="size-5" />
          </div>
          <div>{connectionBadge}</div>
        </div>

        {/* Middle/Bottom Text Block */}
        <div className="flex flex-col pr-6">
          <h3 className="font-bold text-slate-900 truncate">{account.display_name}</h3>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500 truncate">
            {account.bank_name}{" "}
            {account.account_number_last4 ? `• ****${account.account_number_last4}` : ""}
          </p>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            {formatCurrency(account.balance ?? "0.00", ledgerCurrency)}
          </p>
        </div>

        {/* Sliding Hover Arrow matching Quick Actions */}
        <ArrowRight
          className={cn(
            "absolute bottom-5 right-5 size-5 text-slate-300 transition-transform group-hover:translate-x-1",
            hoverStyle.arrow,
          )}
        />
        </button>
      </div>

      {showTransactions && (
        <TransactionsModal account={account} onClose={() => setShowTransactions(false)} />
      )}
      <ConfirmationDialog
        open={confirmation !== null}
        onOpenChange={(open) => !open && setConfirmation(null)}
        title={confirmation === "remove" ? "Remove bank account?" : "Disconnect bank feed?"}
        description={confirmation === "remove"
          ? `Remove “${account.display_name}” from Banking? Its transactions and accounting history will be kept.`
          : "Stop syncing this account with TrueLayer? Existing imported transactions will remain."}
        confirmLabel={confirmation === "remove" ? "Remove account" : "Disconnect feed"}
        variant={confirmation === "remove" ? "destructive" : "warning"}
        loading={confirmation === "remove" ? deleteAccount.isPending : disconnect.isPending}
        onConfirm={() => {
          if (confirmation === "remove") void removeAccount();
          if (confirmation === "disconnect") void disconnectFeed();
        }}
      />
    </>
  );
}

// =====================================================================
// Bank Accounts List
// =====================================================================

function BankAccountCardSkeleton() {
  return (
    <div className="flex w-full flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex w-full items-start justify-between">
        <Skeleton className="size-10 rounded-lg" />
        <Skeleton className="h-4 w-14 rounded-md" />
      </div>
      <div className="flex flex-col gap-2 pr-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-1.5 h-7 w-28" />
      </div>
    </div>
  );
}

function BankAccountsList() {
  const { data: accounts, isLoading, error } = useBankAccounts();
  const { data: trueLayerConnections } = useTrueLayerBankFeedStatuses();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <BankAccountCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load bank accounts. Please try again, or reload the page.
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <Building2 className="size-10 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-700">No bank accounts yet</p>
        <p className="mt-1 text-xs text-slate-500">
          Click &ldquo;Add Account&rdquo; to connect your first bank.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {accounts.map((account) => (
        <BankAccountCard
          key={account.id}
          account={account}
          trueLayerConnection={trueLayerConnections?.find((connection) => connection.bankAccountId === account.id)}
        />
      ))}
    </div>
  );
}

// =====================================================================
// Add Bank Account Modal
// =====================================================================

function AddBankAccountModal({ onClose }: { onClose: () => void }) {
  const create = useCreateBankAccount();
  // Defaults to the workspace's own currency: a business keeping books in pesos
  // almost certainly banks in pesos, and "GBP" was simply wrong for them.
  const { currency: workspaceCurrency } = useCurrency();
  const [form, setForm] = useState<CreateBankAccountInput>({
    display_name: "",
    bank_name: "",
    sort_code: "",
    account_number_last4: "",
    currency: workspaceCurrency,
    connection_type: "manual_import",
    color_tone: "blue",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof CreateBankAccountInput>(
    field: K,
    value: CreateBankAccountInput[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.display_name.trim() || !form.bank_name.trim()) {
      setError("Display name and bank name are required.");
      return;
    }
    try {
      await create.mutateAsync(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-950">Add Bank Account</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Display Name *">
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => update("display_name", e.target.value)}
              placeholder="Barclays Business"
              className="input"
            />
          </Field>

          <Field label="Bank Name *">
            <input
              type="text"
              value={form.bank_name}
              onChange={(e) => update("bank_name", e.target.value)}
              placeholder="Barclays"
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Sort Code">
              <input
                type="text"
                value={form.sort_code ?? ""}
                onChange={(e) => update("sort_code", e.target.value)}
                placeholder="20-00-00"
                className="input"
              />
            </Field>
            <Field label="Account # (last 4)">
              <input
                type="text"
                maxLength={4}
                value={form.account_number_last4 ?? ""}
                onChange={(e) => update("account_number_last4", e.target.value)}
                placeholder="1234"
                className="input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency">
              {/* Driven by the shared registry so a new supported currency
                  appears here automatically. The hardcoded three left a
                  workspace keeping books in pesos or shillings unable to
                  record a bank account in its own currency.

                  Searchable rather than a flat list: that registry is now a
                  hundred and one long. availableOnly, because an account can
                  only be held in a currency the books can keep. */}
              <CurrencyPicker
                // The form seeds this from workspaceCurrency, but the field is
                // optional on the type; falling back to the same value keeps
                // the trigger from rendering an empty currency.
                value={form.currency ?? workspaceCurrency}
                onChange={(code) => update("currency", code)}
                availableOnly
                size="field"
              />
            </Field>
            <Field label="Color">
              <select
                value={form.color_tone}
                onChange={(e) => update("color_tone", e.target.value)}
                className="input"
              >
                <option value="blue">Blue</option>
                <option value="orange">Orange</option>
                <option value="green">Green</option>
                <option value="purple">Purple</option>
                <option value="slate">Slate</option>
              </select>
            </Field>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
            <p className="text-sm font-semibold text-slate-900">Want to link your bank instead?</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">Connect securely through TrueLayer. You can select one or more bank accounts after approval.</p>
            <button type="button" onClick={() => window.location.assign("/api/banking/truelayer/connect")} className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Wifi className="size-4" /> Link your bank</button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={create.isPending}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create Account
          </button>
        </div>
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          height: 38px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 0 10px;
          font-size: 14px;
          outline: none;
          background: white;
        }
        :global(.input:focus) {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
        }
      `}</style>
    </div>,
    document.body,
  );
}

function TrueLayerAccountSelectionModal({ connectionId, onClose }: { connectionId: string; onClose: () => void }) {
  const { data: accounts, isLoading, error } = useTrueLayerAvailableAccounts(connectionId);
  const complete = useCompleteTrueLayerAccountSelection();
  const cancel = useCancelTrueLayerAccountSelection();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = (accounts?.length ?? 0) > 0 && selected.size === accounts?.length;
  const close = async () => { try { await cancel.mutateAsync(connectionId); } finally { onClose(); } };
  const add = async () => {
    try {
      const result = await complete.mutateAsync({ connectionId, providerAccountIds: [...selected] });
      toast.success(`${result.connected} bank account${result.connected === 1 ? "" : "s"} connected.`);
      onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add the selected bank accounts."); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="truelayer-accounts-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Wifi className="size-5" /></div><h2 id="truelayer-accounts-title" className="mt-3 text-lg font-extrabold text-slate-950">Choose bank accounts to add</h2><p className="mt-1 text-sm leading-5 text-slate-500">Select one, several, or all accounts approved in TrueLayer.</p></div><button type="button" onClick={() => void close()} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="size-5" /></button></div>
        <div className="mt-5 max-h-72 space-y-2 overflow-y-auto pr-1">
          {isLoading && Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 w-full rounded-lg" />)}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Could not load the TrueLayer accounts. Try connecting again.</p>}
          {(accounts?.length ?? 0) > 0 && <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(accounts!.map((account) => account.id)))} className="size-4 rounded border-slate-300 text-blue-600" />Select all ({accounts!.length})</label>}
          {accounts?.map((account) => <label key={account.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:border-blue-300 hover:bg-blue-50"><input type="checkbox" checked={selected.has(account.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(account.id)) next.delete(account.id); else next.add(account.id); return next; })} className="size-4 rounded border-slate-300 text-blue-600" /><span><span className="block text-sm font-bold text-slate-900">{account.displayName}</span><span className="text-xs text-slate-500">{account.last4 ? `••••${account.last4}` : "Account details unavailable"}{account.sortCode ? ` · ${account.sortCode}` : ""}{account.currency ? ` · ${account.currency}` : ""}</span></span></label>)}
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4"><button type="button" onClick={() => void close()} className="text-sm font-semibold text-slate-600">Cancel</button><button type="button" onClick={() => void add()} disabled={selected.size === 0 || complete.isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{complete.isPending ? "Adding accounts..." : `Add selected (${selected.size})`}</button></div>
      </div>
    </div>, document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

// =====================================================================
// Main Dashboard
// =====================================================================

export function BankingDashboard() {
  // Cash validation and the balance summary are workspace-wide totals summed
  // from the ledger, so they are stated in the workspace's currency. They were
  // calling formatCurrency with no currency at all, which fell back to the
  // registry default and printed sterling regardless of the books.
  const { currency: dashboardCurrency } = useCurrency();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: trueLayerConnections } = useTrueLayerBankFeedStatuses();
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [isBalancesOpen, setIsBalancesOpen] = useState(false);
  const [trueLayerSelectionId, setTrueLayerSelectionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    return url.searchParams.get("truelayer") === "select" ? url.searchParams.get("truelayerConnection") : null;
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("truelayer");
    if (!status) return;
    if (status === "select") {
      url.searchParams.delete("truelayer");
      url.searchParams.delete("truelayerConnection");
      window.history.replaceState({}, "", url);
      return;
    }

    const messages: Record<string, { level: "success" | "warning" | "error"; text: string }> = {
      connected: { level: "success", text: "Your TrueLayer bank accounts are connected and transactions are syncing." },
      no_accounts: { level: "warning", text: "TrueLayer did not return any bank accounts to add." },
      declined: { level: "warning", text: "Bank connection was cancelled. No accounts were added." },
      bad_state: { level: "error", text: "We could not verify the bank connection. Please try again." },
      exchange_failed: { level: "error", text: "TrueLayer approval could not be completed. Please reconnect." },
      sync_failed: { level: "error", text: "Your bank connection could not be completed. Please reconnect from TrueLayer." },
      not_configured: { level: "error", text: "TrueLayer is not configured for this environment." },
      no_key: { level: "error", text: "TrueLayer secure connection settings are incomplete." },
    };
    const message = messages[status];
    if (message) toast[message.level](message.text);

    url.searchParams.delete("truelayer");
    window.history.replaceState({}, "", url);
  }, []);

  const handleAiMatch = async () => {
    setAiRunning(true);
    setAiResult(null);
    try {
      const result = await runAiMatch();
      const resultParts = [
        result.matched > 0
          ? `Found ${result.matched} journal match${result.matched !== 1 ? "es" : ""}`
          : null,
        result.categories_suggested > 0
          ? `suggested ${result.categories_suggested} categor${result.categories_suggested === 1 ? "y" : "ies"} from your past choices`
          : null,
      ].filter(Boolean);
      setAiResult(
        resultParts.length > 0
          ? `✓ ${resultParts.join(" and ")}.`
          : (result.message ?? "No matches found."),
      );
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
    } catch (err) {
      setAiResult("Failed to run matching.");
    } finally {
      setAiRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* HEADER */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Bank Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Accounts summary, cash validations, and bank feed status.
          </p>
        </div>
        <QuickActions>
          <QuickAction
            icon={Plus}
            label="Add bank account"
            description="Create a bank account for manual imports or a live feed"
            onClick={() => setIsAddOpen(true)}
          />
          <QuickAction
            icon={Wifi}
            label="Link your bank"
            description="Securely connect your bank accounts through TrueLayer"
            onClick={() => window.location.assign("/api/banking/truelayer/connect")}
            tone="blue"
            warningMessage={trueLayerConnections?.some((connection) => connection.status === "ERROR" || connection.status === "RECONNECT_REQUIRED")
              ? "A saved TrueLayer connection needs attention. Open that account’s three-dot menu to reconnect it or remove it if it is no longer needed."
              : undefined}
          />
          <QuickAction
            icon={ArrowRightLeft}
            label="Transfer money"
            description="Open the bank transfer form"
            onClick={() => setIsTransferOpen(true)}
            primary
            tone="emerald"
          />
          <QuickAction
            icon={ArrowDownToLine}
            label="Record receipt"
            description="Record money received"
            onClick={() => setIsReceiveOpen(true)}
          />
          <QuickAction
            icon={ArrowUpFromLine}
            label="Record expense"
            description="Record money paid out"
            onClick={() => setIsPayOpen(true)}
          />
          <QuickAction
            icon={Upload}
            label="Import statement"
            description="Upload a bank statement"
            onClick={() => setIsImportOpen(true)}
          />
        </QuickActions>
      </div>

      {/* KPI CARDS */}
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-400">
                Cash flow this month
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Base currency · excludes transfers
              </p>
            </div>
            {summaryLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-extrabold",
                  (summary?.cash_flow.net_minor ?? 0) >= 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700",
                )}
              >
                {(summary?.cash_flow.net_minor ?? 0) >= 0 ? "+" : ""}
                {formatMinor(summary?.cash_flow.net_minor ?? 0, dashboardCurrency)} net
              </span>
            )}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-6">
            <div className="border-r border-slate-100 pr-4 sm:pr-6">
              <div className="flex items-center gap-2 text-emerald-700">
                <ArrowDownToLine className="size-4" />
                <span className="text-[11px] font-bold uppercase tracking-[0.08em]">Money in</span>
              </div>
              {summaryLoading ? (
                <Skeleton className="mt-3 h-8 w-32" />
              ) : (
                <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">
                  {formatMinor(summary?.cash_flow.money_in_minor ?? 0, dashboardCurrency)}
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 text-rose-700">
                <ArrowUpFromLine className="size-4" />
                <span className="text-[11px] font-bold uppercase tracking-[0.08em]">Money out</span>
              </div>
              {summaryLoading ? (
                <Skeleton className="mt-3 h-8 w-32" />
              ) : (
                <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">
                  {formatMinor(summary?.cash_flow.money_out_minor ?? 0, dashboardCurrency)}
                </p>
              )}
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
            <span className="text-slate-500">
              Statement activity{" "}
              {formatCurrency(summary?.statement_balance ?? "0.00", dashboardCurrency)}
            </span>
            <span className="flex items-center gap-1 font-semibold text-emerald-700">
              <CheckCircle2 className="size-3.5" />
              Reconciled {formatCurrency(summary?.matched_balance ?? "0.00", dashboardCurrency)}
            </span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400">
                  Cash balance
                </p>
                {summaryLoading ? (
                  <Skeleton className="mt-3 h-7 w-28" />
                ) : (
                  <p className="mt-2 text-xl font-extrabold text-slate-950">
                    {formatMinor(summary?.cash_validation.balance_minor ?? 0, dashboardCurrency)}
                  </p>
                )}
              </div>
              <button
                onClick={() => setIsBalancesOpen(true)}
                className="rounded-lg bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                title="Manage opening and closing balances"
              >
                <Wallet className="size-4" />
              </button>
            </div>
          </section>
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-amber-700">
                  To review
                </p>
                {summaryLoading ? (
                  <Skeleton className="mt-3 h-7 w-12 bg-amber-200/70" />
                ) : (
                  <p className="mt-2 text-xl font-extrabold text-amber-950">
                    {summary?.unreconciled_count ?? 0}
                  </p>
                )}
                <p className="mt-1 text-[11px] font-medium text-amber-800">
                  Unreconciled transactions
                </p>
              </div>
              <AlertCircle className="size-4 text-amber-600" />
            </div>
          </section>
        </div>
      </div>

      {/* BANK FEED (Now taking full width!) */}
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Bank Statement Feed</h2>
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
              {aiRunning ? "Matching..." : "Find matches"}
            </button>
          </div>
        </div>
        <BankFeedTable />
      </div>

      {/* MULTIPLE BANK CONNECTIONS (Moved to Absolute Bottom) */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Multiple Bank Connections
          </h2>
        </div>
        <BankAccountsList />
      </div>

      {isAddOpen && <AddBankAccountModal onClose={() => setIsAddOpen(false)} />}
      {trueLayerSelectionId && <TrueLayerAccountSelectionModal connectionId={trueLayerSelectionId} onClose={() => setTrueLayerSelectionId(null)} />}
      {isImportOpen && <ImportStatementModal onClose={() => setIsImportOpen(false)} />}
      {isBalancesOpen && <BalancesModal onClose={() => setIsBalancesOpen(false)} />}
      {isTransferOpen && <TransferMoneyModal onClose={() => setIsTransferOpen(false)} />}
      {isReceiveOpen && <ReceivedPaymentModal onClose={() => setIsReceiveOpen(false)} />}
      {isPayOpen && <PaidExpenseModal onClose={() => setIsPayOpen(false)} />}
    </div>
  );
}

// =====================================================================
// Opening / Closing Balances Modal
// =====================================================================

import {
  getOpeningClosingBalances,
  setOpeningBalance,
  type AccountBalance,
} from "@/lib/banking/api";

function BalancesModal({ onClose }: { onClose: () => void }) {
  // Opening and closing balances are sums of posted journal lines, so they are
  // in the workspace's currency regardless of what the bank account is called.
  const { currency: balanceCurrency } = useCurrency();
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    getOpeningClosingBalances()
      .then(setBalances)
      .catch(() => setError("Failed to load balances."))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (accountId: string) => {
    setSaving(true);
    try {
      const minor = Math.round(parseFloat(editValue) * 100);
      if (isNaN(minor)) {
        setError("Invalid amount.");
        return;
      }
      await setOpeningBalance(accountId, minor);
      const updated = await getOpeningClosingBalances();
      setBalances(updated);
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
      setEditing(null);
      setEditValue("");
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Calculator className="size-5 text-slate-600" />
            <h3 className="text-base font-extrabold text-slate-950">Opening & Closing Balances</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {loading && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2 text-left">Account</th>
                  <th className="py-2 text-right">Opening Balance</th>
                  <th className="py-2 text-right">Closing Balance</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-3">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="mt-1.5 h-3 w-20" />
                    </td>
                    <td className="py-3 text-right">
                      <Skeleton className="ml-auto h-3.5 w-16" />
                    </td>
                    <td className="py-3 text-right">
                      <Skeleton className="ml-auto h-3.5 w-16" />
                    </td>
                    <td className="py-3 text-right">
                      <Skeleton className="ml-auto h-3.5 w-20" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
          {!loading && !error && balances.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calculator className="size-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-600">No bank accounts found</p>
            </div>
          )}
          {!loading && balances.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2 text-left">Account</th>
                  <th className="py-2 text-right">Opening Balance</th>
                  <th className="py-2 text-right">Closing Balance</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {balances.map((b) => (
                  <tr key={b.account_id} className="hover:bg-slate-50">
                    <td className="py-3">
                      <p className="font-semibold text-slate-900">{b.display_name}</p>
                      <p className="text-xs text-slate-500">{b.bank_name}</p>
                    </td>
                    <td className="py-3 text-right">
                      {editing === b.account_id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-28 rounded-md border border-blue-400 px-2 py-1 text-right text-sm outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium text-slate-900">
                          {formatMinor(b.opening_balance_minor, balanceCurrency)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right font-bold text-slate-900">
                      {formatMinor(b.closing_balance_minor, balanceCurrency)}
                    </td>
                    <td className="py-3 text-right">
                      {editing === b.account_id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleSave(b.account_id)}
                            disabled={saving}
                            className="flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {saving && <Loader2 className="size-3 animate-spin" />}
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditing(null);
                              setEditValue("");
                            }}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditing(b.account_id);
                            setEditValue((b.opening_balance_minor / 100).toFixed(2));
                          }}
                          className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                          Set Opening
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FindAndMatchModal({ tx, onClose }: { tx: FeedTransaction; onClose: () => void }) {
  // The feed row is in its bank account's currency; the journals offered as
  // matches are posted in the workspace's. Both appear in this modal, so they
  // are labelled separately rather than assumed to be the same.
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
    } catch {
      setError("Failed to reconcile.");
    } finally {
      setReconciling(null);
    }
  };

  const txAmount = tx.credit_minor > 0 ? tx.credit_minor : tx.debit_minor;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
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
                        className={`text-sm font-bold ${isExact ? "text-green-700" : "text-slate-700"}`}
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

// =====================================================================
// Bank Feed Table
// =====================================================================

function BankFeedTable() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 7;

  const { data: feedPage, isLoading } = useFeedTransactionPage(page, PAGE_SIZE, undefined, search);
  const transactions = feedPage?.transactions;
  const bulkDelete = useBulkDeleteFeed();
  // This table spans every bank account, so there is no single account currency
  // to use. Rows carry their own; the shared column falls back to the
  // workspace's, which is right whenever the accounts agree with it.
  const { currency: feedCurrency } = useCurrency();

  // Reset to page 1 when search changes
  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil((feedPage?.total ?? 0) / PAGE_SIZE));
  const paginated = transactions ?? [];

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
    if (selected.size === selectable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map((t) => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} transaction(s)?`)) return;
    await bulkDelete.mutateAsync(Array.from(selected));
    setSelected(new Set());
    setPage(1);
  };


  const formatMinor = (n: number) => (n > 0 ? formatMoney(n, feedCurrency) : "—");

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
            onClick={handleBulkDelete}
            disabled={selected.size === 0 || bulkDelete.isPending}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
            {selected.size > 0 ? `Delete (${selected.size})` : "Bulk Remove / Delete"}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search feed..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-8 w-48 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
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
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right">Spent</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3 text-left min-w-[220px]">Status</th>
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
                    <Skeleton className="h-7 w-28" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-7 w-28" />
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
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="size-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-500">No transactions yet</p>
          <p className="text-xs text-slate-400">Import a bank statement to populate the feed.</p>
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
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right">Spent</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3 text-left min-w-[220px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((tx) => (
                <FeedRow
                  key={tx.id}
                  tx={tx}
                  selected={selected.has(tx.id)}
                  onToggle={() => toggleSelect(tx.id)}
                  formatMinor={formatMinor}
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
    </div>
  );
}

function AiMatchBadge({ tx }: { tx: FeedTransaction }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const [reconciling, setReconciling] = useState(false);
  const rejectSuggestion = useRejectAiSuggestion();

  const handleReconcile = async () => {
    if (!tx.matched_journal_id) return;
    setReconciling(true);
    try {
      await reconcileFeed(tx.id, tx.matched_journal_id!);
      queryClient.invalidateQueries({ queryKey: bankingKeys.all });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reconcile.");
    } finally {
      setReconciling(false);
    }
  };

  const handleReject = async () => {
    try {
      await rejectSuggestion.mutateAsync(tx.id);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to dismiss suggestion.");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-2 py-1 hover:bg-purple-100 transition-colors"
      >
        <Sparkles className="size-3 shrink-0 text-purple-600" />
        <span className="text-xs font-semibold text-purple-800">AI Match</span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-purple-600" />
                  <h3 className="text-sm font-extrabold text-slate-950">AI Match Found</h3>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2 text-xs mb-4">
                <div className="flex justify-between">
                  <span className="text-slate-500">Feed transaction</span>
                  <span className="font-semibold text-slate-900 truncate max-w-[160px]">
                    {tx.description}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-semibold text-slate-900">
                    {tx.credit_minor > 0
                      ? formatMinor(tx.credit_minor, tx.currency)
                      : formatMinor(tx.debit_minor, tx.currency)}
                  </span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between">
                  <span className="text-slate-500">Matched journal</span>
                  <span className="font-semibold text-purple-700 truncate max-w-[160px]">
                    {tx.ai_match_label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Confidence</span>
                  <span
                    className={`font-bold ${(tx.ai_match_confidence ?? 0) >= 90 ? "text-green-600" : "text-amber-600"}`}
                  >
                    {tx.ai_match_confidence ?? 0}%
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  disabled={rejectSuggestion.isPending}
                  className="flex-1 rounded-md border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {rejectSuggestion.isPending ? "Dismissing..." : "Not a match"}
                </button>
                <button
                  onClick={handleReconcile}
                  disabled={reconciling}
                  className="flex-1 flex items-center justify-center gap-2 rounded-md bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {reconciling && <Loader2 className="size-3.5 animate-spin" />}
                  {reconciling ? "Saving..." : "Reconcile ✓"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function FeedRow({
  tx,
  selected,
  onToggle,
  formatMinor,
}: {
  tx: FeedTransaction;
  selected: boolean;
  onToggle: () => void;
  formatMinor: (n: number) => string;
}) {
  const isReconciled = tx.reconcile_status === "reconciled";
  const [showFindMatch, setShowFindMatch] = useState(false);

  const statusBadge = () => {
    if (isReconciled) {
      return (
        <div className="flex items-center gap-1 text-xs font-semibold text-green-700">
          <CheckCircle2 className="size-4" /> Reconciled
        </div>
      );
    }
    if (tx.reconcile_status === "ai_suggested" && tx.ai_match_label) {
      return <AiMatchBadge tx={tx} />;
    }
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowFindMatch(true)}
          className="text-xs font-semibold text-red-500 hover:text-red-700 hover:underline underline-offset-2"
        >
          Find &amp; Match
        </button>
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
          <span className="block truncate font-medium text-slate-900">{tx.description}</span>
        </td>
        <td className="px-4 py-3"><TransactionScopeSelect transaction={tx} className="w-32" /></td>
        <td className="px-4 py-3"><TransactionCategorySelect transaction={tx} className="w-40" /></td>
        {/* The row's own account currency, so a dollar account's transactions
            are not relabelled as the workspace's. An empty side shows a dash
            rather than a zero, matching the rest of these tables. */}
        <td className="px-4 py-3 text-right font-bold text-slate-900">
          {tx.debit_minor > 0 ? formatMoney(tx.debit_minor, tx.currency) : "—"}
        </td>
        <td className="px-4 py-3 text-right font-bold text-green-600">
          {tx.credit_minor > 0 ? formatMoney(tx.credit_minor, tx.currency) : "—"}
        </td>
        <td className="px-4 py-3">{statusBadge()}</td>
      </tr>
      {showFindMatch && <FindAndMatchModal tx={tx} onClose={() => setShowFindMatch(false)} />}
    </>
  );
}
