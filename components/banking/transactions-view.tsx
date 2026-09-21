"use client";

import { useState } from "react";
import {
  Building2,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Loader2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";

import { useBankAccounts, useBankAccounts as useAccounts, bankingKeys, getAccountTransactions } from "@/lib/banking/api";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { WindowedPager } from "@/components/ui/windowed-pager";
import { formatMoney } from "@/lib/currency";
import { useCurrency } from "@/components/currency-provider";

// ─── Types ───────────────────────────────────────────────────────────

type BankTransaction = {
  id: string;
  journal_id: string;
  journal_date: string;
  memo: string | null;
  debit_minor: number;
  credit_minor: number;
  source_type: string | null;
};

// ─── Hook ────────────────────────────────────────────────────────────

function useBankAccountTransactions(chartAccountId: string | null) {
  return useQuery({
    queryKey: [...bankingKeys.all, "transactions", chartAccountId],
    queryFn: () => getAccountTransactions(chartAccountId!),
    enabled: !!chartAccountId,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

const TONE_STYLES: Record<string, { bg: string; text: string }> = {
  blue:   { bg: "bg-blue-100",   text: "text-blue-600"   },
  orange: { bg: "bg-orange-100", text: "text-orange-600" },
  green:  { bg: "bg-green-100",  text: "text-green-600"  },
  purple: { bg: "bg-purple-100", text: "text-purple-600" },
  slate:  { bg: "bg-slate-100",  text: "text-slate-600"  },
};

// Defers to the shared registry, which covers every supported currency; the
// local symbol table this replaced knew only three and left pesos and shillings
// rendered as bare numbers.
function formatCurrency(minor: number, currency?: string | null) {
  return formatMoney(minor, currency);
}

const PAGE_SIZE = 10;

// ─── Main Component ──────────────────────────────────────────────────

export function TransactionsView() {
  // This screen shows ledger transactions posted to each bank account, and the
  // ledger is kept in one currency. `account.currency` says what the real bank
  // account is denominated in — it does not describe these figures.
  const { currency: ledgerCurrency } = useCurrency();
  const { data: accounts, isLoading: accountsLoading } = useBankAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Find the selected account object
  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId) ?? null;

  // Auto-select first account once loaded
  if (accounts && accounts.length > 0 && !selectedAccountId) {
    setSelectedAccountId(accounts[0].id);
  }

  const { data: transactions, isLoading: txLoading, error } =
    useBankAccountTransactions(selectedAccount?.chart_account_id ?? null);

  // Filter by search
  const filtered = (transactions ?? []).filter((t) =>
    (t.memo ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleAccountChange = (id: string) => {
    setSelectedAccountId(id);
    setSearch("");
    setPage(1);
  };

  const tone = TONE_STYLES[selectedAccount?.color_tone ?? "blue"];

  return (
    <div className="flex flex-col gap-6 pb-10">

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Account Transactions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ledger transactions posted to each bank account.
          </p>
        </div>

        {/* Account Selector */}
        {!accountsLoading && accounts && accounts.length > 0 && (
          <div className="relative min-w-[220px]">
            <select
              value={selectedAccountId}
              onChange={(e) => handleAccountChange(e.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name} ({a.bank_name})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          </div>
        )}
      </div>

      {/* ── Account Summary Card ── */}
      {accountsLoading && (
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <Skeleton className="size-11 shrink-0 rounded-lg" />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-1.5 h-3 w-52" />
          </div>
          <div className="shrink-0 text-right">
            <Skeleton className="ml-auto h-3 w-20" />
            <Skeleton className="ml-auto mt-1.5 h-6 w-24" />
          </div>
        </div>
      )}
      {selectedAccount && (
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${tone.bg} ${tone.text}`}>
            <Building2 className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-slate-900">{selectedAccount.display_name}</p>
            <p className="text-xs text-slate-500">
              {selectedAccount.bank_name}
              {selectedAccount.sort_code ? ` • Sort: ${selectedAccount.sort_code}` : ""}
              {selectedAccount.account_number_last4 ? ` • ****${selectedAccount.account_number_last4}` : ""}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-semibold text-slate-400">Ledger Balance</p>
            <p className="text-xl font-extrabold text-slate-900">
              {formatCurrency(
                Math.round(parseFloat(selectedAccount.balance ?? "0") * 100),
                ledgerCurrency
              )}
            </p>
          </div>
        </div>
      )}

      {/* ── Transactions Table ── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-500">
            {txLoading ? "Loading…" : `${filtered.length} transaction${filtered.length !== 1 ? "s" : ""}`}
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by memo..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-8 w-52 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Loading */}
        {(txLoading || accountsLoading) && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-left">Description</th>
                  <th className="px-6 py-3 text-left">Source</th>
                  <th className="px-6 py-3 text-right">Spent</th>
                  <th className="px-6 py-3 text-right">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-3"><Skeleton className="h-3.5 w-16" /></td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="size-6 shrink-0 rounded-full" />
                        <Skeleton className="h-3.5 w-32" />
                      </div>
                    </td>
                    <td className="px-6 py-3"><Skeleton className="h-3.5 w-16" /></td>
                    <td className="px-6 py-3 text-right"><Skeleton className="ml-auto h-3.5 w-14" /></td>
                    <td className="px-6 py-3 text-right"><Skeleton className="ml-auto h-3.5 w-14" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Error */}
        {error && !txLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="size-10 text-red-300" />
            <p className="mt-3 text-sm font-semibold text-red-600">Failed to load transactions</p>
            <p className="mt-1 text-xs text-slate-400">Please try again, or reload the page.</p>
          </div>
        )}

        {/* No accounts */}
        {!accountsLoading && accounts && accounts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Building2 className="size-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-600">No bank accounts yet</p>
            <p className="mt-1 text-xs text-slate-400">Add a bank account from the dashboard first.</p>
          </div>
        )}

        {/* Empty state */}
        {!txLoading && !error && filtered.length === 0 && selectedAccount && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Receipt className="size-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-600">
              {search ? "No matching transactions" : "No transactions yet"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {search
                ? "Try a different search term."
                : "Transactions appear here once journals are posted to this account."}
            </p>
          </div>
        )}

        {/* Table */}
        {!txLoading && !error && paginated.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-left">Description</th>
                  <th className="px-6 py-3 text-left">Source</th>
                  <th className="px-6 py-3 text-right">Spent</th>
                  <th className="px-6 py-3 text-right">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((tx) => {
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
                          <div className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                            isDebit ? "bg-green-100 text-green-600" : "bg-red-100 text-red-500"
                          }`}>
                            {isDebit
                              ? <ArrowDownLeft className="size-3" />
                              : <ArrowUpRight className="size-3" />
                            }
                          </div>
                          <span className="max-w-xs truncate font-medium text-slate-900">
                            {tx.memo || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        {tx.source_type ? (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            {tx.source_type}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-slate-900">
                        {tx.credit_minor > 0 ? formatCurrency(tx.credit_minor, ledgerCurrency) : "—"}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-green-600">
                        {tx.debit_minor > 0 ? formatCurrency(tx.debit_minor, ledgerCurrency) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <WindowedPager
          page={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}