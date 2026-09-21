"use client";

import { useCurrency } from "@/components/currency-provider";
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import Link from "next/link";
import {
  Search,
  FileSpreadsheet,
  MoreVertical,
  CalendarClock,
  Mail,
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ArrowLeft
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// 🚀 Import the AgedPayablesSkeleton you just showed me!
import { AgedPayablesSkeleton } from "@/components/reports/skeletons"; // <-- Update the path if needed

// ✅ IMPORT YOUR REAL PURCHASES HOOK
import { usePurchases } from "@/components/purchases/use-purchases";
import { emailApRemittance } from "@/app/(dashboard)/reports/aging-actions";
import {
  LedgerReconciliation,
  useAgingReconciliation,
} from "@/components/reports/ledger-reconciliation";
import { agingBucket, agingMoney } from "@/components/reports/aging-money";

export function APAgingView() {
  const { symbol, format } = useCurrency();
  // ✅ Fetch real supplier bill data
  const { bills, loading, error } = usePurchases();
  const { reconciliation, reconciliationLoading } = useAgingReconciliation();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Keyed by contact id, matching the aging rows.
  const [scheduledPayments, setScheduledPayments] = useState<Record<string, string>>({});
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // ✅ DYNAMIC LEDGER CALCULATION ENGINE
  const agingData = useMemo(() => {
    /* No early return on an empty bill list, for the same reason aged
       receivables has none: a payable can move without a bill behind it. */

    const anchorDate = new Date(); // age relative to today
    // Keyed by contact id rather than display name, so a row can be resolved
    // back to a supplier record — and therefore to an email address.
    const supplierMap: Record<string, {
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

    (bills ?? []).forEach((bill: any) => {
      // ✅ Ignore drafts, voided, and fully paid bills
      if (bill.status === "draft" || bill.status === "void" || bill.status === "paid") return;

      // One figure per supplier means one currency. Totalling the face values
      // of bills raised in pounds, pesos and shillings adds unlike amounts and
      // labels the result with the workspace symbol; the base totals are what
      // the ledger holds, so this agrees with the trial balance.
      const totalMinor = bill.baseTotalMinor || bill.totalMinor || 0;
      // Base, to match the total above. amountPaidMinor is in the supplier's
      // own currency, so subtracting it from a base total takes pesos off
      // pounds and reports the remainder as though it were sterling.
      const paidMinor = bill.baseAmountPaidMinor ?? bill.amountPaidMinor ?? 0;
      const outstandingMinor = totalMinor - paidMinor;

      // Skip fully paid bills just in case
      if (outstandingMinor <= 0) return;

      const outstanding = outstandingMinor / 100;
      const supplierName = bill.contactName || "Unassigned Supplier";
      const contactId = bill.contactId || "";
      // Bills with no supplier record still group, they just cannot be emailed.
      const key = contactId || `name:${supplierName}`;

      if (!supplierMap[key]) {
        supplierMap[key] = {
          key,
          contactId,
          name: supplierName,
          current: 0,
          day1_30: 0,
          day31_60: 0,
          day61_90: 0,
          day90Plus: 0,
          total: 0,
        };
      }

      const dueDate = bill.dueDate ? new Date(bill.dueDate) : new Date();
      const varianceMs = anchorDate.getTime() - dueDate.getTime();
      const daysPastDue = Math.floor(varianceMs / (1000 * 60 * 60 * 24));

      if (daysPastDue <= 0) {
        supplierMap[key].current += outstanding;
      } else if (daysPastDue <= 30) {
        supplierMap[key].day1_30 += outstanding;
      } else if (daysPastDue <= 60) {
        supplierMap[key].day31_60 += outstanding;
      } else if (daysPastDue <= 90) {
        supplierMap[key].day61_90 += outstanding;
      } else {
        supplierMap[key].day90Plus += outstanding;
      }

      supplierMap[key].total += outstanding;
    });

    /* Movement on the payable that no bill explains — a supplier credit, a
       payment made on account, an adjustment posted straight to 2000. The
       mirror of what aged receivables does with 1100, and left out for the
       same reason: the report only ever knew how to read documents. */
    for (const adjustment of reconciliation?.payableAdjustments ?? []) {
      const name = adjustment.contactName;
      const key = adjustment.contactId || `name:${name}`;
      const amount = adjustment.amountMinor / 100;
      if (amount === 0) continue;

      supplierMap[key] ??= {
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

      supplierMap[key].current -= amount;
      supplierMap[key].total -= amount;
    }

    /* A supplier whose credits clear their bills nets to zero and drops off.
       Anything non-zero stays, including a negative. */
    return Object.values(supplierMap).filter((row) => Math.round(row.total * 100) !== 0);
  }, [bills, reconciliation]);

  /** Total credit applied above, for the reconciliation strip to name. */
  const creditsApplied = useMemo(
    () =>
      (reconciliation?.payableAdjustments ?? []).reduce(
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

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage]);

  /**
   * Emails the supplier a summary of the bills still open with them, so they
   * can check it against their own records.
   *
   * The figures are recomputed on the server from the same DAL this report
   * reads, so what the supplier receives cannot disagree with what is on
   * screen.
   */
  const handleEmailSummary = async (row: { contactId: string; name: string }) => {
    if (!row.contactId) {
      toast.error(`${row.name} has no supplier record, so there is nowhere to send this.`, {
        description: "Attach these bills to a supplier first.",
      });
      return;
    }

    setSendingTo(row.contactId);
    const result = await emailApRemittance(row.contactId);
    setSendingTo(null);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    const todayStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    setScheduledPayments((prev) => ({ ...prev, [row.contactId]: todayStr }));
    toast.success(`Summary sent to ${row.name}`, { description: `Delivered to ${result.sentTo}.` });
  };

  const handleExportSpreadsheet = () => {
    if (filteredData.length === 0) return;
    const headers = ["Supplier", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Total Owed"];
    const rows = filteredData.map(item => [
      `"${item.name.replace(/"/g, '""')}"`,
      item.current.toFixed(2), item.day1_30.toFixed(2), item.day31_60.toFixed(2),
      item.day61_90.toFixed(2), item.day90Plus.toFixed(2), item.total.toFixed(2)
    ]);
    rows.push([
      "TOTAL PAYABLES SUMMARY",
      totals.current.toFixed(2), totals.day1_30.toFixed(2), totals.day31_60.toFixed(2),
      totals.day61_90.toFixed(2), totals.day90Plus.toFixed(2), totals.total.toFixed(2)
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `AP_Aging_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    // 🚀 Uses your exact AgedPayablesSkeleton!
    return <AgedPayablesSkeleton />; 
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <Link 
        href="/reports" 
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Report Center
      </Link>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Aged Payables</h1>
          <p className="text-slate-600 text-sm mt-0.5">Manage outstanding vendor bills and payment schedules.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={handleExportSpreadsheet} disabled={filteredData.length === 0} className="h-9 font-semibold text-sm shadow-sm bg-white border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Export Payables Sheet</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border-blue-200 bg-blue-50/20"><CardContent className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Total Payables</p>
          <h3 className="text-2xl font-black text-blue-900 mt-1">{agingMoney(totals.total, symbol)}</h3>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current (Not Due)</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{agingMoney(totals.current, symbol)}</h3>
        </CardContent></Card>
        <Card className="border-amber-200 bg-amber-50/10 shadow-sm"><CardContent className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">1 – 30 Days Late</p>
          <h3 className="text-2xl font-black text-amber-700 mt-1">{agingMoney(totals.day1_30, symbol)}</h3>
        </CardContent></Card>
        <Card className="border-red-200 bg-red-50/10 shadow-sm"><CardContent className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">31+ Days Late</p>
          <h3 className="text-2xl font-black text-red-700 mt-1">{agingMoney(totals.day31_60 + totals.day61_90 + totals.day90Plus, symbol)}</h3>
        </CardContent></Card>
      </div>

      {/* Checks the total above against 2000 in the ledger, the same way aged
          receivables checks itself against 1100. */}
      <LedgerReconciliation
        side="payable"
        reportTotal={totals.total}
        symbol={symbol}
        creditsApplied={creditsApplied}
        data={reconciliation}
        loading={reconciliationLoading}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between">
        <div>
          <CardHeader className="bg-slate-50/40 border-b pt-6 pb-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-purple-600" /> Accounts Payable Aging Schedule
              </CardTitle>
              <CardDescription className="text-xs">Outstanding vendor liabilities categorized by age.</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Filter by supplier..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 bg-white h-9" />
            </div>
          </CardHeader>
          
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 text-xs uppercase tracking-wider font-bold">
                <TableRow>
                  <TableHead className="pl-6">Supplier</TableHead>
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
                {paginatedData.map((item) => (
                  <TableRow key={item.key} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="pl-6 font-bold text-slate-800">
                      <div>
                        <p>{item.name}</p>
                        {scheduledPayments[item.contactId] && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-purple-600 bg-purple-50 border border-purple-100 font-bold px-1.5 py-0.5 rounded-md animate-fade-in">
                            <CalendarClock className="size-3" /> Summary sent {scheduledPayments[item.contactId]}
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
                            className="h-8 w-8 p-0 text-slate-400 hover:text-purple-600 transition-colors"
                          >
                            {sendingTo === item.contactId ? (
                              <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            className="cursor-pointer"
                            disabled={!item.contactId}
                            onClick={() => handleEmailSummary(item)}
                          >
                            <Mail className="mr-2 h-4 w-4 text-purple-600" /> Email Account Summary
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredData.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-400 font-medium">No active outstanding payables found.</TableCell></TableRow>
                )}
                <TableRow className="bg-slate-50/60 font-bold text-slate-900 border-t-2 border-slate-200">
                  <TableCell className="pl-6 uppercase tracking-wider text-xs font-black">Total Payables</TableCell>
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
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 text-sm font-semibold text-slate-600 bg-slate-50/20">
            <div className="text-xs font-bold text-slate-400">Showing {((currentPage - 1) * itemsPerPage) + 1} – {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} suppliers</div>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"><ChevronLeft className="size-4" /></button>
              <div className="px-3 text-xs font-bold text-slate-500 bg-slate-50 rounded-lg h-8 flex items-center border border-slate-200/40">Page {currentPage} of {totalPages}</div>
              <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"><ChevronRight className="size-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}