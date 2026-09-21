"use client";

import { formatMoneyMajor } from "@/lib/currency";
import { useCurrency } from "@/components/currency-provider";
import React, { useState } from "react"; 
import { 
  TrendingUp, Wallet, AlertCircle, Clock, ArrowRight, FileText, Users, Quote, CheckCircle2, Send, Sparkles, Plus, RotateCcw
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { QuickAction, QuickActions } from "@/components/shared/quick-actions";


type DashboardProps = {
  kpiData: { totalRevenue: number; outstanding: number; overdue: number; collected: number };
  recentInvoices: any[];
  topCustomers: any[];
  recentQuotes: any[];
  chartBars: any[];
  projectionBars?: any[];
  averageMonthlyRevenue?: number;
};

export function RevenueDashboard({ 
  kpiData, 
  recentInvoices, 
  topCustomers, 
  recentQuotes: mockQuotes, 
  chartBars,
  projectionBars = [],
  averageMonthlyRevenue = 0
}: DashboardProps) {
  const { symbol } = useCurrency();
  const { currency: __cur } = useCurrency();
  const formatCurrency = (amount: number) => formatMoneyMajor(amount, __cur);

  // ✅ Swapped the modal state for a simple loading state
  const [realQuotes, setRealQuotes] = useState<any[]>([]);
  const [realCreditNotes, setRealCreditNotes] = useState<any[]>([]);

  // 🔄 Runs instantly on load to fetch both datasets straight from browser memory
  React.useEffect(() => {
    const savedQuotes = localStorage.getItem("wawprofi_quotes") || localStorage.getItem("quotes") || localStorage.getItem("wawprofi_quotes_v2");
    if (savedQuotes) {
      try {
        const parsed = JSON.parse(savedQuotes);
        setRealQuotes(parsed.slice(0, 3).map((q: any) => ({
          id: q.quoteNo || q.id || "QTY-000",
          client: q.contactName || q.customerName || q.client || "Unknown Client",
          date: q.date || "Today",
          amount: q.totalMinor ? q.totalMinor / 100 : (q.amount || q.total || 0),
          status: q.status || "DRAFT"
        })));
      } catch (e) { console.error("Error reading dashboard quotes:", e); }
    }

    const savedNotes = localStorage.getItem("wawprofi_credit_notes_v2");
    if (savedNotes) {
      try {
        setRealCreditNotes(JSON.parse(savedNotes).slice(0, 3));
      } catch (e) { console.error("Error reading dashboard credit notes:", e); }
    }
  }, []);

  const recentQuotes = realQuotes.length > 0 ? realQuotes : mockQuotes;

  const [activeChartTab, setActiveChartTab] = useState<"history" | "projection">("history");
  const isProjectionTab = activeChartTab === "projection";

  // 📊 Calculate the maximum value in chart bars to make grid lines match real scaling
  const maxBarValue = isProjectionTab
    ? (projectionBars?.reduce((max, b) => Math.max(max, Number(b.rawTotal) || 0), 0) || 0)
    : (chartBars?.reduce((max, b) => Math.max(max, Number(b.rawTotal) || 0), 0) || 0);
  
  // If revenue is 0, default layout scale max to 4000 to keep structure elegant, otherwise round up nicely
  const dynamicMaxScale = maxBarValue > 0 ? Math.ceil(maxBarValue / 4000) * 4000 : 4000;
  const gridLineValues = [4, 3, 2, 1, 0].map((multiplier) => (dynamicMaxScale / 4) * multiplier);
  
  const kpis = [
    { title: "Total Revenue (YTD)", value: kpiData.totalRevenue, trend: "Real-time", isPositive: true, icon: TrendingUp, color: "text-blue-600", bgColor: "bg-blue-100" },
    { title: "Outstanding (AR)", value: kpiData.outstanding, trend: "Awaiting payment", isPositive: true, icon: Clock, color: "text-amber-600", bgColor: "bg-amber-100" },
    { title: "Overdue", value: kpiData.overdue, trend: "Requires attention", isPositive: false, icon: AlertCircle, color: "text-red-600", bgColor: "bg-red-100" },
    { title: "Collected This Month", value: kpiData.collected, trend: "Real-time", isPositive: true, icon: Wallet, color: "text-emerald-600", bgColor: "bg-emerald-100" },
  ];

  return (
    <div className="flex-1 space-y-6">
      
      {/* --- HEADER MATCHING YOUR STANDARD --- */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Revenue Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">Overview of your sales performance and receivables.</p>
        </div>
        
        <QuickActions>
          <QuickAction
            href="/sales/invoices?action=create"
            icon={FileText}
            label="Create invoice"
            description="Start a new customer invoice"
            primary
          />
          <QuickAction
            href="/sales/quotes?action=create"
            icon={Quote}
            label="Create quote"
            description="Start a new customer quote"
          />
          <QuickAction
            href="/sales/customers?action=create"
            icon={Users}
            label="Add customer"
            description="Open the new customer form"
          />
        </QuickActions>
      </div>

      {/* --- KPI GRID --- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{kpi.title}</p>
                <div className={`flex size-8 items-center justify-center rounded-lg ${kpi.bgColor}`}>
                  <Icon className={`size-4 ${kpi.color}`} />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <h3 className="text-2xl font-bold text-slate-900">{formatCurrency(kpi.value)}</h3>
              </div>
              <p className={`mt-1 text-xs font-medium ${kpi.isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                {kpi.trend} <span className="text-slate-400 font-normal ml-1">vs last period</span>
              </p>
            </div>
          );
        })}
      </div>

      {/* --- MAIN CHART & INVOICES --- */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-7">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-4 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveChartTab("history")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
                  activeChartTab === "history"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                Revenue Overview (Past 6m)
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab("projection")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1",
                  activeChartTab === "projection"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <Sparkles className="size-3 text-indigo-500 inline" />
                Sales Projection (Next 6m)
              </button>
            </div>
            {isProjectionTab && (
              <div className="text-xs text-slate-500 font-medium">
                Baseline Target: <span className="font-bold text-slate-700">{formatCurrency(averageMonthlyRevenue)}/mo</span>
              </div>
            )}
          </div>
          
          <div className="flex-1 min-h-[250px] flex items-end gap-2 pb-8 relative">
            <div className="absolute inset-0 flex flex-col justify-between pb-8 pointer-events-none">
              {gridLineValues.map((val, idx) => (
                <div key={idx} className="w-full border-t border-slate-100 flex items-start">
                  <span className="-mt-2.5 bg-white pr-2 text-[10px] text-slate-400 font-mono">
                    {val === 0 ? `${symbol}0` : val >= 1000 ? `${symbol}${(val / 1000).toFixed(0)}k` : `${symbol}${val}`}
                  </span>
                </div>
              ))}
            </div>
            
            {isProjectionTab ? (
              projectionBars.map((bar) => {
                const total = Number(bar.rawTotal) || 0;
                const collectedPct = total > 0 ? (Number(bar.rawCollected) / total) * 100 : 0;
                const guaranteedPct = total > 0 ? (Number(bar.rawGuaranteed) / total) * 100 : 0;
                const projectedPct = total > 0 ? (Number(bar.rawProjected) / total) * 100 : 0;

                return (
                  <div 
                    key={bar.month} 
                    className="relative flex-1 flex flex-col justify-end items-center group z-10 h-full cursor-help"
                  >
                    {/* Tooltip on Hover */}
                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[11px] p-2 rounded shadow-lg z-30 pointer-events-none w-52 text-left space-y-1">
                      <p className="font-bold text-slate-200 border-b border-slate-700 pb-0.5">{bar.month} Forecast</p>
                      <div className="flex justify-between">
                        <span className="text-emerald-400">Collected (Paid):</span>
                        <span>{formatCurrency(bar.rawCollected)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-400">Guaranteed (Unpaid):</span>
                        <span>{formatCurrency(bar.rawGuaranteed)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-indigo-400">Projected:</span>
                        <span>{formatCurrency(bar.rawProjected)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-700 pt-1 font-semibold">
                        <span>Total Expected:</span>
                        <span>{formatCurrency(bar.rawTotal)}</span>
                      </div>
                    </div>

                    <div 
                      className="w-full max-w-[48px] flex flex-col rounded-t-sm overflow-hidden"
                      style={{ height: bar.heightTotal }}
                    >
                      {/* Projected segment at the top */}
                      {projectedPct > 0 && (
                        <div 
                          className="w-full bg-indigo-200 border-t border-indigo-300 border-dashed transition-colors group-hover:bg-indigo-300"
                          style={{ height: `${projectedPct}%` }}
                        />
                      )}
                      {/* Guaranteed segment in the middle */}
                      {guaranteedPct > 0 && (
                        <div 
                          className="w-full bg-blue-600 transition-colors group-hover:bg-blue-700"
                          style={{ height: `${guaranteedPct}%` }}
                        />
                      )}
                      {/* Collected segment at the bottom */}
                      {collectedPct > 0 && (
                        <div 
                          className="w-full bg-emerald-600 transition-colors group-hover:bg-emerald-700"
                          style={{ height: `${collectedPct}%` }}
                        />
                      )}
                    </div>
                    <span className="absolute -bottom-6 text-xs text-slate-500 font-medium">{bar.month}</span>
                  </div>
                );
              })
            ) : (
              chartBars.map((bar) => (
                <div key={bar.month} className="relative flex-1 flex flex-col justify-end items-center group z-10 h-full" title={`Revenue: ${symbol}${bar.rawTotal}`}>
                  <div 
                    className="w-full max-w-[48px] bg-blue-100 rounded-t-sm group-hover:bg-blue-200 transition-colors relative"
                    style={{ height: bar.heightBg }}
                  >
                    <div 
                      className="absolute bottom-0 w-full bg-blue-600 rounded-t-sm group-hover:bg-blue-700 transition-colors"
                      style={{ height: bar.heightFg }}
                    />
                  </div>
                  <span className="absolute -bottom-6 text-xs text-slate-500 font-medium">{bar.month}</span>
                </div>
              ))
            )}
          </div>

          {isProjectionTab && (
            <div className="flex flex-col sm:flex-row items-center gap-6 mt-6 justify-center border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <div className="size-3 bg-emerald-600 rounded-sm" />
                <span>Collected (Paid Invoices)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <div className="size-3 bg-blue-600 rounded-sm" />
                <span>Guaranteed (Issued Invoices Due)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <div className="size-3 bg-indigo-200 border border-indigo-300 border-dashed rounded-sm" />
                <span>Projected Trend (To reach average)</span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-3 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900">Recent Invoices</h3>
            <Link href="/sales/invoices" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>

          <div className="space-y-4 flex-1">
            {recentInvoices.length > 0 ? recentInvoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-slate-50 border border-slate-100 group-hover:bg-blue-50 transition-colors">
                    <FileText className="size-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{invoice.client}</p>
                    <p className="text-[11px] text-slate-500">{invoice.id} &middot; {invoice.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(invoice.amount)}</p>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase mt-0.5
                    ${invoice.status === 'APPROVED' || invoice.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 
                      invoice.status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 
                      invoice.status === 'SENT' ? 'bg-blue-100 text-blue-700' : 
                      'bg-slate-100 text-slate-700'}`}
                  >
                    {invoice.status}
                  </span>
                </div>
              </div>
            )) : (
              <p className="text-sm text-slate-500 text-center py-4">No recent invoices found.</p>
            )}
          </div>
        </div>
      </div>

     {/* --- QUOTES, CUSTOMERS, & CREDIT NOTES WIDGETS --- */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        
        {/* Recent Quotes Box */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900">Recent Quotes (Drafts)</h3>
            <Link href="/sales/quotes" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="space-y-4 flex-1">
            {recentQuotes.length > 0 ? recentQuotes.map((quote: any) => (
              <div key={quote.id} className="flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-slate-50 border border-slate-100">
                    <Quote className="size-4 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{quote.client}</p>
                    <p className="text-[11px] text-slate-500">{quote.id} &middot; {quote.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(quote.amount)}</p>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase mt-0.5 bg-slate-100 text-slate-700">
                    {quote.status}
                  </span>
                </div>
              </div>
            )) : (
              <p className="text-sm text-slate-500 text-center py-4">No quotes found.</p>
            )}
          </div>
        </div>

        {/* Top Customers Box */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900">Top Customers (YTD)</h3>
            <Link href="/sales/customers" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="space-y-4 flex-1">
            {topCustomers.length > 0 ? topCustomers.map((customer) => (
              <div key={customer.name} className="flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-blue-50 border border-blue-100">
                    <span className="text-xs font-bold text-blue-700">{customer.name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{customer.name}</p>
                    <p className="text-[11px] text-slate-500">{customer.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(customer.total)}</p>
                  <p className="text-[11px] text-slate-500">Total Billed</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-slate-500 text-center py-4">No customers found.</p>
            )}
          </div>
        </div>

        {/* Real Credit Notes Box */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900">Recent Credit Notes</h3>
            <Link href="/sales/adjustments" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="space-y-4 flex-1">
            {realCreditNotes.length > 0 ? realCreditNotes.map((note: any) => (
              <Link 
                key={note.id} 
                href={`/sales/adjustments?search=${note.cnNo}`}
                className="flex items-center justify-between group cursor-pointer hover:bg-slate-50/50 p-1 -mx-1 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-orange-50 border border-orange-100 group-hover:bg-orange-100 transition-colors">
                    <FileText className="size-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{note.contactName}</p>
                    <p className="text-[11px] text-slate-500">{note.cnNo} &middot; {note.invoiceRef}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(note.totalMinor / 100)}</p>
                  <span className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase mt-0.5",
                    note.status === "open" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                  )}>
                    {note.status}
                  </span>
                </div>
              </Link>
            )) : (
              <div className="flex flex-col items-center justify-center text-center py-6 h-full border border-dashed border-slate-100 rounded-xl">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">No Adjustments Found</p>
                <p className="text-[11px] text-slate-400 mt-0.5 px-4">Any credit adjustments you issue will show up here.</p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div> 
  );
}
