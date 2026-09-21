"use client";

import { useCurrency } from "@/components/currency-provider";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  CreditCard,
  Wallet,
  Smartphone,
  Banknote,
  Search,
  Download,
  Filter,
  Calendar,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Receipt,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PosTableSkeleton } from "@/components/pos/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// Import our database actions
import { getPosSales, deletePosSale, emailPosReceipt, getPosBusinessName } from "@/app/(dashboard)/pos/actions";


export function POSTransactions() {
  const { format: formatCurrency } = useCurrency();
  const [searchQuery, setSearchQuery] = useState("");
  /** The workspace name printed at the top of a receipt. */
  const [businessName, setBusinessName] = useState("");
  /** The sale whose receipt is being emailed, so its row can show progress. */
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateRange, setDateRange] = useState("today");

  // Dialog Overlay Inspection States
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  // Live database records state hooks
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    // Fetched alongside the sales rather than on its own, so the receipt has
    // the right business name on it the first time it is printed.
    const [result, nameResult] = await Promise.all([getPosSales(), getPosBusinessName()]);
    if (result.success && result.data) {
      setTransactions(result.data);
    } else {
      toast.error("Could not sync live database logs.");
    }
    if (nameResult.success) setBusinessName(nameResult.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Compute live matrix calculations from active hooks layout
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch = t.receiptNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            t.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            t.productSummary.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      const matchesPayment = paymentFilter === "all" || t.paymentMethod === paymentFilter;
      return matchesSearch && matchesStatus && matchesPayment;
    });
  }, [searchQuery, statusFilter, paymentFilter, transactions]);

  const totalSales = useMemo(() => {
    return filteredTransactions
      .filter(t => t.status === "completed")
      .reduce((sum, t) => sum + t.total, 0);
  }, [filteredTransactions]);
  
  const totalRefunds = useMemo(() => {
    return filteredTransactions
      .filter(t => t.status === "refunded")
      .reduce((sum, t) => sum + t.total, 0);
  }, [filteredTransactions]);

  // CSV Spreadsheet Export Engine
  const handleExportSalesCSV = () => {
    if (filteredTransactions.length === 0) {
      toast.error("No transaction records available to export.");
      return;
    }

    const headers = ["Receipt Reference", "Customer Context", "Payment Type", "Total Items", "Subtotal (GBP)", "Tax Amount (GBP)", "Discount Given (GBP)", "Total Paid (GBP)", "Status Label", "Timestamp"];
    const csvContent = [
      headers.join(","),
      ...filteredTransactions.map(t => [
        t.receiptNo,
        `"${t.customer}"`,
        t.paymentMethod.toUpperCase(),
        t.itemsCount || 0,
        (t.subtotal / 100).toFixed(2),
        (t.tax / 100).toFixed(2),
        (t.discount / 100).toFixed(2),
        (t.total / 100).toFixed(2),
        t.status.toUpperCase(),
        `"${t.date}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `POS_Sales_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Sales history report exported successfully!");
  };

  // Thermal Receipt Printer Loop
  const handlePrintReceipt = (txn: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocker intercepted print window.");
      return;
    }

    const receiptHtml = `
      <html>
        <head>
          <title>Receipt ${txn.receiptNo}</title>
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
            <div class="bold" style="font-size: 16px;">${businessName}</div>
            <div class="meta-text">${txn.date}</div>
          </div>
          <div class="divider"></div>
          <div>
            ${txn.lineItems?.map((item: any) => `
              <div class="flex-row">
                <span>${item.quantity}x ${item.name.substring(0, 18)}</span>
                <span>${formatCurrency(item.price * item.quantity)}</span>
              </div>
            `).join('')}
          </div>
          <div class="divider"></div>
          <div>
            <div class="flex-row"><span>Subtotal</span><span>${formatCurrency(txn.subtotal)}</span></div>
            ${txn.discount > 0 ? `<div class="flex-row"><span>Discount</span><span>-${formatCurrency(txn.discount)}</span></div>` : ''}
            <div class="flex-row"><span>Tax</span><span>${formatCurrency(txn.tax)}</span></div>
            <div class="flex-row total-row"><span>TOTAL</span><span>${formatCurrency(txn.total)}</span></div>
          </div>
          <div class="divider"></div>
          <div class="meta-text">
            <div>Receipt No: ${txn.receiptNo}</div>
            <div>Payment: ${txn.paymentMethod.toUpperCase()}</div>
            <div>Customer: ${txn.customer}</div>
          </div>
          <div class="text-center" style="margin-top: 25px; font-size: 12px;">
            Thank you for your business!
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

  /**
   * Email the receipt.
   *
   * Sends to the customer attached at the till when the sale has one; asks for
   * an address otherwise. Reports what the server actually did — this used to
   * wait 1.5 seconds and announce delivery without sending anything, so a
   * shopkeeper could promise a customer a receipt that never existed.
   */
  const handleEmailReceipt = async (txn: any) => {
    let address: string | undefined = txn.customerEmail ?? undefined;

    if (!address) {
      const entered = window.prompt(
        `Send receipt ${txn.receiptNo} to which email address?`,
        ""
      );
      if (entered === null) return;
      address = entered.trim();
      if (!address) {
        toast.error("An email address is needed to send a receipt.");
        return;
      }
    }

    setEmailingId(txn.id);
    const result = await emailPosReceipt(txn.id, address);
    setEmailingId(null);

    if (result.success) toast.success(result.message ?? "Receipt sent.");
    else toast.error(result.error);
  };

  const handleOpenDetails = (txn: any) => {
    setSelectedTxn(txn);
    setShowDetailsDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transaction History</h1>
          <p className="text-sm text-slate-500">View all sales, payments, and transaction details</p>
        </div>
        
        {/* Top Button Layout Block */}
        <div className="flex items-center gap-2">
          {/* 👇 Redesigned single Export button matching the clean shadow/border design perfectly */}
          <Button 
            variant="outline" 
            className="h-10 px-4 border border-slate-200 bg-white text-slate-700 font-medium rounded-xl hover:bg-slate-50 shadow-sm text-sm gap-2"
            onClick={handleExportSalesCSV} 
            disabled={isLoading}
          >
            <Download className="h-4 w-4 text-slate-500" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Total Sales</p>
          <p className="text-2xl font-bold text-green-600">{isLoading ? "..." : formatCurrency(totalSales)}</p>
          <p className="text-xs text-slate-400">
            {filteredTransactions.filter(t => t.status === "completed").length} transactions
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Refunds</p>
          <p className="text-2xl font-bold text-red-600">{isLoading ? "..." : formatCurrency(totalRefunds)}</p>
          <p className="text-xs text-slate-400">
            {filteredTransactions.filter(t => t.status === "refunded").length} transactions
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Net Revenue</p>
          <p className="text-2xl font-bold text-blue-600">
            {isLoading ? "..." : formatCurrency(totalSales - totalRefunds)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Average Transaction</p>
          <p className="text-2xl font-bold text-slate-900">
            {isLoading ? "..." : formatCurrency(Math.round(totalSales / (filteredTransactions.filter(t => t.status === "completed").length || 1)))}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by receipt, customer, or product name..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLoading}
          />
        </div>
        {/* 🚀 FIXED: Switched to flex-wrap with flexible widths so mobile filters drop to the next line smoothly */}
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Select value={dateRange} onValueChange={setDateRange} disabled={isLoading}>
            <SelectTrigger className="w-full sm:w-[145px] flex-1 sm:flex-initial">
              <Calendar className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter} disabled={isLoading}>
            <SelectTrigger className="w-full sm:w-[155px] flex-1 sm:flex-initial">
              <CreditCard className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter} disabled={isLoading}>
            <SelectTrigger className="w-full sm:w-[145px] flex-1 sm:flex-initial">
              <Filter className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto shadow-sm">
        {isLoading ? (
          <PosTableSkeleton columns={7} rows={6} minWidth="w-full" label="Loading sales log" />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Receipt</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Customer & Products</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Payment</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Cashier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Time</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-slate-400" />
                      <span className="font-mono text-sm font-medium">{t.receiptNo}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{t.customer}</p>
                    <p className="text-xs text-indigo-600 font-medium line-clamp-1 max-w-[280px]" title={t.productSummary}>
                      {t.productSummary}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {t.paymentMethod === "cash" && <Banknote className="h-4 w-4 text-green-600" />}
                      {t.paymentMethod === "card" && <CreditCard className="h-4 w-4 text-blue-600" />}
                      {t.paymentMethod === "mobile" && <Smartphone className="h-4 w-4 text-purple-600" />}
                      <div>
                        <p className="text-sm capitalize font-medium">{t.paymentMethod}</p>
                        {t.cardLast4 && <p className="text-xs text-slate-500">**** {t.cardLast4}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-bold text-slate-900">{formatCurrency(t.total)}</p>
                    {t.discount > 0 && (
                      <p className="text-xs text-green-600">-{formatCurrency(t.discount)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge
                      variant={t.status === "completed" ? "default" : t.status === "refunded" ? "destructive" : "secondary"}
                      className={cn(
                        t.status === "completed" && "bg-green-100 text-green-700 hover:bg-green-100",
                        t.status === "refunded" && "bg-red-100 text-red-700 hover:bg-red-100"
                      )}
                    >
                      {t.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {t.status === "refunded" && <XCircle className="h-3 w-3 mr-1" />}
                      {t.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{t.cashier}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{t.date}</td>
                  <td className="px-4 py-3 text-right align-middle">
                  <DropdownMenu>
                      <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            aria-label="Transaction actions"
            className="h-9 w-9 p-0 ml-auto flex items-center justify-center rounded-xl border-slate-200 bg-white shadow-2xs hover:bg-slate-50 hover:border-slate-300 data-[state=open]:bg-slate-100 data-[state=open]:border-slate-300"
          >
            <MoreHorizontal className="h-4 w-4 text-slate-500" />
          </Button>
        </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
  <DropdownMenuItem className="rounded-lg h-9 cursor-pointer font-medium text-slate-700" onClick={() => handleOpenDetails(t)}>View Details</DropdownMenuItem>
  <DropdownMenuItem className="rounded-lg h-9 cursor-pointer font-medium text-slate-700" onClick={() => handlePrintReceipt(t)}>Print Receipt</DropdownMenuItem>
  <DropdownMenuItem className="rounded-lg h-9 cursor-pointer font-medium text-slate-700" onClick={() => handleEmailReceipt(t)}>Email Receipt</DropdownMenuItem>
  <DropdownMenuItem 
    className="rounded-lg h-9 cursor-pointer font-medium text-red-600 focus:text-red-600 focus:bg-red-50"
                          onClick={async () => {
                            const confirmDelete = window.confirm(`Permanently delete receipt ${t.receiptNo}? This resets stock levels modified by this sale.`);
                            if (!confirmDelete) return;

                            setIsLoading(true);
                            const res = await deletePosSale(t.id); 
                            setIsLoading(false);

                            if (res.success) {
                              toast.success(`Transaction ${t.receiptNo} deleted successfully.`);
                              await loadTransactions(); 
                            } else {
                              toast.error(res.error || "Could not delete row.");
                            }
                          }}
                        >
                          Delete Transaction
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && filteredTransactions.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center text-slate-500">
            <Package className="h-12 w-12 mb-2 opacity-20" />
            <p>No transaction history records found</p>
          </div>
        )}
      </div>

      {/* Pop-up Detail Drawer for Receipt Breakdown Inspection Loops */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-indigo-600" />
              Receipt Breakdown
            </DialogTitle>
            <DialogDescription>
              Line items registered to reference: <span className="font-mono font-bold text-slate-900">{selectedTxn?.receiptNo}</span>
            </DialogDescription>
          </DialogHeader>

          {selectedTxn && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-3.5 text-sm">
                <div>
                  <span className="text-xs text-slate-400 block">Customer Context</span>
                  <span className="font-semibold text-slate-800">{selectedTxn.customer}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Date & Time</span>
                  <span className="font-medium text-slate-800">{selectedTxn.date}</span>
                </div>
                <div className="mt-1">
                  <span className="text-xs text-slate-400 block">Processed By</span>
                  <span className="text-slate-700">{selectedTxn.cashier}</span>
                </div>
                <div className="mt-1">
                  <span className="text-xs text-slate-400 block">Payment Mode</span>
                  <span className="capitalize font-medium text-slate-700">{selectedTxn.paymentMethod}</span>
                </div>
              </div>

              {/* Individual Products Listing */}
              <div className="space-y-2">
                <span className="text-xs font-semibold tracking-wider uppercase text-slate-400 block">Purchased Items</span>
                <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 px-3 bg-white">
                  {selectedTxn.lineItems?.map((item: any) => (
                    <div key={item.id} className="py-2.5 flex justify-between items-center text-sm">
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="font-medium text-slate-900 truncate">{item.name}</p>
                        <p className="text-xs font-mono text-slate-400">{item.sku}</p>
                      </div>
                      <div className="text-slate-500 text-xs text-right whitespace-nowrap pr-6">
                        {item.quantity} x {formatCurrency(item.price)}
                      </div>
                      <div className="font-semibold text-slate-900 text-right whitespace-nowrap">
                        {formatCurrency(item.price * item.quantity)}
                      </div>
                    </div>
                  ))}
                  {(!selectedTxn.lineItems || selectedTxn.lineItems.length === 0) && (
                    <p className="text-xs text-slate-400 py-4 text-center">No structural line items logged.</p>
                  )}
                </div>
              </div>

              {/* Financial calculations breakdown summary footer */}
              <div className="border-t border-dashed border-slate-200 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedTxn.subtotal)}</span>
                </div>
                {selectedTxn.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount Deduction</span>
                    <span>-{formatCurrency(selectedTxn.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500">
                  <span>Tax (VAT)</span>
                  <span>{formatCurrency(selectedTxn.tax)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-base text-slate-900">
                  <span>Grand Total</span>
                  <span className="text-indigo-600">{formatCurrency(selectedTxn.total)}</span>
                </div>
              </div>

              <div className="pt-2">
                <Button variant="secondary" className="w-full" onClick={() => setShowDetailsDialog(false)}>
                  Close Window
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}