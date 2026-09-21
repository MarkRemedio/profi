"use client";

import { useCurrency } from "@/components/currency-provider";
import { currencySymbol } from "@/lib/currency";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  BookOpen,
  FileText,
  Landmark,
  ReceiptText,
  Scale,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  PieChart as PieChartIcon,
  Activity,
  Calendar,
  Zap,
  Users,
  Building2,
  CreditCard,
  Target,
  Bell,
  Briefcase,
  Clock,
  PoundSterling,
  Percent,
  ShoppingCart,
  Package,
  FileSpreadsheet,
  Banknote,
  Receipt,
  ArrowLeftRight,
  TrendingUpIcon,
  Eye,
  EyeOff,
  SlidersHorizontal,
  LayoutGrid,
  Settings2,
  Upload,
  Camera,
  Plus,
  ScanLine,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ComposedChart,
  Legend,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { SpendingAnomalyCard } from "./spending-anomaly-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { BankAccount } from "@/lib/banking/types";
import type { SpendAnomaly } from "@/lib/accounting/spend-anomalies";

// ─── Types ─────────────────────────────────────────────────────────────────

type DashboardOverviewProps = {
  overview: {
    metrics: Array<{ label: string; value: string; note: string; }>;
    profitSummary: { revenue: string; expenses: string; profit: string; };
    balanceSummary: { assets: string; liabilities: string; equity: string; };
    activity: Array<{ id: string; date: string; memo: string; amount: string; }>;
    reportPeriod: { yearStart: string; asOfDate: string; };
  };
  monthlyTrends: any[];
  expenseCategories: any[];
  revenueSources: any[];
  assetDistribution: any[];
  liabilityDistribution: any[];
  arAging: any[];
  apAging: any[];
  weeklyCashFlow: any[];
  bankBalanceTrend: any[];
  topAccounts: any[];
  invoiceStatus: any[];
  billStatus: any[];
  journalActivity: any[];
  contactStats: any;
  vatSummary: any;
  financialRatios: any[];
  alerts: any[];
  spendAnomalies: SpendAnomaly[];
  bankAccounts: BankAccount[];
  role?: string | null; // 🚀 Added role access property
};

const AVAILABLE_SHORTCUTS = [
  { id: "reports", label: "Reports", href: "/reports", icon: FileSpreadsheet, feature: "reports" },
  { id: "new-journal", label: "New Journal", href: "/accounting/journals", icon: BookOpen, feature: "accounting" },
  { id: "new-invoice", label: "New Invoice", href: "/sales/invoices", icon: FileText, feature: "sales" },
  { id: "new-bill", label: "New Bill", href: "/purchases/bills", icon: Receipt, feature: "purchases" },
  { id: "banking", label: "Banking", href: "/banking", icon: Landmark, feature: "banking" },
  { id: "payroll", label: "Payroll", href: "/payroll", icon: Users, feature: "payroll" },
  { id: "pos", label: "POS Terminal", href: "/pos/terminal", icon: ShoppingCart, feature: "pos" },
  { id: "taxes", label: "Taxes & VAT", href: "/taxes", icon: Scale, feature: "taxes" },
];

const KPI_METRICS = [
  { id: "net-profit", label: "Net Profit", feature: "accounting", description: "Your profit after subtracting all operating expenses, interest, and taxes." },
  { id: "revenue", label: "Revenue", feature: "accounting", description: "The total amount of money brought in by company sales." },
  { id: "bank-balance", label: "Bank Balance", feature: "banking", description: "Real-time consolidated ledger balance of all active bank accounts." },
  { id: "ar", label: "Accounts Receivable", feature: "sales", description: "Total outstanding balances currently owed by your customers." },
  { id: "ap", label: "Accounts Payable", feature: "purchases", description: "Total outstanding invoices currently owed to your suppliers." },
  { id: "gross-margin", label: "Gross Margin", feature: "sales", description: "Net sales revenue minus cost of goods sold, as percentage." },
  { id: "cash-runway", label: "Cash Runway", feature: "banking", description: "Estimate of how long current cash reserves will sustain cash outflows." },
  { id: "active-customers", label: "Active Customers", feature: "sales", description: "Total count of registered active client profiles." },
];

const DASHBOARD_WIDGETS = [
  { id: "expense-breakdown", label: "Expense Breakdown", category: "Charts & Distributions", feature: "accounting", description: "Concentric rings chart showing expense category distribution." },
  { id: "asset-composition", label: "Asset Composition", category: "Charts & Distributions", feature: "accounting", description: "Concentric rings chart showing asset accounts distribution." },
  { id: "liability-breakdown", label: "Liability Breakdown", category: "Charts & Distributions", feature: "accounting", description: "Concentric rings chart showing liability distribution." },
  { id: "ar-aging", label: "AR Aging Chart", category: "Cash Flow & Collections", feature: "sales", description: "Horizontal bar chart of accounts receivable aging buckets." },
  { id: "ap-aging", label: "AP Aging Chart", category: "Cash Flow & Collections", feature: "purchases", description: "Horizontal bar chart of accounts payable aging buckets." },
  { id: "weekly-cash-flow", label: "Weekly Cash Flow", category: "Cash Flow & Collections", feature: "accounting", description: "Comparative column chart of cash receipts vs payments." },
  { id: "bank-balance-trend", label: "Bank Balance Trend", category: "Cash Flow & Collections", feature: "banking", description: "Area chart showing bank balance movement over last 30 days." },
  { id: "invoice-status", label: "Invoice Status", category: "Document Directories", feature: "sales", description: "Concentric rings showing status of outgoing invoices." },
  { id: "bill-status", label: "Bill Status", category: "Document Directories", feature: "purchases", description: "Concentric rings showing status of supplier bills." },
  { id: "contact-directory", label: "Contact Directory", category: "Document Directories", feature: "sales", description: "Quick summary of customers, suppliers, and employees." },
  { id: "financial-ratios", label: "Key Financial Ratios", category: "Analytics & VAT", feature: "accounting", description: "List of key accounting metrics compared against targets." },
  { id: "vat-summary", label: "VAT Summary", category: "Analytics & VAT", feature: "taxes", description: "Output vs Input tax totals and net payable amount." },
  { id: "top-accounts", label: "Top Accounts", category: "Analytics & VAT", feature: "accounting", description: "Ranked list of accounts with highest ledger balances." }
];

// ─── Main Component ───────────────────────────────────────────────────────

