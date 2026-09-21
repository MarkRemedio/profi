"use client";

import { useCurrency } from "@/components/currency-provider";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { 
  Building2, 
  ArrowDownRight,
  ArrowUpRight,
  CreditCard, 
  ClipboardList,
  FileText, 
  TrendingDown, 
  Wallet,
  BarChart3,
  Receipt,
  Truck,
  Clock
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { usePurchases } from "./use-purchases";

import { cn } from "@/lib/utils";
import { QuickAction, QuickActions } from "@/components/shared/quick-actions";
import { reportCategoryLabels } from "@/components/chart-of-accounts/constants";

type PeriodFilter = "this_month" | "last_month" | "this_quarter" | "this_year" | "previous_year";
type ShowPerFilter = "month" | "supplier" | "category" | "account" | "project" | "department";

type ChartBucket = {
  key: string;
  label: string;
  currentMinor: number;
  previousMinor: number;
};

const PERIOD_OPTIONS: Array<{ value: PeriodFilter; label: string }> = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
  { value: "previous_year", label: "Previous year" },
];

const SHOW_PER_OPTIONS: Array<{ value: ShowPerFilter; label: string }> = [
  { value: "month", label: "Month" },
  { value: "supplier", label: "Supplier" },
  { value: "category", label: "Category" },
  { value: "account", label: "Account" },
  { value: "project", label: "Project" },
  { value: "department", label: "Department" },
];

function parseDateOnly(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfQuarter(date: Date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

function shiftMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function periodLabel(period: PeriodFilter) {
  switch (period) {
    case "this_month":
      return "This month";
    case "last_month":
      return "Last month";
    case "this_quarter":
      return "This quarter";
    case "this_year":
      return "This year";
    case "previous_year":
      return "Previous year";
  }
}

function previousPeriodLabel(period: PeriodFilter) {
  switch (period) {
    case "this_month":
      return "Last month";
    case "last_month":
      return "The month before";
    case "this_quarter":
      return "Previous quarter";
    case "this_year":
      return "Previous year";
    case "previous_year":
      return "The year before";
  }
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "short" });
}

