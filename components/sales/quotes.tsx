"use client";

import { useCurrency } from "@/components/currency-provider";
import { useState, useMemo, useEffect } from "react";
import { FileText, Plus, Send, Target, TrendingUp, Search, ChevronLeft, ChevronRight, Edit2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

import { CreateInvoiceView } from "./add-invoice-dialog";
import { useInvoices } from "./use-invoices";
import { QuotesSkeleton } from "./skeletons";
import { cn } from "@/lib/utils";

function formatDate(date: string | null) {
  if (!date) return "No due date";
  return new Date(date).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function Quotes({ activeOrgId, initialCreate = false }: { activeOrgId: string; initialCreate?: boolean }) {
  const { format: formatMinor, symbol } = useCurrency();
  const {
    invoices,
    contacts,
    accounts,
    bankAccounts,
    taxRates,
    chargeItems,
    canManage,
    loading, 
    saving, 
    error, 
    addInvoice, 
    approveInvoice, 
    stats 
  } = useInvoices();

  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(initialCreate);

  // 🔢 Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // 🎯 NEW: Dynamic Target States with LocalStorage Memory
  const [targetMinor, setTargetMinor] = useState(50000000); // Default: £500,000.00
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState("500000");

  // Load saved target from local storage on mount
  useEffect(() => {
    const savedTarget = localStorage.getItem("wawprofi_revenue_target");
    if (savedTarget) {
      const parsed = parseInt(savedTarget, 10);
      setTargetMinor(parsed);
      setTargetInput((parsed / 100).toString());
    }
  }, []);

  // Save updated target configuration handler
  const handleSaveTarget = () => {
    const cleanAmount = parseFloat(targetInput.replace(/,/g, "")) || 0;
    const computedMinor = Math.round(cleanAmount * 100);
    setTargetMinor(computedMinor);
    localStorage.setItem("wawprofi_revenue_target", computedMinor.toString());
    setIsEditingTarget(false);
  };
  
  // ✅ DEDICATED PROPOSAL / ESTIMATE PRINT ENGINE
  const handlePrintQuote = (quoteItem: any) => {
    if (!quoteItem.id) return;
    // 🚀 We now use the dedicated, perfectly styled Print App Route!
    // Appending ?type=quote tells the print page to fetch the Quote settings instead of Invoice settings.
    window.open(`/print/invoice/${quoteItem.id}?type=quote`, "_blank");
  };

  // 🔄 Smart Reset
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // --- DYNAMIC LIVE PIPELINE CALCULATIONS ---
  const quotesData = useMemo(() => {
    const baseQuotes = invoices.filter((invoice) => invoice.status === "draft");

    const filtered = baseQuotes.filter((quote) => {
      return (
        quote.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        quote.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });

    const wonMinor = invoices.reduce((acc, inv) => {
      const statusLower = inv.status.toLowerCase();
      if (statusLower === "approved" || statusLower === "sent" || statusLower === "paid") {
        // Converted first: this totals across invoices, which may be in
        // different currencies.
        return acc + Math.round(Number(inv.totalMinor) * (inv.exchangeRate ?? 1));
      }
      return acc;
    }, 0);

    const targetProgressPercentage = targetMinor > 0 ? Math.min((wonMinor / targetMinor) * 100, 100) : 0;
    
    const approvedCount = invoices.filter(i => i.status.toLowerCase() === "approved" || i.status.toLowerCase() === "paid").length;
    const totalPipelineDeals = invoices.filter(i => ["draft", "approved", "sent", "paid"].includes(i.status.toLowerCase())).length;
    const winRate = totalPipelineDeals > 0 ? (approvedCount / totalPipelineDeals) * 100 : 0;

    return {
      filtered,
      wonMinor,
      targetProgressPercentage,
      winRate,
      totalDraftsCount: baseQuotes.length
    };
  }, [invoices, searchQuery, targetMinor]);

  // 🧮 Compute Paginated Segments
  const totalPages = Math.ceil(quotesData.filtered.length / itemsPerPage) || 1;

  const paginatedQuotes = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return quotesData.filtered.slice(startIndex, startIndex + itemsPerPage);
  }, [quotesData.filtered, currentPage]);

  // Placed after every hook so the hook order stays stable across renders —
  // and checked BEFORE the create view: arriving via ?action=create mounts the
  // form on a cold cache, where the empty accounts placeholder made it show
  // "set up your chart of accounts" to workspaces that have them. `loading` is
  // isPending (no data at all), so a background refetch never unmounts the form.
  if (loading) return <QuotesSkeleton />;

  // ✅ PAGE ROUTING LOGIC: Render full-page view if `dialogOpen` is true
  if (dialogOpen) {
    return (
      <CreateInvoiceView
        activeOrgId={activeOrgId} // 🚀 Add this right here!
        key="new-quote-active"
        saving={saving}
        contacts={contacts}
        accounts={accounts}
        bankAccounts={bankAccounts}
        taxRates={taxRates}
        chargeItems={chargeItems}
        invoice={null}
        invoices={invoices}
        onCancel={() => setDialogOpen(false)}
        onSubmit={async (input: any) => {
          const result = await addInvoice(input);
          if (result.success) setDialogOpen(false);
          return result;
        }}
      />
    );
  }

  // ✅ Otherwise, render the main dashboard table!
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Quotes & Pipeline Analysis
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Prepare draft quotes, track revenue target completions, and convert approved work into active invoices.
          </p>
        </div>
        <Button 
          onClick={() => setDialogOpen(true)}
          disabled={!canManage}
          className="h-9 gap-1.5 bg-orange-500 px-3 text-sm font-semibold text-white hover:bg-orange-600 shadow-sm shrink-0 transition-colors"
        >
          <Plus className="size-4 stroke-[2.5]" />
          <span>New Quote</span>
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* REVENUE TARGET TRACKER GAUGE WITH EDIT CAPABILITIES */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100">
              <Target className="size-4 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Monthly Revenue Target Tracker</h3>
              <p className="text-xs text-slate-400">Progression mapped against won/approved client metrics this period.</p>
            </div>
          </div>
          
          {/* Editable Form Field Trigger Logic Group */}
          <div className="flex items-center gap-2 font-medium self-start sm:self-center bg-slate-50 p-1.5 rounded-lg border border-slate-200/60 shadow-sm">
            <span className="text-sm font-black text-slate-900 pl-1.5">{formatMinor(quotesData.wonMinor)}</span>
            <span className="text-xs font-semibold text-slate-400">/</span>
            
            {isEditingTarget ? (
              <div className="flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="relative flex items-center">
                  <span className="absolute left-2 text-xs font-bold text-slate-400">{symbol}</span>
                  <input 
                    type="text"
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    className="h-7 w-24 rounded border border-slate-200 bg-white pl-5 pr-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
                <button 
                  onClick={handleSaveTarget}
                  className="flex size-7 items-center justify-center rounded bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm"
                >
                  <Check className="size-3.5 stroke-[3]" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-600">{formatMinor(targetMinor)}</span>
                <button 
                  onClick={() => setIsEditingTarget(true)}
                  className="p-1 rounded text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
                  title="Modify revenue target goals"
                >
                  <Edit2 className="size-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="relative w-full h-3.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60 shadow-inner">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-1000 ease-out relative"
            style={{ width: `${quotesData.targetProgressPercentage}%` }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:16px_16px] animate-[shimmer_2s_linear_infinite]" />
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-2.5 text-xs font-bold text-indigo-600 bg-indigo-50/50 rounded-md px-3 py-1.5 border border-indigo-100/40">
          <span className="flex items-center gap-1"><TrendingUp className="size-3.5" /> Pipeline Performance pace</span>
          <span>{quotesData.targetProgressPercentage.toFixed(1)}% Completed</span>
        </div>
      </div>

      {/* PIPELINE METRICS GRID */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Active Draft Quotes
          </p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {quotesData.totalDraftsCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Estimated Pipeline Value
          </p>
          <p className="mt-2 text-2xl font-extrabold text-blue-600">
            {formatMinor(stats?.draft ? Number(stats.draft) : 0)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Pipeline Proposal Win-Rate
          </p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600">
            {quotesData.winRate.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* PIPELINE LEDGER PLATFORM */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4 gap-3 bg-slate-50/40">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900 sm:text-base">
              Draft Quote Pipeline
            </h2>
          </div>

          <div className="flex items-center gap-2.5 relative w-full sm:w-auto">
            <Search className="size-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search active quote parameters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full sm:w-64 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
            />
          </div>
        </div>

        {quotesData.filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <FileText className="size-10 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-800">
              {searchQuery ? "No matching quotes found" : "No draft quotes active"}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              {searchQuery 
                ? `We couldn't locate any records matching "${searchQuery}".`
                : "Draft invoices generated across your accounting profiles appear here as quote work in progress."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {paginatedQuotes.map((quote) => (
              <div
                key={quote.id}
                className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/60 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-800 text-sm">
                    {quote.contactName}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-semibold text-slate-500">{quote.invoiceNo}</span> &middot; {formatDate(quote.dueDate)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <p className="font-black text-slate-900 text-sm sm:text-base mr-1">
                    {formatMinor(quote.totalMinor)}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button 
                      title="Send/Print proposal document"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrintQuote(quote); 
                      }}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all border border-transparent hover:border-slate-200/80 active:scale-95"
                    >
                      <Send className="size-3.5" />
                    </button>
                    
                    {/* ✅ CONVERSION ACTION PIPELINE BUTTON */}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canManage || saving}
                      onClick={async (e) => {
                        e.stopPropagation(); 
                        if (confirm(`Post quote ${quote.invoiceNo || "Draft"} as an approved live invoice?`)) {
                          if (approveInvoice) await approveInvoice(quote.id);
                        }
                      }}
                      className="h-8 text-xs font-bold border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 transition-all shadow-sm"
                    >
                      Convert to Invoice
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 text-sm font-semibold text-slate-600 bg-slate-50/20">
            <div className="text-xs font-bold text-slate-400">
              Showing {((currentPage - 1) * itemsPerPage) + 1} – {Math.min(currentPage * itemsPerPage, quotesData.filtered.length)} of {quotesData.filtered.length} quotes
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                <ChevronLeft className="size-4" />
              </button>
              
              <div className="px-3 text-xs font-bold text-slate-500 bg-slate-50 rounded-lg h-8 flex items-center border border-slate-200/40">
                Page {currentPage} of {totalPages}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