export function DashboardOverview({ 
  overview, 
  monthlyTrends, 
  expenseCategories, 
  assetDistribution, 
  liabilityDistribution, 
  arAging, 
  apAging, 
  weeklyCashFlow, 
  bankBalanceTrend, 
  topAccounts, 
  invoiceStatus, 
  billStatus, 
  journalActivity, 
  contactStats, 
  vatSummary,
  financialRatios,
  alerts,
  spendAnomalies,
  bankAccounts,
  role, // 🚀 Destructure role variable
}: DashboardOverviewProps) {
  const { symbol, format, currency } = useCurrency();

  // 🔒 PRIVACY TOGGLE STATE
  const [hideAllData, setHideAllData] = useState(false);

  // Load the saved privacy preference the moment the dashboard opens
  useEffect(() => {
    const savedPrivacy = localStorage.getItem("wawprofi-privacy-mode");
    if (savedPrivacy === "true") {
      setHideAllData(true);
    }
  }, []);

  // Helper to flip the switch AND save it to the browser memory forever
  const toggleMasterPrivacy = () => {
    const newState = !hideAllData;
    setHideAllData(newState);
    localStorage.setItem("wawprofi-privacy-mode", String(newState));
    
    // 🚀 MAGIC: Tell all individual cards to reset their personal saves and obey the Master!
    window.dispatchEvent(new Event("wawprofi-reset-privacy"));
  };

  // 🛠️ CUSTOMIZABLE QUICK LINKS STATE
  const [pinnedLinks, setPinnedLinks] = useState<string[]>(["reports", "new-journal"]);
  const [showFrequent, setShowFrequent] = useState<boolean>(true);
  const [frequentClicks, setFrequentClicks] = useState<Record<string, number>>({});
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

  useEffect(() => {
    const savedPinned = localStorage.getItem("wawprofi-dashboard-pinned");
    if (savedPinned) {
      try {
        setPinnedLinks(JSON.parse(savedPinned));
      } catch (e) {
        console.error(e);
      }
    }
    const savedShowFrequent = localStorage.getItem("wawprofi-dashboard-show-frequent");
    if (savedShowFrequent !== null) {
      setShowFrequent(savedShowFrequent === "true");
    }
    const savedClicks = localStorage.getItem("wawprofi-dashboard-clicks");
    if (savedClicks) {
      try {
        setFrequentClicks(JSON.parse(savedClicks));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // 🎨 DASHBOARD CUSTOMIZABLE LAYOUT STATE
  const [pinnedKPIs, setPinnedKPIs] = useState<string[]>(KPI_METRICS.map(k => k.id));
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(DASHBOARD_WIDGETS.map(w => w.id));
  const [isLayoutCustomizeOpen, setIsLayoutCustomizeOpen] = useState(false);
  const [activeLayoutTab, setActiveLayoutTab] = useState<"kpis" | "widgets">("kpis");

  useEffect(() => {
    const savedKPIs = localStorage.getItem("wawprofi-dashboard-layout-kpis");
    if (savedKPIs) {
      try {
        setPinnedKPIs(JSON.parse(savedKPIs));
      } catch (e) {
        console.error(e);
      }
    }
    const savedWidgets = localStorage.getItem("wawprofi-dashboard-layout-widgets");
    if (savedWidgets) {
      try {
        setVisibleWidgets(JSON.parse(savedWidgets));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const trackClick = (id: string) => {
    const current = { ...frequentClicks };
    current[id] = (current[id] || 0) + 1;
    setFrequentClicks(current);
    localStorage.setItem("wawprofi-dashboard-clicks", JSON.stringify(current));
  };

  // 🧠 READ FEATURE FLAGS FROM MEMORY
  const [features, setFeatures] = useState<string[] | null>(null);
  useEffect(() => {
    const cached = sessionStorage.getItem("wawprofi-features");
    if (cached) setFeatures(JSON.parse(cached));
  }, []);

  const hasFeature = (feat: string) => {
    if (features === null) return true; 
    return features.some((f) => f.toLowerCase() === feat.toLowerCase());
  };

  // 🚀 Normalize active role string securely
  const userRole = String(role || "EMPLOYEE").toUpperCase();

  // 🛡️ Verify if this specific role has access clearance to this module
  const isRoleAllowed = (feat: string) => {
    if (userRole === "OWNER") return true;
    if (userRole === "EMPLOYEE") {
      return !["sales", "purchases", "banking", "accounting", "reports", "payroll", "taxes"].includes(feat.toLowerCase());
    }
    if (userRole === "ACCOUNTANT") {
      return !["pos"].includes(feat.toLowerCase());
    }
    return true;
  };

  // 📈 Compute dynamic values directly from array props to avoid static strings
  const dynamicAR = arAging?.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) || 0;
  const dynamicAP = apAging?.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) || 0;
  const dynamicNetCashFlow = weeklyCashFlow?.reduce((sum, w) => sum + (Number(w.receipts || 0) - Number(w.payments || 0)), 0) || 0;
  const dynamicYTDRevenue = monthlyTrends?.reduce((sum, m) => sum + (Number(m.revenue) || 0), 0) || 0;
  const dynamicYTDExpenses = monthlyTrends?.reduce((sum, m) => sum + (Number(m.expenses) || 0), 0) || 0;
  const salesSeries = monthlyTrends?.map((m) => Number(m.revenue) || 0) || [];
  const expenseSeries = monthlyTrends?.map((m) => Number(m.expenses) || 0) || [];

  // 🚀 THE FIX: Extract the actual number from the bank balance (e.g. converting "£0.00" to 0)
  const assetValue = Number(overview.balanceSummary.assets?.replace(/[^0-9.-]+/g, '')) || 0;

  const kpis = [
    {
      id: "net-profit",
      label: "Net Profit",
      value: overview.profitSummary.profit || format(0),
      sub: "Current period",
      trend: "•",
      positive: true,
      icon: TrendingUp,
      iconBg: "bg-emerald-50 text-emerald-600",
      sparkline: monthlyTrends?.map(m => Number(m.profit) || 0).slice(-6) || [0, 0, 0, 0, 0, 0],
    },
    {
      id: "revenue",
      label: "Revenue",
      value: overview.profitSummary.revenue || format(0),
      sub: "Current period",
      trend: "•",
      positive: true,
      icon: PoundSterling,
      iconBg: "bg-emerald-50 text-emerald-600",
      sparkline: monthlyTrends?.map(m => Number(m.revenue) || 0).slice(-6) || [0, 0, 0, 0, 0, 0],
    },
    {
      id: "bank-balance",
      label: "Bank Balance",
      value: overview.balanceSummary.assets || format(0),
      sub: "Real-time ledger",
      trend: "•",
      positive: true,
      neutral: true,
      icon: Wallet,
      iconBg: "bg-blue-50 text-blue-600",
      sparkline: bankBalanceTrend?.map(t => Number(t.balance) || 0).slice(-6) || [0, 0, 0, 0, 0, 0],
    },
    {
      id: "ar",
      label: "Account Receivables",
      value: `${symbol}${dynamicAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `${invoiceStatus?.find(s => s.name === "Unpaid")?.value || 0} invoices pending`,
      trend: "•",
      positive: true,
      icon: CreditCard,
      iconBg: "bg-emerald-50 text-emerald-600",
      sparkline: arAging?.map(a => Number(a.amount) || 0) || [0, 0, 0, 0],
    },
    {
      id: "ap",
      label: "Account Payables",
      value: `${symbol}${dynamicAP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `${billStatus?.find(s => s.name === "Unpaid")?.value || 0} bills to pay",`,
      trend: "•",
      positive: false,
      icon: ReceiptText,
      iconBg: "bg-red-50 text-red-600",
      sparkline: apAging?.map(a => Number(a.amount) || 0) || [0, 0, 0, 0],
    },
    {
      id: "gross-margin",
      label: "Gross Margin",
      value: financialRatios?.find(r => r.name.toLowerCase().includes("margin"))?.value || "0.0%",
      sub: "vs sales target",
      trend: "•",
      positive: true,
      icon: Percent,
      iconBg: "bg-emerald-50 text-emerald-600",
      sparkline: [0, 0, 0, 0, 0, 0],
    },
    {
      id: "cash-runway",
      label: "Cash Runway",
      // 🚀 THE FIX: If they have 0 cash, it says "None". If they have cash but no bills, it says "Stable". Otherwise, it calculates the months.
      value: assetValue === 0 ? "None" : (dynamicAP > 0 ? `${(assetValue / dynamicAP).toFixed(1)} mos` : "Stable"),
      sub: "Liquidity timeline",
      trend: assetValue === 0 ? "•" : "stable",
      positive: true,
      neutral: true,
      icon: Clock,
      iconBg: "bg-blue-50 text-blue-600",
      sparkline: [0, 0, 0, 0, 0, 0],
    },
    {
      id: "active-customers",
      label: "Active Customers",
      value: String(contactStats?.customers?.total || 0),
      sub: "Registered clients",
      trend: "•",
      positive: true,
      icon: Users,
      iconBg: "bg-indigo-50 text-indigo-600",
      sparkline: [0, 0, 0, 0, 0, 0],
    },
  ];

  const visibleKPIs = kpis.filter(k => pinnedKPIs.includes(k.id));

  const pinnedList = AVAILABLE_SHORTCUTS.filter(s => pinnedLinks.includes(s.id) && hasFeature(s.feature) && isRoleAllowed(s.feature));
  const frequentList = AVAILABLE_SHORTCUTS
    .filter(s => !pinnedLinks.includes(s.id) && hasFeature(s.feature) && isRoleAllowed(s.feature))
    .map(s => ({ ...s, count: frequentClicks[s.id] || 0 }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);

  return (
    <div className="space-y-6">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 bg-clip-text text-3xl font-black tracking-tight text-transparent">
              Financial Dashboard
            </h1>
            <Badge variant="secondary" className="rounded-full bg-blue-50/80 px-3 py-0.5 text-xs font-bold text-blue-700 border border-blue-100 hover:bg-blue-100 transition-all duration-200">
              FY {new Date().getFullYear()}
            </Badge>
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/50 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur-sm">
              <Calendar className="size-3.5 text-slate-400" />
              <span>As of: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="text-slate-300">•</span>
              <Clock className="size-3.5 text-slate-400" />
              <span>{new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="relative flex size-2 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500"></span>
            </div>
            <span>Complete financial overview</span>
            <span className="text-slate-300">•</span>
            <span className="font-semibold text-slate-600">All metrics in real-time</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pinnedList.map((item, idx) => {
            const Icon = item.icon;
            const isPrimary = idx === 0;
            return (
              <Button
                key={item.id}
                variant={isPrimary ? "default" : "outline"}
                size="sm"
                className={cn("gap-2 shadow-xs rounded-full", isPrimary ? "bg-blue-600 hover:bg-blue-700 text-white border-transparent" : "border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50")}
                asChild
              >
                <Link href={item.href} onClick={() => trackClick(item.id)}>
                  <Icon className={cn("size-4", isPrimary ? "text-white" : "text-slate-500")} />
                  {item.label}
                </Link>
              </Button>
            );
          })}
          
          {showFrequent && frequentList.length > 0 && (
            <>
              <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />
              {frequentList.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    variant="ghost"
                    size="sm"
                    className="gap-2 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100/80 border border-dashed border-slate-200/60"
                    asChild
                  >
                    <Link href={item.href} onClick={() => trackClick(item.id)}>
                      <Icon className="size-4 text-slate-400" />
                      <span className="flex items-center gap-1.5">
                        {item.label}
                        <span className="text-[8px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-full uppercase tracking-wider scale-90">Suggest</span>
                      </span>
                    </Link>
                  </Button>
                );
              })}
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full border border-slate-200/50 bg-white hover:bg-slate-50 shadow-xs text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            onClick={() => setIsCustomizeOpen(true)}
            title="Customize quick links"
          >
            <SlidersHorizontal className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full border border-slate-200/50 bg-white hover:bg-slate-50 shadow-xs text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            onClick={() => setIsLayoutCustomizeOpen(true)}
            title="Customize dashboard layout"
          >
            <LayoutGrid className="size-4" />
          </Button>
        </div>
      </div>

      {/* ─── SECTION 1: Key Performance Indicators (MOVED TO TOP) ─── */}
      {visibleKPIs.length > 0 && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Key Performance Indicators</h2>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleMasterPrivacy}
              className="text-slate-500 hover:text-slate-700 bg-slate-50"
            >
              {hideAllData ? <EyeOff className="size-4 mr-2" /> : <Eye className="size-4 mr-2" />}
              {hideAllData ? "Show Values" : "Hide Values"}
            </Button>
          </div>
          <div className={cn(
            "grid grid-cols-1 gap-3 sm:grid-cols-2",
            visibleKPIs.length >= 4 ? "lg:grid-cols-4" : visibleKPIs.length === 3 ? "lg:grid-cols-3" : visibleKPIs.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1"
          )}>
            {visibleKPIs.map((kpi) => (
              <KPICard key={kpi.id} {...kpi} hideAll={hideAllData} /> 
            ))}
          </div>
        </div>
      )}

      {/* ─── SECTION 2: 3 Donut Breakdown Charts ─── */}
      {(() => {
        const section2Widgets = [
          { id: "expense-breakdown", title: "Expense Breakdown", icon: PieChartIcon, data: expenseCategories, feature: "accounting" },
          { id: "asset-composition", title: "Asset Composition", icon: Package, data: assetDistribution, feature: "accounting" },
          { id: "liability-breakdown", title: "Liability Breakdown", icon: Receipt, data: liabilityDistribution, feature: "accounting" }
        ].filter(w => visibleWidgets.includes(w.id) && hasFeature(w.feature) && isRoleAllowed(w.feature));

        if (section2Widgets.length === 0) return null;
        return (
          <div className={cn(
            "grid grid-cols-1 gap-4 animate-in fade-in duration-300",
            section2Widgets.length === 3 ? "lg:grid-cols-3" : section2Widgets.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1"
          )}>
            {section2Widgets.map(w => (
              <Card key={w.id} hideAll={hideAllData} title={w.title} icon={w.icon}>
                <StackedRings data={w.data} />
              </Card>
            ))}
          </div>
        );
      })()}

      {/* ─── SECTION 3: 4 Smaller Widgets (Aging & Cash Flow) ─── */}
      {(() => {
        const visibleSection3Count = [
          visibleWidgets.includes("ar-aging") && hasFeature("sales"),
          visibleWidgets.includes("ap-aging") && hasFeature("purchases"),
          visibleWidgets.includes("weekly-cash-flow") && hasFeature("accounting"),
          visibleWidgets.includes("bank-balance-trend") && hasFeature("banking")
        ].filter(Boolean).length;

        if (visibleSection3Count === 0) return null;

        // Dynamic AR Math
        const totalArAmount = arAging?.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) || 0;
        const currentArAmount = arAging?.[0]?.amount || 0;
        const overdueArAmount = totalArAmount - currentArAmount;
        const currentArPercent = totalArAmount > 0 ? Math.round((currentArAmount / totalArAmount) * 100) : 100;
        const overdueArPercent = totalArAmount > 0 ? Math.round((overdueArAmount / totalArAmount) * 100) : 0;

        // Dynamic AP Math
        const totalApAmount = apAging?.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) || 0;
        const currentApAmount = apAging?.[0]?.amount || 0;
        const overdueApAmount = totalApAmount - currentApAmount;
        const currentApPercent = totalApAmount > 0 ? Math.round((currentApAmount / totalApAmount) * 100) : 100;
        const overdueApPercent = totalApAmount > 0 ? Math.round((overdueApAmount / totalApAmount) * 100) : 0;

        return (
          <div className={cn(
            "grid grid-cols-1 gap-4 animate-in fade-in duration-300",
            visibleSection3Count === 4 ? "xl:grid-cols-4 lg:grid-cols-2" :
            visibleSection3Count === 3 ? "lg:grid-cols-3" :
            visibleSection3Count === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1"
          )}>
            {/* AR Aging */}
            {visibleWidgets.includes("ar-aging") && hasFeature("sales") && (
              <Card hideAll={hideAllData} title="AR Aging" icon={Clock} action={<Badge variant="outline" className="text-[10px]">{symbol}{dynamicAR.toLocaleString()} total</Badge>}>
                {/* ✅ LAZY CHART ADDED HERE */}
                <LazyChart height="h-40">
                  <ResponsiveContainer width="100%" height="100%" debounce={150} initialDimension={{ width: 100, height: 100 }}>
                    <BarChart data={arAging} layout="vertical" margin={{ top: 5, right: 5, left: 40, bottom: 5 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="bucket" type="category" tick={{ fontSize: 10, fill: "#64748b" }} width={60} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="amount" name="Amount" radius={[0, 4, 4, 0]}>
                        {arAging.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </LazyChart>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Current: {currentArPercent}%</span>
                  <span className={cn("font-bold", overdueArAmount > 0 ? "text-red-500" : "text-emerald-500")}>
                    {overdueArAmount > 0 ? `Overdue: ${overdueArPercent}%` : "All on track"}
                  </span>
                </div>
              </Card>
            )}

            {/* AP Aging */}
            {visibleWidgets.includes("ap-aging") && hasFeature("purchases") && (
              <Card hideAll={hideAllData} title="AP Aging" icon={Calendar} action={<Badge variant="outline" className="text-[10px]">{symbol}{dynamicAP.toLocaleString()} total</Badge>}>
                <LazyChart height="h-40">
                  <ResponsiveContainer width="100%" height="100%" debounce={150} initialDimension={{ width: 100, height: 100 }}>
                    <BarChart data={apAging} layout="vertical" margin={{ top: 5, right: 5, left: 40, bottom: 5 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="bucket" type="category" tick={{ fontSize: 10, fill: "#64748b" }} width={60} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="amount" name="Amount" radius={[0, 4, 4, 0]}>
                        {apAging.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </LazyChart>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Current: {currentApPercent}%</span>
                  <span className={cn("font-bold", overdueApAmount > 0 ? "text-red-500" : "text-emerald-500")}>
                    {overdueApAmount > 0 ? `Overdue: ${overdueApPercent}%` : "All on track"}
                  </span>
                </div>
              </Card>
            )}

            {/* Weekly Cash Flow */}
            {visibleWidgets.includes("weekly-cash-flow") && hasFeature("accounting") && (
              <Card hideAll={hideAllData} title="Weekly Cash Flow" icon={Banknote}>
                <LazyChart height="h-40">
                  <ResponsiveContainer width="100%" height="100%" debounce={150} initialDimension={{ width: 100, height: 100 }}>
                    <BarChart data={weeklyCashFlow} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${v/1000}k`} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="receipts" name="Receipts" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="payments" name="Payments" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </LazyChart>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <LegendItem color="#10b981" label="In" />
                  <LegendItem color="#ef4444" label="Out" />
                  <span className={cn("ml-auto font-bold", dynamicNetCashFlow >= 0 ? "text-emerald-600" : "text-red-600")}>
                    Net: {dynamicNetCashFlow >= 0 ? "+" : "-"}{symbol}{Math.abs(dynamicNetCashFlow).toLocaleString()}
                  </span>
                </div>
              </Card>
            )}

            {/* Bank Balance Trend */}
            {visibleWidgets.includes("bank-balance-trend") && hasFeature("banking") && (
              <Card hideAll={hideAllData} title="Bank Balance (30 days)" icon={Wallet}>
                <LazyChart height="h-40">
                  <ResponsiveContainer width="100%" height="100%" debounce={150} initialDimension={{ width: 100, height: 100 }}>
                    <AreaChart data={bankBalanceTrend} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="bankGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${v/1000}k`} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#bankGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </LazyChart>
                <div className="mt-2 text-center text-xs font-bold text-blue-600">{overview.balanceSummary.assets || format(0)} current balance</div>
              </Card>
            )}
          </div>
        );
      })()}

      {/* ─── SECTION 4: Document Status & Contacts ─── */}
      {(() => {
        const visibleSection4Count = [
          visibleWidgets.includes("invoice-status") && hasFeature("sales"),
          visibleWidgets.includes("bill-status") && hasFeature("purchases"),
          visibleWidgets.includes("contact-directory") && hasFeature("sales")
        ].filter(Boolean).length;

        if (visibleSection4Count === 0) return null;

        return (
          <div className={cn(
            "grid grid-cols-1 gap-4 animate-in fade-in duration-300",
            visibleSection4Count === 3 ? "lg:grid-cols-3" :
            visibleSection4Count === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1"
          )}>
            {/* Invoice Status */}
            {visibleWidgets.includes("invoice-status") && hasFeature("sales") && (
              <Card hideAll={hideAllData} title="Invoice Status" icon={FileText} action={<Link href="/sales/invoices" className="text-xs font-bold text-blue-600">View all</Link>}>
                <StackedRings data={invoiceStatus} />
              </Card>
            )}

            {/* Bill Status */}
            {visibleWidgets.includes("bill-status") && hasFeature("purchases") && (
              <Card hideAll={hideAllData} title="Bill Status" icon={ReceiptText} action={<Link href="/purchases" className="text-xs font-bold text-blue-600">View all</Link>}>
                <StackedRings data={billStatus} />
              </Card>
            )}

            {/* Contact Stats */}
            {visibleWidgets.includes("contact-directory") && hasFeature("sales") && (
              <Card hideAll={hideAllData} title="Contact Directory" icon={Users}>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-blue-50 p-3 text-center">
                    <p className="text-2xl font-extrabold text-blue-600">{contactStats.customers.total}</p>
                    <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Customers</p>
                    <p className="text-[10px] text-blue-500">+{contactStats.customers.newThisMonth} new</p>
                  </div>
                  <div className="rounded-lg bg-rose-50 p-3 text-center">
                    <p className="text-2xl font-extrabold text-rose-600">{contactStats.suppliers.total}</p>
                    <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wide">Suppliers</p>
                    <p className="text-[10px] text-rose-500">+{contactStats.suppliers.newThisMonth} new</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3 text-center">
                    <p className="text-2xl font-extrabold text-emerald-600">{contactStats.employees.total}</p>
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Employees</p>
                    <p className="text-[10px] text-emerald-500">+{contactStats.employees.newThisMonth} new</p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        );
      })()}

      {/* ─── SECTION 5: Financial Ratios, VAT, Top Accounts ─── */}
      {(() => {
        const visibleSection5Count = [
          visibleWidgets.includes("financial-ratios") && hasFeature("accounting"),
          visibleWidgets.includes("vat-summary") && hasFeature("taxes"),
          visibleWidgets.includes("top-accounts") && hasFeature("accounting")
        ].filter(Boolean).length;

        if (visibleSection5Count === 0) return null;

        return (
          <div className={cn(
            "grid grid-cols-1 gap-4 animate-in fade-in duration-300",
            visibleSection5Count === 3 ? "lg:grid-cols-3" :
            visibleSection5Count === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1"
          )}>
            {/* Financial Ratios */}
            {visibleWidgets.includes("financial-ratios") && hasFeature("accounting") && (
              <Card hideAll={hideAllData} title="Key Financial Ratios" icon={Activity}>
                <div className="space-y-2">
                  {financialRatios.map((ratio) => (
                    <div key={ratio.name} className="flex items-center justify-between py-1">
                      <span className="text-xs font-medium text-slate-600">{ratio.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">Target: {ratio.target}</span>
                        <Badge className={cn("text-[10px]", ratio.status === "good" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                          {ratio.value}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* VAT Summary */}
            {visibleWidgets.includes("vat-summary") && hasFeature("taxes") && (
              <Card hideAll={hideAllData} title="VAT Summary" icon={Percent} action={<Badge variant="outline" className="text-[10px]">Q{Math.floor(new Date().getMonth() / 3) + 1} {new Date().getFullYear()}</Badge>}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">Output VAT (Sales)</span>
                    <span className="font-mono text-sm font-bold text-emerald-600">{symbol}{vatSummary.outputTax.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">Input VAT (Purchases)</span>
                    <span className="font-mono text-sm font-bold text-red-500">-{symbol}{vatSummary.inputTax.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Net VAT Payable</span>
                      <span className="font-mono text-lg font-bold text-blue-600">{symbol}{vatSummary.netVat.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>QTD: {symbol}{vatSummary.quarterToDate.toLocaleString()}</span>
                    <span>Prev: {symbol}{vatSummary.previousQuarter.toLocaleString()}</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Top Accounts by Balance */}
            {visibleWidgets.includes("top-accounts") && hasFeature("accounting") && (
              <Card hideAll={hideAllData} title="Top Accounts" icon={Briefcase}>
                <div className="space-y-2">
                  {topAccounts.slice(0, 6).map((acc) => (
                    <div key={acc.code} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-mono px-1">{acc.code}</Badge>
                        <span className="text-xs text-slate-700 truncate max-w-[100px]">{acc.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {acc.trend === "up" ? <TrendingUpIcon className="size-3 text-emerald-500" /> : acc.trend === "down" ? <TrendingDown className="size-3 text-red-500" /> : <div className="size-3" />}
                        <span className="font-mono text-xs font-bold text-slate-900">{symbol}{acc.balance.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        );
      })()}

      {/* ─── SECTION 6: Alerts & Journal Activity ─── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <SpendingAnomalyCard anomalies={spendAnomalies} currency={currency} className="xl:col-span-1" />

        {/* All Alerts */}
        <Card hideAll={hideAllData} title="Action Required" icon={Bell} className="xl:col-span-1">
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <AlertCard key={i} {...alert} />
            ))}
          </div>
        </Card>

        {/* Journal Activity */}
        <Card hideAll={hideAllData} title="Journal Activity by Day" icon={BarChart3} className="xl:col-span-1">
          <LazyChart height="h-48">
            <ResponsiveContainer width="100%" height="100%" debounce={150} initialDimension={{ width: 100, height: 100 }}>
              <BarChart data={journalActivity} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${v/1000}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar yAxisId="left" dataKey="count" name="Journals" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="amount" name="Amount" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </LazyChart>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <LegendItem color="#3b82f6" label="Count" />
            <LegendItem color="#10b981" label="Amount" />
          </div>
        </Card>

        {/* Recent Ledger Activity */}
        <Card hideAll={hideAllData} title="Recent Transactions" icon={Calendar} className="xl:col-span-1" action={<Button variant="outline" size="sm" asChild><Link href="/accounting/journals">View All</Link></Button>}>
          <div className="divide-y divide-slate-50">
            {overview.activity.slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-6 items-center justify-center rounded-full bg-slate-100">
                    <FileText className="size-3 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800 truncate max-w-[140px]">{item.memo}</p>
                    <p className="text-[10px] text-slate-400">{item.date}</p>
                  </div>
                </div>
                <p className="font-mono text-xs font-bold text-slate-900">{item.amount}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ─── SECTION 7: Main Large Charts (12-Month & Receivables) ─── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Revenue Trend - 12 months */}
        <Card hideAll={hideAllData} className="xl:col-span-2" title="12-Month Financial Performance" icon={TrendingUp} action={<Badge variant="outline" className="text-[10px]">YTD</Badge>}>
          <LazyChart height="h-72">
            <ResponsiveContainer width="100%" height="100%" debounce={150} initialDimension={{ width: 100, height: 100 }}>
              <ComposedChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${symbol}${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revGrad)" />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#expGrad)" />
                <Line type="monotone" dataKey="profit" name="Net Profit" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </LazyChart>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <LegendItem color="#3b82f6" label="Revenue" />
            <LegendItem color="#ef4444" label="Expenses" />
            <LegendItem color="#10b981" label="Net Profit" />
            <div className="ml-auto text-xs text-slate-400">{symbol}{dynamicYTDRevenue.toLocaleString()} total revenue YTD</div>
          </div>
        </Card>

        {/* AR & AP Trend */}
        <Card hideAll={hideAllData} title="Receivables vs Payables" icon={ArrowLeftRight}>
          <LazyChart height="h-48">
            <ResponsiveContainer width="100%" height="100%" debounce={150} initialDimension={{ width: 100, height: 100 }}>
              <AreaChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="arGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="apGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${symbol}${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="ar" name="Receivables" stroke="#3b82f6" strokeWidth={2} fill="url(#arGrad)" />
                <Area type="monotone" dataKey="ap" name="Payables" stroke="#ef4444" strokeWidth={2} fill="url(#apGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </LazyChart>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-3">
              <LegendItem color="#3b82f6" label="AR" />
              <LegendItem color="#ef4444" label="AP" />
            </div>
            <div className={cn("text-xs font-bold", (dynamicAR - dynamicAP) >= 0 ? "text-emerald-600" : "text-red-600")}>
  Net Working Capital: {symbol}{(dynamicAR - dynamicAP).toLocaleString()}
</div>
          </div>
        </Card>
      </div>

     {/* ─── SECTION 8: Activity & Quick Capture (Absolute Bottom) ─── */}
      {userRole !== "EMPLOYEE" && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Zap className="size-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Data Tracking</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="grid content-start grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-8">
              <ActivityCard
                title="Total Sales Activity"
                icon={TrendingUp}
                total={overview.profitSummary.revenue || format(0)}
                subtitle="Revenue this period"
                series={salesSeries}
                color="#10b981"
                positiveIsGood
                badge="YTD"
                footer={`YTD ${symbol}${dynamicYTDRevenue.toLocaleString()}`}
                href="/sales"
                linkLabel="View sales"
                hideAll={hideAllData}
              />
              <ActivityCard
                title="Total Expenses Activity"
                icon={TrendingDown}
                total={overview.profitSummary.expenses || format(0)}
                subtitle="Spend this period"
                series={expenseSeries}
                color="#f43f5e"
                positiveIsGood={false}
                badge="YTD"
                footer={expenseCategories?.[0]?.name ? `Top: ${expenseCategories[0].name}` : `YTD ${symbol}${dynamicYTDExpenses.toLocaleString()}`}
                href="/purchases"
                linkLabel="View expenses"
                hideAll={hideAllData}
              />
              <div className="sm:col-span-2">
                <ReceiptCaptureCard />
              </div>
            </div>

            <div className="xl:col-span-4">
              <BankAccountsPanel accounts={bankAccounts || []} hideAll={hideAllData} />
            </div>
          </div>
        </div>
      )}
      {/* 🛠️ CUSTOMIZABLE QUICK LINKS DIALOG */}
      <Dialog open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Customize Quick Links</DialogTitle>
            <DialogDescription>
              Select which shortcuts you want to pin to your dashboard header, or enable smart suggestions based on your usage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Pin Quick Links</h4>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_SHORTCUTS.filter(s => hasFeature(s.feature) && isRoleAllowed(s.feature)).map(s => {
                  const Icon = s.icon;
                  const isPinned = pinnedLinks.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        const nextPinned = isPinned
                          ? pinnedLinks.filter(id => id !== s.id)
                          : [...pinnedLinks, s.id];
                        setPinnedLinks(nextPinned);
                        localStorage.setItem("wawprofi-dashboard-pinned", JSON.stringify(nextPinned));
                      }}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all duration-200 outline-none",
                        isPinned
                          ? "border-blue-200 bg-blue-50/40 text-blue-700 ring-2 ring-blue-500/10 font-semibold"
                          : "border-slate-200 bg-white hover:border-slate-300 text-slate-600"
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", isPinned ? "text-blue-600" : "text-slate-400")} />
                      <span className="text-sm">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-800">Smart Suggestions</h4>
                <p className="text-xs text-slate-500 mt-0.5">Show your 2 most frequently used pages next to pinned links.</p>
              </div>
              <Switch
                checked={showFrequent}
                onCheckedChange={(checked) => {
                  setShowFrequent(checked);
                  localStorage.setItem("wawprofi-dashboard-show-frequent", String(checked));
                }}
              />
            </div>
          </div>

          <DialogFooter className="flex sm:justify-between items-center w-full gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Are you sure you want to reset your usage statistics?")) {
                  setFrequentClicks({});
                  localStorage.removeItem("wawprofi-dashboard-clicks");
                }
              }}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Reset usage
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setIsCustomizeOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 🎨 CUSTOMIZABLE DASHBOARD LAYOUT DIALOG */}
      <Dialog open={isLayoutCustomizeOpen} onOpenChange={setIsLayoutCustomizeOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="size-5 text-blue-600" />
              Customize Dashboard Layout
            </DialogTitle>
            <DialogDescription>
              Toggle which items you want to display on your workspace overview page.
            </DialogDescription>
          </DialogHeader>

          {/* Custom state-based tabs */}
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => setActiveLayoutTab("kpis")}
              className={cn(
                "flex-1 py-2.5 text-center text-sm font-semibold border-b-2 transition-all duration-200 outline-none",
                activeLayoutTab === "kpis"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              KPI Cards
            </button>
            <button
              onClick={() => setActiveLayoutTab("widgets")}
              className={cn(
                "flex-1 py-2.5 text-center text-sm font-semibold border-b-2 transition-all duration-200 outline-none",
                activeLayoutTab === "widgets"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              Charts & Widgets
            </button>
          </div>

          <div className="max-h-[380px] overflow-y-auto py-4 pr-1 space-y-4">
            {activeLayoutTab === "kpis" ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">Enable or disable metrics in the key performance grid at the top.</p>
                <div className="space-y-2">
                  {KPI_METRICS.filter(k => hasFeature(k.feature)).map(k => {
                    const isPinned = pinnedKPIs.includes(k.id);
                    return (
                      <div key={k.id} className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3 hover:bg-slate-50 transition-colors">
                        <div className="space-y-0.5 max-w-[80%]">
                          <span className="text-sm font-bold text-slate-800">{k.label}</span>
                          <p className="text-xs text-slate-500 line-clamp-2">{k.description}</p>
                        </div>
                        <Switch
                          checked={isPinned}
                          onCheckedChange={(checked) => {
                            const nextKPIs = checked
                              ? [...pinnedKPIs, k.id]
                              : pinnedKPIs.filter(id => id !== k.id);
                            setPinnedKPIs(nextKPIs);
                            localStorage.setItem("wawprofi-dashboard-layout-kpis", JSON.stringify(nextKPIs));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">Choose which visualization widgets are visible in the main feed.</p>
                {/* Group widgets by category */}
                {Array.from(new Set(DASHBOARD_WIDGETS.map(w => w.category))).map(category => (
                  <div key={category} className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{category}</h4>
                    <div className="space-y-2">
                      {DASHBOARD_WIDGETS.filter(w => w.category === category && hasFeature(w.feature)).map(w => {
                        const isVisible = visibleWidgets.includes(w.id);
                        return (
                          <div key={w.id} className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3 hover:bg-slate-50 transition-colors">
                            <div className="space-y-0.5 max-w-[80%]">
                              <span className="text-sm font-bold text-slate-800">{w.label}</span>
                              <p className="text-xs text-slate-500">{w.description}</p>
                            </div>
                            <Switch
                              checked={isVisible}
                              onCheckedChange={(checked) => {
                                const nextWidgets = checked
                                  ? [...visibleWidgets, w.id]
                                  : visibleWidgets.filter(id => id !== w.id);
                                setVisibleWidgets(nextWidgets);
                                localStorage.setItem("wawprofi-dashboard-layout-widgets", JSON.stringify(nextWidgets));
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex sm:justify-between items-center w-full gap-2 border-t border-slate-100 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Restore dashboard to default layout?")) {
                  const defaultKPIs = KPI_METRICS.map(k => k.id);
                  const defaultWidgets = DASHBOARD_WIDGETS.map(w => w.id);
                  setPinnedKPIs(defaultKPIs);
                  setVisibleWidgets(defaultWidgets);
                  localStorage.removeItem("wawprofi-dashboard-layout-kpis");
                  localStorage.removeItem("wawprofi-dashboard-layout-widgets");
                }
              }}
              className="text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            >
              Reset Layout
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setIsLayoutCustomizeOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Performance Wrappers ─────────────────────────────────────────────────

// ✅ THE FIX: This wrapper prevents Recharts from rendering on the exact same millisecond as the page load.
function LazyChart({ children, height = "h-40" }: { children: React.ReactNode, height?: string }) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    // 100ms delay gives the browser time to paint the rest of the page first
    const timer = setTimeout(() => setIsMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!isMounted) return <div className={cn("w-full rounded-xl bg-slate-100 animate-pulse", height)} />;
  return <div className={cn("w-full animate-in fade-in duration-700", height)}>{children}</div>;
}

// ─── Section 8: Activity & Quick Capture Components ───────────────────────

const BANK_TONE: Record<string, string> = {
  blue: "bg-blue-100 text-blue-600",
  orange: "bg-orange-100 text-orange-600",
  green: "bg-emerald-100 text-emerald-600",
  purple: "bg-purple-100 text-purple-600",
  slate: "bg-slate-100 text-slate-600",
};

function formatBankCurrency(amount: string | number, currency = "GBP") {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const symbol = currencySymbol(currency);
  return `${symbol}${(isNaN(num) ? 0 : num).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Lightweight inline bar sparkline — no chart library, current period highlighted
function MiniBars({ data, color }: { data: number[]; color: string }) {
  const bars = data.length ? data : [0, 0, 0, 0, 0, 0];
  const max = Math.max(...bars, 1);
  return (
    <div className="flex h-16 items-end gap-1">
      {bars.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm transition-all"
          style={{
            height: `${Math.max((v / max) * 100, 4)}%`,
            backgroundColor: color,
            opacity: i === bars.length - 1 ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  );
}

function ActivityCard({
  title,
  icon,
  total,
  subtitle,
  series,
  color,
  positiveIsGood,
  badge,
  footer,
  href,
  linkLabel,
  hideAll,
}: {
  title: string;
  icon: React.ElementType;
  total: string;
  subtitle: string;
  series: number[];
  color: string;
  positiveIsGood: boolean;
  badge: string;
  footer: string;
  href: string;
  linkLabel: string;
  hideAll?: boolean;
}) {
  const last = series.length ? series[series.length - 1] : 0;
  const prev = series.length > 1 ? series[series.length - 2] : 0;
  const mom = prev > 0 ? ((last - prev) / prev) * 100 : last > 0 ? 100 : 0;
  const up = mom >= 0;
  const good = positiveIsGood ? up : !up;

  return (
    <Card
      title={title}
      icon={icon}
      hideAll={hideAll}
      action={<Badge variant="outline" className="text-[10px]">{badge}</Badge>}
    >
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-3xl font-black tracking-tight text-slate-950">{total}</p>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-xs font-bold",
            good ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
          )}
        >
          {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {Math.abs(mom).toFixed(1)}%
        </span>
      </div>

      <div className="mt-4">
        <MiniBars data={series.slice(-8)} color={color} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
        <span className="truncate text-slate-500">{footer}</span>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 font-bold text-blue-600 hover:text-blue-700">
          {linkLabel}
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </Card>
  );
}

function BankRow({ account }: { account: BankAccount }) {
  const tone = BANK_TONE[account.color_tone] ?? BANK_TONE.blue;
  const isLive = account.connection_type === "live_feed";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/40 p-3 transition-colors hover:border-slate-200 hover:bg-slate-50">
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Building2 className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{account.display_name}</p>
          <p className="truncate text-[11px] text-slate-500">
            {account.sort_code ? `${account.sort_code} · ` : ""}
            {account.account_number_last4 ? `••${account.account_number_last4}` : account.bank_name}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-extrabold text-slate-900">
          {formatBankCurrency(account.balance, account.currency)}
        </p>
        <span
          className={cn(
            "mt-0.5 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider",
            isLive ? "text-emerald-600" : "text-slate-400"
          )}
        >
          {isLive && <span className="size-1.5 rounded-full bg-emerald-500" />}
          {isLive ? "Live" : "Manual"}
        </span>
      </div>
    </div>
  );
}

function BankAccountsPanel({ accounts, hideAll }: { accounts: BankAccount[]; hideAll?: boolean }) {
  const shown = accounts.slice(0, 5);
  const remaining = accounts.length - shown.length;

  return (
    <Card
      title="Bank Accounts"
      icon={Landmark}
      hideAll={hideAll}
      action={<Link href="/banking" className="text-xs font-bold text-blue-600 hover:text-blue-700">Manage</Link>}
    >
      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-10 text-center">
          <Building2 className="size-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-600">No bank accounts yet</p>
          <Link href="/banking" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
            <Plus className="size-3.5" /> Add account
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((account) => (
            <BankRow key={account.id} account={account} />
          ))}
          {remaining > 0 && (
            <Link
              href="/banking"
              className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 py-2 text-xs font-bold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-600"
            >
              +{remaining} more account{remaining > 1 ? "s" : ""}
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

function ReceiptCaptureCard() {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ name: string; url: string; isImage: boolean }[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Keep the latest files in a ref so unmount cleanup revokes every object URL
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next = Array.from(list).map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      isImage: f.type.startsWith("image/"),
    }));
    setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine className="size-4 text-indigo-500" />
          <h2 className="text-sm font-bold text-slate-800">Capture / Upload Receipt</h2>
        </div>
        <Badge variant="outline" className="text-[10px]">Purchases</Badge>
      </div>

      {files.length === 0 ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => uploadRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") uploadRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(e.dataTransfer.files); }}
          className={cn(
            "flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center outline-none transition-all",
            dragActive
              ? "border-indigo-400 bg-indigo-50/60"
              : "border-slate-200 bg-slate-50/40 hover:border-indigo-300 hover:bg-indigo-50/30"
          )}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 ring-8 ring-indigo-50/40">
            <Upload className="size-5" />
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">Drop a receipt here</p>
          <p className="mt-0.5 text-xs text-slate-500">PNG, JPG or PDF — or use your camera</p>
        </div>
      ) : (
        <div className="flex-1 space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-2">
              <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                {f.isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={f.name} className="size-full object-cover" />
                ) : (
                  <FileText className="size-4 text-slate-400" />
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{f.name}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="px-1 text-xs font-bold text-slate-300 hover:text-red-500"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-slate-400">
            Continue in Purchases to file {files.length > 1 ? "these receipts" : "this receipt"} against a bill.
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
        >
          <Upload className="size-3.5 text-slate-500" /> Upload
        </button>
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
        >
          <Camera className="size-3.5 text-slate-500" /> Capture
        </button>
      </div>

      {files.length > 0 && (
        <Link
          href="/purchases"
          className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          Continue in Purchases <ArrowRight className="size-3.5" />
        </Link>
      )}

      <input
        ref={uploadRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
    </div>
  );
}

// ─── Stacked Concentric Rings Component ───────────────────────────────────
function StackedRings({
  data,
}: {
  data: Array<{ name: string; value: number; pct: number; color: string }>;
}) {
  const { symbol, format } = useCurrency();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  // ✅ THE FIX: Defer the custom SVG rings so we save CPU cycles on load!
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  if (!isMounted) {
    return (
      <div className="flex flex-col items-center justify-center py-4">
        <div className="size-[180px] rounded-full border-[12px] border-slate-50 bg-slate-100/50 animate-pulse" />
        <div className="mt-6 w-full h-16 bg-slate-50 animate-pulse rounded-lg" />
      </div>
    );
  }

  // Sort data by pct descending - outer ring = highest value
  const sortedData = [...data].sort((a, b) => b.pct - a.pct);
  
  // Fixed dimensions for better proportions
  const size = 220;
  const center = size / 2;
  const strokeWidth = 16;
  const ringGap = 3;
  
  // Outermost ring radius - largest value is on the outside
  const outermostRadius = 95;
  // Calculate radii from outer to inner (reversed visually: index 0 is outermost in data)
  const radii = sortedData.map((_, index) => outermostRadius - index * (strokeWidth + ringGap));
  
  const getCircumference = (radius: number) => 2 * Math.PI * radius;
  
  return (
    <div className="flex flex-col items-center">
      {/* Chart Container */}
      <div 
        className="relative rounded-full bg-gradient-to-br from-slate-50 to-white shadow-inner"
        style={{ width: size, height: size }}
      >
        <svg 
          width={size} 
          height={size} 
          className="transform -rotate-90"
        >
          {/* Full background tracks */}
          {sortedData.map((_, index) => {
            const radius = radii[index];
            return (
              <circle
                key={`track-${index}`}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth={strokeWidth}
              />
            );
          })}
          
          {/* Progress arcs - outermost ring has highest percentage */}
          {sortedData.map((item, index) => {
            const radius = radii[index];
            const circumference = getCircumference(radius);
            // Fill most of the circle (85-99% of pct to make it look full but with gap)
            const fillAmount = Math.min((item.pct / 100) * 0.95 + 0.05, 0.98);
            const dashArray = `${circumference * fillAmount} ${circumference * (1 - fillAmount)}`;
            const isHovered = hoveredIndex === index;
            const isAnyHovered = hoveredIndex !== null;
            
            return (
              <g key={`arc-${index}`}>
                {/* Outer glow */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={strokeWidth + 8}
                  strokeDasharray={dashArray}
                  strokeLinecap="round"
                  opacity={isHovered ? 0.2 : 0}
                  className="transition-opacity duration-300"
                />
                {/* Main arc */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
                  strokeDasharray={dashArray}
                  strokeLinecap="round"
                  className={cn(
                    "cursor-pointer transition-all duration-300",
                    isHovered && "brightness-110",
                    isAnyHovered && !isHovered && "opacity-20"
                  )}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              </g>
            );
          })}
        </svg>
        
        {/* Center Hub - outside the rings area */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div 
            className={cn(
              "rounded-full bg-white shadow-lg border border-slate-100 flex flex-col items-center justify-center transition-all duration-300",
              hoveredIndex !== null ? "scale-105" : "scale-100"
            )}
           style={{ 
            width: sortedData.length > 0 ? (radii[sortedData.length - 1] * 2 - strokeWidth - 10) : 120,
            height: sortedData.length > 0 ? (radii[sortedData.length - 1] * 2 - strokeWidth - 10) : 120,
          }}
          >
            {hoveredIndex !== null ? (
              <div className="text-center px-2">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider truncate max-w-[80px]">
                  {sortedData[hoveredIndex].name}
                </p>
                <p className="text-xl font-black" style={{ color: sortedData[hoveredIndex].color }}>
                  {sortedData[hoveredIndex].pct}%
                </p>
                <p className="text-[10px] font-mono font-semibold text-slate-600">
                  {symbol}{sortedData[hoveredIndex].value.toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="text-center px-2">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Total</p>
                <p className="text-xl font-black text-slate-800">
                  {symbol}{sortedData.reduce((sum, d) => sum + d.value, 0).toLocaleString()}
                </p>
                <p className="text-[9px] text-slate-400">{sortedData.length} items</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Legend - sorted to match visual order */}
      <div className="mt-4 w-full space-y-1">
        {sortedData.map((item, visualIndex) => {
          // Find original index for hover matching
          const originalIndex = data.findIndex(d => d.name === item.name);
          const isHovered = hoveredIndex === visualIndex;
          const isAnyHovered = hoveredIndex !== null;
          
          return (
            <div
              key={item.name}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 cursor-pointer transition-all duration-200",
                isHovered && "bg-slate-50",
                isAnyHovered && !isHovered && "opacity-30"
              )}
              onMouseEnter={() => setHoveredIndex(visualIndex)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Mini arc indicator */}
              <svg width="16" height="16" className="shrink-0 transform -rotate-90">
                <circle cx="8" cy="8" r="6" fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
                <circle 
                  cx="8" cy="8" r="6" fill="none" stroke={item.color} strokeWidth="2.5"
                  strokeDasharray={`${(item.pct / 100) * 38} 38`}
                  strokeLinecap="round"
                />
              </svg>
              
              <span className={cn(
                "flex-1 text-xs truncate transition-all",
                isHovered ? "font-bold text-slate-900" : "font-medium text-slate-600"
              )}>
                {item.name}
              </span>
              
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded transition-all",
                isHovered ? "bg-slate-100 text-slate-900" : "text-slate-400"
              )}>
                {item.pct}%
              </span>
              <span className={cn(
                "text-xs font-mono font-bold transition-all min-w-[55px] text-right",
                isHovered ? "text-slate-900" : "text-slate-500"
              )}>
                {symbol}{item.value.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  trend,
  positive,
  neutral,
  icon: Icon,
  iconBg,
  sparkline,
  hideAll,
}: {
  label: string;
  value: string;
  sub: string;
  trend: string;
  positive: boolean;
  neutral?: boolean;
  icon: React.ElementType;
  iconBg: string;
  sparkline: number[];
  hideAll?: boolean;
}) {
  // 🚀 Local state tracks overrides (null = follow master, true/false = manual override)
  const [localHidden, setLocalHidden] = useState<boolean | null>(null);
  const safeKey = `wawprofi-privacy-kpi-${label.replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    // 1. Load saved individual preference on mount
    const saved = localStorage.getItem(safeKey);
    if (saved !== null) setLocalHidden(saved === "true");

    // 2. Listen for the Master Button click to reset this local override
    const handleReset = () => {
      setLocalHidden(null);
      localStorage.removeItem(safeKey);
    };
    window.addEventListener("wawprofi-reset-privacy", handleReset);
    return () => window.removeEventListener("wawprofi-reset-privacy", handleReset);
  }, [label, safeKey]);

  // If there is a local override, use it. Otherwise, follow the master button!
  const isHidden = localHidden !== null ? localHidden : hideAll;

  const toggleLocal = () => {
    const nextState = !isHidden; // Flip whatever state it is currently in
    setLocalHidden(nextState);
    localStorage.setItem(safeKey, String(nextState));
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      {/* Sparkline background */}
      <div className={cn("absolute right-2 top-2 opacity-10 transition-opacity", isHidden && "opacity-0")}>
        <svg width="80" height="40" viewBox="0 0 80 40">
          <path
            d={`M0,${40 - sparkline[0]} ${sparkline.map((v, i) => `L${(i / (sparkline.length - 1)) * 80},${40 - v}`).join(" ")}`}
            fill="none"
            stroke={neutral ? "#3b82f6" : positive ? "#10b981" : "#ef4444"}
            strokeWidth="2"
          />
        </svg>
      </div>
      
      <div className="relative">
        <div className="flex items-start justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleLocal}
              className="p-1 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Toggle visibility"
            >
              {isHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
            <div className={cn("rounded-lg p-1.5", iconBg)}>
              <Icon className="size-4" />
            </div>
          </div>
        </div>
        
        <p className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">
          {isHidden ? "••••••" : value}
        </p>
        
        <div className="mt-2 flex items-center gap-1.5">
          <span className={cn(
            "flex items-center gap-0.5 text-xs font-bold",
            neutral ? "text-blue-600" : positive ? "text-emerald-600" : "text-red-500"
          )}>
            {neutral ? null : positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {trend}
          </span>
          <span className="truncate text-xs text-slate-400">{sub}</span>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
  action,
  className,
  hideAll, 
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  hideAll?: boolean; 
}) {
  // 🚀 Local state tracks overrides (null = follow master, true/false = manual override)
  const [localHidden, setLocalHidden] = useState<boolean | null>(null);
  const safeKey = `wawprofi-privacy-card-${title.replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    // 1. Load saved individual preference on mount
    const saved = localStorage.getItem(safeKey);
    if (saved !== null) setLocalHidden(saved === "true");

    // 2. Listen for the Master Button click to reset this local override
    const handleReset = () => {
      setLocalHidden(null);
      localStorage.removeItem(safeKey);
    };
    window.addEventListener("wawprofi-reset-privacy", handleReset);
    return () => window.removeEventListener("wawprofi-reset-privacy", handleReset);
  }, [title, safeKey]);

  // If there is a local override, use it. Otherwise, follow the master button!
  const isHidden = localHidden !== null ? localHidden : hideAll;

  const toggleLocal = () => {
    const nextState = !isHidden; // Flip whatever state it is currently in
    setLocalHidden(nextState);
    localStorage.setItem(safeKey, String(nextState));
  };

  return (
    <div className={cn("group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md", className)}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Local Eye Icon Toggle (Appears on Hover) */}
          <button 
            onClick={toggleLocal}
            className="p-1 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Toggle visibility"
          >
            {isHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <Icon className="size-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        </div>
        
        {/* Blurs the Action/Badges if hidden */}
        <div className={cn("transition-all duration-300", isHidden && "blur-sm opacity-40 select-none pointer-events-none")}>
          {action}
        </div>
      </div>
      
      {/* Blurs the entire Chart/Content if hidden */}
      <div className={cn("transition-all duration-300", isHidden && "blur-md opacity-40 select-none pointer-events-none")}>
        {children}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  const { symbol, format } = useCurrency();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
      <p className="mb-1 text-xs font-bold text-slate-500">{label}</p>
      {payload.map((item: any, i: number) => (
        <p key={i} className="font-mono text-sm font-bold" style={{ color: item.color }}>
          {item.name}: {symbol}{item.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </div>
  );
}

function AlertCard({ level, text, action, href }: { level: string; text: string; action: string; href: string }) {
  const icons = {
    danger: AlertCircle,
    warning: AlertTriangle,
    info: Activity,
  };
  const colors = {
    danger: "border-red-100 bg-red-50",
    warning: "border-amber-100 bg-amber-50",
    info: "border-blue-100 bg-blue-50",
  };
  const iconColors = {
    danger: "text-red-500",
    warning: "text-amber-500",
    info: "text-blue-500",
  };
  const Icon = icons[level as keyof typeof icons];

  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5", colors[level as keyof typeof colors])}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconColors[level as keyof typeof iconColors])} />
      <p className="flex-1 text-xs font-semibold leading-snug text-slate-800">{text}</p>
      <Link href={href} className="shrink-0 text-[10px] font-bold text-slate-500 hover:text-slate-700">
        {action}
      </Link>
    </div>
  );
}

function BalanceItem({
  label,
  value,
  icon: Icon,
  iconColor,
  bgColor,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={cn("flex size-8 items-center justify-center rounded-lg", bgColor)}>
          <Icon className={cn("size-4", iconColor)} />
        </div>
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <span className="font-mono text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}
