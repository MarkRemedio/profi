"use client";

import { useState, useEffect } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Download,
  Filter,
  RefreshCw,
  Search,
  TrendingUp,
  XCircle,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { updateAdminSubscription, type Subscription, type BillingStatus } from "@/app/(admin)/admin/(protected)/subscriptions/actions";
import { updatePayrollAdminSubscription } from "@/app/(admin)/admin/(protected)/subscriptions/payroll-actions";

const statusConfig: Record<BillingStatus, { label: string; badge: string; dot: string }> = {
  paid:      { label: "Paid",      badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  overdue:   { label: "Overdue",   badge: "bg-red-50 text-red-700",         dot: "bg-red-500"     },
  failed:    { label: "Failed",    badge: "bg-red-100 text-red-800",        dot: "bg-red-600"     },
  trial:     { label: "Trial",     badge: "bg-blue-50 text-blue-700",       dot: "bg-blue-400"    },
  cancelled: { label: "Cancelled", badge: "bg-slate-100 text-slate-500",    dot: "bg-slate-300"   },
};

export function MasterSubscriptions({
  subscriptions,
  payrollSubscriptions = [],
  plans = [],
  payrollPlans = [],
}: {
  subscriptions: Subscription[];
  payrollSubscriptions?: Subscription[];
  plans?: any[];
  payrollPlans?: any[];
}) {
  const router = useRouter();
  
  // 🚀 DB TAB TOGGLE
  const [dbTab, setDbTab] = useState<"waw-profi" | "payroll">("waw-profi");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BillingStatus | "All">("All");
  
  // MODAL STATES
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const activeSubscriptions = dbTab === "waw-profi" ? subscriptions : payrollSubscriptions;
  const activePlans = dbTab === "waw-profi" ? plans : payrollPlans;

  const handleManageClick = (sub: Subscription) => {
    setSelectedSub(sub);
    setSelectedPlanCode(sub.planCode);
    setIsModalOpen(true);
  };

  const handleUpdate = async (action: "update" | "cancel") => {
    if (!selectedSub) return;
    
    if (action === "cancel" && !confirm(`Are you sure you want to cancel ${selectedSub.client}'s subscription?`)) {
      return;
    }

    try {
      setIsUpdating(true);
      const res = dbTab === "waw-profi" 
        ? await updateAdminSubscription(selectedSub.id, action, action === "update" ? selectedPlanCode : undefined)
        : await updatePayrollAdminSubscription(selectedSub.id, action, action === "update" ? selectedPlanCode : undefined);

      toast.success(res.message);
      setIsModalOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update subscription.");
    } finally {
      setIsUpdating(false);
    }
  };

  // PAGINATION STATE
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, dbTab]);

  // DYNAMIC KPIS
  const totalMrr = activeSubscriptions.reduce((sum, sub) => (sub.status === "paid" ? sum + sub.rawMrr : sum), 0);
  const activeSubs = activeSubscriptions.filter(s => s.status === "paid").length;
  const overdueSubs = activeSubscriptions.filter(s => s.status === "overdue").length;
  const failedSubs = activeSubscriptions.filter(s => s.status === "failed").length;

  const kpis = [
    { label: "Total MRR",       value: `£${totalMrr.toLocaleString()}`, trend: "Live", positive: true,  icon: TrendingUp  },
    { label: "Active Subs",    value: activeSubs.toString(),           trend: "Live", positive: true,  icon: CheckCircle2 },
    { label: "Overdue",        value: overdueSubs.toString(),           trend: overdueSubs > 0 ? "Action needed" : "All good", positive: overdueSubs === 0, icon: AlertCircle },
    { label: "Failed Payments",value: failedSubs.toString(),           trend: failedSubs > 0 ? "Retrying..." : "All good", positive: failedSubs === 0, icon: XCircle },
  ];

  const filtered = activeSubscriptions.filter((s) => {
    const matchSearch =
      !search ||
      s.client.toLowerCase().includes(search.toLowerCase()) ||
      s.plan.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedSubscriptions = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const renderPaginationFooter = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between border-t border-slate-100 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-1 justify-between sm:hidden">
          <Button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} variant="outline" size="sm">Previous</Button>
          <Button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} variant="outline" size="sm">Next</Button>
        </div>
        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-900">{((currentPage - 1) * ITEMS_PER_PAGE) + 1}</span> to{" "}
              <span className="font-semibold text-slate-900">{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}</span> of{" "}
              <span className="font-semibold text-slate-900">{filtered.length}</span> results
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} variant="outline" className="h-8 w-8 p-0 rounded-md">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs font-bold px-1.5 text-slate-600">Page {currentPage} of {totalPages}</span>
            <Button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} variant="outline" className="h-8 w-8 p-0 rounded-md">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Subscriptions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Billing status, plan management, and payment tracking across applications
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 🚀 DATABASE TOGGLE */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setDbTab("waw-profi")}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-md transition",
                dbTab === "waw-profi" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Waw-Profi
            </button>
            <button
              onClick={() => setDbTab("payroll")}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-md transition",
                dbTab === "payroll" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Payroll
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => toast.info("Exporting billing report…")}
          >
            <Download className="size-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{k.label}</p>
              <div className={cn("rounded-lg p-1.5", k.positive ? "bg-teal-50 text-teal-600" : "bg-red-50 text-red-500")}>
                <k.icon className="size-3.5" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-extrabold text-slate-950">{k.value}</p>
            <span className={cn("mt-1 text-xs font-bold", k.positive ? "text-emerald-600" : "text-red-500")}>
              {k.trend}
            </span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
          <Search className="size-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search subscriptions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <Filter className="size-3.5 text-slate-400" />
          Status:
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="ml-1 bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="All">All</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="failed">Failed</option>
            <option value="trial">Trial</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} records</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Client</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Plan</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">MRR</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Next Billing</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Last Payment</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Payment Method</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {paginatedSubscriptions.map((sub) => {
              const sc = statusConfig[sub.status];
              return (
                <tr key={sub.id} className="group transition hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-extrabold text-slate-600">
                        {sub.initials}
                      </div>
                      <span className="font-bold text-slate-900">{sub.client}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      sub.plan.toLowerCase().includes("enterprise") ? "bg-amber-50 text-amber-700" :
                      sub.plan.toLowerCase().includes("pro")        ? "bg-teal-50 text-teal-700"   :
                      sub.plan.toLowerCase().includes("trial")      ? "bg-slate-100 text-slate-600" :
                                                                      "bg-indigo-50 text-indigo-700"
                    )}>
                      {sub.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900">{sub.mrr}</td>
                  <td className="px-4 py-3">
                    <span className={cn("flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold", sc.badge)}>
                      <span className={cn("size-1.5 rounded-full", sc.dot)} />
                      {sc.label}
                    </span>
                  </td>
                  <td className={cn("px-4 py-3 text-xs", sub.status === "overdue" || sub.status === "failed" ? "font-bold text-red-600" : "text-slate-600")}>
                    {sub.nextBilling}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{sub.lastPayment}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{sub.paymentMethod}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(sub.status === "overdue" || sub.status === "failed") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-[11px] font-bold text-red-600 hover:bg-red-50"
                          onClick={() => toast.success(`Retry payment triggered for ${sub.client}`)}
                        >
                          <RefreshCw className="size-3" />
                          Retry
                        </Button>
                      )}
                      {sub.status === "trial" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-[11px] font-bold text-blue-600 hover:bg-blue-50"
                          onClick={() => toast.success(`Conversion email sent to ${sub.client}`)}
                        >
                          <ArrowUpRight className="size-3" />
                          Convert
                        </Button>
                      )}
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-[11px] font-bold text-slate-500 hover:bg-slate-100"
                        onClick={() => handleManageClick(sub)}
                      >
                        <CreditCard className="size-3" />
                        Manage
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CreditCard className="mb-3 size-10 text-slate-200" />
            <p className="text-sm font-bold text-slate-500">No {dbTab === "waw-profi" ? "Waw-Profi" : "Payroll"} subscriptions match your filters</p>
          </div>
        )}
        
        {renderPaginationFooter()}
      </div>

      {/* MANAGE SUBSCRIPTION MODAL */}
      {isModalOpen && selectedSub && (
        <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-950">Manage Subscription</h2>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">{selectedSub.client}</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 border-none bg-transparent cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Change Plan Tier
                </label>
                <select
                  value={selectedPlanCode}
                  onChange={(e) => setSelectedPlanCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="" disabled>Select a plan...</option>
                  {activePlans.map((p) => (
                    <option key={p.id} value={p.planCode || p.id}>
                      {p.name} ({p.interval === "month" || p.interval === "monthly" ? `£${Number(p.price || 0)}/mo` : `£${Number(p.price || 0)}/yr`})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-6 mt-6 border-t border-slate-100">
              <Button
                onClick={() => handleUpdate("update")}
                disabled={isUpdating || selectedPlanCode === selectedSub.planCode}
                className="w-full h-9 rounded-lg text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 border-none"
              >
                {isUpdating ? "Saving..." : "Save Plan Changes"}
              </Button>
              
              <Button
                onClick={() => handleUpdate("cancel")}
                disabled={isUpdating || selectedSub.status === "cancelled"}
                variant="outline"
                className="w-full h-9 rounded-lg text-xs font-bold border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                {selectedSub.status === "cancelled" ? "Already Cancelled" : "Cancel Subscription Immediately"}
              </Button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}