function getPeriodWindow(period: PeriodFilter, anchor = new Date()) {
  const current = {
    start: startOfMonth(anchor),
    end: endOfMonth(anchor),
  };

  switch (period) {
    case "this_month":
      current.start = startOfMonth(anchor);
      current.end = endOfMonth(anchor);
      break;
    case "last_month": {
      const lastMonth = shiftMonths(anchor, -1);
      current.start = startOfMonth(lastMonth);
      current.end = endOfMonth(lastMonth);
      break;
    }
    case "this_quarter":
      current.start = startOfQuarter(anchor);
      current.end = new Date(current.start.getFullYear(), current.start.getMonth() + 3, 0);
      break;
    case "this_year":
      current.start = new Date(anchor.getFullYear(), 0, 1);
      current.end = new Date(anchor.getFullYear(), 11, 31);
      break;
    case "previous_year":
      current.start = new Date(anchor.getFullYear() - 1, 0, 1);
      current.end = new Date(anchor.getFullYear() - 1, 11, 31);
      break;
  }

  const previous =
    period === "this_year"
      ? {
          start: new Date(current.start.getFullYear() - 1, 0, 1),
          end: new Date(current.start.getFullYear() - 1, 11, 31),
        }
      : period === "previous_year"
        ? {
            start: new Date(current.start.getFullYear() - 1, 0, 1),
            end: new Date(current.start.getFullYear() - 1, 11, 31),
          }
        : period === "this_quarter"
          ? {
              start: new Date(current.start.getFullYear(), current.start.getMonth() - 3, 1),
              end: new Date(current.start.getFullYear(), current.start.getMonth(), 0),
            }
          : {
              start: startOfMonth(shiftMonths(current.start, -1)),
              end: endOfMonth(shiftMonths(current.start, -1)),
            };

  return { current, previous };
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

export function PurchaseDashboard() {
  const { symbol, format: formatMinor } = useCurrency();
  const { bills } = usePurchases();
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("this_year");
  const [showPer, setShowPer] = useState<ShowPerFilter>("month");

  const chartPeriod = useMemo(() => getPeriodWindow(periodFilter, new Date()), [periodFilter]);

  const chartData = (() => {
    const isPosted = (bill: any) => bill.status === "approved" || bill.status === "paid";
    const billMinor = (bill: any) => Number((bill.baseTotalMinor ?? bill.totalMinor ?? 0) || 0);

    const inRange = (date: Date, range: { start: Date; end: Date }) =>
      date >= range.start && date <= range.end;

    if (showPer === "month") {
      const buckets: ChartBucket[] = [];
      const currentMonths: Date[] = [];
      const cursor = new Date(chartPeriod.current.start);

      while (cursor <= chartPeriod.current.end) {
        currentMonths.push(new Date(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
      }

      currentMonths.forEach((month, index) => {
        buckets.push({
          key: `month-${index}`,
          label: formatMonthLabel(month),
          currentMinor: 0,
          previousMinor: 0,
        });
      });

      const addMonthValue = (bill: any, range: { start: Date; end: Date }, field: "currentMinor" | "previousMinor") => {
        const issueDate = parseDateOnly(bill.issueDate);
        if (!issueDate || !isPosted(bill) || !inRange(issueDate, range)) return;
        const monthIndex =
          (issueDate.getFullYear() - range.start.getFullYear()) * 12 +
          (issueDate.getMonth() - range.start.getMonth());
        const bucket = buckets[monthIndex];
        if (!bucket) return;
        bucket[field] += billMinor(bill);
      };

      bills.forEach((bill) => {
        addMonthValue(bill, chartPeriod.current, "currentMinor");
        addMonthValue(bill, chartPeriod.previous, "previousMinor");
      });

      return buckets.filter((bucket) => bucket.currentMinor > 0 || bucket.previousMinor > 0);
    }

    const bucketMap = new Map<string, ChartBucket>();
    const addBucket = (label: string, currentMinor: number, previousMinor: number) => {
      const key = normalizeLabel(label);
      const existing = bucketMap.get(key);
      if (existing) {
        existing.currentMinor += currentMinor;
        existing.previousMinor += previousMinor;
        return;
      }

      bucketMap.set(key, {
        key,
        label,
        currentMinor,
        previousMinor,
      });
    };

    const addLineBuckets = (bill: any, field: "currentMinor" | "previousMinor") => {
      const issueDate = parseDateOnly(bill.issueDate);
      if (!issueDate || !isPosted(bill)) return;

      const inCurrent = inRange(issueDate, chartPeriod.current);
      const inPrevious = inRange(issueDate, chartPeriod.previous);
      if ((field === "currentMinor" && !inCurrent) || (field === "previousMinor" && !inPrevious)) return;

      for (const line of bill.lines ?? []) {
        const label =
          showPer === "category"
            ? reportCategoryLabels[line.accountReportCategory as keyof typeof reportCategoryLabels] ??
              line.accountReportCategory.replace(/_/g, " ")
            : `${line.accountCode ?? "----"} ${line.accountName ?? "Unknown account"}`.trim();
        addBucket(label, field === "currentMinor" ? Number(line.totalMinor ?? 0) : 0, field === "previousMinor" ? Number(line.totalMinor ?? 0) : 0);
      }
    };

    bills.forEach((bill: any) => {
      const issueDate = parseDateOnly(bill.issueDate);
      if (!issueDate || !isPosted(bill)) return;

      const inCurrent = inRange(issueDate, chartPeriod.current);
      const inPrevious = inRange(issueDate, chartPeriod.previous);
      if (!inCurrent && !inPrevious) return;

      const field = inCurrent ? "currentMinor" : "previousMinor";

      if (showPer === "supplier" || showPer === "project" || showPer === "department") {
        const label =
          showPer === "supplier"
            ? bill.contactName || "Unassigned supplier"
            : showPer === "project"
              ? bill.location?.trim() || "Unassigned project"
              : bill.department?.trim() || "Unassigned department";
        addBucket(label, field === "currentMinor" ? billMinor(bill) : 0, field === "previousMinor" ? billMinor(bill) : 0);
        return;
      }

      addLineBuckets(bill, field);
    });

    const sortedBuckets = Array.from(bucketMap.values())
      .filter((bucket) => bucket.currentMinor > 0 || bucket.previousMinor > 0)
      .sort((a, b) => (b.currentMinor + b.previousMinor) - (a.currentMinor + a.previousMinor));

    const visibleBuckets = sortedBuckets.slice(0, 6);
    if (sortedBuckets.length <= visibleBuckets.length) {
      return visibleBuckets;
    }

    const other = sortedBuckets.slice(6).reduce(
      (acc, bucket) => {
        acc.currentMinor += bucket.currentMinor;
        acc.previousMinor += bucket.previousMinor;
        return acc;
      },
      { key: "other", label: "Other", currentMinor: 0, previousMinor: 0 }
    );

    return [...visibleBuckets, other].filter((bucket) => bucket.currentMinor > 0 || bucket.previousMinor > 0);
  })();

  const summaryCards = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const next7Days = new Date(startOfToday);
    next7Days.setDate(next7Days.getDate() + 7);
    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();
    const previousMonthDate = new Date(thisYear, thisMonth - 1, 1);
    const previousMonth = previousMonthDate.getMonth();
    const previousYear = previousMonthDate.getFullYear();

    const parseDateOnly = (value: string | null | undefined) =>
      value ? new Date(`${value}T00:00:00`) : null;

    const amountMinor = (bill: any) => (bill.baseTotalMinor ?? bill.totalMinor ?? 0) as number;
    const isPosted = (bill: any) => bill.status === "approved" || bill.status === "paid";
    const isOpenBill = (bill: any) => bill.status === "draft";

    const currentMonthSpend = bills.reduce((sum, bill) => {
      const issueDate = parseDateOnly(bill.issueDate);
      if (!issueDate || !isPosted(bill)) return sum;
      if (issueDate.getFullYear() !== thisYear || issueDate.getMonth() !== thisMonth) return sum;
      return sum + amountMinor(bill);
    }, 0);

    const previousMonthSpend = bills.reduce((sum, bill) => {
      const issueDate = parseDateOnly(bill.issueDate);
      if (!issueDate || !isPosted(bill)) return sum;
      if (issueDate.getFullYear() !== previousYear || issueDate.getMonth() !== previousMonth) return sum;
      return sum + amountMinor(bill);
    }, 0);

    const trendPct =
      previousMonthSpend > 0
        ? ((currentMonthSpend - previousMonthSpend) / previousMonthSpend) * 100
        : currentMonthSpend > 0
          ? 100
          : 0;

    const unpaidBills = bills.filter((bill) => isOpenBill(bill));

    const dueNext7Days = unpaidBills.filter((bill) => {
      const dueDate = parseDateOnly(bill.dueDate);
      return dueDate ? dueDate >= startOfToday && dueDate <= next7Days : false;
    });

    const overdueBills = unpaidBills.filter((bill) => {
      const dueDate = parseDateOnly(bill.dueDate);
      return dueDate ? dueDate < startOfToday : false;
    });

    return {
      currentMonthSpend,
      previousMonthSpend,
      trendPct,
      unpaidBills,
      dueNext7Days,
      overdueBills,
      unpaidTotalMinor: unpaidBills.reduce((sum, bill) => sum + amountMinor(bill), 0),
      dueNext7DaysTotalMinor: dueNext7Days.reduce((sum, bill) => sum + amountMinor(bill), 0),
      overdueTotalMinor: overdueBills.reduce((sum, bill) => sum + amountMinor(bill), 0),
    };
  }, [bills]);

  const formatBillCount = (count: number) => `${count} bill${count === 1 ? "" : "s"}`;
  const formatTrend = (value: number) => {
    const direction = value >= 0 ? "↑" : "↓";
    return `${direction} ${Math.abs(value).toFixed(1)}%`;
  };

  const topSuppliers = useMemo(() => {
    const suppliersMap = bills.reduce((acc, bill) => {
      if (!acc[bill.contactName]) {
        acc[bill.contactName] = { name: bill.contactName, total: 0, count: 0 };
      }
      // Ranking "largest outgoings" only means something if the figures are
      // comparable, and this one is printed with the workspace symbol.
      acc[bill.contactName].total += (bill as any).baseTotalMinor || bill.totalMinor;
      acc[bill.contactName].count += 1;
      return acc;
    }, {} as Record<string, { name: string; total: number; count: number }>);
    
    return Object.values(suppliersMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
  }, [bills]);

  const chartPeriodLabel = periodLabel(periodFilter);
  const chartComparisonLabel = previousPeriodLabel(periodFilter);
  const chartDimensionLabel = SHOW_PER_OPTIONS.find((option) => option.value === showPer)?.label ?? "Month";
  const chartConfig = {
    currentMinor: {
      label: chartPeriodLabel,
      color: "#2563eb",
    },
    previousMinor: {
      label: chartComparisonLabel,
      color: "#cbd5e1",
    },
  } as const;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Purchases Overview</h1>
          <p className="text-slate-500 mt-1 text-sm">Monitor outgoings, analyze monthly expenses, and track supplier liabilities.</p>
        </div>
        
        <QuickActions>
          <QuickAction
            href="/purchases/orders?action=create"
            icon={ClipboardList}
            label="Create PO"
            description="Draft a purchase order"
            tone="orange"
          />
          <QuickAction
            href="/purchases/bills?action=create"
            icon={Receipt}
            label="Add bill"
            description="Start a new supplier bill"
            primary
            tone="orange"
          />
          <QuickAction
            href="/purchases/suppliers?action=create"
            icon={Truck}
            label="Add supplier"
            description="Open the new supplier form"
          />
          <QuickAction
            href="/purchases/expense-claims?action=create"
            icon={CreditCard}
            label="Submit expense"
            description="Start a new expense claim"
          />
        </QuickActions>
      </div>

      {/* Top Metrics Cards (REAL DATA) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-blue-100 bg-blue-50/30 shadow-sm">
          <CardContent className="p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-blue-100 p-1.5 text-blue-600">
                  <Wallet className="size-4" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Spend this month</p>
              </div>
              <div
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                  summaryCards.trendPct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                )}
              >
                {summaryCards.trendPct >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {formatTrend(summaryCards.trendPct)}
              </div>
            </div>
            <h3 className="text-2xl font-black text-slate-900">{formatMinor(summaryCards.currentMonthSpend)}</h3>
            <p className="mt-1 text-xs font-medium text-slate-400">
              {summaryCards.previousMonthSpend > 0
                ? `${formatMinor(summaryCards.previousMonthSpend)} last month`
                : "Compared with a quiet previous month"}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-md bg-amber-50 p-1.5 text-amber-600">
                <FileText className="size-4" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unpaid bills</p>
            </div>
            <h3 className="text-2xl font-black text-slate-900">{formatMinor(summaryCards.unpaidTotalMinor)}</h3>
            <p className="mt-1 text-xs font-medium text-slate-400">{formatBillCount(summaryCards.unpaidBills.length)}</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-md bg-slate-100 p-1.5 text-slate-600">
                <Clock className="size-4" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Due next 7 days</p>
            </div>
            <h3 className="text-2xl font-black text-slate-900">{formatMinor(summaryCards.dueNext7DaysTotalMinor)}</h3>
            <p className="mt-1 text-xs font-medium text-slate-400">{formatBillCount(summaryCards.dueNext7Days.length)}</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-md bg-red-50 p-1.5 text-red-600">
                <TrendingDown className="size-4" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Overdue</p>
            </div>
            <h3 className="text-2xl font-black text-slate-900">{formatMinor(summaryCards.overdueTotalMinor)}</h3>
            <p className="mt-1 text-xs font-medium text-rose-500">{formatBillCount(summaryCards.overdueBills.length)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MONTHLY EXPENSE COMPARISON CHART */}
        <Card className="shadow-sm lg:col-span-2 flex flex-col">
          <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <BarChart3 className="size-4 text-blue-600" /> Monthly Expense Comparison
                </CardTitle>
                <CardDescription className="text-xs">
                  {chartPeriodLabel} compared with {chartComparisonLabel}, grouped by {chartDimensionLabel.toLowerCase()}.
                </CardDescription>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:min-w-[34rem]">
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Period</div>
                  <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}>
                    <SelectTrigger className="h-9 bg-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIOD_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Show per</div>
                  <Select value={showPer} onValueChange={(value) => setShowPer(value as ShowPerFilter)}>
                    <SelectTrigger className="h-9 bg-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHOW_PER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-end p-6">
            {chartData.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/40 text-center">
                <BarChart3 className="mb-2 size-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No posted bills in this period</p>
                <p className="mt-1 max-w-sm text-xs text-slate-400">
                  Try a wider period or a different grouping dimension.
                </p>
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[340px] w-full">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} barCategoryGap="8%" barGap={0}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    interval={0}
                    height={44}
                    padding={{ left: 0, right: 0 }}
                    tick={{ fontSize: 9, fill: "#64748b", fontWeight: 700 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={56}
                    tick={{ fontSize: 9, fill: "#64748b", fontWeight: 600 }}
                    tickFormatter={(value) => formatMinor(Number(value))}
                  />
                  <ChartTooltip
                    cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                    content={
                      <ChartTooltipContent
                        formatter={(value, name, item) => (
                          <div className="flex w-full items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="size-2 rounded-sm"
                                style={{ backgroundColor: item.color ?? "#64748b" }}
                              />
                              <span className="font-medium text-slate-700">
                                {name === "currentMinor" ? chartPeriodLabel : chartComparisonLabel}
                              </span>
                            </div>
                            <span className="font-mono font-semibold tabular-nums text-slate-900">
                              {formatMinor(Number(value))}
                            </span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="previousMinor" barSize={16} fill="#cbd5e1" radius={[4, 4, 0, 0]} name={chartComparisonLabel} />
                  <Bar dataKey="currentMinor" barSize={16} fill="#2563eb" radius={[4, 4, 0, 0]} name={chartPeriodLabel} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Suppliers and expense-claim payees, ranked by base-currency value. */}
        <Card className="shadow-sm flex flex-col">
          <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Building2 className="size-4 text-emerald-600" /> Top Payees
            </CardTitle>
            <CardDescription className="text-xs mt-1">Largest outgoings by payee.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {topSuppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400">
                <Building2 className="size-8 opacity-20 mb-2" />
                <span className="text-xs font-medium">No supplier data yet</span>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {topSuppliers.map((supplier, index) => (
                  <li key={supplier.name} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="size-8 shrink-0 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{supplier.name}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{supplier.count} Bills</p>
                      </div>
                    </div>
                    <div className="text-right pl-4">
                      <p className="text-sm font-black text-slate-900">{formatMinor(supplier.total)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
