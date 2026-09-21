import "server-only";

import { prisma } from "@/lib/prisma";
import { minorToMajor } from "@/lib/accounting/money";
import { formatMoney } from "@/lib/currency";
import { getCoreReports } from "@/lib/accounting/reports";
import { getAmountPaidMap } from "@/lib/accounting/payments";
import { calculateSpendAnomalies } from "@/lib/accounting/spend-anomalies";
import { subMonths, subWeeks, subDays, format, differenceInDays } from "date-fns";

type DashboardMetric = {
  label: string;
  value: string;
  note: string;
};

type DashboardActivity = {
  id: string;
  date: string;
  memo: string;
  amount: string;
};

const CHART_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#f97316"];


/**
 * A document's value in the workspace's own currency.
 *
 * Every figure on this dashboard is a cross-document total, so it must use the
 * converted amount. totalMinor is the document's face value — a PHP 48,800
 * invoice carries 4,880,000 minor units of pesos, and adding that to a pounds
 * total treats pesos as pence. Worse, the "paid" figures come from journal
 * lines, which are always base currency, so subtracting one from the other
 * mixed units outright.
 */
function baseValue(row: { baseTotalMinor?: bigint | null; totalMinor: bigint }): number {
  // Documents predating multi-currency have no converted total stored; they are
  // all in the workspace currency, so the face value is already correct.
  const base = row.baseTotalMinor ?? BigInt(0);
  return Number(base > BigInt(0) ? base : row.totalMinor);
}

