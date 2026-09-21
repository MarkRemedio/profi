"use client";

import { useCurrency } from "@/components/currency-provider";
import { currencyInputInset } from "@/lib/currency";
import { useState, useEffect, useMemo, useCallback, useTransition } from "react";
import {
  Wallet,
  Calculator,
  FileText,
  Printer,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Banknote,
  Smartphone,
  Download,
  Lock,
  Unlock,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PosReceiptSkeleton } from "@/components/pos/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// Import live transaction actions
import {
  getPosSales,
  getPosRefunds,
  closeRegisterDay,
  getRegisterDayCloses,
  type RegisterDayClose,
} from "@/app/(dashboard)/pos/actions";


/**
 * The register's idea of "today", in the local timezone.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that is UTC, so under BST it
 * reports yesterday's date between midnight and 1am and the close would be
 * filed against the wrong business day.
 */
function todayIsoDate() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * The Z-report is built as an HTML string and handed to document.write, so any
 * user-supplied value going into it has to be escaped first.
 */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The same day as {@link todayIsoDate}, formatted dd/mm/yyyy.
 *
 * Must stay in the same format getPosSales uses for its `date` field, since the
 * takings filter matches on that prefix.
 */
function todayDisplayDate() {
  return new Date().toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function POSReconciliation() {
  const { symbol, format: formatCurrency } = useCurrency();
  const [isClosed, setIsClosed] = useState(false);
  const [cashCounted, setCashCounted] = useState("");
  /** How much of the counted cash is being taken to the bank; the rest is float. */
  const [bankedAmount, setBankedAmount] = useState("");
  const [isClosing, startClosing] = useTransition();
  const [notes, setNotes] = useState("");
  
  // Database States
  /** Printed on the Z-report; blank until the register data loads. */
  const [orgName, setOrgName] = useState("");
  const [sales, setSales] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch data logs from database
  const loadRegisterData = useCallback(async () => {
    setIsLoading(true);
    const [salesRes, refundsRes, closesRes] = await Promise.all([
      getPosSales(),
      getPosRefunds(),
      getRegisterDayCloses(),
    ]);

    if (salesRes.success && salesRes.data) {
      setSales(salesRes.data);
    }
    if (refundsRes.success && refundsRes.data) {
      setRefunds(refundsRes.data);
    }

    // Closing the day used to be local state only, so a refresh showed an open
    // register even though the journals were already posted. Rehydrate from the
    // saved close so the lock reflects what is actually in the ledger.
    if (closesRes.success && closesRes.data) {
      setOrgName(closesRes.data.organizationName);
      const today = todayIsoDate();
      const close = closesRes.data.closes.find((c: RegisterDayClose) => c.businessDate === today);
      if (close) {
        setIsClosed(true);
        setCashCounted((close.countedCashMinor / 100).toFixed(2));
        setBankedAmount(close.bankedMinor ? (close.bankedMinor / 100).toFixed(2) : "");
        setNotes(close.notes ?? "");
      }
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadRegisterData();
  }, [loadRegisterData]);

  const totals = useMemo(() => {
    // Was hardcoded to "20/05/2026", so the register only ever counted sales
    // from that one day and today's takings never appeared.
    const todayStr = todayDisplayDate();
    
    let cash = 0;
    let card = 0;
    let mobile = 0;
    let itemsSold = 0;
    let discounts = 0;
    let transactionCount = 0;

    const todaysSales = sales.filter(s => s.date.startsWith(todayStr));

    todaysSales.forEach((sale) => {
      if (sale.status === "completed") {
        transactionCount++;
        discounts += sale.discount || 0;
        itemsSold += sale.itemsCount || 0;

        if (sale.paymentMethod === "cash") cash += sale.total;
        else if (sale.paymentMethod === "card") card += sale.total;
        else if (sale.paymentMethod === "mobile") mobile += sale.total;
      }
    });

    const todaysRefunds = refunds.filter(r => r.date.startsWith(todayStr));
    const totalRefunds = todaysRefunds.reduce((sum, r) => sum + r.amount, 0);

    const grossTotal = cash + card + mobile;
    const netTotal = grossTotal - totalRefunds;

    return {
      expectedCash: cash,
      expectedCard: card,
      expectedMobile: mobile,
      expectedTotal: grossTotal,
      netTotal,
      totalRefunds,
      discounts,
      transactionCount,
      itemsSold
    };
  }, [sales, refunds]);

  // Handle dynamic cash variance tracking
  const variance = useMemo(() => {
    if (!cashCounted) return 0;
    const countedInPence = Math.round(parseFloat(cashCounted) * 100);
    return countedInPence - totals.expectedCash;
  }, [cashCounted, totals.expectedCash]);

  // Monospace Thermal Z-Report Generator
  const handlePrintZReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup window was intercepted by a browser blocker.");
      return;
    }

    const reportHtml = `
      <html>
        <head>
          <title>Z-REPORT_CLOSE_SHIFT</title>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 13px; 
              line-height: 1.5;
              width: 280px; 
              margin: 0 auto; 
              padding: 20px 10px;
              color: #000;
            }
            .text-center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 12px 0; }
            .flex-row { display: flex; justify-content: space-between; }
            .total-row { font-size: 15px; font-weight: bold; margin-top: 6px; }
          </style>
        </head>
        <body>
          <div class="text-center">
            <div class="bold" style="font-size: 16px;">*** Z-REPORT ***</div>
            <div class="bold" style="margin-top: 4px;">${escapeHtml(orgName) || "POS"}</div>
            <div>Shift Close: ${todayDisplayDate()}</div>
            <div>Printed: ${new Date().toLocaleTimeString()}</div>
          </div>
          <div class="divider"></div>
          
          <div class="bold">FINANCIAL BREAKDOWN:</div>
          <div class="flex-row"><span>CASH SALES:</span><span>${formatCurrency(totals.expectedCash)}</span></div>
          <div class="flex-row"><span>CARD SALES:</span><span>${formatCurrency(totals.expectedCard)}</span></div>
          <div class="flex-row"><span>MOBILE PAY:</span><span>${formatCurrency(totals.expectedMobile)}</span></div>
          <div class="flex-row font-bold"><span>GROSS SALES:</span><span>${formatCurrency(totals.expectedTotal)}</span></div>
          
          <div class="divider"></div>
          <div class="flex-row"><span>DISCOUNTS REF:</span><span>-${formatCurrency(totals.discounts)}</span></div>
          <div class="flex-row"><span>RETURNS RECORDED:</span><span>-${formatCurrency(totals.totalRefunds)}</span></div>
          <div class="flex-row total-row"><span>NET DRAW VAL:</span><span>${formatCurrency(totals.netTotal)}</span></div>
          
          <div class="divider"></div>
          <div class="bold">CASH DRAWER AUDIT:</div>
          <div class="flex-row"><span>DRAWER EXPECTED:</span><span>${formatCurrency(totals.expectedCash)}</span></div>
          <div class="flex-row"><span>DRAWER COUNTED:</span><span>${formatCurrency(cashCounted ? parseFloat(cashCounted) * 100 : 0)}</span></div>
          <div class="flex-row bold"><span>VARIANCE:</span><span>${variance >= 0 ? "+" : ""}${formatCurrency(variance)}</span></div>
          
          <div class="divider"></div>
          <div class="bold">METRICS:</div>
          <div class="flex-row"><span>TOTAL TX COUNTS:</span><span>${totals.transactionCount}</span></div>
          <div class="flex-row"><span>TOTAL SKUS SOLD:</span><span>${totals.itemsSold}</span></div>
          
          <div class="divider"></div>
          <div style="word-break: break-word; font-size: 11px;">
            <span class="bold">Manager Notes:</span> ${escapeHtml(notes) || "No notes appended to shift configuration."}
          </div>

          <div class="text-center" style="margin-top: 30px; font-size: 11px; text-transform: uppercase;">
            Register locked securely.<br/>Ledger State Archived.
          </div>
          <script>
            window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 150); };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(reportHtml);
    printWindow.document.close();
    toast.success("Thermal Z-Report sent to system print spooler!");
  };

  // CSV Shift Ledger Data Exporter
  const handleExportZReportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Shift Reconciliation Metric,Value\n";
    csvContent += `Business Date,${todayDisplayDate()}\n`;
    csvContent += `Register Status,${isClosed ? "Closed" : "Open"}\n`;
    csvContent += `Expected Cash,${(totals.expectedCash / 100).toFixed(2)}\n`;
    csvContent += `Actual Counted Cash,${cashCounted || "0.00"}\n`;
    csvContent += `Drawer Cash Variance,${(variance / 100).toFixed(2)}\n`;
    csvContent += `Cash Taken to Bank,${bankedAmount || "0.00"}\n`;
    csvContent += `Expected Card Sales,${(totals.expectedCard / 100).toFixed(2)}\n`;
    csvContent += `Expected Mobile Sales,${(totals.expectedMobile / 100).toFixed(2)}\n`;
    csvContent += `Gross Revenue,${(totals.expectedTotal / 100).toFixed(2)}\n`;
    csvContent += `Total Discounts Applied,${(totals.discounts / 100).toFixed(2)}\n`;
    csvContent += `Total Refund Deductions,${(totals.totalRefunds / 100).toFixed(2)}\n`;
    csvContent += `Net Cashflow Total,${(totals.netTotal / 100).toFixed(2)}\n`;
    csvContent += `Transactions Processed,${totals.transactionCount}\n`;
    csvContent += `Physical Items Distributed,${totals.itemsSold}\n`;
    csvContent += `Auditor Notes,"${notes.replace(/"/g, '""')}"\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Z_Report_Shift_Reconciliation_${todayIsoDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Shift verification audit CSV downloaded successfully!");
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* Top Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">End of Day Reconciliation</h1>
          <p className="text-sm text-slate-500 mt-0.5">Audit register metrics, verify cash safety parameters, and dispatch Z-reports</p>
        </div>
        <div>
          <Badge className={cn(
            "text-xs font-semibold px-3 py-1 rounded-xl tracking-wide transition-all border shadow-2xs",
            isClosed 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" 
              : "bg-amber-50 text-amber-700 border-amber-200/60"
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full mr-2 animate-pulse", isClosed ? "bg-emerald-500" : "bg-amber-500")} />
            {isClosed ? "Register Status: Closed" : "Register Status: Open"}
          </Badge>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Expected Cash</p>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
              <Banknote className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2 tracking-tight">{isLoading ? "..." : formatCurrency(totals.expectedCash)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Card Sales</p>
            <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
              <CreditCard className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2 tracking-tight">{isLoading ? "..." : formatCurrency(totals.expectedCard)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Mobile Payments</p>
            <div className="h-9 w-9 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-100">
              <Smartphone className="h-4 w-4 text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2 tracking-tight">{isLoading ? "..." : formatCurrency(totals.expectedMobile)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Gross Sales</p>
            <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
              <Wallet className="h-4 w-4 text-indigo-600" />
            </div>
          </div>
          <p className="text-2xl font-black text-indigo-600 mt-2 tracking-tight">{isLoading ? "..." : formatCurrency(totals.expectedTotal)}</p>
        </div>
      </div>

      {/* Main Column Split Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Controls Area */}
        {/* 🚀 FIXED: Dropped layout stretchers to eliminate empty container vacuum spaces */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Calculator className="h-5 w-5 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-base">Drawer Verification Balance</h3>
            </div>
            
            {/* Elegant Gradient Expected Cash Banner */}
            <div className="relative overflow-hidden rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 via-white to-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-500/80">System Expected Cash</p>
                  <p className="text-3xl font-black text-slate-900 mt-1 tracking-tight">
                    {isLoading ? "..." : formatCurrency(totals.expectedCash)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-indigo-600/10 flex items-center justify-center text-indigo-600 shrink-0">
                  <Coins className="h-6 w-6" />
                </div>
              </div>
            </div>
            
            {/* Input fields row setup */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Physical Cash Counted</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">{symbol}</span>
                  <Input 
                    type="number" 
                    step="0.01"
                    className="h-11 rounded-xl text-sm font-bold border-slate-200 shadow-2xs focus-visible:ring-indigo-500"
                    style={{ paddingLeft: currencyInputInset(symbol, 1) }}
                    placeholder="0.00"
                    value={cashCounted}
                    onChange={(e) => setCashCounted(e.target.value)}
                    disabled={isClosed || isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Cash Taken to Bank</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">{symbol}</span>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-11 rounded-xl text-sm font-bold border-slate-200 shadow-2xs focus-visible:ring-indigo-500"
                    style={{ paddingLeft: currencyInputInset(symbol, 1) }}
                    placeholder="0.00"
                    value={bankedAmount}
                    onChange={(e) => setBankedAmount(e.target.value)}
                    disabled={isClosed || isLoading}
                  />
                </div>
                <p className="text-[11px] text-slate-400 m-0">
                  Leave blank to keep everything in the till. Anything banked moves from
                  Cash on Hand into your bank account.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Auditor Audit Notes</label>
                <Input 
                  placeholder="Discrepancies, adjustments, overrides..." 
                  className="h-11 rounded-xl border-slate-200 shadow-2xs text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isClosed || isLoading} 
                />
              </div>
            </div>

            {/* Micro Variance Component Container */}
            {cashCounted && (
              <div className={cn(
                "p-4 rounded-xl border transition-all animate-in fade-in zoom-in-95 duration-200",
                variance === 0 
                  ? "bg-emerald-50/50 border-emerald-200/60 text-emerald-800" 
                  : variance > 0 
                    ? "bg-sky-50/50 border-sky-200/60 text-sky-800" 
                    : "bg-rose-50/50 border-rose-200/60 text-rose-800"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border shadow-2xs",
                    variance === 0 ? "bg-white border-emerald-200" : variance > 0 ? "bg-white border-sky-200" : "bg-white border-rose-200"
                  )}>
                    {variance === 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className={cn("h-4 w-4", variance > 0 ? "text-sky-600" : "text-rose-600")} />
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">Calculated Variance Status</p>
                    <p className={cn("text-lg font-black tracking-tight", variance === 0 ? "text-emerald-700" : variance > 0 ? "text-sky-700" : "text-rose-700")}>
                      {variance >= 0 ? "+" : ""}{formatCurrency(variance)}
                      {variance === 0 && <span className="text-xs font-bold ml-2">(Perfectly Balanced)</span>}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Master Register Close Action Wrapper Panel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between gap-4 mt-4">
            <div>
              <p className="text-sm font-bold text-slate-800">{isClosed ? "Shift Completed Successfully" : "Finalize Balance Ledger"}</p>
              <p className="text-xs text-slate-400 mt-0.5">{isClosed ? "Unlock fields below to edit values." : "Locking inputs stores data into shift archives."}</p>
            </div>
            <Button 
              size="lg" 
              className={cn(
                "gap-2 px-6 h-12 rounded-xl font-bold shadow-md transition-all text-sm w-full sm:w-auto shrink-0 border border-transparent",
                isClosed 
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100" 
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100"
              )}
              onClick={() => {
                // Reopening is UI-only: the posted journals stay put, and
                // re-closing reverses and reposts them.
                if (isClosed) {
                  setIsClosed(false);
                  toast.success("Register variables unlocked successfully.");
                  return;
                }

                if (!cashCounted) {
                  toast.error("You must input an evaluated cash count total before locking the register.");
                  return;
                }

                const banked = bankedAmount ? Math.round(parseFloat(bankedAmount) * 100) : 0;
                const counted = Math.round(parseFloat(cashCounted) * 100);

                if (banked > counted) {
                  toast.error("You cannot bank more cash than you counted.");
                  return;
                }

                startClosing(async () => {
                  const res = await closeRegisterDay({
                    businessDate: todayIsoDate(),
                    expectedCashMinor: totals.expectedCash,
                    countedCashMinor: counted,
                    bankedMinor: banked,
                    expectedCardMinor: totals.expectedCard + totals.expectedMobile,
                    notes: notes || undefined,
                  });

                  if (!res.success) {
                    toast.error(res.error);
                    return;
                  }

                  setIsClosed(true);
                  toast.success(res.message ?? "Register closed.");
                });
              }}
              disabled={isLoading || isClosing}
            >
              {isClosed ? (
                <>
                  <Unlock className="h-4 w-4" />
                  Reopen Session Inputs
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Finalize & Close Register Session
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right Column: Thermal Z-Report Slate Frame */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col h-full min-h-[520px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-base">Z-Report Live Slip</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1.5 h-8 rounded-lg border-slate-200 bg-white font-bold text-slate-700 px-3 shadow-2xs hover:bg-slate-5"
                onClick={handlePrintZReport}
                disabled={isLoading}
              >
                <Printer className="h-3.5 w-3.5 text-slate-400" />
                Print Slip
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1.5 h-8 rounded-lg border-slate-200 bg-white font-bold text-slate-700 px-3 shadow-2xs hover:bg-slate-5"
                onClick={handleExportZReportCSV}
                disabled={isLoading}
              >
                <Download className="h-3.5 w-3.5 text-slate-400" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Thermal Monospace Preview Block */}
          {/* 🚀 FIXED: Swapped dark panels for light matte-gray schemas to match branding guidelines */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 font-mono text-[11px] text-slate-700 space-y-4 shadow-inner relative flex-1 overflow-hidden select-none leading-relaxed">
            {isLoading && (
              // Opaque rather than a translucent blur: a spinner over half-visible
              // stale figures reads as if those numbers are already final.
              <div className="absolute inset-0 z-10 overflow-hidden bg-slate-50 p-5">
                <PosReceiptSkeleton />
              </div>
            )}
            
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              <p className="font-bold text-sm text-slate-900 tracking-wide">{orgName || "POS"}</p>
              <p className="text-slate-400 font-bold mt-0.5">*** SYSTEM Z-REPORT ***</p>
              <p className="text-slate-400 text-[10px] mt-1 tracking-wider">DATE: {todayDisplayDate()}</p>
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">CASH EXPECTED:</span>
                <span className="text-slate-900 font-bold">{formatCurrency(totals.expectedCash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CARD EXPECTED:</span>
                <span className="text-slate-900 font-bold">{formatCurrency(totals.expectedCard)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">MOBILE EXPECTED:</span>
                <span className="text-slate-900 font-bold">{formatCurrency(totals.expectedMobile)}</span>
              </div>
              <div className="border-t border-slate-300 pt-2 flex justify-between font-bold text-slate-900 text-xs tracking-wide">
                <span>GROSS SALES TOTAL:</span>
                <span>{formatCurrency(totals.expectedTotal)}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-slate-300 pt-3 space-y-1.5 text-slate-500">
              <div className="flex justify-between">
                <span>TX SUMMARY COUNTS:</span>
                <span className="text-slate-800">{totals.transactionCount}</span>
              </div>
              <div className="flex justify-between">
                <span>PRODUCT SKUS DIST:</span>
                <span className="text-slate-800">{totals.itemsSold}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>REFUND DEDUCTIONS:</span>
                <span>-{formatCurrency(totals.totalRefunds)}</span>
              </div>
              <div className="flex justify-between text-amber-600">
                <span>DISCOUNT BASELINES:</span>
                <span>-{formatCurrency(totals.discounts)}</span>
              </div>
            </div>

            <div className="border-t border-slate-300 pt-2.5 flex justify-between font-bold text-indigo-600 text-sm tracking-wide">
              <span>NET DRAWER VALUE:</span>
              <span>{formatCurrency(totals.netTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}