"use client";

import { useCurrency } from "@/components/currency-provider";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link"; // 🚀 Added Link import
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Clock,
  Search,
  Mail,
  FileSpreadsheet,
  MoreVertical,
  ArrowLeft,
  CalendarCheck,
  Loader2,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useInvoices } from "../sales/use-invoices";
import { AgedReceivablesSkeleton } from "@/components/reports/skeletons"; // 🚀 Import your AR skeleton!
import { emailArStatement } from "@/app/(dashboard)/reports/aging-actions";
import {
  LedgerReconciliation,
  useAgingReconciliation,
} from "@/components/reports/ledger-reconciliation";
import { agingBucket, agingMoney } from "@/components/reports/aging-money";

export function ARAgingView() {
  const { symbol, format } = useCurrency();
  const { invoices, loading, error } = useInvoices();
  const { reconciliation, reconciliationLoading } = useAgingReconciliation();
  const [searchTerm, setSearchTerm] = useState("");
  // Keyed by contact id, matching the aging rows.
  const [reminders, setReminders] = useState<Record<string, string>>({});
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  
  // ✅ PAGINATION STATES
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Reset pagination indexes on new search filters
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // ✅ LIVE LEDGER DYNAMIC CALCULATION ENGINE
  const agingData = useMemo(() => {
    /* No early return on an empty invoice list. A workspace can hold a
       receivable balance with no invoice behind it — a payment received on
       account is exactly that — and returning here would drop it. */

    const anchorDate = new Date(); // age relative to today
    // Keyed by contact id, not by display name. A name cannot be resolved back
    // to an email address, which is why the reminder button could never send
    // anything; two customers can also share one and would merge into a single
    // row. The name is still carried for display.
    const customerMap: Record<string, {
      key: string;
      contactId: string;
      name: string;
      current: number;
      day1_30: number;
      day31_60: number;
      day61_90: number;
      day90Plus: number;
      total: number;
    }> = {};

    (invoices ?? []).forEach((invoice) => {
      if (invoice.status === "draft" || invoice.status === "void") return;

      // Aged receivables totals many invoices into one figure per customer, so
      // every amount has to be in the same currency. A workspace billing in
      // pounds, pesos and shillings would otherwise add 995 shillings to 100
      // pounds and print the result with a pound sign. The base figures are
      // what the ledger holds, so this report agrees with the trial balance.
      // Older rows predate the base columns, so they fall back to the document
      // amount — correct for the single-currency workspaces that created them.
      const totalMinor = invoice.baseTotalMinor || invoice.totalMinor || 0;
      const paidMinor = invoice.baseAmountPaidMinor ?? invoice.amountPaidMinor ?? 0;
      const outstandingMinor = totalMinor - paidMinor;

      if (outstandingMinor <= 0) return;

      const outstanding = outstandingMinor / 100;
      const customerName = invoice.contactName || "Unassigned Customer";
      const contactId = invoice.contactId || "";
      // Invoices with no contact still need a stable bucket, so they group by
      // name — they just cannot be emailed.
      const key = contactId || `name:${customerName}`;

      if (!customerMap[key]) {
        customerMap[key] = {
          key,
          contactId,
          name: customerName,
          current: 0,
          day1_30: 0,
          day31_60: 0,
          day61_90: 0,
          day90Plus: 0,
          total: 0,
        };
      }

      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : new Date();
      const varianceMs = anchorDate.getTime() - dueDate.getTime();
      const daysPastDue = Math.floor(varianceMs / (1000 * 60 * 60 * 24));

      if (daysPastDue <= 0) {
        customerMap[key].current += outstanding;
      } else if (daysPastDue <= 30) {
        customerMap[key].day1_30 += outstanding;
      } else if (daysPastDue <= 60) {
        customerMap[key].day31_60 += outstanding;
      } else if (daysPastDue <= 90) {
        customerMap[key].day61_90 += outstanding;
      } else {
        customerMap[key].day90Plus += outstanding;
      }

      customerMap[key].total += outstanding;
    });

    /* Movement on the receivable that no invoice explains — a credit note, a
       payment received on account, an adjustment posted straight to 1100. None
       of it appeared here, so a customer sitting in credit read as owing
       nothing rather than being owed, and the report’s total disagreed with
       the trial balance while presenting itself as authoritative.

       These land in the current bucket rather than being aged. A credit has no
       due date — it is available now — and ageing it would imply the business
       is overdue in giving it back. */
    for (const adjustment of reconciliation?.receivableAdjustments ?? []) {
      const name = adjustment.contactName;
      const key = adjustment.contactId || `name:${name}`;
      const amount = adjustment.amountMinor / 100;
      if (amount === 0) continue;

      /* A customer with credit but no open invoices still belongs on the
         report, as a negative balance. Suppressing the row would hide that
         money is owed back to them. */
      customerMap[key] ??= {
        key,
        contactId: adjustment.contactId ?? "",
        name,
        current: 0,
        day1_30: 0,
        day31_60: 0,
        day61_90: 0,
        day90Plus: 0,
        total: 0,
      };

      customerMap[key].current -= amount;
      customerMap[key].total -= amount;
    }

    /* A customer whose credits exactly clear their invoices nets to zero and
       has nothing left to chase, so the row is dropped. Anything non-zero
       stays, including a negative. */
    return Object.values(customerMap).filter((row) => Math.round(row.total * 100) !== 0);
  }, [invoices, reconciliation]);

  /** Total credit applied above, for the reconciliation strip to name. */
  const creditsApplied = useMemo(
    () =>
      (reconciliation?.receivableAdjustments ?? []).reduce(
        (sum, adjustment) => sum + adjustment.amountMinor / 100,
        0
      ),
    [reconciliation]
  );

  const filteredData = useMemo(() => {
    return agingData.filter((item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [agingData, searchTerm]);

  // Global aggregate summary card totals remain stable based on full filtered dataset profile
  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, item) => {
        acc.current += item.current;
        acc.day1_30 += item.day1_30;
        acc.day31_60 += item.day31_60;
        acc.day61_90 += item.day61_90;
        acc.day90Plus += item.day90Plus;
        acc.total += item.total;
        return acc;
      },
      { current: 0, day1_30: 0, day31_60: 0, day61_90: 0, day90Plus: 0, total: 0 }
    );
  }, [filteredData]);

  // ✅ SLICE PAGINATED SUBSET (Max 20 rows per view screen partition)
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage]);

  /**
   * Sends the customer their outstanding balance.
   *
   * This used to write the customer's name into a local object and raise a
   * toast reading "logged on screen" — nothing was sent, and the badge saying a
   * reminder had gone out vanished on refresh. The figures in the email are
   * recomputed on the server from the ledger rather than posted up from here:
   * it is a demand for payment leaving the business, so it should not be
   * rendered from whatever this page happens to be holding.
   */
  const handleSendReminder = async (row: { contactId: string; name: string }) => {
    if (!row.contactId) {
      toast.error(`${row.name} has no customer record, so there is nowhere to send this.`, {
        description: "Attach these invoices to a customer first.",
      });
      return;
    }

    setSendingTo(row.contactId);
    const result = await emailArStatement(row.contactId);
    setSendingTo(null);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    const todayStr = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    setReminders((prev) => ({ ...prev, [row.contactId]: todayStr }));
    toast.success(`Statement sent to ${row.name}`, {
      description: `Delivered to ${result.sentTo}.`,
    });
  };

  const handleExportSpreadsheet = () => {
    if (filteredData.length === 0) return;
    const headers = ["Customer", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Total Owed"];
    const rows = filteredData.map(item => [
      `"${item.name.replace(/"/g, '""')}"`,
      item.current.toFixed(2),
      item.day1_30.toFixed(2),
      item.day31_60.toFixed(2),
      item.day61_90.toFixed(2),
      item.day90Plus.toFixed(2),
      item.total.toFixed(2)
    ]);

    rows.push([
      "TOTAL PORTFOLIO SUMMARY",
      totals.current.toFixed(2),
      totals.day1_30.toFixed(2),
      totals.day31_60.toFixed(2),
      totals.day61_90.toFixed(2),
      totals.day90Plus.toFixed(2),
      totals.total.toFixed(2)
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `AR_Aging_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    // 🚀 Instantly render the flawless UI-matching skeleton
    return <AgedReceivablesSkeleton />;
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* 🚀 NEW: Back Button matches the core ledger layout pattern flawlessly */}
      <Link 
        href="/reports" 
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Report Center
      </Link>

      {/* Header Context Layout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Aged Receivables</h1>
          <p className="text-slate-600 text-sm mt-0.5">Analyze collection intervals and manage outstanding invoice balances.</p>
        </div>
        
        {/* ✅ ACTIONS SECTION: Repositioned Back layout action adjacent to exporter anchor rules */}
        <div className="flex items-center gap-2 shrink-0">
         

          <Button variant="outline" onClick={handleExportSpreadsheet} disabled={filteredData.length === 0} className="h-9 font-semibold text-sm shadow-sm bg-white border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Export Statement Sheet</span>
          </Button>
        </div>
      </div>

      {/* Aggregate Metric Summaries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Outstanding</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{agingMoney(totals.total, symbol)}</h3>
        </CardContent></Card>
        <Card className="border-green-200 bg-green-50/10 shadow-sm"><CardContent className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-green-600">Current (Within Terms)</p>
          <h3 className="text-2xl font-black text-green-700 mt-1">{agingMoney(totals.current, symbol)}</h3>
        </CardContent></Card>
        <Card className="border-amber-200 bg-amber-50/10 shadow-sm"><CardContent className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">1 – 30 Days Overdue</p>
          <h3 className="text-2xl font-black text-amber-700 mt-1">{agingMoney(totals.day1_30, symbol)}</h3>
        </CardContent></Card>
        <Card className="border-red-200 bg-red-50/10 shadow-sm"><CardContent className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">31+ Days Overdue</p>
          <h3 className="text-2xl font-black text-red-700 mt-1">{agingMoney(totals.day31_60 + totals.day61_90 + totals.day90Plus, symbol)}</h3>
        </CardContent></Card>
      </div>

      {/* Checks the total above against 1100 in the ledger. Deliberately not
          hidden when it passes: the point is that the figure can be trusted. */}
      <LedgerReconciliation
        side="receivable"
        reportTotal={totals.total}
        symbol={symbol}
        creditsApplied={creditsApplied}
        data={reconciliation}
        loading={reconciliationLoading}
      />

      {/* Main Schedule Ledger Block Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between">
        <div>
          <CardHeader className="bg-slate-50/40 border-b pt-6 pb-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" /> Accounts Receivable Aging Schedule
              </CardTitle>
              <CardDescription className="text-xs">Outstanding books parsed into days past due thresholds.</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Filter by customer name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-white h-9"
              />
            </div>
          </CardHeader>
          
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 text-xs uppercase tracking-wider font-bold">
                <TableRow>
                  <TableHead className="pl-6">Customer</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right text-amber-600">1 – 30 Days</TableHead>
                  <TableHead className="text-right text-amber-700">31 – 60 Days</TableHead>
                  <TableHead className="text-right text-orange-600">61 – 90 Days</TableHead>
                  <TableHead className="text-right text-red-600">90+ Days</TableHead>
                  <TableHead className="text-right font-bold text-slate-900">Total Owed</TableHead>
                  <TableHead className="w-12 pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody className="font-medium text-slate-700">
                {/* ✅ RENDERS SUBSET SPLICED RECORDS */}
                {paginatedData.map((item) => (
                  <TableRow key={item.key} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="pl-6 font-bold text-slate-800">
                      <div>
                        <p>{item.name}</p>
                        {reminders[item.contactId] && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 font-bold px-1.5 py-0.5 rounded-md animate-fade-in">
                            <CalendarCheck className="size-3" /> Statement sent {reminders[item.contactId]}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-slate-500">{agingBucket(item.current, symbol)}</TableCell>
                    <TableCell className="text-right text-amber-600 font-mono">{agingBucket(item.day1_30, symbol)}</TableCell>
                    <TableCell className="text-right text-amber-700 font-mono">{agingBucket(item.day31_60, symbol)}</TableCell>
                    <TableCell className="text-right text-orange-600 font-mono">{agingBucket(item.day61_90, symbol)}</TableCell>
                    <TableCell className="text-right text-red-600 font-mono">{agingBucket(item.day90Plus, symbol)}</TableCell>
                    <TableCell className="text-right font-black text-slate-900">{agingMoney(item.total, symbol)}</TableCell>
                    <TableCell className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            disabled={sendingTo === item.contactId}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            {sendingTo === item.contactId ? (
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            className="cursor-pointer"
                            disabled={!item.contactId}
                            onClick={() => handleSendReminder(item)}
                          >
                            <Mail className="mr-2 h-4 w-4 text-blue-600" /> Email Statement Reminder
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-slate-400 font-medium">
                      No active outstanding receivables found.
                    </TableCell>
                  </TableRow>
                )}

                {/* Summary Global Totals Footer Anchor */}
                <TableRow className="bg-slate-50/60 font-bold text-slate-900 border-t-2 border-slate-200">
                  <TableCell className="pl-6 uppercase tracking-wider text-xs font-black">Total Portfolio</TableCell>
                  <TableCell className="text-right">{agingMoney(totals.current, symbol)}</TableCell>
                  <TableCell className="text-right text-amber-600 font-mono">{agingMoney(totals.day1_30, symbol)}</TableCell>
                  <TableCell className="text-right text-amber-700 font-mono">{agingMoney(totals.day31_60, symbol)}</TableCell>
                  <TableCell className="text-right text-orange-600 font-mono">{agingMoney(totals.day61_90, symbol)}</TableCell>
                  <TableCell className="text-right text-red-600 font-mono">{agingMoney(totals.day90Plus, symbol)}</TableCell>
                  <TableCell className="text-right font-black text-blue-600 bg-blue-50/30">{agingMoney(totals.total, symbol)}</TableCell>
                  <TableCell className="pr-6 bg-blue-50/30" />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ✅ NEW: CONTROLS FOOTER PANEL (Displays if overall array entries overflow pagination partition limit) */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 text-sm font-semibold text-slate-600 bg-slate-50/20">
            <div className="text-xs font-bold text-slate-400">
              Showing {((currentPage - 1) * itemsPerPage) + 1} – {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} customers
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