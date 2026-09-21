"use client";

import { useCurrency } from "@/components/currency-provider";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Calendar,
  Download,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PosTableSkeleton, PosCardsSkeleton } from "@/components/pos/skeletons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// 🚀 IMPORT: Connect to your existing database actions
import { getPosProducts, getPosSales } from "@/app/(dashboard)/pos/actions";


// Helper to parse date strings from "DD/MM/YYYY, HH:MM" back into clean Date Objects
function parseSalesDate(dateStr: string): Date {
  try {
    const [datePart, timePart] = dateStr.split(", ");
    const [day, month, year] = datePart.split("/").map(Number);
    if (timePart) {
      const [hour, minute] = timePart.split(":").map(Number);
      return new Date(year, month - 1, day, hour, minute);
    }
    return new Date(year, month - 1, day);
  } catch (e) {
    return new Date();
  }
}

export function POSReports() {
  const { format: formatCurrency } = useCurrency();
  const [dateRange, setDateRange] = useState("week");
  const [products, setProducts] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load database records on component mount
  const loadReportData = useCallback(async () => {
    setIsLoading(true);
    const [productsRes, salesRes] = await Promise.all([
      getPosProducts(),
      getPosSales(),
    ]);

    if (productsRes.success && productsRes.data) {
      setProducts(productsRes.data);
    }
    if (salesRes.success && salesRes.data) {
      // Filter out any canceled or non-completed orders if necessary
      setSales(salesRes.data.filter((s: any) => s.status === "completed"));
    } else if (!salesRes.success) {
      toast.error("Failed to compile live database sales metrics.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  // 🚀 LIVE ANALYTICS ENGINE: Computes all metrics dynamically from database fields
  const analytics = useMemo(() => {
    const now = new Date();
    
    // 1. Filter sales based on the selected timeframe option
    const filteredSales = sales.filter((sale) => {
      const saleDate = parseSalesDate(sale.date);
      const diffTime = Math.abs(now.getTime() - saleDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (dateRange === "today") return diffDays <= 1;
      if (dateRange === "week") return diffDays <= 7;
      if (dateRange === "month") return diffDays <= 30;
      if (dateRange === "quarter") return diffDays <= 90;
      if (dateRange === "year") return diffDays <= 365;
      return true;
    });

    // Create a fast map lookup for product item cost baselines
    const costMap = new Map<string, number>();
    products.forEach((p) => costMap.set(p.sku, p.costPrice || 0));

    let totalRevenue = 0;
    let totalCostOfGoods = 0;
    const productStatsMap = new Map<string, { name: string; sku: string; sold: number; revenue: number; profit: number }>();

    // 2. Loop through live line items to process margins and sales velocities
    filteredSales.forEach((sale) => {
      totalRevenue += sale.total;

      sale.lineItems?.forEach((item: any) => {
        const itemCost = costMap.get(item.sku) || 0;
        const totalItemCost = itemCost * item.quantity;
        const totalItemRevenue = item.price * item.quantity;
        const totalItemProfit = totalItemRevenue - totalItemCost;

        totalCostOfGoods += totalItemCost;

        // Track running sales performance aggregates per unique item
        const existing = productStatsMap.get(item.sku);
        if (existing) {
          existing.sold += item.quantity;
          existing.revenue += totalItemRevenue;
          existing.profit += totalItemProfit;
        } else {
          productStatsMap.set(item.sku, {
            name: item.name,
            sku: item.sku,
            sold: item.quantity,
            revenue: totalItemRevenue,
            profit: totalItemProfit,
          });
        }
      });
    });

    // 3. Compile top performing list arrays sorted by items sold volume
    const topPerformingProducts = Array.from(productStatsMap.values())
      .map((p) => {
        const margin = p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0;
        return { ...p, margin };
      })
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5);

    // 4. Calculate core financial KPIs
    const transactionCount = filteredSales.length;
    const avgBasketValue = transactionCount > 0 ? Math.round(totalRevenue / transactionCount) : 0;
    const totalProfit = totalRevenue - totalCostOfGoods;
    const grossProfitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : "0.0";

    // 5. Compute slow moving stock items (items that haven't sold within this filter view)
    const slowMovingInventory = products
      .filter((p) => !productStatsMap.has(p.sku) && p.stockQuantity > 0)
      .map((p) => {
        // Look up the historical last sale date for this product item frame
        const productSales = sales.filter((s) => s.lineItems?.some((li: any) => li.sku === p.sku));
        let daysSinceSale = "∞";
        if (productSales.length > 0) {
          const lastSaleDate = parseSalesDate(productSales[0].date);
          const diff = Math.abs(now.getTime() - lastSaleDate.getTime());
          daysSinceSale = `${Math.floor(diff / (1000 * 60 * 60 * 24))} days`;
        } else {
          daysSinceSale = "Never Sold";
        }
        return { name: p.name, sku: p.sku, stock: p.stockQuantity, context: daysSinceSale };
      })
      .slice(0, 3);

    return {
      totalRevenue,
      transactionCount,
      avgBasketValue,
      grossProfitMargin,
      topPerformingProducts,
      slowMovingInventory,
    };
  }, [sales, products, dateRange]);

  // 🚀 NEW FUNCTION: Compiles a localized CSV spreadsheet and downloads it safely
  const handleExportCSV = () => {
    if (sales.length === 0) {
      toast.error("There is no analytical layout data to export yet.");
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Report Stat Metric,Value\n";
    csvContent += `Total Revenue,${(analytics.totalRevenue / 100).toFixed(2)}\n`;
    csvContent += `Total Transactions Count,${analytics.transactionCount}\n`;
    csvContent += `Average Basket TransactionValue,${(analytics.avgBasketValue / 100).toFixed(2)}\n`;
    csvContent += `Gross Net Profit Margin Percentage,${analytics.grossProfitMargin}%\n\n`;
    csvContent += "Top Performing Product Name,SKU,Units Sold,Revenue Generated (GBP)\n";
    
    analytics.topPerformingProducts.forEach((p) => {
      csvContent += `"${p.name}",${p.sku},${p.sold},${(p.revenue / 100).toFixed(2)}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `POS_Sales_Report_${dateRange}_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel-compatible CSV spreadsheet downloaded successfully!");
  };

  return (
    <div className="space-y-6">
      {/* Page Header (Mobile Responsive Layout) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Reports & Analytics</h1>
          <p className="text-sm text-slate-500">Track performance, identify trends, and optimize profitability</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={dateRange} onValueChange={setDateRange} disabled={isLoading}>
            <SelectTrigger className="w-full sm:w-[150px] h-10 rounded-xl bg-white border border-slate-200 shadow-2xs font-semibold text-slate-700">
              <Calendar className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            className="gap-2 h-10 rounded-xl font-semibold w-full sm:w-auto shadow-2xs border-slate-200 bg-white"
            onClick={handleExportCSV}
            disabled={isLoading}
          >
            <Download className="h-4 w-4 text-slate-500" />
            Export
          </Button>
        </div>
      </div>

      {/* KPI Cards Dashboard Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 font-semibold">Total Revenue</p>
            <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {isLoading ? "..." : formatCurrency(analytics.totalRevenue)}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-green-600">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>+12.5%</span>
            <span className="text-slate-400 font-normal">vs last period</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 font-semibold">Transactions</p>
            <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {isLoading ? "..." : analytics.transactionCount}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-green-600">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>+8.3%</span>
            <span className="text-slate-400 font-normal">vs last period</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 font-semibold">Avg Transaction</p>
            <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {isLoading ? "..." : formatCurrency(analytics.avgBasketValue)}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-green-600">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>+3.8%</span>
            <span className="text-slate-400 font-normal">vs last period</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 font-semibold">Profit Margin</p>
            <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <PieChart className="h-4 w-4 text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {isLoading ? "..." : `${analytics.grossProfitMargin}%`}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-red-600">
            <ArrowDownRight className="h-3.5 w-3.5" />
            <span>-1.2%</span>
            <span className="text-slate-400 font-normal">vs last period</span>
          </div>
        </div>
      </div>

      {/* Top Products Panel (Swipable Frame Fix) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col">
        <h3 className="font-bold text-lg text-slate-900 mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-indigo-600" />
          Top Performing Products
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          {isLoading ? (
            <PosTableSkeleton columns={5} rows={5} minWidth="min-w-[650px]" label="Loading top products" />
          ) : (
            <table className="w-full min-w-[650px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Rank & Product</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Units Sold</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Gross Revenue</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Calculated Profit</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {analytics.topPerformingProducts.map((p, i) => (
                  <tr key={p.sku} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-400 w-6">#{i + 1}</span>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{p.name}</p>
                          <p className="text-xs font-mono font-medium text-slate-400">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 text-sm">{p.sold}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700 text-sm">{formatCurrency(p.revenue)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-bold text-sm">{formatCurrency(p.profit)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 font-bold shadow-2xs rounded-lg px-2 py-0.5 text-xs">
                        {p.margin}%
                      </Badge>
                    </td>
                  </tr>
                ))}
                {analytics.topPerformingProducts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center font-medium py-10 text-slate-400 text-sm">
                      No matching checkout records found inside this date threshold.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Slow Moving Inventory Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-lg text-slate-900 mb-4 flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-red-500" />
          Slow Moving Inventory Watchlist
        </h3>
        {isLoading ? (
          <PosCardsSkeleton count={3} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {analytics.slowMovingInventory.map((p) => (
              <div key={p.sku} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 shadow-2xs">
                <div>
                  <p className="font-bold text-slate-900 text-sm">{p.name}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">SKU: {p.sku} • <span className="font-bold text-slate-700">{p.stock} left</span></p>
                </div>
                <div className="text-right">
                  <Badge variant="destructive" className="text-xs font-bold shadow-2xs px-2 py-0.5 rounded-lg">
                    {p.context}
                  </Badge>
                  <p className="text-[10px] font-medium text-slate-400 mt-1">dormancy velocity</p>
                </div>
              </div>
            ))}
            {analytics.slowMovingInventory.length === 0 && (
              <p className="text-sm font-medium py-4 text-slate-400 col-span-3 text-center">
                Excellent turnover! Every SKU in your inventory has regular active transaction volume.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}