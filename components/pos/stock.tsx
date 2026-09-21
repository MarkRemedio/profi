"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Package,
  AlertTriangle,
  TrendingDown,
  Search,
  Filter,
  ArrowUpRight,
  Bell,
  Loader2,
  ShoppingCart,
  History,
  ChevronLeft,
  ChevronRight,
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
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// Wire up the live database fetcher
import { getPosProducts, upsertPosProduct, getPosSales, getPosRefunds, getPosStockLogs } from "@/app/(dashboard)/pos/actions";

// 🚀 NEW: Define pagination limit
const ITEMS_PER_PAGE = 20;

export function POSStock() {
  const [activeTab, setActiveTab] = useState<"alerts" | "history" | "settings">("alerts");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  
  // 🚀 NEW: Pagination States
  const [alertsPage, setAlertsPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  // Settings Form States
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [lowThreshold, setLowThreshold] = useState("10");
  const [criticalThreshold, setCriticalThreshold] = useState("5");

  // Reorder Modal States
  const [showReorderDialog, setShowReorderDialog] = useState(false);
  const [selectedReorderItem, setSelectedReorderItem] = useState<any | null>(null);
  const [reorderQuantity, setReorderQuantity] = useState("20");
  const [isSubmittingReorder, setIsSubmittingReorder] = useState(false);

  // Live Database States
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Live History States
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Fetch live products from database
  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    const result = await getPosProducts();
    if (result.success && result.data) {
      setProducts(result.data);
    } else {
      toast.error("Failed to load live database stock levels.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Fetch and merge live sales & refunds to build the movement history
  const loadMovementHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    
    const [salesRes, refundsRes, manualLogsRes] = await Promise.all([
      getPosSales(),
      getPosRefunds(),
      getPosStockLogs() // 🚀 Fetch manual restocks!
    ]);

    const logs: any[] = [];

    // 🚀 Inject Manual Restocks and Edits from our new table!
    if (manualLogsRes.success && manualLogsRes.data) {
      manualLogsRes.data.forEach((log: any) => {
        logs.push(log); // Matches the format exactly!
      });
    }

    if (salesRes.success && salesRes.data) {
      salesRes.data.forEach((sale: any) => {
        sale.lineItems?.forEach((item: any) => {
          logs.push({
            // Stable: the sale id plus the product is already unique. Math.random()
            // here gave every row a new key on each render, so React rebuilt the
            // whole list instead of reusing it and scroll position was lost.
            id: `sale-${sale.id}-${item.id ?? item.name}`,
            product: item.name,
            action: "sale",
            quantity: -Math.abs(item.quantity),
            date: sale.date,
            user: sale.cashier || "Admin User",
            rawTimestamp: new Date(sale.date).getTime()
          });
        });
      });
    }

    if (refundsRes.success && refundsRes.data) {
      refundsRes.data.forEach((refund: any) => {
        refund.items?.forEach((item: any) => {
          logs.push({
            id: `refund-${refund.id}-${item.id ?? item.name}`,
            product: item.name,
            action: "restock (refund)",
            quantity: Math.abs(item.quantity),
            date: refund.date,
            user: refund.customer || "System Return",
            rawTimestamp: new Date(refund.date).getTime()
          });
        });
      });
    }

    logs.sort((a, b) => b.rawTimestamp - a.rawTimestamp);

    setHistoryLogs(logs);
    setIsLoadingHistory(false);
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      loadMovementHistory();
      setHistoryPage(1); // Reset page when switching to history
    }
  }, [activeTab, loadMovementHistory]);

  // 🚀 NEW: Reset Alerts page to 1 when user searches or filters
  useEffect(() => {
    setAlertsPage(1);
  }, [searchQuery, filterType]);

  // Compute live alerts and stats from database products
  const stockMetrics = useMemo(() => {
    const totalSKUs = products.length;
    let criticalCount = 0;
    let lowCount = 0;
    let inStockCount = 0;
    const alertList: any[] = [];

    products.forEach((p) => {
      const current = p.stockQuantity || 0;
      const minLevel = p.minStockLevel || 5;

      if (current <= 0) {
        criticalCount++;
        alertList.push({ ...p, alertStatus: "critical" });
      } else if (current <= minLevel) {
        lowCount++;
        alertList.push({ ...p, alertStatus: "low" });
      } else {
        inStockCount++;
      }
    });

    const filteredAlerts = alertList.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            item.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterType === "all" || item.alertStatus === filterType;
      return matchesSearch && matchesFilter;
    });

    return { totalSKUs, criticalCount, lowCount, inStockCount, filteredAlerts };
  }, [products, searchQuery, filterType]);

  // 🚀 NEW: Calculate Pagination slices
  const totalAlertsPages = Math.max(1, Math.ceil(stockMetrics.filteredAlerts.length / ITEMS_PER_PAGE));
  const paginatedAlerts = stockMetrics.filteredAlerts.slice(
    (alertsPage - 1) * ITEMS_PER_PAGE,
    alertsPage * ITEMS_PER_PAGE
  );

  const totalHistoryPages = Math.max(1, Math.ceil(historyLogs.length / ITEMS_PER_PAGE));
  const paginatedHistory = historyLogs.slice(
    (historyPage - 1) * ITEMS_PER_PAGE,
    historyPage * ITEMS_PER_PAGE
  );

  const handleSaveSettings = () => {
    toast.success("Alert preferences and thresholds updated successfully!");
  };

  const handleConfirmReorder = async () => {
    const amountToAdd = parseInt(reorderQuantity);
    
    if (!amountToAdd || amountToAdd <= 0) {
      toast.error("Please enter a valid reorder quantity.");
      return;
    }
    
    setIsSubmittingReorder(true);
    
    const currentStock = selectedReorderItem?.stockQuantity || 0;
    const newTotalStock = currentStock + amountToAdd;

    // Formatting safely so prices don't inflate
    const safePrice = (selectedReorderItem.price / 100).toFixed(2);
    const safeCostPrice = selectedReorderItem.costPrice ? (selectedReorderItem.costPrice / 100).toFixed(2) : "0";

    const result = await upsertPosProduct({
      ...selectedReorderItem,
      price: safePrice,
      costPrice: safeCostPrice,
      stockQuantity: newTotalStock.toString(),
    } as any);

    if (result.success) {
      toast.success(`Successfully added ${amountToAdd} units to ${selectedReorderItem.name}!`);
      await loadProducts();
      if (activeTab === "history") loadMovementHistory();
      setShowReorderDialog(false);
    } else {
      toast.error(result.error || "Failed to update database stock.");
    }
    
    setIsSubmittingReorder(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Levels & Alerts</h1>
          <p className="text-sm text-slate-500">Monitor inventory levels and manage reorder notifications</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button 
            variant="outline" 
            className="gap-2 h-10 rounded-xl w-full sm:w-auto shadow-sm border-slate-200 bg-white"
            onClick={() => setActiveTab("settings")}
          >
            <Bell className="h-4 w-4 text-slate-500" />
            Configure Alerts
          </Button>
        </div>
      </div>

      {/* Dynamic Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Critical Stock</p>
              <p className="text-2xl font-bold text-red-600">{isLoading ? "..." : stockMetrics.criticalCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Low Stock</p>
              <p className="text-2xl font-bold text-amber-600">{isLoading ? "..." : stockMetrics.lowCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total SKUs</p>
              <p className="text-2xl font-bold text-slate-900">{isLoading ? "..." : stockMetrics.totalSKUs}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <ArrowUpRight className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Healthy Stock</p>
              <p className="text-2xl font-bold text-green-600">{isLoading ? "..." : stockMetrics.inStockCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab("alerts")}
          className={cn(
            "px-5 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap",
            activeTab === "alerts"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          Stock Alerts ({stockMetrics.filteredAlerts.length})
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "px-5 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap",
            activeTab === "history"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          Movement History
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={cn(
            "px-5 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap",
            activeTab === "settings"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          Alert Settings
        </button>
      </div>

      {/* Tab Content: Alerts */}
      {activeTab === "alerts" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search alert products..."
                className="pl-9 h-10 rounded-xl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType} disabled={isLoading}>
              <SelectTrigger className="w-full sm:w-[150px] h-10 rounded-xl bg-white border border-slate-200">
                <Filter className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Alerts</SelectItem>
                <SelectItem value="critical">Critical Only</SelectItem>
                <SelectItem value="low">Low Stock Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
            <div className="overflow-x-auto">
              {isLoading ? (
                <PosTableSkeleton columns={6} rows={6} label="Loading stock levels" />
              ) : (
                <table className="w-full min-w-[700px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">SKU</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Current</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Min Level</th>
                      <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* 🚀 FIXED: Mapping over paginatedAlerts instead of all filtered alerts */}
                    {paginatedAlerts.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{item.name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-slate-500 font-medium">{item.sku}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className={cn(
                            "font-black text-lg",
                            item.alertStatus === "critical" ? "text-red-600" : "text-amber-600"
                          )}>
                            {item.stockQuantity}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-sm font-medium text-slate-600">{item.minStockLevel || 5}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={cn(
                            "shadow-2xs px-2.5 py-0.5 font-semibold text-xs border border-transparent",
                            item.alertStatus === "critical" ? "bg-red-100 text-red-700 border-red-200/50 hover:bg-red-100" : "bg-amber-100 text-amber-700 border-amber-200/50 hover:bg-amber-100"
                          )}>
                            {item.alertStatus === "critical" ? "Critical" : "Low Stock"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="rounded-lg font-semibold border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors" 
                            onClick={() => {
                              setSelectedReorderItem(item);
                              setShowReorderDialog(true);
                            }}
                          >
                            Reorder
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {paginatedAlerts.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                          <div className="flex flex-col items-center gap-2">
                            <Package className="h-10 w-10 text-slate-300" />
                            <p className="font-medium text-sm">No stock alerts found.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            
            {/* 🚀 NEW: Alerts Pagination Footer (Mobile Responsive) */}
            {!isLoading && stockMetrics.filteredAlerts.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 p-4 gap-4 bg-slate-50/50">
                <span className="text-sm font-medium text-slate-500">
                  Showing page <span className="font-bold text-slate-700">{alertsPage}</span> of <span className="font-bold text-slate-700">{totalAlertsPages}</span>
                </span>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button 
                    variant="outline" 
                    className="h-9 flex-1 sm:flex-initial rounded-lg border-slate-200 bg-white" 
                    onClick={() => setAlertsPage(p => Math.max(1, p - 1))} 
                    disabled={alertsPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-9 flex-1 sm:flex-initial rounded-lg border-slate-200 bg-white" 
                    onClick={() => setAlertsPage(p => Math.min(totalAlertsPages, p + 1))} 
                    disabled={alertsPage === totalAlertsPages}
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: Movement History */}
      {activeTab === "history" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm animate-in fade-in duration-200 flex flex-col">
          <div className="overflow-x-auto">
            {isLoadingHistory ? (
              <PosTableSkeleton columns={5} rows={6} label="Loading movement history" />
            ) : (
              <table className="w-full min-w-[700px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Action Type</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Quantity Delta</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Date Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Processed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {/* 🚀 FIXED: Mapping over paginatedHistory instead of all logs */}
                  {paginatedHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-semibold text-slate-900">{item.product}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={cn(
                          "text-xs capitalize font-semibold rounded-md border-0",
                          item.action === "sale" ? "bg-slate-100 text-slate-700" : "bg-blue-100 text-blue-800"
                        )}>
                          {item.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          "font-bold text-sm",
                          item.quantity > 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {item.quantity > 0 ? "+" : ""}{item.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-slate-400">Auto-Synced</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-500">{item.date}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-600">{item.user}</td>
                    </tr>
                  ))}
                  {paginatedHistory.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <History className="h-10 w-10 text-slate-300" />
                          <p className="font-medium text-sm">No recent movement records found.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* 🚀 NEW: History Pagination Footer (Mobile Responsive) */}
          {!isLoadingHistory && historyLogs.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 p-4 gap-4 bg-slate-50/50">
              <span className="text-sm font-medium text-slate-500">
                Showing page <span className="font-bold text-slate-700">{historyPage}</span> of <span className="font-bold text-slate-700">{totalHistoryPages}</span>
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  className="h-9 flex-1 sm:flex-initial rounded-lg border-slate-200 bg-white" 
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))} 
                  disabled={historyPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button 
                  variant="outline" 
                  className="h-9 flex-1 sm:flex-initial rounded-lg border-slate-200 bg-white" 
                  onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))} 
                  disabled={historyPage === totalHistoryPages}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Settings */}
      {activeTab === "settings" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-8 shadow-sm animate-in fade-in duration-200 max-w-3xl">
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Bell className="h-5 w-5 text-indigo-600" /> Notification Channels
            </h3>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-semibold text-slate-900">Email Alerts</p>
                <p className="text-sm text-slate-500 mt-0.5">Receive immediate low stock alerts directly to your administrator email.</p>
              </div>
              <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} />
            </div>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-semibold text-slate-900">Dashboard Push Notifications</p>
                <p className="text-sm text-slate-500 mt-0.5">Show real-time toast notifications inside the browser when inventory dips.</p>
              </div>
              <Switch checked={pushAlerts} onCheckedChange={setPushAlerts} />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
              <TrendingDown className="h-5 w-5 text-indigo-600" /> Default Alert Thresholds
            </h3>
            
            <div className="grid gap-6 sm:grid-cols-2 pt-2">
              <div className="space-y-2.5">
                <label className="text-sm font-bold text-slate-700">Low Stock Limit (Default %)</label>
                <Input 
                  type="number" 
                  value={lowThreshold} 
                  onChange={(e) => setLowThreshold(e.target.value)} 
                  className="rounded-xl h-11 font-semibold text-lg" 
                />
                <p className="text-xs text-slate-500 font-medium">Trigger warning when stock drops below this baseline percentage.</p>
              </div>
              <div className="space-y-2.5">
                <label className="text-sm font-bold text-slate-700">Critical Stock Limit (Default %)</label>
                <Input 
                  type="number" 
                  value={criticalThreshold} 
                  onChange={(e) => setCriticalThreshold(e.target.value)} 
                  className="rounded-xl h-11 font-semibold text-lg text-red-600" 
                />
                <p className="text-xs text-slate-500 font-medium">Trigger critical failure alert when stock drops below this redline.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700 h-11 px-8 rounded-xl font-semibold shadow-sm text-base" 
              onClick={handleSaveSettings}
            >
              Save Preferences
            </Button>
          </div>
        </div>
      )}

      {/* Reorder Dialog Modal Wizard */}
      <Dialog open={showReorderDialog} onOpenChange={(open) => {
        setShowReorderDialog(open);
        if(!open) setReorderQuantity("20");
      }}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <ShoppingCart className="h-5 w-5 text-indigo-600" />
              Dispatch Purchase Order
            </DialogTitle>
            <DialogDescription>
              Submit a fast-track restock request for <span className="font-bold text-slate-800">{selectedReorderItem?.name}</span>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            {selectedReorderItem && (
              <div className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-200 p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Stock</p>
                  <p className={cn(
                    "text-2xl font-black mt-1",
                    selectedReorderItem.stockQuantity <= 0 ? "text-red-600" : "text-amber-600"
                  )}>
                    {selectedReorderItem.stockQuantity}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Target Minimum</p>
                  <p className="text-2xl font-black mt-1 text-slate-700">{selectedReorderItem.minStockLevel || 5}</p>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              <label className="text-sm font-bold text-slate-700">Requested Order Quantity</label>
              <Input 
                type="number" 
                value={reorderQuantity}
                onChange={(e) => setReorderQuantity(e.target.value)}
                className="h-12 rounded-xl text-lg font-bold"
                min="1"
                disabled={isSubmittingReorder}
              />
            </div>
          </div>
          
          <div className="flex gap-2.5 border-t border-slate-100 pt-2">
            <Button 
              variant="outline" 
              className="flex-1 h-11 rounded-xl font-semibold border-slate-200 text-slate-600" 
              onClick={() => setShowReorderDialog(false)} 
              disabled={isSubmittingReorder}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1 h-11 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              disabled={isSubmittingReorder || !reorderQuantity}
              onClick={handleConfirmReorder}
            >
              {isSubmittingReorder ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...
                </>
              ) : (
                "Confirm Restock"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}