export async function getDashboardOverview(organizationId: string) {
  const reports = await getCoreReports(organizationId);
  const now = new Date();

  // These figures are formatted server-side, so the workspace currency has to
  // be read here rather than picked up from the client-side CurrencyProvider.
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true },
  });
  const formatMinor = (minor: number | bigint | string) =>
    formatMoney(typeof minor === "string" ? Number(minor) : minor, org?.baseCurrency);

  // 1. Fetch core data (Notice we added 'taxMinor' to calculate the VAT!)
  const [invoiceRows, billRows, recentJournals, allPostedJournals] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId },
      select: { id: true, status: true, totalMinor: true, baseTotalMinor: true, taxMinor: true, dueDate: true, issueDate: true }
    }),
    prisma.bill.findMany({
      where: { organizationId },
      select: {
        id: true,
        status: true,
        totalMinor: true,
        baseTotalMinor: true,
        taxMinor: true,
        dueDate: true,
        issueDate: true,
        contactId: true,
        vendor: true,
        contact: { select: { id: true, name: true } },
      }
    }),
    prisma.journal.findMany({
      where: { organizationId, status: "POSTED" },
      orderBy: [{ journalDate: "desc" }, { postedAt: "desc" }],
      take: 6,
      include: { lines: { select: { debitMinor: true } } },
    }),
    prisma.journal.findMany({
      where: { 
        organizationId, 
        status: "POSTED",
        journalDate: { gte: subMonths(now, 12) }
      },
      include: {
        lines: {
          include: { account: true }
        }
      }
    })
  ]);

  // Derive net paid amounts per document (POSTED payments, excluding POSTED reversals)
  const [invoicePaid, billPaid] = await Promise.all([
    getAmountPaidMap(prisma, organizationId, "invoice_payment"),
    getAmountPaidMap(prisma, organizationId, "bill_payment"),
  ]);

  // --- CORE FINANCIAL MATH ---
  const revenue = reports.profitAndLoss.filter((row) => row.accountType === "revenue").reduce((total, row) => total + row.balanceMinor, 0);
  const expenses = reports.profitAndLoss.filter((row) => row.accountType === "expense").reduce((total, row) => total + row.balanceMinor, 0);
  const profit = revenue - expenses;

  const netProfitMinor = reports.profitAndLoss.reduce((total, row) => {
    if (["cost_of_sales", "expense", "depreciation"].includes(row.reportCategory)) {
      return total - row.balanceMinor;
    }
    return total + row.balanceMinor;
  }, 0);

  const assets = reports.balanceSheet.filter((row) => row.accountType === "asset").reduce((total, row) => total + row.balanceMinor, 0);
  const liabilities = reports.balanceSheet.filter((row) => row.accountType === "liability").reduce((total, row) => total + row.balanceMinor, 0);
  const equity = reports.balanceSheet.filter((row) => row.accountType === "equity").reduce((total, row) => total + row.balanceMinor, 0) + netProfitMinor;

  const receivables = invoiceRows
    .filter((row) => String(row.status).toUpperCase() !== "PAID" && String(row.status).toUpperCase() !== "VOID")
    .reduce((total, row) => {
      const paid = Number(invoicePaid.get(row.id) ?? BigInt(0));
      return total + Math.max(0, baseValue(row) - paid);
    }, 0);
  const payables = billRows
    .filter((row) => String(row.status).toUpperCase() !== "PAID" && String(row.status).toUpperCase() !== "VOID")
    .reduce((total, row) => {
      const paid = Number(billPaid.get(row.id) ?? BigInt(0));
      return total + Math.max(0, baseValue(row) - paid);
    }, 0);

  // --- COMPLEX TIME-SERIES CHARTS ---
  const monthlyData: Record<string, { revenue: number, expenses: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const monthKey = format(subMonths(now, i), 'MMM');
    monthlyData[monthKey] = { revenue: 0, expenses: 0 };
  }
  
  allPostedJournals.forEach(journal => {
    const monthKey = format(journal.journalDate, 'MMM');
    if (monthlyData[monthKey]) {
      journal.lines.forEach(line => {
        // 🚀 Skip this line safely if the account has been wiped/deleted
        if (!line.account) return;

        const amount = Number(line.creditMinor) > 0 ? Number(line.creditMinor) : Number(line.debitMinor);
        if (line.account.accountType === "REVENUE") monthlyData[monthKey].revenue += minorToMajor(amount);
        if (line.account.accountType === "EXPENSE") monthlyData[monthKey].expenses += minorToMajor(amount);
      });
    }
  });

  const monthlyTrends = Object.entries(monthlyData).map(([month, data]) => ({
    month, revenue: data.revenue, expenses: data.expenses, profit: data.revenue - data.expenses, ar: 0, ap: 0
  }));

  const calculateAging = (records: any[], paidMap: Map<string, bigint>) => {
    const buckets = [
      { bucket: "Current", amount: 0, count: 0, color: "#10b981" },
      { bucket: "1-30 days", amount: 0, count: 0, color: "#84cc16" },
      { bucket: "31-60 days", amount: 0, count: 0, color: "#f59e0b" },
      { bucket: "61-90 days", amount: 0, count: 0, color: "#f97316" },
      { bucket: "90+ days", amount: 0, count: 0, color: "#ef4444" },
    ];

    records.filter(r => String(r.status).toUpperCase() !== "PAID" && String(r.status).toUpperCase() !== "VOID").forEach(record => {
      const outstanding = minorToMajor(baseValue(record) - Number(paidMap.get(record.id) ?? BigInt(0)));
      if (outstanding <= 0) return; // fully paid via ledger — skip
      if (!record.dueDate || record.dueDate >= now) {
        buckets[0].amount += outstanding; buckets[0].count++;
      } else {
        const daysOverdue = differenceInDays(now, record.dueDate);
        if (daysOverdue <= 30) { buckets[1].amount += outstanding; buckets[1].count++; }
        else if (daysOverdue <= 60) { buckets[2].amount += outstanding; buckets[2].count++; }
        else if (daysOverdue <= 90) { buckets[3].amount += outstanding; buckets[3].count++; }
        else { buckets[4].amount += outstanding; buckets[4].count++; }
      }
    });
    return buckets;
  };

  const arAging = calculateAging(invoiceRows, invoicePaid);
  const apAging = calculateAging(billRows, billPaid);

  const weeklyCashFlow = [];
  for (let i = 3; i >= 0; i--) {
    const weekStart = subWeeks(now, i + 1);
    const weekEnd = subWeeks(now, i);
    let receipts = 0; let payments = 0;
    allPostedJournals.filter(j => j.journalDate >= weekStart && j.journalDate < weekEnd).forEach(j => {
        j.lines.forEach(line => {
          // 🚀 Safe Guard: Skip this line safely if the account has been wiped/deleted
          if (!line.account) return;

          if (line.account.reportCategory === "BANK") {
            if (line.debitMinor > 0) receipts += minorToMajor(line.debitMinor);
            if (line.creditMinor > 0) payments += minorToMajor(line.creditMinor);
          }
        });
    });
    weeklyCashFlow.push({ week: `W${4-i}`, receipts, payments, net: receipts - payments });
  }

  // --- RING CHARTS & LISTS ---
  const expenseCategories = reports.profitAndLoss.filter((row) => row.accountType === "expense" && row.balanceMinor > 0).sort((a, b) => b.balanceMinor - a.balanceMinor).slice(0, 5).map((row, i) => ({
      name: (row as any).accountName || (row as any).name || "Expense Account", value: minorToMajor(row.balanceMinor), pct: expenses > 0 ? Math.round((row.balanceMinor / expenses) * 100) : 0, color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const assetDistribution = reports.balanceSheet.filter((row) => row.accountType === "asset" && row.balanceMinor > 0).sort((a, b) => b.balanceMinor - a.balanceMinor).slice(0, 5).map((row, i) => ({
      name: (row as any).accountName || (row as any).name || "Asset Account", value: minorToMajor(row.balanceMinor), pct: assets > 0 ? Math.round((row.balanceMinor / assets) * 100) : 0, color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const liabilityDistribution = reports.balanceSheet.filter((row) => row.accountType === "liability" && row.balanceMinor > 0).sort((a, b) => b.balanceMinor - a.balanceMinor).slice(0, 5).map((row, i) => ({
      name: (row as any).accountName || (row as any).name || "Liability Account", value: minorToMajor(row.balanceMinor), pct: liabilities > 0 ? Math.round((row.balanceMinor / liabilities) * 100) : 0, color: CHART_COLORS[(i + 2) % CHART_COLORS.length],
  }));

  const topAccounts = [...reports.balanceSheet, ...reports.profitAndLoss].filter((row) => row.balanceMinor > 0).sort((a, b) => b.balanceMinor - a.balanceMinor).slice(0, 6).map((row) => ({
      name: (row as any).accountName || (row as any).name || "Unknown Account", code: (row as any).accountCode || (row as any).code || "---", type: row.accountType, balance: minorToMajor(row.balanceMinor), trend: "stable"
  }));

  const invoiceTotal = invoiceRows.reduce((sum, r) => sum + baseValue(r), 0);
  const invoiceGroups = invoiceRows.reduce((acc, row) => {
    const status = String(row.status).toLowerCase();
    acc[status] = (acc[status] || 0) + baseValue(row); return acc;
  }, {} as Record<string, number>);
  const invoiceStatus = Object.entries(invoiceGroups).map(([status, val], i) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1), value: minorToMajor(val), pct: invoiceTotal > 0 ? Math.round((val / invoiceTotal) * 100) : 0, color: status === "paid" ? "#10b981" : status === "overdue" ? "#ef4444" : "#3b82f6"
  })).sort((a, b) => b.value - a.value);

  const billTotal = billRows.reduce((sum, r) => sum + baseValue(r), 0);
  const billGroups = billRows.reduce((acc, row) => {
    const status = String(row.status).toLowerCase();
    acc[status] = (acc[status] || 0) + baseValue(row); return acc;
  }, {} as Record<string, number>);
  const billStatus = Object.entries(billGroups).map(([status, val], i) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1), value: minorToMajor(val), pct: billTotal > 0 ? Math.round((val / billTotal) * 100) : 0, color: status === "paid" ? "#10b981" : status === "overdue" ? "#ef4444" : "#f59e0b"
  })).sort((a, b) => b.value - a.value);

  const spendAnomalies = calculateSpendAnomalies(billRows);

  // --- 🌟 NEW: THE MISSING WIDGETS ---

  // 1. VAT Summary
  const outputTaxMinor = invoiceRows.filter(r => String(r.status).toUpperCase() !== "VOID").reduce((sum, r) => sum + Number(r.taxMinor || 0), 0);
  const inputTaxMinor = billRows.filter(r => String(r.status).toUpperCase() !== "VOID").reduce((sum, r) => sum + Number(r.taxMinor || 0), 0);
  const vatSummary = {
    outputTax: minorToMajor(outputTaxMinor),
    inputTax: minorToMajor(inputTaxMinor),
    netVat: minorToMajor(outputTaxMinor - inputTaxMinor),
    quarterToDate: minorToMajor(outputTaxMinor - inputTaxMinor),
    previousQuarter: 0,
  };

  // 2. Key Financial Ratios
  const salesMinor = reports.profitAndLoss.filter(r => r.reportCategory === "sales").reduce((sum, r) => sum + r.balanceMinor, 0);
  const cosMinor = reports.profitAndLoss.filter(r => r.reportCategory === "cost_of_sales").reduce((sum, r) => sum + r.balanceMinor, 0);
  const grossMargin = salesMinor > 0 ? ((salesMinor - cosMinor) / salesMinor) * 100 : 0;
  const netMargin = salesMinor > 0 ? (netProfitMinor / salesMinor) * 100 : 0;
  const currAssetsMinor = reports.balanceSheet.filter(r => r.reportCategory === "current_asset" || r.reportCategory === "bank").reduce((sum, r) => sum + r.balanceMinor, 0);
  const currLiabMinor = reports.balanceSheet.filter(r => r.reportCategory === "current_liability").reduce((sum, r) => sum + r.balanceMinor, 0);
  const currentRatio = currLiabMinor > 0 ? (currAssetsMinor / currLiabMinor) : 0;

  const financialRatios = [
    { name: "Gross Margin", value: `${grossMargin.toFixed(1)}%`, target: "70%", status: grossMargin >= 70 ? "good" : "warning" },
    { name: "Net Margin", value: `${netMargin.toFixed(1)}%`, target: "25%", status: netMargin >= 25 ? "good" : "warning" },
    { name: "Current Ratio", value: `${currentRatio.toFixed(1)}x`, target: "1.5x", status: currentRatio >= 1.5 ? "good" : "warning" }
  ];

  // 3. Journal Activity by Day (Last 7 Days)
  const journalActivityMap = new Map();
  for(let i = 6; i >= 0; i--) {
      journalActivityMap.set(format(subDays(now, i), 'EEE'), { count: 0, amount: 0 });
  }
  const sevenDaysAgo = subDays(now, 7);
  allPostedJournals.filter(j => j.journalDate >= sevenDaysAgo).forEach(j => {
      const dayStr = format(j.journalDate, 'EEE');
      if (journalActivityMap.has(dayStr)) {
          const current = journalActivityMap.get(dayStr);
          current.count += 1;
          const amountMinor = j.lines.reduce((sum, l) => sum + Number(l.debitMinor), 0);
          current.amount += minorToMajor(amountMinor);
      }
  });
  const journalActivity = Array.from(journalActivityMap.entries()).map(([day, data]) => ({
      day, count: data.count, amount: data.amount
  }));

  // 4. Bank Balance Trend (Consolidated last 30 days backwards from today's assets)
  const bankBalanceTrendMap = new Map<string, number>();
  let currentBankBalance = assets; // start with total assets as baseline proxy for bank accounts
  
  // Group posted journal bank/asset lines by day
  const bankLinesByDay: Record<string, { debits: number, credits: number }> = {};
  allPostedJournals.forEach(j => {
    const dayStr = format(j.journalDate, 'yyyy-MM-dd');
    j.lines.forEach(line => {
      if (line.account && (line.account.reportCategory === "BANK" || line.account.accountType === "ASSET")) {
        if (!bankLinesByDay[dayStr]) {
          bankLinesByDay[dayStr] = { debits: 0, credits: 0 };
        }
        bankLinesByDay[dayStr].debits += Number(line.debitMinor || 0);
        bankLinesByDay[dayStr].credits += Number(line.creditMinor || 0);
      }
    });
  });

  // Calculate backwards for 30 days
  for (let i = 0; i < 30; i++) {
    const targetDate = subDays(now, i);
    const dayStr = format(targetDate, 'yyyy-MM-dd');
    const dayLabel = format(targetDate, 'dd MMM');
    
    bankBalanceTrendMap.set(dayLabel, minorToMajor(currentBankBalance));

    // For the next loop iteration (which is 1 day earlier), subtract today's net bank movement
    const movement = bankLinesByDay[dayStr];
    if (movement) {
      currentBankBalance = currentBankBalance - movement.debits + movement.credits;
    }
  }

  const bankBalanceTrend = Array.from(bankBalanceTrendMap.entries())
    .map(([day, balance]) => ({ day, balance }))
    .reverse();

  // 5. Contacts stats query
  const [contacts, employees] = await Promise.all([
    prisma.contact.findMany({
      where: { organizationId },
      select: { contactType: true, isActive: true, createdAt: true }
    }),
    prisma.employee.findMany({
      where: { organizationId },
      select: { status: true, createdAt: true }
    })
  ]);

  const monthStart = subMonths(now, 1);
  const contactStats = {
    customers: {
      total: contacts.filter(c => c.contactType === "CUSTOMER" || c.contactType === "BOTH").length,
      active: contacts.filter(c => (c.contactType === "CUSTOMER" || c.contactType === "BOTH") && c.isActive).length,
      newThisMonth: contacts.filter(c => (c.contactType === "CUSTOMER" || c.contactType === "BOTH") && c.createdAt >= monthStart).length
    },
    suppliers: {
      total: contacts.filter(c => c.contactType === "SUPPLIER" || c.contactType === "BOTH").length,
      active: contacts.filter(c => (c.contactType === "SUPPLIER" || c.contactType === "BOTH") && c.isActive).length,
      newThisMonth: contacts.filter(c => (c.contactType === "SUPPLIER" || c.contactType === "BOTH") && c.createdAt >= monthStart).length
    },
    employees: {
      total: employees.length,
      active: employees.filter(e => e.status === "ACTIVE").length,
      newThisMonth: employees.filter(e => e.createdAt >= monthStart).length
    }
  };

  // 6. Alerts & Action Required
  const alerts = [];
  const overdueCount = (arAging[3]?.count || 0) + (arAging[4]?.count || 0); // 61-90 and 90+ days
  if (overdueCount > 0) alerts.push({ level: "danger", text: `${overdueCount} invoices overdue 60+ days`, action: "Chase", href: "/sales" });
  if (vatSummary.netVat > 0) alerts.push({ level: "warning", text: `VAT payable stands at ${formatMoney(Math.round(vatSummary.netVat * 100), org?.baseCurrency)}`, action: "Review", href: "/reports" });
  if (alerts.length === 0) alerts.push({ level: "info", text: "All systems looking good!", action: "View", href: "/reports" });

  // Return the master payload!
  return {
    metrics: [
      { label: "Net profit", value: formatMinor(profit), note: `${reports.period.yearStart} to ${reports.period.asOfDate}` },
      { label: "Revenue", value: formatMinor(revenue), note: "Posted journals" },
      { label: "Open receivables", value: formatMinor(receivables), note: `${invoiceRows.length} sales records` },
      { label: "Open payables", value: formatMinor(payables), note: `${billRows.length} purchase records` },
    ],
    profitSummary: { revenue: formatMinor(revenue), expenses: formatMinor(expenses), profit: formatMinor(profit) },
    balanceSummary: { assets: formatMinor(assets), liabilities: formatMinor(liabilities), equity: formatMinor(equity) },
    activity: recentJournals.map((journal) => ({
      id: journal.id, date: journal.journalDate.toISOString().slice(0, 10), memo: journal.memo || "Manual journal",
      amount: formatMinor(Number(journal.lines.reduce((total, line) => total + line.debitMinor, BigInt(0)))),
    })),
    reportPeriod: reports.period,
    expenseCategories, assetDistribution, liabilityDistribution, topAccounts, invoiceStatus, billStatus, monthlyTrends, arAging, apAging, weeklyCashFlow,
    
    // THE NEW WIDGETS
    vatSummary,
    financialRatios,
    journalActivity,
    alerts,
    spendAnomalies,
    bankBalanceTrend,
    contactStats
  };
}
