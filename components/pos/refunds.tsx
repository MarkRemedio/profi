"use client";

import { useCurrency } from "@/components/currency-provider";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  RotateCcw,
  Receipt,
  Search,
  DollarSign,
  CreditCard,
  Banknote,
  AlertCircle,
  CheckCircle2,
  MoreHorizontal,
  Loader2,
  Package,
  Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PosTableSkeleton } from "@/components/pos/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

// Wire up our real-time data hooks
import { getPosRefunds, lookupReceiptForReturn, executeReceiptRefund, getPosBusinessName } from "@/app/(dashboard)/pos/actions";


export function POSRefunds() {
  const { format: formatCurrency } = useCurrency();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewRefundDialog, setShowNewRefundDialog] = useState(false);
  
  // Real Database Data States
  const [refundHistory, setRefundHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /** Printed at the top of the refund slip. */
  const [businessName, setBusinessName] = useState("");

  // Dialog Search Lookup Form States
  const [lookupString, setLookupString] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [matchedRecord, setMatchedRecord] = useState<any | null>(null);
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  // 👇 NEW: Inspection Details Modal States
  const [selectedRefund, setSelectedRefund] = useState<any | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const loadRefundLedger = useCallback(async () => {
    setIsLoading(true);
    const res = await getPosRefunds();
    if (res.success && res.data) {
      setRefundHistory(res.data);
    } else {
      toast.error("Failed to read database returns log.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadRefundLedger();
  }, [loadRefundLedger]);

  // Compute stats metrics dynamically from actual database records
  const statistics = useMemo(() => {
    const totalAmount = refundHistory.reduce((sum, r) => sum + r.amount, 0);
    const creditCount = refundHistory.filter(r => r.method === "store_credit").length;
    return {
      totalRefundsAmount: totalAmount,
      totalCount: refundHistory.length,
      storeCreditCount: creditCount
    };
  }, [refundHistory]);

  // Filter refunds records interactively
  const filteredRefunds = useMemo(() => {
    return refundHistory.filter((r) => {
      return searchQuery === "" ||
        r.receiptNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [searchQuery, refundHistory]);

  // Handle active lookup validation inside the wizard dialog overlay
  const handleReceiptLookup = async () => {
    if (!lookupString.trim()) {
      toast.error("Please enter a receipt number first.");
      return;
    }
    setIsLookingUp(true);
    setMatchedRecord(null);
    
    const res = await lookupReceiptForReturn(lookupString);
    if (res.success && res.data) {
      setMatchedRecord(res.data);
      toast.success("Transaction verified successfully!");
    } else {
      toast.error(res.error || "Receipt reference not found.");
    }
    setIsLookingUp(false);
  };

  // Submit and execute restocking pipeline sequence
  const handleConfirmRefundSubmit = async () => {
    if (!matchedRecord) return;
    setIsSubmittingRefund(true);

    const res = await executeReceiptRefund(matchedRecord.id);
    if (res.success) {
      toast.success(`Receipt ${matchedRecord.receiptNo} successfully reversed and items restocked!`);
      setShowNewRefundDialog(false);
      setLookupString("");
      setMatchedRecord(null);
      await loadRefundLedger(); 
    } else {
      toast.error(res.error || "Could not process return sequence.");
    }
    setIsSubmittingRefund(false);
  };

  // 👇 NEW: Thermal Receipt Generator for Returns Note
  const handlePrintRefundReceipt = (refund: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocker intercepted print window.");
      return;
    }

    const receiptHtml = `
      <html>
        <head>
          <title>Refund Note ${refund.id}</title>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 13px; 
              line-height: 1.4;
              width: 280px; 
              margin: 0 auto; 
              padding: 20px 10px;
              color: #000;
            }
            .text-center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
            .flex-row { display: flex; justify-content: space-between; }
            .total-row { font-size: 15px; font-weight: bold; margin-top: 4px; }
            .meta-text { font-size: 11px; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="text-center">
            <div class="bold" style="font-size: 15px;">** REFUND VOUCHER **</div>
            <div class="bold" style="font-size: 16px; margin-top: 4px;">${businessName}</div>
            <div class="meta-text">${refund.date}</div>
          </div>
          <div class="divider"></div>
          <div>
            ${refund.items?.map((item: any) => `
              <div class="flex-row">
                <span>${item.quantity}x ${item.name.substring(0, 18)}</span>
                <span>${formatCurrency(item.price * item.quantity)}</span>
              </div>
            `).join('') || '<div class="text-center">1x Order Return</div>'}
          </div>
          <div class="divider"></div>
          <div>
            <div class="flex-row total-row"><span>TOTAL RETURNED</span><span>${formatCurrency(refund.amount)}</span></div>
          </div>
          <div class="divider"></div>
          <div class="meta-text">
            <div>Refund Ref: ${refund.id}</div>
            <div>Orig Receipt: ${refund.receiptNo}</div>
            <div>Method: ${refund.method.toUpperCase()}</div>
            <div>Customer: ${refund.customer}</div>
          </div>
          <div class="text-center" style="margin-top: 25px; font-size: 12px;">
            Inventory Restocked Safely.<br/>Thank you!
          </div>
          <script>
            window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 150); };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHtml);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Returns & Refunds</h1>
          <p className="text-sm text-slate-500">Process returns, issue refunds, and manage store credit</p>
        </div>
        <Button 
          className="gap-2 bg-indigo-600 hover:bg-indigo-700 h-10 rounded-xl font-semibold shadow-sm"
          onClick={() => setShowNewRefundDialog(true)}
        >
          <RotateCcw className="h-4 w-4" />
          Process Return
        </Button>
      </div>

      {/* Dynamic Statistics Block */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-sm text-slate-500 font-medium">Total Returns Reflected</p>
          <p className="text-2xl font-bold text-red-600">{isLoading ? "..." : formatCurrency(statistics.totalRefundsAmount)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{statistics.totalCount} historical logs processed</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-sm text-slate-500 font-medium">Digital Cards Reissued</p>
          <p className="text-2xl font-bold text-amber-600">{statistics.storeCreditCount}</p>
          <p className="text-xs text-slate-400 mt-0.5">Automated method balance fallback splits</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-sm text-slate-500 font-medium">Operational Gateway Status</p>
          <p className="text-2xl font-bold text-emerald-600">Active</p>
          <p className="text-xs text-slate-400 mt-0.5">Database ledger hooks synced correctly</p>
        </div>
      </div>

      {/* Search Input Bar Filters */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center shadow-2xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search filtered entries by receipt number, refund reference, or customer name..."
            className="pl-9 h-10 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Master Data Grid Table Panel */}
      {/* 🚀 FIXED: Swapped overflow-hidden for overflow-x-auto to enable horizontal swiping on mobile */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto shadow-sm">
        {isLoading ? (
          <PosTableSkeleton columns={6} rows={6} minWidth="w-full" label="Loading refunds" />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Refund ID</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Original Receipt</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Customer Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Reason Summary</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Returned Amount</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Method</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Gateway Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRefunds.map((refund) => (
                <tr key={refund.id} className="hover:bg-slate-50/80 transition group">
                  <td className="px-4 py-3 align-middle">
                    <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded-md">{refund.id}</span>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-mono font-medium text-slate-700">{refund.receiptNo}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <p className="font-semibold text-slate-900 text-sm">{refund.customer}</p>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <p className="text-xs text-slate-500 font-medium">{refund.reason}</p>
                  </td>
                  <td className="px-4 py-3 text-right align-middle">
                    <p className="font-bold text-red-600 text-sm">{formatCurrency(refund.amount)}</p>
                  </td>
                  <td className="px-4 py-3 text-center align-middle">
                    <Badge variant="secondary" className="text-xs font-medium rounded-lg px-2 py-0.5 border border-slate-100 capitalize bg-white shadow-2xs">
                      {refund.method === "card" && <CreditCard className="h-3 w-3 mr-1 text-blue-500" />}
                      {refund.method === "cash" && <Banknote className="h-3 w-3 mr-1 text-green-500" />}
                      {refund.method === "mobile" && <DollarSign className="h-3 w-3 mr-1 text-purple-500" />}
                      {refund.method.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center align-middle">
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border border-green-200/40 rounded-lg px-2 py-0.5 text-xs font-semibold capitalize shadow-2xs">
                      <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                      {refund.status}
                    </Badge>
                  </td>
                  {/* 👇 FIXED: Bound dropdown menu items to both view modal and print receipt handlers */}
                  <td className="px-4 py-3 text-right align-middle">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 flex items-center justify-center rounded-lg hover:bg-slate-100 data-[state=open]:bg-slate-100 ml-auto">
                          <MoreHorizontal className="h-4 w-4 text-slate-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                        <DropdownMenuItem 
                          className="rounded-lg h-9 cursor-pointer font-medium text-slate-700"
                          onClick={() => { setSelectedRefund(refund); setShowDetailsDialog(true); }}
                        >
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="rounded-lg h-9 cursor-pointer font-medium text-slate-700"
                          onClick={() => handlePrintRefundReceipt(refund)}
                        >
                          Print Receipt
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && filteredRefunds.length === 0 && (
          <div className="flex h-44 flex-col items-center justify-center text-slate-500 bg-white">
            <Package className="h-12 w-12 mb-2 opacity-20" />
            <p className="text-sm font-medium text-slate-400">No matching return records found inside current layout view.</p>
          </div>
        )}
      </div>

      {/* New Refund Processing Dialog Wizard */}
      <Dialog open={showNewRefundDialog} onOpenChange={(open) => {
        setShowNewRefundDialog(open);
        if(!open) { setLookupString(""); setMatchedRecord(null); }
      }}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">Process New Return</DialogTitle>
            <DialogDescription>Enter the original receipt number to query and reverse transaction ledger fields.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Original Receipt Number</label>
              <div className="flex gap-2">
                <Input 
                  placeholder="e.g., RCP-K6R9X2" 
                  className="rounded-xl h-10 font-mono text-sm uppercase tracking-wider"
                  value={lookupString}
                  onChange={(e) => setLookupString(e.target.value)}
                  disabled={isLookingUp || isSubmittingRefund}
                />
                <Button 
                  variant="outline" 
                  className="rounded-xl h-10 font-semibold border-slate-200 px-4 shadow-2xs"
                  onClick={handleReceiptLookup}
                  disabled={isLookingUp || isSubmittingRefund}
                >
                  {isLookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup"}
                </Button>
              </div>
            </div>

            {/* Matched Transaction Record Card Details */}
            {matchedRecord && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3 shadow-inner text-sm animate-in fade-in zoom-in-95 duration-150">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Customer</p>
                    <p className="font-bold text-slate-800">{matchedRecord.customer}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 font-medium">Sale Date</p>
                    <p className="font-medium text-slate-700">{matchedRecord.date}</p>
                  </div>
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                  {matchedRecord.items.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs text-slate-600">
                      <span>{item.quantity}x {item.name}</span>
                      <span className="font-medium">{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center border-t border-slate-200/80 pt-2 font-bold text-slate-900">
                  <span>Refund Total Due</span>
                  <span className="text-xl font-black text-red-600">{formatCurrency(matchedRecord.total)}</span>
                </div>
              </div>
            )}

            <div className="rounded-xl bg-amber-50/60 border border-amber-200/60 p-3.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Automated Inventory Rules</p>
                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">Executing this action updates parent transaction ledgers and pushes catalog item volumes directly back onto available store stock quantities.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2.5 border-t border-slate-100 pt-4 mt-2">
            <Button variant="outline" className="flex-1 h-11 rounded-xl font-semibold border-slate-200 text-slate-600" onClick={() => setShowNewRefundDialog(false)} disabled={isSubmittingRefund}>
              Cancel
            </Button>
            <Button 
              className="flex-1 h-11 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              disabled={!matchedRecord || isSubmittingRefund}
              onClick={handleConfirmRefundSubmit}
            >
              {isSubmittingRefund ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Restocking...
                </>
              ) : (
                "Complete Return"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 👇 NEW: View Refund Details Breakdown Dialog Modal overlay layout */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
              <Receipt className="h-5 w-5 text-indigo-600" />
              Return Breakdown
            </DialogTitle>
            <DialogDescription>
              Details for reference logging entry ID: <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-xs">{selectedRefund?.id}</span>
            </DialogDescription>
          </DialogHeader>

          {selectedRefund && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl text-sm border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Customer Context</span>
                  <span className="font-bold text-slate-800">{selectedRefund.customer}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Processed Date</span>
                  <span className="font-medium text-slate-700">{selectedRefund.date}</span>
                </div>
                <div className="mt-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Orig Receipt No</span>
                  <span className="font-mono text-slate-700 font-semibold">{selectedRefund.receiptNo}</span>
                </div>
                <div className="mt-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Return Method</span>
                  <span className="capitalize font-semibold text-slate-700">{selectedRefund.method}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Restocked Items</span>
                <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 px-3.5 bg-white shadow-xs">
                  {selectedRefund.items?.map((item: any, idx: number) => (
                    <div key={idx} className="py-2.5 flex justify-between items-center text-sm">
                      <span className="font-semibold text-slate-800 text-sm">{item.quantity}x {item.name}</span>
                      <span className="font-bold text-slate-900">{formatCurrency(item.total)}</span>
                    </div>
                  )) || <p className="text-xs text-slate-400 py-4 text-center">Standard Item Order Package Return</p>}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                <span className="font-bold text-slate-900 text-sm">Total Refunded Value</span>
                <span className="font-black text-xl text-red-600">{formatCurrency(selectedRefund.amount)}</span>
              </div>

              <div className="flex gap-2 border-t border-slate-100 pt-3.5 mt-1">
                <Button variant="outline" className="flex-1 h-10 rounded-xl font-semibold" onClick={() => setShowDetailsDialog(false)}>
                  Close
                </Button>
                <Button 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl gap-2 h-10 px-4 shadow-sm"
                  onClick={() => handlePrintRefundReceipt(selectedRefund)}
                >
                  <Printer className="h-4 w-4" />
                  Print Note
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}